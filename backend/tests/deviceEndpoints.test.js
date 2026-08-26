const request = require('supertest');
const { signAccessToken } = require('../src/utils/jwt');
const { encryptPrivateKey, randomUUID } = require('../src/utils/crypto');

const mockUser = { _id: 'u100', role: 'user', email: 'user@example.com', isActive: true, plan: 'pro' };

const testUUID = randomUUID();
const mockDevice = {
  _id: 'd100',
  userId: 'u100',
  deviceName: 'My MacBook',
  assignedIP: '10.8.0.2',
  serverNode: 'mumbai',
  mode: 'stealth',
  wgPublicKey: 'MOCK_PUBLIC_KEY_12345678901234567890123456=',
  wgPrivateKey: encryptPrivateKey('MOCK_PRIVATE_KEY_12345678901234567890123456='),
  encryptedXrayUUID: encryptPrivateKey(testUUID),
  isActive: true,
};

const mockServerNode = {
  _id: 'sn1',
  name: 'mumbai',
  ip: '203.0.113.10',
  wgPort: 51820,
  wgPublicKey: 'SERVER_WG_PUBLIC_KEY_12345678901234567890=',
  xrayPort: 443,
  isOnline: true,
};

jest.mock('../src/models/User', () => ({
  findById: jest.fn((id) => ({
    select: jest.fn(async () => (id === mockUser._id ? { ...mockUser } : null)),
  })),
}));

jest.mock('../src/models/Device', () => ({
  findOne: jest.fn(async ({ _id, userId }) => {
    if (_id === mockDevice._id && userId === mockUser._id) {
      return { ...mockDevice };
    }
    return null;
  }),
  find: jest.fn(() => ({
    select: () => ({
      sort: async () => [mockDevice],
    }),
  })),
}));

jest.mock('../src/models/ServerNode', () => ({
  findOne: jest.fn(async ({ name }) => {
    if (name === mockServerNode.name) {
      return { ...mockServerNode };
    }
    return null;
  }),
  find: jest.fn(() => ({ select: async () => [mockServerNode] })),
}));

const createApp = require('../src/app');

describe('Device Endpoints (VLESS & Multi-format downloads)', () => {
  const app = createApp();
  const token = signAccessToken(mockUser);

  test('GET /api/devices/:id/vless returns VLESS URI, QR, and client configs', async () => {
    const res = await request(app)
      .get('/api/devices/d100/vless')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.vlessUri).toContain('vless://');
    expect(res.body.vlessUri).toContain(testUUID);
    expect(res.body.vlessUri).toContain('203.0.113.10:443');
    expect(res.body.qrDataUrl).toBeDefined();
    expect(res.body.deviceName).toBe('My MacBook');
    expect(res.body.singbox).toBeDefined();
    expect(res.body.singbox.type).toBe('vless');
    expect(res.body.clash).toBeDefined();
    expect(res.body.clash.type).toBe('vless');
  });

  test('GET /api/devices/:id/config defaults to wireguard .conf format', async () => {
    const res = await request(app)
      .get('/api/devices/d100/config')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.headers['content-disposition']).toContain('stealth-My%20MacBook.conf');
    expect(res.text).toContain('[Interface]');
    expect(res.text).toContain('[Peer]');
  });

  test('GET /api/devices/:id/config?format=singbox returns sing-box JSON', async () => {
    const res = await request(app)
      .get('/api/devices/d100/config?format=singbox')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');
    expect(res.headers['content-disposition']).toContain('singbox.json');
    const parsed = JSON.parse(res.text);
    expect(parsed.type).toBe('vless');
    expect(parsed.server).toBe('203.0.113.10');
  });

  test('GET /api/devices/:id/config?format=clash returns clash Meta JSON', async () => {
    const res = await request(app)
      .get('/api/devices/d100/config?format=clash')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');
    expect(res.headers['content-disposition']).toContain('clash.json');
    const parsed = JSON.parse(res.text);
    expect(parsed.proxies).toBeDefined();
    expect(parsed.proxies[0].type).toBe('vless');
  });

  test('SEC-16: POST /api/devices rejects script injection and CRLF in deviceName', async () => {
    const payloads = [
      '<script>alert(1)</script>',
      'device\r\nSet-Cookie: evil=1',
      'device"; filename="hack.exe',
      'device&quot;foo',
      'device/../../traversal',
    ];

    for (const badName of payloads) {
      const res = await request(app)
        .post('/api/devices')
        .set('Authorization', `Bearer ${token}`)
        .send({ deviceName: badName, serverNode: 'mumbai', mode: 'stealth' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
      expect(res.body.details[0].message).toContain('Device name may only contain');
    }
  });
});
