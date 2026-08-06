const crypto = require('crypto');
const { verifyRazorpaySignature, verifyRazorpayWebhook } = require('../src/services/payment.service');
const env = require('../src/config/env');

describe('Razorpay HMAC verification', () => {
  test('valid signature passes', () => {
    const orderId = 'order_N1abc';
    const paymentId = 'pay_N2def';
    const signature = crypto
      .createHmac('sha256', env.RAZORPAY_KEY_SECRET)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');
    expect(verifyRazorpaySignature({ orderId, paymentId, signature })).toBe(true);
  });

  test('forged signature fails', () => {
    expect(verifyRazorpaySignature({ orderId: 'order_N1abc', paymentId: 'pay_N2def', signature: 'f'.repeat(64) })).toBe(false);
  });

  test('swapped order/payment fails', () => {
    const orderId = 'order_N1abc';
    const paymentId = 'pay_N2def';
    const signature = crypto
      .createHmac('sha256', env.RAZORPAY_KEY_SECRET)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');
    // reverse the concatenation — signature no longer matches
    expect(verifyRazorpaySignature({ orderId: paymentId, paymentId: orderId, signature })).toBe(false);
  });

  test('webhook HMAC uses the WEBHOOK secret and raw body', () => {
    const raw = Buffer.from(JSON.stringify({ event: 'payment.captured' }));
    const signature = crypto
      .createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET)
      .update(raw)
      .digest('hex');
    expect(verifyRazorpayWebhook(raw, signature)).toBe(true);
    expect(verifyRazorpayWebhook(raw, 'bad')).toBe(false);
  });
});
