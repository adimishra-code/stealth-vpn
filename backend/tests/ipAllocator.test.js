const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { allocateIP, HOST_MIN, HOST_MAX } = require('../src/utils/ipAllocator');
const ServerNode = require('../src/models/ServerNode');
const Device = require('../src/models/Device');

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
  await Device.deleteMany({});
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

describe('allocateIP (reusable & atomic IP assignment)', () => {
  test('returns lowest available octet starting at HOST_MIN', async () => {
    const a = await allocateIP('mumbai');
    expect(a.assignedIP).toBe('10.8.0.2');

    // Simulate device creation with 10.8.0.2
    await Device.create({
      userId: new mongoose.Types.ObjectId(),
      deviceName: 'Device 1',
      wgPublicKey: 'key-1-abcdefghijklmnopqrstuvwxyz012345678=',
      wgPrivateKey: 'priv-1',
      assignedIP: '10.8.0.2',
      serverNode: 'mumbai',
      isActive: true,
    });

    const b = await allocateIP('mumbai');
    expect(b.assignedIP).toBe('10.8.0.3');
  });

  test('reclaims and reuses IP when an active device is deactivated or revoked', async () => {
    const dev1 = await Device.create({
      userId: new mongoose.Types.ObjectId(),
      deviceName: 'Device 1',
      wgPublicKey: 'key-1-abcdefghijklmnopqrstuvwxyz012345678=',
      wgPrivateKey: 'priv-1',
      assignedIP: '10.8.0.2',
      serverNode: 'mumbai',
      isActive: true,
    });

    await Device.create({
      userId: new mongoose.Types.ObjectId(),
      deviceName: 'Device 2',
      wgPublicKey: 'key-2-abcdefghijklmnopqrstuvwxyz012345678=',
      wgPrivateKey: 'priv-2',
      assignedIP: '10.8.0.3',
      serverNode: 'mumbai',
      isActive: true,
    });

    // 10.8.0.2 and 10.8.0.3 are occupied, next is .4
    const c = await allocateIP('mumbai');
    expect(c.assignedIP).toBe('10.8.0.4');

    // Deactivate dev1 (10.8.0.2)
    dev1.isActive = false;
    dev1.status = 'revoked';
    await dev1.save();

    // Now 10.8.0.2 is free and must be recycled
    const recycled = await allocateIP('mumbai');
    expect(recycled.assignedIP).toBe('10.8.0.2');
  });

  test('reclaims and reuses IP when an active device is deleted', async () => {
    const dev1 = await Device.create({
      userId: new mongoose.Types.ObjectId(),
      deviceName: 'Device 1',
      wgPublicKey: 'key-1-abcdefghijklmnopqrstuvwxyz012345678=',
      wgPrivateKey: 'priv-1',
      assignedIP: '10.8.0.2',
      serverNode: 'mumbai',
      isActive: true,
    });

    await Device.deleteOne({ _id: dev1._id });

    const recycled = await allocateIP('mumbai');
    expect(recycled.assignedIP).toBe('10.8.0.2');
  });

  test('throws 404 for unknown node', async () => {
    await expect(allocateIP('atlantis')).rejects.toMatchObject({ statusCode: 404 });
  });

  test('throws 503 at subnet exhaustion when all 253 octets are in use', async () => {
    // Fill all host octets 2 to 254
    const docs = [];
    for (let octet = HOST_MIN; octet <= HOST_MAX; octet++) {
      docs.push({
        userId: new mongoose.Types.ObjectId(),
        deviceName: `Device ${octet}`,
        wgPublicKey: `key-${octet}-abcdefghijklmnopqrstuvwxyz0123456=`,
        wgPrivateKey: `priv-${octet}`,
        assignedIP: `10.8.0.${octet}`,
        serverNode: 'mumbai',
        isActive: true,
      });
    }
    await Device.insertMany(docs);

    await expect(allocateIP('mumbai')).rejects.toMatchObject({ statusCode: 503 });
  });

  test('sequential provisioning and allocation assigns valid disjoint IPs without collisions', async () => {
    const results = [];
    for (let i = 0; i < 20; i++) {
      const { assignedIP } = await allocateIP('mumbai');
      const doc = await Device.create({
        userId: new mongoose.Types.ObjectId(),
        deviceName: `Device ${i}`,
        wgPublicKey: `key-concurrent-${i}-abcdefghijklmnopqrstuvwxyz0123456=`,
        wgPrivateKey: `priv-${i}`,
        assignedIP,
        serverNode: 'mumbai',
        isActive: true,
      });
      results.push(doc.assignedIP);
    }
    const uniqueIPs = new Set(results);
    expect(uniqueIPs.size).toBe(20);
  });
});
