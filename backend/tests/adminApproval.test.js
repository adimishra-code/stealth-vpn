const request = require('supertest');
const { signAccessToken } = require('../src/utils/jwt');
const provisioningService = require('../src/services/provisioning.service');
const vpn = require('../src/services/vpn.service');
const User = require('../src/models/User');
const Device = require('../src/models/Device');
const ServerNode = require('../src/models/ServerNode');

jest.mock('../src/models/User');
jest.mock('../src/models/Device');
jest.mock('../src/models/ServerNode');
jest.mock('../src/services/audit.service', () => ({
  audit: jest.fn(),
}));

const mockExecCommand = jest.fn(async () => ({ stdout: '', stderr: '' }));
jest.mock('node-ssh', () => ({
  NodeSSH: jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue(true),
    execCommand: mockExecCommand,
    dispose: jest.fn(),
  })),
}));

const createApp = require('../src/app');

describe('Strict Admin Approval Gate & Pro Plan Limits', () => {
  let mockAdmin;
  let mockUnapprovedUser;
  let mockApprovedUser;
  let mockExpiredUser;
  let adminToken;
  let unapprovedToken;
  let approvedToken;
  let expiredToken;
  let app;

  beforeEach(() => {
    jest.clearAllMocks();

    mockAdmin = {
      _id: 'adm_01',
      role: 'admin',
      email: 'admin@stealthvpn.com',
      isActive: true,
      isApproved: true,
      totpEnabled: true,
      save: jest.fn(async function () { return this; }),
    };

    mockUnapprovedUser = {
      _id: 'usr_unapproved',
      role: 'user',
      email: 'friend@example.com',
      isActive: true,
      isApproved: false,
      plan: 'free',
      planExpiresAt: null,
      save: jest.fn(async function () { return this; }),
    };

    mockApprovedUser = {
      _id: 'usr_approved',
      role: 'user',
      email: 'approved_friend@example.com',
      isActive: true,
      isApproved: true,
      plan: 'pro',
      planExpiresAt: new Date(Date.now() + 25 * 86400000),
      save: jest.fn(async function () { return this; }),
    };

    mockExpiredUser = {
      _id: 'usr_expired',
      role: 'user',
      email: 'expired_friend@example.com',
      isActive: true,
      isApproved: true,
      plan: 'pro',
      planExpiresAt: new Date(Date.now() - 2 * 86400000),
      reactivationRequested: false,
      save: jest.fn(async function () { return this; }),
    };

    const users = [mockAdmin, mockUnapprovedUser, mockApprovedUser, mockExpiredUser];
    users.forEach((u) => {
      u.select = jest.fn(function () { return this; });
    });

    User.findById.mockImplementation((id) => {
      const u = users.find((x) => x._id === id);
      return u || null;
    });

    User.find.mockReturnValue({
      select: () => ({ sort: () => ({ skip: () => ({ limit: async () => [] }) }) }),
    });
    User.countDocuments.mockResolvedValue(0);

    Device.find.mockReturnValue({
      select: () => ({ sort: async () => [] }),
    });
    Device.findOne.mockResolvedValue(null);
    Device.countDocuments.mockResolvedValue(0);

    ServerNode.find.mockReturnValue({ select: async () => [] });
    ServerNode.findOne.mockResolvedValue({ name: 'mumbai', ip: '1.2.3.4', isOnline: true });

    adminToken = signAccessToken(mockAdmin, { amr: ['mfa'] });
    unapprovedToken = signAccessToken(mockUnapprovedUser);
    approvedToken = signAccessToken(mockApprovedUser);
    expiredToken = signAccessToken(mockExpiredUser);

    app = createApp();
  });

  test('Pro plan limit is strictly 2 devices', () => {
    expect(provisioningService.PLAN_LIMITS.pro.devices).toBe(2);
    expect(provisioningService.PLAN_LIMITS.free.devices).toBe(0);
  });

  test('Unapproved user is blocked from adding a device (403)', async () => {
    const res = await request(app)
      .post('/api/devices')
      .set('Authorization', `Bearer ${unapprovedToken}`)
      .send({ deviceName: 'My Laptop', serverNode: 'mumbai', mode: 'stealth' });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('Account pending administrator approval');
  });

  test('Unapproved user is blocked from downloading configs (403)', async () => {
    const res = await request(app)
      .get('/api/devices/dev123/config')
      .set('Authorization', `Bearer ${unapprovedToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('Account pending administrator approval');
  });

  test('Expired user is blocked from adding device (403)', async () => {
    const res = await request(app)
      .post('/api/devices')
      .set('Authorization', `Bearer ${expiredToken}`)
      .send({ deviceName: 'My Laptop', serverNode: 'mumbai', mode: 'stealth' });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('Monthly plan expired');
  });

  test('User can submit a monthly reactivation request via POST /api/auth/request-reactivation', async () => {
    const res = await request(app)
      .post('/api/auth/request-reactivation')
      .set('Authorization', `Bearer ${expiredToken}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toContain('Reactivation request submitted');
    expect(mockExpiredUser.reactivationRequested).toBe(true);
    expect(mockExpiredUser.save).toHaveBeenCalled();
  });

  test('Admin can approve user via POST /api/admin/users/:id/approve', async () => {
    const targetUser = mockUnapprovedUser;
    const res = await request(app)
      .post(`/api/admin/users/${targetUser._id}/approve`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toContain('User approved and activated for 30 days');
    expect(targetUser.isApproved).toBe(true);
    expect(targetUser.plan).toBe('pro');
    expect(targetUser.planExpiresAt).toBeInstanceOf(Date);
    expect(targetUser.save).toHaveBeenCalled();
  });

  test('VPN service applies 100mbit tc traffic shaping for pro peers', async () => {
    mockExecCommand.mockClear();

    const result = await vpn.provisionPeer({
      serverNode: { name: 'mumbai', ip: '1.2.3.4' },
      publicKey: '4mZTj+9zXkLq2wVbNcDfGhJkPqRsTuVwXyZ01234567=',
      assignedIP: '10.8.0.2',
      plan: 'pro',
    });

    expect(result.success).toBe(true);
    expect(result.tcHandle).toBeDefined();

    const tcCalls = mockExecCommand.mock.calls.filter(([cmd]) => cmd.includes('tc class add'));
    expect(tcCalls.length).toBeGreaterThan(0);
    const tcCommand = tcCalls[0][0];
    expect(tcCommand).toContain('rate 100mbit burst 125mbit');
  });
});
