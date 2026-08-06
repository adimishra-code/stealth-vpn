const User = require('../models/User');
const Device = require('../models/Device');
const ServerNode = require('../models/ServerNode');

const vpn = require('./vpn.service');
const xray = require('./xray.service');
const { encryptPrivateKey, randomUUID } = require('../utils/crypto');
const { allocateIP } = require('../utils/ipAllocator');
const { generateQRBase64 } = require('../utils/qrcode');
const logger = require('../config/logger');
const { ApiError } = require('../utils/ApiError');
const { PLAN_DURATION_DAYS } = require('./payment.service');

const PLAN_LIMITS = {
  free: { devices: 0 },
  basic: { devices: 1 },
  pro: { devices: 3 },
  team: { devices: 10 },
};

// Monthly quota in MB. null = unlimited. Enforced by the bandwidth cron.
const PLAN_QUOTAS = {
  basic: 500 * 1024, // 500 GB
  pro: null,
  team: null,
};

async function enforceDeviceLimit(userId, plan) {
  const activeDevices = await Device.countDocuments({ userId, isActive: true });
  const limit = PLAN_LIMITS[plan]?.devices ?? 0;
  if (activeDevices >= limit) {
    throw new ApiError(403, `${plan.toUpperCase()} plan allows max ${limit} device(s)`);
  }
}

// 'auto' (or omitted) picks the online node with the lowest active-peers load;
// an explicit name is honored only if it has capacity left. Prevents every
// user piling onto Mumbai until it falls over.
async function resolveServerNode(serverNodeName) {
  if (serverNodeName && serverNodeName !== 'auto') {
    const node = await vpn.getServerNode(serverNodeName);
    const active = await Device.countDocuments({ serverNode: node.name, isActive: true });
    if (node.maxPeers && active >= node.maxPeers) {
      throw new ApiError(503, `Server "${node.name}" is at capacity`);
    }
    return node.name;
  }

  const nodes = await ServerNode.find({ isOnline: true });
  const candidates = [];
  for (const node of nodes) {
    const active = await Device.countDocuments({ serverNode: node.name, isActive: true });
    if (node.maxPeers && active >= node.maxPeers) continue;
    candidates.push({ name: node.name, load: active / (node.maxPeers || 1) });
  }
  if (!candidates.length) {
    throw new ApiError(503, 'All server nodes are at capacity');
  }
  candidates.sort((a, b) => a.load - b.load);
  return candidates[0].name;
}

async function provisionDevice({ user, plan, serverNodeName, deviceName, mode }) {
  await enforceDeviceLimit(user._id, plan);

  const resolvedNodeName = await resolveServerNode(serverNodeName);

  const { privateKey, publicKey, encryptedPrivateKey, serverNode } = await vpn.createDeviceOnNode({
    serverNodeName: resolvedNodeName,
    plan,
  });
  const { assignedIP } = await allocateIP(resolvedNodeName);
  const uuid = randomUUID();

  let peerProvisioned = false;
  let xrayAdded = false;
  let device;
  try {
    await vpn.provisionPeer({ serverNode, publicKey, assignedIP, plan });
    peerProvisioned = true;
    await xray.addXrayUser({ serverNode, uuid, flow: xray.FLOW_VISION });
    xrayAdded = true;

    device = await Device.create({
      userId: user._id,
      deviceName,
      wgPublicKey: publicKey,
      wgPrivateKey: encryptedPrivateKey,
      assignedIP,
      serverNode: resolvedNodeName,
      mode,
      xrayUUID: uuid,
      plan,
      quotaMB: PLAN_QUOTAS[plan] ?? null,
      tcHandle: null,
      isActive: true,
    });
  } catch (err) {
    // Undo whatever landed on the node. Without this the peer stays live on the
    // remote host with no Device row, so nothing can ever revoke it.
    if (xrayAdded) {
      try {
        await xray.removeXrayUser({ serverNode, uuid });
      } catch (cleanupErr) {
        logger.error('Rollback: failed to remove Xray user', {
          uuid,
          error: cleanupErr.message,
        });
      }
    }
    if (peerProvisioned) {
      try {
        await vpn.revokePeer({ serverNode, publicKey, tcHandle: null });
      } catch (cleanupErr) {
        logger.error('Rollback: failed to remove WireGuard peer', {
          assignedIP,
          error: cleanupErr.message,
        });
      }
    }
    // The allocated octet is deliberately not returned to the pool: decrementing
    // the counter would hand the same IP to a concurrent request.
    logger.error('Provisioning failed — rolled back node state', {
      error: err.message,
      assignedIP,
    });
    throw err;
  }

  const now = new Date();
  const newExpiry = user.planExpiresAt && user.planExpiresAt > now
    ? new Date(user.planExpiresAt.getTime() + PLAN_DURATION_DAYS * 86400000)
    : new Date(now.getTime() + PLAN_DURATION_DAYS * 86400000);

  user.plan = plan;
  user.planExpiresAt = newExpiry;
  user.isActive = true;
  user.notified = {};
  await user.save();

  logger.info('Device provisioned', {
    userId: user._id.toString(),
    deviceId: device._id.toString(),
    serverNode: resolvedNodeName,
    plan,
    assignedIP,
  });

  const configString = vpn.generateWGConfig({
    privateKey,
    assignedIP,
    serverNode,
    mode,
  });

  const qrDataUrl = await generateQRBase64(configString);

  return {
    device: {
      id: device._id,
      deviceName: device.deviceName,
      assignedIP: device.assignedIP,
      serverNode: device.serverNode,
      mode: device.mode,
      plan: device.plan,
    },
    config: configString,
    qrDataUrl,
    expiresAt: newExpiry,
  };
}

async function revokeDevice(device) {
  const ServerNode = require('../models/ServerNode');
  const node = await ServerNode.findOne({ name: device.serverNode });
  if (!node) {
    logger.warn('Cannot revoke — server node missing', { serverNode: device.serverNode });
    device.isActive = false;
    await device.save();
    return;
  }

  // Deliberately not caught: if the peer is still live on the node, the device
  // must stay active so a retry happens. Marking it inactive here would report
  // revoked while the user keeps working VPN access.
  if (device.xrayUUID) {
    await xray.removeXrayUser({ serverNode: node, uuid: device.xrayUUID });
  }
  await vpn.revokePeer({
    serverNode: node,
    publicKey: device.wgPublicKey,
    tcHandle: device.tcHandle,
  });

  device.isActive = false;
  await device.save();
  logger.info('Device revoked', { deviceId: device._id.toString() });
}

module.exports = {
  provisionDevice,
  revokeDevice,
  resolveServerNode,
  PLAN_LIMITS,
  PLAN_QUOTAS,
  enforceDeviceLimit,
};