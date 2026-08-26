const request = require('supertest');
const { signAccessToken } = require('../src/utils/jwt');
const User = require('../src/models/User');
const Device = require('../src/models/Device');
const Invoice = require('../src/models/Invoice');
const paymentService = require('../src/services/payment.service');
const provisioning = require('../src/services/provisioning.service');

jest.mock('../src/models/User');
jest.mock('../src/models/Device');
jest.mock('../src/models/Invoice');
jest.mock('../src/services/payment.service');
jest.mock('../src/services/provisioning.service');

const createApp = require('../src/app');

describe('SEC-21: Account deletion cancels active Stripe and Razorpay subscriptions', () => {
  const app = createApp();
  const mockUser = {
    _id: 'u100',
    email: 'delete-me@example.com',
    role: 'user',
    isActive: true,
    stripeCustomerId: 'cus_stripe_123',
    razorpayCustomerId: 'cust_rzp_123',
    save: jest.fn(async function() { return this; }),
  };
  const token = signAccessToken(mockUser);

  beforeEach(() => {
    jest.clearAllMocks();
    User.findById.mockImplementation(() => ({
      select: jest.fn().mockResolvedValue(mockUser),
      then: (resolve) => Promise.resolve(mockUser).then(resolve),
    }));
    Device.find.mockResolvedValue([]);
    Invoice.updateMany.mockResolvedValue({ modifiedCount: 1 });
    paymentService.cancelCustomerSubscriptions.mockResolvedValue({ stripe: 1, razorpay: 1 });
  });

  test('DELETE /api/auth/me triggers cancelCustomerSubscriptions', async () => {
    const res = await request(app)
      .delete('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.deletionScheduledAt).toBeDefined();
    expect(paymentService.cancelCustomerSubscriptions).toHaveBeenCalledWith(mockUser);
  });
});
