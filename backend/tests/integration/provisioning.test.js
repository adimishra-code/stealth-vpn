// Provisioning integration tests — full HTTP provisioning path with the SSH /
// Xray / IP-pool layers mocked. Covers the happy path, the at-capacity 503,
// and the rollback that cleans node state when the Device row fails to save.
const request = require('supertest');
const { signAccessToken } = require('../../src/utils/jwt');

const mockTestUser = {
  _id: 'u1',
  role: 'user',
  email: 'prov@example.com',
  plan: 'pro',
  planExpiresAt: new Date(Date.now() + 7 * 86400000),
  isActive: true,
  notified: {},
  save: jest.fn(async () => {}),
};

jest.mock('../../src/models/User', () => ({
  findById: jest.fn(() => ({ select: () => mockTestUser })),
}));

jest.mock('../../src/models/Device', () => ({
  countDocuments: jest.fn(async () => 0),
  create: jest.fn(async (props) => ({ _id: 'dev-new', ...props })),
}));

jest.mock('../../src/models/ServerNode', () => ({
  find: jest.fn(async () => []),
  findOne: jest.fn(),
}));

jest.mock('../../src/services/vpn.service', () => ({
  getServerNode: jest.fn(async () => ({ name: 'mumbai', maxPeers: 100 })),
  createDeviceOnNode: jest.fn(async () => ({
    privateKey: 'priv-key',
    publicKey: 'pub-key',
    encryptedPrivateKey: 'enc-key',
    serverNode: { name: 'mumbai', host: '10.0.0.1' },
  })),
  provisionPeer: jest.fn(async () => ({ tcHandle: null })),
  revokePeer: jest.fn(async () => {}),
  removeThrottle: jest.fn(async () => {}),
  generateWGConfig: jest.fn(() => '[Interface]\nPrivateKey = priv-key'),
}));

jest.mock('../../src/services/xray.service', () => ({
  FLOW_VISION: 'xtls-rprx-vision',
  addXrayUser: jest.fn(async () => {}),
  removeXrayUser: jest.fn(async () => {}),
  buildVlessUri: jest.fn(() => 'vless://test'),
}));

jest.mock('../../src/utils/ipAllocator', () => ({
  allocateIP: jest.fn(async () => ({ assignedIP: '10.8.0.5' })),
}));

jest.mock('../../src/utils/qrcode', () => ({
  generateQRBase64: jest.fn(async () => 'data:image/png;base64,AAAA'),
}));

const createApp = require('../../src/app');
const vpn = require('../../src/services/vpn.service');
const xray = require('../../src/services/xray.service');
const Device = require('../../src/models/Device');

describe('Provisioning API (integration)', () => {
  const app = createApp();
  const authHeader = { Authorization: `Bearer ${signAccessToken(mockTestUser)}` };

  beforeEach(() => {
    jest.clearAllMocks();
    Device.countDocuments.mockResolvedValue(0);
    vpn.getServerNode.mockResolvedValue({ name: 'mumbai', maxPeers: 100 });
    vpn.createDeviceOnNode.mockResolvedValue({
      privateKey: 'priv-key',
      publicKey: 'pub-key',
      encryptedPrivateKey: 'enc-key',
      serverNode: { name: 'mumbai', host: '10.0.0.1' },
    });
  });

  test('happy path provisions a device and returns config + VLESS URI', async () => {
    const res = await request(app)
      .post('/api/devices')
      .set(authHeader)
      .send({ deviceName: 'laptop', serverNode: 'mumbai', mode: 'stealth' });

    expect(res.status).toBe(201);
    expect(res.body.device).toMatchObject({ deviceName: 'laptop', serverNode: 'mumbai', plan: 'pro' });
    expect(res.body.config).toContain('PrivateKey');
    expect(res.body.vlessUri).toBe('vless://test');
    expect(Device.create).toHaveBeenCalledWith(
      expect.objectContaining({ encryptedXrayUUID: expect.any(String), assignedIP: '10.8.0.5', quotaMB: null })
    );
    expect(mockTestUser.save).toHaveBeenCalled();
  });

  test('node at capacity returns 503 and nothing is provisioned', async () => {
    Device.countDocuments.mockImplementation(async (query) => (query.userId ? 0 : 100));

    const res = await request(app)
      .post('/api/devices')
      .set(authHeader)
      .send({ deviceName: 'full-node', serverNode: 'mumbai', mode: 'stealth' });

    expect(res.status).toBe(503);
    expect(res.body.error).toContain('at capacity');
    expect(vpn.createDeviceOnNode).not.toHaveBeenCalled();
    expect(Device.create).not.toHaveBeenCalled();
  });

  test('Device row failure rolls back node state and returns 500', async () => {
    Device.create.mockRejectedValueOnce(new Error('db down'));
    const uuidCapture = { value: null };
    xray.addXrayUser.mockImplementationOnce(async ({ uuid }) => {
      uuidCapture.value = uuid;
    });

    const res = await request(app)
      .post('/api/devices')
      .set(authHeader)
      .send({ deviceName: 'rollback', serverNode: 'mumbai', mode: 'stealth' });

    expect(res.status).toBe(500);
    expect(vpn.revokePeer).toHaveBeenCalled();
    expect(xray.removeXrayUser).toHaveBeenCalledWith({ serverNode: expect.anything(), uuid: uuidCapture.value });
    expect(mockTestUser.save).not.toHaveBeenCalled();
  });
});
