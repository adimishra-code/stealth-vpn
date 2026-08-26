// INFRA-08/INFRA-09: the offline detection contract. lastOnlineAt must only
// advance on a SUCCESSFUL sweep (failed sweeps leave it untouched so the
// offline duration — and therefore the >5-min alert — can actually fire);
// lastHealthCheck records that the sweep ran either way. Freshly-seeded nodes
// (lastOnlineAt null) fall back to their creation time so a dead-on-arrival
// node still alerts.
jest.mock('../src/models/ServerNode', () => {
  class ServerNode {}
  ServerNode.findByIdAndUpdate = jest.fn(async () => ({}));
  return ServerNode;
});
const { recordStatus, offlineSinceMs, checkFrontingTls } = require('../src/cron/health.cron');

const ServerNode = require('../src/models/ServerNode');

describe('Health cron status bookkeeping (INFRA-08)', () => {
  beforeEach(() => {
    ServerNode.findByIdAndUpdate.mockClear();
  });

  test('online sweep advances lastOnlineAt and lastHealthCheck', async () => {
    const now = new Date('2026-08-01T12:00:00Z');
    await recordStatus({ _id: 'n1' }, true, now);
    expect(ServerNode.findByIdAndUpdate).toHaveBeenCalledWith('n1', {
      isOnline: true,
      lastOnlineAt: now,
      lastHealthCheck: now,
    });
  });

  test('failed sweep leaves lastOnlineAt untouched', async () => {
    const now = new Date('2026-08-01T12:00:00Z');
    await recordStatus({ _id: 'n1' }, false, now);
    expect(ServerNode.findByIdAndUpdate).toHaveBeenCalledWith('n1', {
      isOnline: false,
      lastHealthCheck: now,
    });
  });

  test('offlineSinceMs uses lastOnlineAt; falls back to createdAt for never-seen nodes', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-01T12:00:00Z'));
    expect(offlineSinceMs({ lastOnlineAt: new Date('2026-08-01T11:00:00Z') })).toBe(3600000);
    expect(offlineSinceMs({ createdAt: new Date('2026-08-01T10:00:00Z') })).toBe(7200000);
    jest.useRealTimers();
  });
});

describe('Fronting-domain TLS check (INFRA-09)', () => {
  test('unreachable host rejects with an error (cron converts it to an alert)', async () => {
    await expect(checkFrontingTls('203.0.113.1', 9, 500)).rejects.toThrow();
  });
});

describe('Health check route alignment (SEC-17)', () => {
  const request = require('supertest');
  const createApp = require('../src/app');
  const app = createApp();

  test('both /api/health and /health return status when probed', async () => {
    const res1 = await request(app).get('/api/health');
    const res2 = await request(app).get('/health');
    expect([200, 503]).toContain(res1.status);
    expect(res1.body.status).toBeDefined();
    expect([200, 503]).toContain(res2.status);
    expect(res2.body.status).toBeDefined();
  });
});
