const request = require('supertest');
const { signAccessToken } = require('../src/utils/jwt');

const mockUser = {
  _id: 'u300',
  role: 'user',
  email: 'tester@example.com',
  isActive: true,
  plan: 'pro',
};

const mockNodes = [
  {
    name: 'mumbai',
    ip: '127.0.0.1',
    country: 'IN',
    region: 'ap-south-1',
    isOnline: true,
    xrayPort: 443,
    wgPort: 51820,
  },
  {
    name: 'frankfurt',
    ip: '127.0.0.1',
    country: 'DE',
    region: 'eu-central-1',
    isOnline: false,
    xrayPort: 443,
    wgPort: 51820,
  },
];

jest.mock('../src/models/User', () => ({
  findById: jest.fn((id) => ({
    select: jest.fn(async () => (id === mockUser._id ? mockUser : null)),
  })),
}));

jest.mock('../src/models/ServerNode', () => ({
  find: jest.fn(() => ({
    select: jest.fn(async () => mockNodes),
  })),
  findOne: jest.fn(async ({ name }) => mockNodes.find((n) => n.name === name) || null),
}));

const createApp = require('../src/app');

describe('Server Node Ping & Latency Diagnostics', () => {
  const app = createApp();
  const token = signAccessToken(mockUser);

  test('GET /api/servers/ping-all returns latency metrics for all online nodes', async () => {
    const res = await request(app)
      .get('/api/servers/ping-all')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.pings).toBeDefined();
    expect(res.body.pings.length).toBe(2);

    const mumbai = res.body.pings.find((p) => p.name === 'mumbai');
    expect(mumbai.isOnline).toBe(true);
    expect(typeof mumbai.latencyMs).toBe('number');

    const frankfurt = res.body.pings.find((p) => p.name === 'frankfurt');
    expect(frankfurt.isOnline).toBe(false);
    expect(frankfurt.latencyMs).toBeNull();
  });

  test('GET /api/servers/:name/ping returns latency for single node', async () => {
    const res = await request(app)
      .get('/api/servers/mumbai/ping')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('mumbai');
    expect(res.body.isOnline).toBe(true);
    expect(typeof res.body.latencyMs).toBe('number');
  });

  test('GET /api/servers/:name/ping returns 404 for non-existent node', async () => {
    const res = await request(app)
      .get('/api/servers/unknown-node/ping')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });
});
