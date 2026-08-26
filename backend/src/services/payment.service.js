const Razorpay = require('razorpay');
const Stripe = require('stripe');
const crypto = require('crypto');
const env = require('../config/env');
const logger = require('../config/logger');

const PLAN_PRICES_INR = {
  basic: 9900,
  pro: 19900,
  team: 49900,
};

const PLAN_PRICES_USD = {
  basic: 199,
  pro: 399,
  team: 999,
};

const PLAN_DURATION_DAYS = 30;

const razorpay = new Razorpay({
  key_id: env.RAZORPAY_KEY_ID,
  key_secret: env.RAZORPAY_KEY_SECRET,
});

const stripe = Stripe(env.STRIPE_SECRET_KEY);

function createRazorpayOrder(plan) {
  const amount = PLAN_PRICES_INR[plan];
  return razorpay.orders.create({
    amount,
    currency: 'INR',
    receipt: `stealth_${plan}_${Date.now()}`,
    notes: { plan },
  });
}

function timingSafeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function verifyRazorpaySignature({ orderId, paymentId, signature }) {
  const expected = crypto
    .createHmac('sha256', env.RAZORPAY_KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
  return timingSafeCompare(expected, signature);
}

function verifyRazorpayWebhook(rawBody, signature) {
  const expected = crypto
    .createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');
  return timingSafeCompare(expected, signature);
}

async function createStripeCheckoutSession({ plan, successUrl, cancelUrl, metadata }) {
  const amount = PLAN_PRICES_USD[plan];
  return stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: { name: `StealthVPN ${plan.toUpperCase()} — 30 days` },
          unit_amount: amount,
        },
        quantity: 1,
      },
    ],
    mode: 'payment',
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata,
  });
}

async function retrieveStripeSession(sessionId) {
  return stripe.checkout.sessions.retrieve(sessionId);
}

function verifyStripeWebhook(rawBody, signature) {
  try {
    return stripe.webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    logger.warn('Stripe webhook verification failed', { error: err.message });
    return null;
  }
}

// SEC-21: Cancel gateway recurring subscriptions when an account is marked for deletion
async function cancelCustomerSubscriptions(user) {
  const Invoice = require('../models/Invoice');
  const results = { stripe: 0, razorpay: 0, errors: [] };

  // Cancel active Stripe subscriptions for this customer
  if (user.stripeCustomerId && env.STRIPE_SECRET_KEY) {
    try {
      const subs = await stripe.subscriptions.list({
        customer: user.stripeCustomerId,
        status: 'active',
      });
      if (subs && Array.isArray(subs.data)) {
        for (const sub of subs.data) {
          await stripe.subscriptions.cancel(sub.id);
          results.stripe++;
          logger.info('Stripe subscription cancelled on account deletion', {
            userId: user._id.toString(),
            subscriptionId: sub.id,
          });
        }
      }
    } catch (err) {
      results.errors.push(`Stripe cancel error: ${err.message}`);
      logger.error('Failed to cancel Stripe subscription on deletion', {
        userId: user._id.toString(),
        error: err.message,
      });
    }
  }

  // Cancel active Razorpay subscriptions if present
  if (user.razorpayCustomerId && env.RAZORPAY_KEY_ID) {
    try {
      if (razorpay.subscriptions && typeof razorpay.subscriptions.all === 'function') {
        const rzSubs = await razorpay.subscriptions.all({ customer_id: user.razorpayCustomerId });
        if (rzSubs && Array.isArray(rzSubs.items)) {
          for (const sub of rzSubs.items) {
            if (sub.status === 'active') {
              await razorpay.subscriptions.cancel(sub.id);
              results.razorpay++;
              logger.info('Razorpay subscription cancelled on account deletion', {
                userId: user._id.toString(),
                subscriptionId: sub.id,
              });
            }
          }
        }
      }
    } catch (err) {
      results.errors.push(`Razorpay cancel error: ${err.message}`);
      logger.error('Failed to cancel Razorpay subscription on deletion', {
        userId: user._id.toString(),
        error: err.message,
      });
    }
  }

  return results;
}

module.exports = {
  PLAN_PRICES_INR,
  PLAN_PRICES_USD,
  PLAN_DURATION_DAYS,
  razorpay,
  stripe,
  createRazorpayOrder,
  verifyRazorpaySignature,
  verifyRazorpayWebhook,
  createStripeCheckoutSession,
  retrieveStripeSession,
  verifyStripeWebhook,
  cancelCustomerSubscriptions,
};