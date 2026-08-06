const User = require('../models/User');
const Invoice = require('../models/Invoice');
const logger = require('../config/logger');

const paymentService = require('../services/payment.service');
const emailService = require('../services/email.service');

function extendedExpiry(user) {
  const ms = paymentService.PLAN_DURATION_DAYS * 86400000;
  const now = new Date();
  return user.planExpiresAt && user.planExpiresAt > now
    ? new Date(user.planExpiresAt.getTime() + ms)
    : new Date(now.getTime() + ms);
}

// Returns 'ok' when applied, 'duplicate' when already processed (webhook retry),
// or 'retry' when the invoice/user is not visible yet — the caller turns 'retry'
// into a non-2xx so the gateway redelivers instead of dropping the payment.
async function applyRenewal({ gateway, orderId, paymentId }) {
  // Atomic pending -> paid claim. A retried webhook, or a concurrent client-side
  // verify, matches zero documents and cannot credit the plan a second time.
  const invoice = await Invoice.findOneAndUpdate(
    { gatewayOrderId: orderId, gateway, status: 'pending' },
    { $set: { status: 'paid', gatewayPaymentId: paymentId, paidAt: new Date() } },
    { new: true }
  );

  if (!invoice) {
    const existing = await Invoice.findOne({ gatewayOrderId: orderId, gateway });
    if (!existing) {
      logger.warn('Renewal webhook: invoice not found', { gateway, orderId });
      return 'retry';
    }
    logger.info('Renewal webhook: already processed', { gateway, orderId });
    return 'duplicate';
  }

  const user = await User.findById(invoice.userId);
  if (!user) {
    await Invoice.updateOne({ _id: invoice._id }, { $set: { status: 'pending' } });
    logger.error('Renewal webhook: user missing', { gateway, orderId });
    return 'retry';
  }

  user.plan = invoice.plan;
  user.planExpiresAt = extendedExpiry(user);
  user.isActive = true;
  user.notified = {};
  await user.save();

  logger.info('Renewal applied', {
    gateway,
    userId: user._id.toString(),
    planExpiresAt: user.planExpiresAt,
  });
  return 'ok';
}

function handleRazorpayRenewal(payment) {
  return applyRenewal({
    gateway: 'razorpay',
    orderId: payment.order_id,
    paymentId: payment.id,
  });
}

function handleStripeRenewal(session) {
  return applyRenewal({
    gateway: 'stripe',
    orderId: session.id,
    paymentId: session.payment_intent || session.id,
  });
}

async function handleRazorpayFailure(payment) {
  const invoice = await Invoice.findOneAndUpdate(
    { gatewayOrderId: payment.order_id, gateway: 'razorpay', status: 'pending' },
    { $set: { status: 'failed' } },
    { new: true }
  );
  if (!invoice) return 'duplicate';

  const user = await User.findById(invoice.userId);
  if (user) {
    try {
      await emailService.sendPaymentFailedEmail(user);
    } catch (err) {
      logger.warn('Payment-failed email not sent', { error: err.message });
    }
  }
  logger.warn('Payment failed via Razorpay webhook', { invoiceId: invoice._id.toString() });
  return 'ok';
}

module.exports = {
  handleRazorpayRenewal,
  handleRazorpayFailure,
  handleStripeRenewal,
};
