// Payment integration tests — Razorpay webhook HMAC validation, webhook
// outcomes (ok / retry / invalid), order creation, and the per-user
// paymentLimiter on /create-order. Real crypto/HMAC code, mocked providers.
const crypto = require('crypto');
const request = require('supertest');
const { signAccessToken } = require('../../src/utils/jwt');

const mockInvoices = [];
let mockInvoiceSeq = 1;

jest.mock('../../src/models/Invoice', () => ({
  create: jest.fn(async (props) => {
    const invoice = { _id: `inv${mockInvoiceSeq++}`, ...props };
    mockInvoices.push(invoice);
    return invoice;
  }),
  findOneAndUpdate: async (query, update) => {
    const invoice = mockInvoices.find(
      (i) => i.gatewayOrderId === query.gatewayOrderId && i.gateway === query.gateway && i.status === query.status
    );
    if (!invoice) return null;
    Object.assign(invoice, update.$set);
    return invoice;
  },
  findOne: async (query) =>
    mockInvoices.find((i) => i.gatewayOrderId === query.gatewayOrderId && i.gateway === query.gateway) || null,
}));

jest.mock('../../src/services/payment.service', () => ({
  ...jest.requireActual('../../src/services/payment.service'),
  createRazorpayOrder: jest.fn(),
  createStripeCheckoutSession: jest.fn(),
  retrieveStripeSession: jest.fn(),
}));

jest.mock('../../src/services/webhook.service', () => ({
  handleRazorpayRenewal: jest.fn(async () => 'ok'),
  handleRazorpayFailure: jest.fn(async () => 'ok'),
}));

const mockAuthedUser = { _id: 'u1', role: 'user', email: 'pay@example.com', isActive: true };

jest.mock('../../src/models/User', () => ({
  findById: jest.fn(() => ({ select: () => mockAuthedUser })),
}));

const createApp = require('../../src/app');
const webhookService = require('../../src/services/webhook.service');
const paymentService = require('../../src/services/payment.service');
const Invoice = require('../../src/models/Invoice');

function razorpayBody(event, entity) {
  return JSON.stringify({ event, payload: { payment: { entity } } });
}

function validSignature(body) {
  return crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET).update(body).digest('hex');
}

describe('Payment API (integration)', () => {
  const app = createApp();
  const authHeader = { Authorization: `Bearer ${signAccessToken(mockAuthedUser)}` };

  beforeEach(() => {
    webhookService.handleRazorpayRenewal.mockClear();
    webhookService.handleRazorpayFailure.mockClear();
    paymentService.createRazorpayOrder.mockClear();
    Invoice.create.mockClear();
  });

  describe('Razorpay webhook', () => {
    test('valid HMAC signature for payment.captured is applied', async () => {
      const entity = { id: 'pay_abc', order_id: 'order_xyz' };
      const body = razorpayBody('payment.captured', entity);

      const res = await request(app)
        .post('/api/payment/webhook')
        .set('x-razorpay-signature', validSignature(body))
        .set('Content-Type', 'application/json')
        .send(body);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(webhookService.handleRazorpayRenewal).toHaveBeenCalledWith(entity);
    });

    test('payment.failed routes to the failure handler', async () => {
      const entity = { id: 'pay_fail', order_id: 'order_fail' };
      const body = razorpayBody('payment.failed', entity);

      const res = await request(app)
        .post('/api/payment/webhook')
        .set('x-razorpay-signature', validSignature(body))
        .set('Content-Type', 'application/json')
        .send(body);

      expect(res.status).toBe(200);
      expect(webhookService.handleRazorpayFailure).toHaveBeenCalledWith(entity);
    });

    test('tampered signature is rejected with 400', async () => {
      const body = razorpayBody('payment.captured', { id: 'pay_bad', order_id: 'order_bad' });

      const res = await request(app)
        .post('/api/payment/webhook')
        .set('x-razorpay-signature', validSignature('totally different body'))
        .set('Content-Type', 'application/json')
        .send(body);

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid signature');
      expect(webhookService.handleRazorpayRenewal).not.toHaveBeenCalled();
    });

    test('webhook without any signature header is rejected', async () => {
      const res = await request(app)
        .post('/api/payment/webhook')
        .set('Content-Type', 'application/json')
        .send(razorpayBody('payment.captured', { id: 'pay_x', order_id: 'order_x' }));

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('No valid signature');
    });

    test('retry outcome becomes a 503 so the gateway redelivers', async () => {
      webhookService.handleRazorpayRenewal.mockResolvedValueOnce('retry');
      const body = razorpayBody('payment.captured', { id: 'pay_retry', order_id: 'order_retry' });

      const res = await request(app)
        .post('/api/payment/webhook')
        .set('x-razorpay-signature', validSignature(body))
        .set('Content-Type', 'application/json')
        .send(body);

      expect(res.status).toBe(503);
      expect(res.body.error).toBe('Not ready — please retry');
    });
  });

  describe('Order creation', () => {
    test('create-order stores a pending invoice and returns gateway details', async () => {
      paymentService.createRazorpayOrder.mockResolvedValueOnce({
        id: 'order_RAZ1',
        amount: 19900,
        currency: 'INR',
      });

      const res = await request(app)
        .post('/api/payment/create-order')
        .set(authHeader)
        .send({ plan: 'pro', deviceName: 'laptop' });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ orderId: 'order_RAZ1', amount: 19900, currency: 'INR' });
      expect(paymentService.createRazorpayOrder).toHaveBeenCalledWith('pro');
      expect(Invoice.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'u1',
          plan: 'pro',
          gateway: 'razorpay',
          gatewayOrderId: 'order_RAZ1',
          status: 'pending',
        })
      );
    });

    test('paymentLimiter returns 429 after 20 orders in the window', async () => {
      paymentService.createRazorpayOrder.mockResolvedValue({ id: 'order_RAZ1', amount: 9900, currency: 'INR' });

      let lastStatus = 0;
      for (let i = 0; i < 21; i += 1) {
        const res = await request(app)
          .post('/api/payment/create-order')
          .set(authHeader)
          .send({ plan: 'basic', deviceName: 'brute' });
        lastStatus = res.status;
      }

      expect(lastStatus).toBe(429);
    });
  });
});
