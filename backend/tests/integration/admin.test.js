// Admin integration tests — the admin surface is the highest-impact target, so
// these lock in the self-harm guards (an admin must not be able to ban, modify,
// or kill their own account/device) plus the role gate and a happy path.
const request = require('supertest');
const { signAccessToken } = require('../../src/utils/jwt');

const mockAdminUser = { _id: 'adm1', role: 'admin', email: 'admin@stealthvpn.com', isActive: true };
const mockPlainUser = { _id: 'usr1', role: 'user', email: 'user@example.com', isActive: true };

let mockDeviceStore = [];

jest.mock('../../src/models/User', () => ({
  findById: jest.fn((id) => {
    const user = [mockAdminUser, mockPlainUser].find((u) => u._id === id) || null;
    return user ? { select: () => user } : null;
  }),
  find: jest.fn(() => ({
    select: () => ({ sort: () => ({ skip: () => ({ limit: async () => [] }) }) }),
  })),
  countDocuments: jest.fn(async () => 0),
}));

jest.mock('../../src/models/Device', () => ({
  findById: jest.fn(async (id) => {
    const device = mockDeviceStore.find((d) => d._id === id) || null;
    return device ? { ...device } : null;
  }),
}));

jest.mock('../../src/models/ServerNode', () => ({
  find: jest.fn(() => ({ select: async () => [] })),
}));

const createApp = require('../../src/app');

const adminToken = signAccessToken(mockAdminUser);
const userToken = signAccessToken(mockPlainUser);

describe('Admin API (integration)', () => {
  const app = createApp();

  beforeEach(() => {
    mockDeviceStore = [
      { _id: 'dev1', userId: 'adm1', isActive: true },
      { _id: 'dev2', userId: 'adm1', isActive: true },
      { _id: 'dev3', userId: 'usr1', isActive: true },
    ];
  });

  test('unauthenticated admin request returns 401', async () => {
    const res = await request(app).get('/api/admin/users');
    expect(res.status).toBe(401);
  });

  test('non-admin role is rejected with 403', async () => {
    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Admin access required');
  });

  test('admin can reach the pool-status endpoint (happy path)', async () => {
    const res = await request(app)
      .get('/api/admin/pool-status')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ total: 0, allocated: 0 });
  });

  test('admin cannot modify their own account', async () => {
    const res = await request(app)
      .patch('/api/admin/users/adm1')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: false, banReason: 'oops' });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('You cannot modify your own admin account');
  });

  test('admin cannot ban their own account', async () => {
    const res = await request(app)
      .post('/api/admin/users/adm1/ban')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ banReason: 'oops' });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('You cannot ban your own account');
  });

  test('admin cannot revoke their own device', async () => {
    const res = await request(app)
      .post('/api/admin/devices/dev1/revoke')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('You cannot revoke your own device');
  });

  test('admin cannot expire their own device', async () => {
    const res = await request(app)
      .post('/api/admin/devices/dev2/expire')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('You cannot expire your own device');
  });
});
