const User = require('../models/User');
const Device = require('../models/Device');
const Invoice = require('../models/Invoice');

const vpn = require('./vpn.service');
const xray = require('./xray.service');
const { encryptPrivateKey, randomUUID } = require('../utils/crypto');
const { allocateIP } = require('../utils/ipAllocator');
const { generateQRBase64 } = require('../utils/qrcode');
const logger = require('../config/logger');
const { ApiError } = require('../utils/ApiError');
const { PLAN_DURATION_DAYS, PLAN_PRICES_INR } = require('./payment.service');

const PLAN_LIMITS = {
  free: { devices: 0 },
  basic: { devices: 1 },
  pro: { devices: 3 },
  team: { devices: 10 },
};

async function enforceDeviceLimit(userId, plan) {
  const activeDevices = await Device.countDocuments({ userId, isActive: true });
  const limit = PLAN_LIMITS[plan]?.devices ?? 0;
  if (activeDevices >= limit) {
    throw new ApiError(403, `${plan.toUpperCase()} plan allows max ${limit} device(s)`);
  }
}

async function provisionDevice({ user, plan, serverNodeName, deviceName, mode, invoiceData }) {
  await enforceDeviceLimit(user._id, plan);

  const { privateKey, publicKey, encryptedPrivateKey, serverNode } = await vpn.createDeviceOnNode({
    serverNodeName,
    plan,
  });
  const { assignedIP } = await allocateIP(serverNodeName);
  const uuid = randomUUID();

  try {
    await vpn.provisionPeer({ serverNode, publicKey, assignedIP, plan });
    await xray.addXrayUser({ serverNode, uuid, flow: xray.FLOW_VISION });
  } catch (err) {
    logger.error('Provisioning failed — rolling back IP allocation', {
      error: err.message,
      assignedIP,
    });
    const ServerNode = require('../models/ServerNode');
    await ServerNode.findOneAndUpdate({ name: serverNodeName }, { $inc: { nextIP: -1 } });
    throw err;
  }

  const device = await Device.create({
    userId: user._id,
    deviceName,
    wgPublicKey: publicKey,
    wgPrivateKey: encryptedPrivateKey,
    assignedIP,
    serverNode: serverNodeName,
    mode,
    xrayUUID: uuid,
    plan,
    tcHandle: null,
    isActive: true,
  });

  let invoice = null;
  if (invoiceData) {
    invoice = await Invoice.create({
      userId: user._id,
      plan,
      amountINR: invoiceData.amountINR ?? PLAN_PRICES_INR[plan],
      currency: invoiceData.currency ?? 'INR',
      gateway: invoiceData.gateway,
      gatewayPaymentId: invoiceData.gatewayPaymentId,
      gatewayOrderId: invoiceData.gatewayOrderId,
      status: 'paid',
      paidAt: new Date(),
    });
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
    serverNode: serverNodeName,
    plan,
    assignedIP,
    invoiceId: invoice?._id?.toString(),
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
    invoiceId: invoice?._id,
  };
}

async function revokeDevice(device) {
  const ServerNode = require('../models/ServerNode');
  const node = await ServerNode.findOne({ name: device.serverNode });
  if (!node) {
    logger.warn('Cannot revoke — server node missing', { serverNode: device.serverNode });
    return;
  }
  try {
    if (device.xrayUUID) {
      await xray.removeXrayUser({ serverNode: node, uuid: device.xrayUUID });
    }
    await vpn.revokePeer({
      serverNode: node,
      publicKey: device.wgPublicKey,
      tcHandle: device.tcHandle,
    });
  } catch (err) {
    logger.error('Revoke failed (marking inactive anyway)', {
      deviceId: device._id.toString(),
      error: err.message,
    });
  }
  device.isActive = false;
  await device.save();
  logger.info('Device revoked', { deviceId: device._id.toString() });
}

module.exports = {
  provisionDevice,
  revokeDevice,
  PLAN_LIMITS,
  enforceDeviceLimit,
};