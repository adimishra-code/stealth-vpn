require('dotenv').config();
const mongoose = require('mongoose');

(async () => {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI not set. Add to backend/.env first.');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB.');

  const ServerNode = require('../src/models/ServerNode');
  const vpn = require('../src/services/vpn.service');
  const xray = require('../src/services/xray.service');
  const { allocateIP } = require('../src/utils/ipAllocator');
  const { randomUUID } = require('../src/utils/crypto');

  const arg = process.argv[2] || 'mumbai';
  const node = await ServerNode.findOne({ name: arg });
  if (!node) {
    console.error(`Server "${arg}" not found. Run "npm run seed" first.`);
    await mongoose.disconnect();
    process.exit(1);
  }
  if (!node.isOnline) {
    console.error(`Server "${arg}" marked offline in DB.`);
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log(`\nProvisioning test peer on ${node.name} (${node.ip})...\n`);

  const { privateKey, publicKey, encryptedPrivateKey } = await vpn.createDeviceOnNode({
    serverNodeName: node.name,
    plan: 'pro',
  });
  const { assignedIP } = await allocateIP(node.name);
  const uuid = randomUUID();

  console.log('Generated keys:');
  console.log('  Private:', privateKey.slice(0, 12) + '...');
  console.log('  Public:', publicKey.slice(0, 12) + '...');
  console.log('  Encrypted (first 24 chars):', encryptedPrivateKey.slice(0, 24) + '...');
  console.log('  UUID:', uuid);
  console.log('  Assigned IP:', assignedIP);

  console.log('\nCalling provisionPeer...');
  await vpn.provisionPeer({
    serverNode: node,
    publicKey,
    assignedIP,
    plan: 'pro',
  });

  console.log('\nCalling addXrayUser...');
  await xray.addXrayUser({ serverNode: node, uuid, flow: xray.FLOW_VISION });

  console.log('\nVerifying on node:');
  const ssh = await vpn.sshConnect(node);
  const { stdout: wgShow } = await ssh.execCommand('wg show wg0');
  console.log(wgShow);
  ssh.dispose();

  console.log('\nRolling back test peer...');
  await vpn.revokePeer({ serverNode: node, publicKey });
  await xray.removeXrayUser({ serverNode: node, uuid });

  await ServerNode.findByIdAndUpdate(node._id, { $inc: { nextIP: -1 } });
  console.log('nextIP restored.');

  console.log('\n==============================');
  console.log('  Provisioning flow works.');
  console.log('==============================');

  await mongoose.disconnect();
})().catch((err) => {
  console.error('Test failed:', err.message);
  process.exit(1);
});