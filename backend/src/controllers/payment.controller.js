const Invoice = require('../models/Invoice');
const env = require('../config/env');
const logger = require('../config/logger');

const paymentService = require('../services/payment.service');
const webhookService = require('../services/webhook.service');
const provisioningService = require('../services/provisioning.service');
const { ApiError, asyncHandler } = require('../utils/ApiError');

exports.createOrder = asyncHandler(async (req, res) => {
  const { plan } = req.body;
  const order = await paymentService.createRazorpayOrder(plan);

  await Invoice.create({
    userId: req.user._id,
    plan,
    amount: paymentService.PLAN_PRICES_INR[plan],
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
  const { paymentId, orderId, signature, serverNode, deviceName, mode } = req.body;

  const valid = paymentService.verifyRazorpaySignature({ orderId, paymentId, signature });
  if (!valid) {
    throw new ApiError(400, 'Invalid payment signature');
  }

  // Atomic claim: only the first caller flips pending -> paid, so a concurrent
  // webhook for the same order cannot also provision and double-credit the plan.
  const invoice = await Invoice.findOneAndUpdate(
    { gatewayOrderId: orderId, gateway: 'razorpay', status: 'pending' },
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
    const existing = await Invoice.findOne({ gatewayOrderId: orderId, gateway: 'razorpay' });
    if (!existing) {
      throw new ApiError(404, 'Invoice not found for this order');
    }
    throw new ApiError(409, 'This payment has already been processed');
  }

  if (!invoice.userId.equals(req.user._id)) {
    throw new ApiError(403, 'This order belongs to another account');
  }

  const user = req.user;
  let result;
  try {
    result = await provisioningService.provisionDevice({
      user,
      plan: invoice.plan,
      serverNodeName: serverNode,
      deviceName,
      mode,
    });
  } catch (err) {
    // Release the claim so the user can retry instead of losing a paid order.
    await Invoice.updateOne({ _id: invoice._id }, { $set: { status: 'pending' } });
    throw err;
  }

  logger.info('Razorpay payment verified + device provisioned', {
    userId: user._id.toString(),
    deviceId: result.device.id.toString(),
    paymentId,
  });

  res.json({ ...result, invoiceId: invoice._id });
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
    amount: paymentService.PLAN_PRICES_USD[plan],
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

  // The session id is not a secret — without this check any authenticated user
  // could replay someone else's session and provision against their account.
  if (meta.userId !== req.user._id.toString()) {
    throw new ApiError(403, 'This checkout session belongs to another account');
  }

  const invoice = await Invoice.findOneAndUpdate(
    { gatewayOrderId: session_id, gateway: 'stripe', status: 'pending' },
    { $set: { status: 'paid', gatewayPaymentId: session_id, paidAt: new Date() } },
    { new: true }
  );
  if (!invoice) {
    const existing = await Invoice.findOne({ gatewayOrderId: session_id, gateway: 'stripe' });
    if (!existing) {
      throw new ApiError(404, 'Invoice not found for this session');
    }
    throw new ApiError(409, 'This payment has already been processed');
  }

  const user = req.user;
  let result;
  try {
    result = await provisioningService.provisionDevice({
      user,
      plan: invoice.plan,
      serverNodeName: meta.serverNode,
      deviceName: meta.deviceName,
      mode: meta.mode,
    });
  } catch (err) {
    await Invoice.updateOne({ _id: invoice._id }, { $set: { status: 'pending' } });
    throw err;
  }

  logger.info('Stripe confirmed + device provisioned', {
    userId: user._id.toString(),
    deviceId: result.device.id.toString(),
    sessionId: session_id,
  });

  res.json({ ...result, invoiceId: invoice._id });
});

exports.listInvoices = asyncHandler(async (req, res) => {
  const invoices = await Invoice.find({ userId: req.user._id })
    .sort({ createdAt: -1 })
    .limit(50)
    .select('-__v');
  res.json({ invoices });
});

// A duplicated header arrives as an array; comparing that to a string always
// fails, which would reject a legitimate webhook.
function singleHeader(value) {
  return Array.isArray(value) ? value[0] : value;
}

exports.webhook = asyncHandler(async (req, res) => {
  const raw = req.body;
  const sig = singleHeader(req.headers['x-razorpay-signature']);

  if (sig) {
    if (!paymentService.verifyRazorpayWebhook(raw, sig)) {
      logger.warn('Razorpay webhook signature invalid');
      return res.status(400).json({ error: 'Invalid signature' });
    }

    const event = JSON.parse(raw.toString());
    logger.info('Razorpay webhook', { event: event.event });

    let outcome = 'ok';
    if (event.event === 'payment.captured') {
      outcome = await webhookService.handleRazorpayRenewal(event.payload.payment.entity);
    } else if (event.event === 'payment.failed') {
      outcome = await webhookService.handleRazorpayFailure(event.payload.payment.entity);
    }

    // 5xx tells the gateway to redeliver; a 200 here would silently drop a
    // payment whose invoice had not yet been committed.
    if (outcome === 'retry') {
      return res.status(503).json({ error: 'Not ready — please retry' });
    }
    return res.json({ status: 'ok' });
  }

  const stripeSig = singleHeader(req.headers['stripe-signature']);
  if (stripeSig) {
    const event = paymentService.verifyStripeWebhook(raw, stripeSig);
    if (!event) {
      logger.warn('Stripe webhook signature invalid');
      return res.status(400).json({ error: 'Invalid signature' });
    }
    logger.info('Stripe webhook', { type: event.type });

    let outcome = 'ok';
    if (event.type === 'checkout.session.completed') {
      outcome = await webhookService.handleStripeRenewal(event.data.object);
    }

    if (outcome === 'retry') {
      return res.status(503).json({ error: 'Not ready — please retry' });
    }
    return res.json({ status: 'ok' });
  }

  logger.warn('Webhook received with no signature header');
  return res.status(400).json({ error: 'No valid signature' });
});