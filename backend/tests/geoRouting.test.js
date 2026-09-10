const { resolveServerNode } = require('../src/services/provisioning.service');
const ServerNode = require('../src/models/ServerNode');
const Device = require('../src/models/Device');

jest.mock('../src/models/ServerNode');
jest.mock('../src/models/Device');
jest.mock('../src/services/vpn.service', () => ({
  getServerNode: jest.fn(async (name) => ({ name, isOnline: true, maxPeers: 100 })),
}));

describe('Geo-Proximity & Latency-Aware Server Node Routing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockNodes = [
    { name: 'mumbai', country: 'IN', region: 'ap-south-1', isOnline: true, maxPeers: 100 },
    { name: 'delhi', country: 'IN', region: 'ap-south-1', isOnline: true, maxPeers: 100 },
    { name: 'frankfurt', country: 'DE', region: 'eu-central-1', isOnline: true, maxPeers: 100 },
  ];

  test('prioritizes lowest-load server in client home country', async () => {
    ServerNode.find.mockResolvedValue(mockNodes);

    // mumbai has 20 active devices, delhi has 5 active devices, frankfurt has 1 active device
    Device.countDocuments.mockImplementation(async ({ serverNode }) => {
      if (serverNode === 'mumbai') return 20;
      if (serverNode === 'delhi') return 5;
      if (serverNode === 'frankfurt') return 1;
      return 0;
    });

    // Even though frankfurt has lowest global load (1), user in 'IN' should get delhi (least loaded in IN)
    const selected = await resolveServerNode('auto', 'IN');
    expect(selected).toBe('delhi');
  });

  test('routes to country node case-insensitively with trimmed whitespace', async () => {
    ServerNode.find.mockResolvedValue(mockNodes);
    Device.countDocuments.mockResolvedValue(10);

    const selected = await resolveServerNode('auto', '  de  ');
    expect(selected).toBe('frankfurt');
  });

  test('falls back to lowest load node globally if client country has no nodes', async () => {
    ServerNode.find.mockResolvedValue(mockNodes);

    Device.countDocuments.mockImplementation(async ({ serverNode }) => {
      if (serverNode === 'mumbai') return 50;
      if (serverNode === 'delhi') return 30;
      if (serverNode === 'frankfurt') return 2;
      return 0;
    });

    // Client from US (no US node exists in mockNodes) -> falls back to least loaded node globally (frankfurt)
    const selected = await resolveServerNode('auto', 'US');
    expect(selected).toBe('frankfurt');
  });

  test('honors explicit node selection regardless of client country', async () => {
    Device.countDocuments.mockResolvedValue(5);
    const selected = await resolveServerNode('frankfurt', 'IN');
    expect(selected).toBe('frankfurt');
  });
});
