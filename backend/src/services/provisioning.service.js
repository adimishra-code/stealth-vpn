const Device = require('../models/Device');
const ServerNode = require('../models/ServerNode');

const vpn = require('./vpn.service');
const xray = require('./xray.service');
const env = require('../config/env');
const { randomUUID, encryptPrivateKey, decryptPrivateKey } = require('../utils/crypto');
const { allocateIP } = require('../utils/ipAllocator');
const { generateQRBase64 } = require('../utils/qrcode');
const logger = require('../config/logger');
const { ApiError } = require('../utils/ApiError');
const emailService = require('./email.service');
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

// 'auto' (or omitted) picks the online node with the lowest active-peers
// load; an explicit name is honored only if it has capacity left.
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

// Per-node Reality credentials for the VLESS URI, sourced from env
// (NODE_MUMBAI_*/NODE_FRANKFURT_* — the same values provision-node.sh prints).
function nodeRealityKeys(serverNodeName) {
  const prefix = `NODE_${serverNodeName.toUpperCase()}`;
  return {
    realityPublicKey: env[`${prefix}_REALITY_PUBLIC_KEY`] || null,
    realityShortId: env[`${prefix}_REALITY_SHORT_ID`] || null,
  };
}

// ── Per-user provisioning lock ───────────────────────────────────────────────
// Two concurrent payments can both pass enforceDeviceLimit before either
// creates a row (TOCTOU). Single-instance PM2 makes an in-process mutex
// enough: serialize per user, second caller re-checks. Exported for tests.
const userLocks = new Map(); // userId -> Promise

function withUserLock(userId, fn) {
  const key = String(userId);
  const prev = userLocks.get(key) || Promise.resolve();
  const run = prev.catch(() => {}).then(fn);
  const settled = run.finally(() => {
    if (userLocks.get(key) === settled) userLocks.delete(key);
  });
  userLocks.set(key, settled);
  return settled;
}

async function provisionDeviceUnlocked({ user, plan, serverNodeName, deviceName, mode }) {
  await enforceDeviceLimit(user._id, plan);

  const resolvedNodeName = await resolveServerNode(serverNodeName);

  const { privateKey, publicKey, encryptedPrivateKey, serverNode } = await vpn.createDeviceOnNode({
    serverNodeName: resolvedNodeName,
  });
  const { assignedIP } = await allocateIP(resolvedNodeName);
  const uuid = randomUUID();

  let peerProvisioned = false;
  let xrayAdded = false;
  let tcHandle = null;
  let device;
  try {
    const provisioned = await vpn.provisionPeer({ serverNode, publicKey, assignedIP, plan });
    peerProvisioned = true;
    tcHandle = provisioned.tcHandle || null;
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
      encryptedXrayUUID: encryptPrivateKey(uuid),
      plan,
      quotaMB: PLAN_QUOTAS[plan] ?? null,
      tcHandle,
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
        await vpn.revokePeer({ serverNode, publicKey, tcHandle });
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
  // Only extend plan expiry on a fresh purchase — not when adding/removing
  // devices within an existing paid plan (that would yield unlimited free days).
  const planWasActive = user.planExpiresAt && user.planExpiresAt > now;
  const newExpiry = planWasActive
    ? new Date(user.planExpiresAt) // keep existing expiry; device add/revoke won't push it further
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
  });

  const qrDataUrl = await generateQRBase64(configString);

  const vlessUri = xray.buildVlessUri({
    serverNode,
    uuid,
    deviceName,
    nodeKeys: nodeRealityKeys(resolvedNodeName),
  });

  // Email the config + VLESS URI to the user. Fire-and-forget so a slow SMTP
  // server never delays the provisioning response; the user already has the
  // config in-app and the dashboard QR button stays the primary recovery.
  emailService.sendConfigEmail(user, device, configString, vlessUri).catch((err) => {
    logger.error('Config email failed', { error: err.message, deviceId: device._id.toString() });
  });

  const vlessQrDataUrl = await generateQRBase64(vlessUri);

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
    vlessUri,
    vlessQrDataUrl,
    expiresAt: newExpiry,
  };
}

// status: optional terminal marker ('expired' | 'revoked') for admin flows.
function provisionDevice(args) {
  return withUserLock(args.user._id, () => provisionDeviceUnlocked(args));
}

async function revokeDevice(device, { status } = {}) {
  const ServerNode = require('../models/ServerNode');
  const node = await ServerNode.findOne({ name: device.serverNode });
  if (!node) {
    logger.warn('Cannot revoke — server node missing', { serverNode: device.serverNode });
    device.isActive = false;
    if (status) device.status = status;
    await device.save();
    return;
  }

  // Deliberately not caught: a still-live peer must keep the device active so
  // a retry happens — marking it inactive would report revoked while the
  // user keeps working VPN access.
  if (device.encryptedXrayUUID) {
    await xray.removeXrayUser({ serverNode: node, uuid: decryptPrivateKey(device.encryptedXrayUUID) });
  }
  await vpn.revokePeer({
    serverNode: node,
    publicKey: device.wgPublicKey,
    tcHandle: device.tcHandle,
  });

  device.isActive = false;
  if (status) device.status = status;
  await device.save();
  logger.info('Device revoked', { deviceId: device._id.toString(), status: status || 'active' });
}

// Re-adds a previously revoked/expired device to its node and reactivates it
// (admin extend flow, re-buy after expiry). Peer key and IP are unchanged, so
// wg set is idempotent and no new IP is consumed.
async function reactivateDevice(device, { plan } = {}) {
  const ServerNode = require('../models/ServerNode');
  const node = await ServerNode.findOne({ name: device.serverNode });
  if (!node) {
    throw new ApiError(404, `Server node "${device.serverNode}" not found`);
  }

  const effectivePlan = plan || device.plan || 'basic';
  const provisioned = await vpn.provisionPeer({
    serverNode: node,
    publicKey: device.wgPublicKey,
    assignedIP: device.assignedIP,
    plan: effectivePlan,
  });

  if (device.encryptedXrayUUID) {
    await xray.addXrayUser({ serverNode: node, uuid: decryptPrivateKey(device.encryptedXrayUUID) });
  }

  device.tcHandle = provisioned.tcHandle || device.tcHandle;
  device.quotaMB = PLAN_QUOTAS[effectivePlan] ?? null;
  device.plan = effectivePlan;
  device.quotaExceeded = false;
  device.isActive = true;
  device.status = 'active';
  await device.save();
  logger.info('Device reactivated', {
    deviceId: device._id.toString(),
    plan: effectivePlan,
    assignedIP: device.assignedIP,
  });
  return device;
}

module.exports = {
  provisionDevice,
  withUserLock,
  revokeDevice,
  reactivateDevice,
  resolveServerNode,
  nodeRealityKeys,
  PLAN_LIMITS,
  PLAN_QUOTAS,
  enforceDeviceLimit,
};