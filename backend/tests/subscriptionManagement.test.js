const request = require('supertest');
const { signAccessToken } = require('../src/utils/jwt');

const mockUser = {
  _id: 'u200',
  role: 'user',
  email: 'subscriber@example.com',
  isActive: true,
  plan: 'pro',
  planExpiresAt: new Date(Date.now() + 15 * 86400000),
  save: jest.fn(async function () { return this; }),
};

jest.mock('../src/models/User', () => ({
  findById: jest.fn((id) => ({
    select: jest.fn(async () => (id === mockUser._id ? mockUser : null)),
  })),
}));

jest.mock('../src/services/payment.service', () => {
  const actual = jest.requireActual('../src/services/payment.service');
  return {
    ...actual,
    cancelCustomerSubscriptions: jest.fn(async () => ({ stripe: 1, razorpay: 0, errors: [] })),
  };
});

jest.mock('../src/services/webhook.service', () => ({
  reconcileDevicesForPlan: jest.fn(async () => {}),
}));

jest.mock('../src/services/audit.service', () => ({
  audit: jest.fn(),
}));

const createApp = require('../src/app');

describe('Subscription Management Endpoints', () => {
  const app = createApp();
  const token = signAccessToken(mockUser);

  test('POST /api/payment/downgrade successfully changes user plan', async () => {
    const res = await request(app)
      .post('/api/payment/downgrade')
      .set('Authorization', `Bearer ${token}`)
      .send({ targetPlan: 'basic' });

    expect(res.status).toBe(200);
    expect(res.body.message).toContain('BASIC');
    expect(res.body.user.plan).toBe('basic');
  });

  test('POST /api/payment/downgrade rejects same plan downgrade', async () => {
    mockUser.plan = 'basic';
    const res = await request(app)
      .post('/api/payment/downgrade')
      .set('Authorization', `Bearer ${token}`)
      .send({ targetPlan: 'basic' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('already on BASIC');
  });

  test('POST /api/payment/cancel-subscription cancels plan and returns to free tier', async () => {
    mockUser.plan = 'pro';
    const res = await request(app)
      .post('/api/payment/cancel-subscription')
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'No longer needed' });

    expect(res.status).toBe(200);
    expect(res.body.message).toContain('Free tier');
    expect(res.body.user.plan).toBe('free');
  });
});
