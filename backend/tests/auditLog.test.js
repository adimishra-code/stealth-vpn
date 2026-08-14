// ADMIN-02: audit logging contract. The fire-and-forget wrapper must never
// reject into the caller (an admin ban must not fail because the audit write
// did), failures are logged, and the payload carries exactly the fields the
// list endpoint renders.
jest.mock('../src/models/AuditLog', () => ({
  create: jest.fn(async () => ({})),
}));
const AuditLog = require('../src/models/AuditLog');

const { audit } = require('../src/services/audit.service');

describe('Audit log service (ADMIN-02)', () => {
  beforeEach(() => {
    AuditLog.create.mockClear();
  });

  test('writes the full payload (who did what to whom, from where)', async () => {
    const payload = {
      adminId: 'admin-1',
      action: 'device.expire',
      targetType: 'device',
      targetId: 'dev-1',
      details: { days: 7 },
      ip: '198.51.100.2',
    };
    audit(payload);
    await Promise.resolve(); // fire-and-forget promise settles
    expect(AuditLog.create).toHaveBeenCalledWith(payload);
  });

  test('a failing audit write never throws into the caller', async () => {
    AuditLog.create.mockRejectedValueOnce(new Error('db down'));
    expect(() => audit({ adminId: 'admin-1', action: 'user.ban', targetType: 'user', targetId: 'u1' })).not.toThrow();
    await new Promise((resolve) => setImmediate(resolve));
    expect(AuditLog.create).toHaveBeenCalledTimes(1);
  });
});
