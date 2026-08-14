// PRIV-02: the purge pass must hard-delete after the grace period — and must
// DEFER instead of deleting a user whose device is still live on a node
// (otherwise the peer leaks forever with nothing left to revoke it).
jest.mock('../src/models/User', () => {
  class User {
    constructor(props) {
      Object.assign(this, props);
      this.deleted = false;
    }
    async deleteOne() {
      this.deleted = true;
    }
    static async find() {
      return User._due || [];
    }
    static async updateMany() {
      return { modifiedCount: 0 };
    }
  }
  User._due = [];
  User.updateMany = jest.fn(User.updateMany);
  return User;
});

jest.mock('../src/models/Device', () => {
  class Device {}
  Device._devices = [];
  Device.find = async ({ isActive } = {}) => (isActive ? Device._devices : []);
  Device.deleteMany = async () => {};
  return Device;
});

jest.mock('../src/models/Invoice', () => ({
  deleteMany: jest.fn(async () => {}),
}));

jest.mock('../src/services/provisioning.service', () => ({
  revokeDevice: jest.fn(async () => {}),
}));

const { runPurgePass } = require('../src/cron/purgeExpiredData.cron');
const provisioning = require('../src/services/provisioning.service');
const { deleteMany } = require('../src/models/Invoice');

const User = require('../src/models/User');

const Device = require('../src/models/Device');
describe('Account purge pass (PRIV-02)', () => {
  beforeEach(() => {
    User._due = [];
    Device._devices = [];
    provisioning.revokeDevice.mockClear();
    deleteMany.mockClear();
    User.updateMany.mockClear();
  });

  test('no due accounts → no-op', async () => {
    await expect(runPurgePass()).resolves.toBeUndefined();
    expect(provisioning.revokeDevice).not.toHaveBeenCalled();
    // DB-01: stale verify/reset tokens are still swept even with no purges.
    expect(User.updateMany).toHaveBeenCalledTimes(2);
  });

  test('due account: revokes live devices, then hard-deletes user data', async () => {
    const user = new User({ _id: 'u1', deletionScheduledAt: new Date(Date.now() - 1000) });
    User._due = [user];
    Device._devices = [{ _id: 'd1', userId: 'u1', isActive: true }];
    const { deleteMany } = require('../src/models/Invoice');

    await runPurgePass();

    expect(provisioning.revokeDevice).toHaveBeenCalledTimes(1);
    expect(provisioning.revokeDevice).toHaveBeenCalledWith({ _id: 'd1', userId: 'u1', isActive: true }, { status: 'revoked' });
    expect(deleteMany).toHaveBeenCalledWith({ userId: 'u1' });
    expect(user.deleted).toBe(true);
  });

  test('revocation failure defers the whole account instead of deleting', async () => {
    provisioning.revokeDevice.mockRejectedValueOnce(new Error('ssh unreachable'));
    const user = new User({ _id: 'u2', deletionScheduledAt: new Date(Date.now() - 1000) });
    User._due = [user];
    Device._devices = [{ _id: 'd2', userId: 'u2', isActive: true }];

    await runPurgePass();

    expect(provisioning.revokeDevice).toHaveBeenCalledTimes(1);
    expect(user.deleted).toBe(false);
    // Deletion must not have happened for the deferred account.
    const { deleteMany } = require('../src/models/Invoice');
    expect(deleteMany).not.toHaveBeenCalled();
  });
});
