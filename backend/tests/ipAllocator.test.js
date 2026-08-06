const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { allocateIP } = require('../src/utils/ipAllocator');
const ServerNode = require('../src/models/ServerNode');

let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  await ServerNode.deleteMany({});
  await ServerNode.create({
    name: 'mumbai',
    ip: '1.2.3.4',
    country: 'IN',
    region: 'Maharashtra',
    subnetCIDR: '10.8.0.0/16',
    nextIP: 2,
    wgPublicKey: 'server-public-key-1',
  });
});

describe('allocateIP (atomic IP assignment)', () => {
  test('returns sequential octets from nextIP', async () => {
    const a = await allocateIP('mumbai');
    expect(a.assignedIP).toBe('10.8.0.2');
    const b = await allocateIP('mumbai');
    expect(b.assignedIP).toBe('10.8.0.3');
  });

  test('two concurrent allocations never return the same IP (race test)', async () => {
    const [a, b] = await Promise.all([allocateIP('mumbai'), allocateIP('mumbai')]);
    expect(a.assignedIP).not.toBe(b.assignedIP);
  });

  test('throws 404 for unknown node', async () => {
    await expect(allocateIP('atlantis')).rejects.toMatchObject({ statusCode: 404 });
  });

  test('throws 503 at subnet exhaustion', async () => {
    await ServerNode.updateOne({ name: 'mumbai' }, { $set: { nextIP: 255 } });
    await expect(allocateIP('mumbai')).rejects.toMatchObject({ statusCode: 503 });
  });
});
