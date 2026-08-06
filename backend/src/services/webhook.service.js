const crypto = require('crypto');
const User = require('../models/User');
const Invoice = require('../models/Invoice');
const env = require('../config/env');
const logger = require('../config/logger');

const paymentService = require('../services/payment.service');
const emailService = require('../services/email.service');
const provisioningService = require('../services/provisioning.service');

async function handleRazorpayRenewal(payment) {
  const invoice = await Invoice.findOne({ gatewayOrderId: payment.order_id, gateway: 'razorpay' });
  if (!invoice) {
    logger.warn('Razorpay renewal: invoice not found', { orderId: payment.order_id });
    return;
  }
  const user = await User.findById(invoice.userId);
  if (!user) return;

  invoice.status = 'paid';
  invoice.gatewayPaymentId = payment.id;
  invoice.paidAt = new Date();
  await invoice.save();

  const newExpiry = user.planExpiresAt && user.planExpiresAt > new Date()
    ? new Date(user.planExpiresAt.getTime() + paymentService.PLAN_DURATION_DAYS * 86400000)
    : new Date(Date.now() + paymentService.PLAN_DURATION_DAYS * 86400000);

  user.planExpiresAt = newExpiry;
  user.isActive = true;
  user.notified = {};
  await user.save();

  logger.info('Renewal via Razorpay webhook', { userId: user._id.toString(), newExpiry });
}

async function handleRazorpayFailure(payment) {
  const invoice = await Invoice.findOne({ gatewayOrderId: payment.order_id, gateway: 'razorpay' });
  if (!invoice) return;
  invoice.status = 'failed';
  await invoice.save();

  const user = await User.findById(invoice.userId);
  if (user) {
    try { await emailService.sendPaymentFailedEmail(user); } catch {}
  }
  logger.warn('Payment failed via Razorpay webhook', { invoiceId: invoice._id.toString() });
}

async function handleStripeRenewal(session) {
  const invoice = await Invoice.findOne({
    gatewayPaymentId: session.id,
    gateway: 'stripe',
  });
  if (!invoice) return;

  const user = await User.findById(invoice.userId);
  if (!user) return;

  invoice.status = 'paid';
  invoice.paidAt = new Date();
  await invoice.save();

  const newExpiry = user.planExpiresAt && user.planExpiresAt > new Date()
    ? new Date(user.planExpiresAt.getTime() + paymentService.PLAN_DURATION_DAYS * 86400000)
    : new Date(Date.now() + paymentService.PLAN_DURATION_DAYS * 86400000);

  user.planExpiresAt = newExpiry;
  user.isActive = true;
  user.notified = {};
  await user.save();

  logger.info('Renewal via Stripe webhook', { userId: user._id.toString() });
}

module.exports = {
  handleRazorpayRenewal,
  handleRazorpayFailure,
  handleStripeRenewal,
};