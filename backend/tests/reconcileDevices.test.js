const Device = require('../src/models/Device');
const ServerNode = require('../src/models/ServerNode');
const vpn = require('../src/services/vpn.service');
const provisioningService = require('../src/services/provisioning.service');
const { reconcileDevicesForPlan } = require('../src/services/webhook.service');

jest.mock('../src/models/Device');
jest.mock('../src/models/ServerNode');
jest.mock('../src/services/vpn.service');
jest.mock('../src/services/provisioning.service', () => ({
  PLAN_LIMITS: {
    basic: { devices: 1, bandwidth: 50 },
    pro: { devices: 3, bandwidth: 500 },
    team: { devices: 10, bandwidth: 2000 },
  },
  revokeDevice: jest.fn(async () => {}),
}));

describe('SEC-11: Plan downgrade reconciliation (LRU device revocation + tc shaping)', () => {
  const userId = 'u123';
  const mockNode = { name: 'mumbai', ip: '203.0.113.1' };

  beforeEach(() => {
    jest.clearAllMocks();
    ServerNode.findOne.mockResolvedValue(mockNode);
    vpn.applyThrottle.mockResolvedValue('tc1234');
    vpn.removeThrottle.mockResolvedValue();
  });

  test('downgrade from pro to basic revokes least-recently-used devices and throttles retained device', async () => {
    // 3 active devices with distinct lastSeen timestamps
    const devOldest = {
      _id: 'd1',
      userId,
      deviceName: 'Old Phone',
      assignedIP: '10.8.0.2',
      serverNode: 'mumbai',
      isActive: true,
      lastSeen: new Date('2026-08-01T10:00:00Z'),
      createdAt: new Date('2026-07-01T10:00:00Z'),
      plan: 'pro',
      save: jest.fn(async function() { return this; }),
    };
    const devMiddle = {
      _id: 'd2',
      userId,
      deviceName: 'Laptop',
      assignedIP: '10.8.0.3',
      serverNode: 'mumbai',
      isActive: true,
      lastSeen: new Date('2026-08-10T10:00:00Z'),
      createdAt: new Date('2026-07-05T10:00:00Z'),
      plan: 'pro',
      save: jest.fn(async function() { return this; }),
    };
    const devActive = {
      _id: 'd3',
      userId,
      deviceName: 'Current Phone',
      assignedIP: '10.8.0.4',
      serverNode: 'mumbai',
      isActive: true,
      lastSeen: new Date('2026-08-25T10:00:00Z'),
      createdAt: new Date('2026-07-10T10:00:00Z'),
      plan: 'pro',
      save: jest.fn(async function() { return this; }),
    };

    // Mock Device.find().sort() returning sorted array [d1, d2, d3]
    Device.find.mockReturnValue({
      sort: jest.fn().mockResolvedValue([devOldest, devMiddle, devActive]),
    });

    await reconcileDevicesForPlan(userId, 'basic');

    // For basic limit = 1. Excess = 3 - 1 = 2.
    // d1 and d2 should be revoked.
    expect(provisioningService.revokeDevice).toHaveBeenCalledTimes(2);
    expect(provisioningService.revokeDevice).toHaveBeenCalledWith(devOldest, { status: 'downgraded' });
    expect(provisioningService.revokeDevice).toHaveBeenCalledWith(devMiddle, { status: 'downgraded' });

    // d3 is retained and throttled
    expect(vpn.applyThrottle).toHaveBeenCalledWith({
      serverNode: mockNode,
      assignedIP: '10.8.0.4',
    });
    expect(devActive.tcHandle).toBe('tc1234');
    expect(devActive.plan).toBe('basic');
    expect(devActive.save).toHaveBeenCalled();
  });
});
