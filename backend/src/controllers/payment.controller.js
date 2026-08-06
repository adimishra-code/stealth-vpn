const crypto = require('crypto');
const User = require('../models/User');
const Invoice = require('../models/Invoice');
const env = require('../config/env');
const logger = require('../config/logger');

const paymentService = require('../services/payment.service');
const webhookService = require('../services/webhook.service');
const provisioningService = require('../services/provisioning.service');
const { ApiError, asyncHandler } = require('../utils/ApiError');

exports.createOrder = asyncHandler(async (req, res) => {
  const { plan, serverNode, deviceName, mode } = req.body;
  const order = await paymentService.createRazorpayOrder(plan);

  await Invoice.create({
    userId: req.user._id,
    plan,
    amountINR: paymentService.PLAN_PRICES_INR[plan],
    currency: 'INR',
    gateway: 'razorpay',
    gatewayOrderId: order.id,
    status: 'pending',
  });

  logger.info('Razorpay order created', { orderId: order.id, userId: req.user._id.toString() });

  res.json({
    orderId: order.id,
    amount: order.amount,
    currency: order.currency,
    keyId: env.RAZORPAY_KEY_ID,
  });
});

exports.verifyPayment = asyncHandler(async (req, res) => {
  const { paymentId, orderId, signature, plan, serverNode, deviceName, mode } = req.body;

  const valid = paymentService.verifyRazorpaySignature({ orderId, paymentId, signature });
  if (!valid) {
    throw new ApiError(400, 'Invalid payment signature');
  }

  const invoice = await Invoice.findOneAndUpdate(
    { gatewayOrderId: orderId, gateway: 'razorpay' },
    {
      $set: {
        status: 'paid',
        gatewayPaymentId: paymentId,
        paidAt: new Date(),
      },
    },
    { new: true }
  );
  if (!invoice) {
    throw new ApiError(404, 'Invoice not found for this order');
  }

  const user = req.user;
  const result = await provisioningService.provisionDevice({
    user,
    plan,
    serverNodeName: serverNode,
    deviceName,
    mode,
    invoiceData: {
      amountINR: invoice.amountINR,
      currency: 'INR',
      gateway: 'razorpay',
      gatewayPaymentId: paymentId,
      gatewayOrderId: orderId,
    },
  });

  logger.info('Razorpay payment verified + device provisioned', {
    userId: user._id.toString(),
    deviceId: result.device.id.toString(),
    paymentId,
  });

  res.json(result);
});

exports.stripeSession = asyncHandler(async (req, res) => {
  const { plan, serverNode, deviceName, mode, successUrl, cancelUrl } = req.body;

  const session = await paymentService.createStripeCheckoutSession({
    plan,
    successUrl,
    cancelUrl,
    metadata: {
      userId: req.user._id.toString(),
      plan,
      serverNode,
      deviceName,
      mode,
    },
  });

  await Invoice.create({
    userId: req.user._id,
    plan,
    amountINR: paymentService.PLAN_PRICES_INR[plan],
    currency: 'USD',
    gateway: 'stripe',
    gatewayOrderId: session.id,
    status: 'pending',
  });

  logger.info('Stripe session created', { sessionId: session.id, userId: req.user._id.toString() });
  res.json({ sessionUrl: session.url, sessionId: session.id });
});

exports.stripeConfirm = asyncHandler(async (req, res) => {
  const { session_id } = req.body;
  const session = await paymentService.retrieveStripeSession(session_id);
  if (session.payment_status !== 'paid') {
    throw new ApiError(402, 'Payment not completed');
  }

  const meta = session.metadata || {};
  if (!meta.userId || !meta.plan || !meta.serverNode || !meta.deviceName || !meta.mode) {
    throw new ApiError(400, 'Missing metadata in Stripe session');
  }

  const user = await User.findById(meta.userId);
  if (!user) throw new ApiError(404, 'User not found');

  const result = await provisioningService.provisionDevice({
    user,
    plan: meta.plan,
    serverNodeName: meta.serverNode,
    deviceName: meta.deviceName,
    mode: meta.mode,
    invoiceData: {
      amountINR: paymentService.PLAN_PRICES_INR[meta.plan],
      currency: 'USD',
      gateway: 'stripe',
      gatewayPaymentId: session_id,
      gatewayOrderId: session_id,
    },
  });

  await Invoice.findOneAndUpdate(
    { gatewayOrderId: session_id, gateway: 'stripe' },
    { $set: { status: 'paid', paidAt: new Date() } }
  );

  logger.info('Stripe confirmed + device provisioned', {
    userId: user._id.toString(),
    deviceId: result.device.id.toString(),
    sessionId: session_id,
  });

  res.json(result);
});

exports.listInvoices = asyncHandler(async (req, res) => {
  const invoices = await Invoice.find({ userId: req.user._id })
    .sort({ createdAt: -1 })
    .limit(50)
    .select('-__v');
  res.json({ invoices });
});

exports.webhook = asyncHandler(async (req, res) => {
  const raw = req.body;
  const sig = req.headers['x-razorpay-signature'];

  if (sig && paymentService.verifyRazorpayWebhook(raw, sig)) {
    const event = JSON.parse(raw.toString());
    logger.info('Razorpay webhook', { event: event.event });

    if (event.event === 'payment.captured') {
      await webhookService.handleRazorpayRenewal(event.payload.payment.entity);
    } else if (event.event === 'payment.failed') {
      await webhookService.handleRazorpayFailure(event.payload.payment.entity);
    }
    return res.json({ status: 'ok' });
  }

  const stripeSig = req.headers['stripe-signature'];
  if (stripeSig) {
    const event = paymentService.verifyStripeWebhook(raw, stripeSig);
    if (!event) {
      logger.warn('Stripe webhook signature invalid');
      return res.status(400).json({ error: 'Invalid signature' });
    }
    logger.info('Stripe webhook', { type: event.type });

    if (event.type === 'checkout.session.completed') {
      await webhookService.handleStripeRenewal(event.data.object);
    }
    return res.json({ status: 'ok' });
  }

  logger.warn('Webhook received with no valid signature');
  return res.status(400).json({ error: 'No valid signature' });
});