const Device = require('../models/Device');
const ServerNode = require('../models/ServerNode');
const vpn = require('../services/vpn.service');
const xray = require('../services/xray.service');
const provisioning = require('../services/provisioning.service');
const { decryptPrivateKey } = require('../utils/crypto');
const { generateQRBase64 } = require('../utils/qrcode');
const { ApiError, asyncHandler } = require('../utils/ApiError');
const logger = require('../config/logger');

exports.listDevices = asyncHandler(async (req, res) => {
  const devices = await Device.find({ userId: req.user._id })
    .select('-wgPrivateKey -xrayUUID -__v')
    .sort({ createdAt: -1 });
  res.json({ devices, total: devices.length });
});

exports.addDevice = asyncHandler(async (req, res) => {
  const { deviceName, serverNode, mode } = req.body;
  const user = req.user;
  if (!user.plan || user.plan === 'free') {
    throw new ApiError(403, 'No active plan. Subscribe to add devices.');
  }
  if (!user.planExpiresAt || user.planExpiresAt < new Date()) {
    throw new ApiError(403, 'Plan expired. Renew to add devices.');
  }

  const result = await provisioning.provisionDevice({
    user,
    plan: user.plan,
    serverNodeName: serverNode,
    deviceName,
    mode,
  });

  res.status(201).json(result);
});

exports.revokeDevice = asyncHandler(async (req, res) => {
  const device = await Device.findOne({ _id: req.params.id, userId: req.user._id });
  if (!device) throw new ApiError(404, 'Device not found');
  if (!device.isActive) throw new ApiError(400, 'Device already revoked');

  await provisioning.revokeDevice(device);

  res.json({ message: 'Device revoked', deviceId: device._id });
});

exports.downloadConfig = asyncHandler(async (req, res) => {
  const device = await Device.findOne({ _id: req.params.id, userId: req.user._id });
  if (!device) throw new ApiError(404, 'Device not found');
  if (!device.isActive) throw new ApiError(400, 'Device revoked');

  const privateKey = decryptPrivateKey(device.wgPrivateKey);
  const serverNode = await ServerNode.findOne({ name: device.serverNode });
  if (!serverNode) throw new ApiError(404, 'Server node not found');

  const config = vpn.generateWGConfig({ privateKey, assignedIP: device.assignedIP, serverNode, mode: device.mode });

  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Content-Disposition', `attachment; filename="stealth-${device.deviceName}.conf"`);
  res.send(config);
});

exports.qrcode = asyncHandler(async (req, res) => {
  const device = await Device.findOne({ _id: req.params.id, userId: req.user._id });
  if (!device) throw new ApiError(404, 'Device not found');
  if (!device.isActive) throw new ApiError(400, 'Device revoked');

  const privateKey = decryptPrivateKey(device.wgPrivateKey);
  const serverNode = await ServerNode.findOne({ name: device.serverNode });
  if (!serverNode) throw new ApiError(404, 'Server node not found');

  const config = vpn.generateWGConfig({ privateKey, assignedIP: device.assignedIP, serverNode, mode: device.mode });
  const qrDataUrl = await generateQRBase64(config);
  res.json({ qrDataUrl, deviceName: device.deviceName });
});

exports.toggleMode = asyncHandler(async (req, res) => {
  const { mode } = req.body;
  const device = await Device.findOneAndUpdate(
    { _id: req.params.id, userId: req.user._id },
    { $set: { mode } },
    { new: true }
  ).select('-wgPrivateKey -__v');

  if (!device) throw new ApiError(404, 'Device not found');
  if (!device.isActive) throw new ApiError(400, 'Device revoked');

  logger.info('Device mode toggled', { deviceId: device._id.toString(), mode });
  res.json({ device });
});

exports.getBandwidth = asyncHandler(async (req, res) => {
  const device = await Device.findOne({ _id: req.params.id, userId: req.user._id })
    .select('deviceName bandwidthUsedMB lastSeen');
  if (!device) throw new ApiError(404, 'Device not found');

  res.json({
    deviceId: device._id,
    deviceName: device.deviceName,
    bandwidthUsedMB: device.bandwidthUsedMB,
    bandwidthUsedGB: (device.bandwidthUsedMB / 1024).toFixed(2),
    lastSeen: device.lastSeen,
  });
});