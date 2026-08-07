const User = require('../models/User');
const Invoice = require('../models/Invoice');
const Device = require('../models/Device');
const ServerNode = require('../models/ServerNode');
const logger = require('../config/logger');

const paymentService = require('../services/payment.service');
const emailService = require('../services/email.service');
const vpn = require('../services/vpn.service');

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

  // Throttle removal talks to the VPN nodes over SSH and can take seconds —
  // Razorpay retries webhooks on slow responses, so it must NOT hold up the
  // 200. The invoice was already claimed (idempotency) above, so a duplicate
  // webhook cannot double-credit or double-clean. Fire-and-forget with a
  // structured failure log for manual recovery.
  if (invoice.plan !== 'basic') {
    applyPlanUpgradeCleanup(user._id, invoice.plan).catch((err) => {
      logger.error('[WEBHOOK FAIL] throttle cleanup', {
        orderId,
        userId: user._id.toString(),
        plan: invoice.plan,
        error: err.message,
      });
    });
  }

  logger.info('Renewal applied', {
    gateway,
    userId: user._id.toString(),
    planExpiresAt: user.planExpiresAt,
  });
  return 'ok';
}

// D3 — plan upgrade path. When a user moves OFF basic, the 10 Mbps tc
// throttles on their existing basic devices must go, otherwise the old
// device keeps being shaped forever. Best-effort: a failed SSH call is
// logged (never thrown) — it runs detached from the webhook response.
async function applyPlanUpgradeCleanup(userId, newPlan) {
  if (newPlan === 'basic') return;

  const throttled = await Device.find({
    userId,
    isActive: true,
    plan: 'basic',
    tcHandle: { $ne: null },
  });
  if (!throttled.length) return;

  logger.info('Plan upgrade — removing throttles', {
    userId: userId.toString(),
    deviceCount: throttled.length,
    newPlan,
  });

  for (const device of throttled) {
    const node = await ServerNode.findOne({ name: device.serverNode });
    if (!node) continue;
    try {
      await vpn.removeThrottle({ serverNode: node, tcHandle: device.tcHandle });
      device.tcHandle = null;
      device.plan = newPlan;
      await device.save();
      logger.info('Throttle removed on upgrade', { deviceId: device._id.toString() });
    } catch (err) {
      logger.error('Throttle removal on upgrade failed — retried next renewal', {
        deviceId: device._id.toString(),
        error: err.message,
      });
    }
  }
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
  applyPlanUpgradeCleanup,
};
