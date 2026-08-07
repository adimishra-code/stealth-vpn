const User = require('../models/User');
const Invoice = require('../models/Invoice');
const Device = require('../models/Device');
const ServerNode = require('../models/ServerNode');
const AuditLog = require('../models/AuditLog');
const provisioning = require('../services/provisioning.service');
const { audit } = require('../services/audit.service');
const { computePoolUsage } = require('../utils/ipPool');
const { alertError } = require('../services/alert.service');
const { ApiError, asyncHandler } = require('../utils/ApiError');
const logger = require('../config/logger');

exports.listUsers = asyncHandler(async (req, res) => {
  // PRIV-07/08: filters come from the validated POST body — identifiers must
  // never ride the query string into access logs.
  const page = req.body.page || 1;
  const limit = req.body.limit || 20;
  const search = req.body.search ? String(req.body.search).trim() : '';
  const plan = req.body.plan;

  const filter = {};
  if (search) {
    filter.email = { $regex: search, $options: 'i' };
  }
  if (plan) {
    filter.plan = plan;
  }

  const [users, total] = await Promise.all([
    User.find(filter)
      .select('-passwordHash -refreshTokens -emailVerifyToken -emailVerifyExpires -passwordResetToken -passwordResetExpires')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    User.countDocuments(filter),
  ]);

  res.json({
    users,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

exports.updateUser = asyncHandler(async (req, res) => {
  const { plan, isActive, banReason } = req.body;

  if (req.params.id === req.user._id.toString()) {
    throw new ApiError(403, 'You cannot modify your own admin account');
  }

  const user = await User.findById(req.params.id);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  if (plan) user.plan = plan;
  if (typeof isActive === 'boolean') {
    user.isActive = isActive;
    if (isActive) {
      // Unban — clear the full ban record so the account is truly restored.
      user.banReason = undefined;
      user.bannedAt = undefined;
    } else if (banReason) {
      user.banReason = banReason;
      user.bannedAt = new Date();
    }
  }
  await user.save();

  logger.info('Admin updated user', {
    adminId: req.user._id.toString(),
    targetUserId: user._id.toString(),
    changes: { plan, isActive, banReason },
  });
  audit({
    adminId: req.user._id,
    action: 'user.update',
    targetType: 'user',
    targetId: user._id.toString(),
    details: { plan: plan || null, isActive: typeof isActive === 'boolean' ? isActive : null, banReason: banReason || null },
    ip: req.ip,
  });

  res.json({
    message: 'User updated',
    user: {
      id: user._id,
      email: user.email,
      plan: user.plan,
      isActive: user.isActive,
      banReason: user.banReason,
      bannedAt: user.bannedAt,
    },
  });
});

exports.getRevenue = asyncHandler(async (req, res) => {
  const now = new Date();
  const dayMs = 86400000;

  // Grouped by currency — INR (paise) and USD (cents) are different units and
  // summing them together produces a meaningless figure.
  const revenue = await Invoice.aggregate([
    { $match: { status: 'paid' } },
    {
      $group: {
        _id: {
          date: { $dateToString: { format: '%Y-%m-%d', date: '$paidAt' } },
          currency: '$currency',
        },
        total: { $sum: '$amount' },
        count: { $sum: 1 },
      },
    },
    {
      $project: {
        _id: 0,
        date: '$_id.date',
        currency: '$_id.currency',
        total: 1,
        count: 1,
      },
    },
    { $sort: { date: 1 } },
  ]);

  const mrr = await Invoice.aggregate([
    { $match: { status: 'paid', paidAt: { $gte: new Date(now - 30 * dayMs) } } },
    { $group: { _id: '$currency', total: { $sum: '$amount' }, count: { $sum: 1 } } },
    { $project: { _id: 0, currency: '$_id', total: 1, count: 1 } },
  ]);

  res.json({
    daily: revenue,
    last30Days: mrr,
  });
});

exports.getBandwidthStats = asyncHandler(async (req, res) => {
  const stats = await Device.aggregate([
    { $group: { _id: '$serverNode', totalMB: { $sum: '$bandwidthUsedMB' }, active: { $sum: { $cond: ['$isActive', 1, 0] } } } },
  ]);
  res.json({ perNode: stats });
});

// 2B — IP pool status. Alerts via console.warn when any node crosses 80% of
// its pool — the operator should add capacity or reclaim IPs before a new
// signup starts getting 503 "at capacity" errors.
exports.getPoolStatus = asyncHandler(async (req, res) => {
  const nodes = await ServerNode.find().select('name subnetCIDR nextIP');
  const perNode = nodes.map((n) => computePoolUsage(n));

  for (const p of perNode) {
    if (p.pct >= 80) {
      console.warn(`[POOL WARN] ${p.node}: ${p.pct}% of IP pool used (${p.allocated}/${p.total}) — consider capacity planning`);
    }
  }

  const total = perNode.reduce((s, p) => s + p.total, 0);
  const allocated = perNode.reduce((s, p) => s + p.allocated, 0);
  res.json({
    perNode,
    total,
    allocated,
    free: Math.max(total - allocated, 0),
    pct: total > 0 ? Math.round((allocated / total) * 100) : 0,
  });
});

exports.getAlerts = asyncHandler(async (req, res) => {
  const failedPayments = await Invoice.find({ status: 'failed' })
    .sort({ createdAt: -1 })
    .limit(20)
    .populate('userId', 'email');
  const expiredUsers = await User.find({
    plan: { $ne: 'free' },
    planExpiresAt: { $lt: new Date() },
    isActive: true,
  }).select('email plan planExpiresAt');
  const offlineNodes = await ServerNode.find({ isOnline: false }).select('name ip lastHealthCheck');

  res.json({ failedPayments, expiredUsers, offlineNodes });
});

// Admin device inventory — needed by the admin panel to pick targets for the
// lifecycle actions below. Search matches device name or assigned IP.
exports.listDevices = asyncHandler(async (req, res) => {
  const page = req.body.page || 1;
  const limit = req.body.limit || 20;
  const search = req.body.search ? String(req.body.search).trim() : '';

  const filter = {};
  if (search) {
    filter.$or = [
      { deviceName: { $regex: search, $options: 'i' } },
      { assignedIP: { $regex: search, $options: 'i' } },
    ];
  }

  const [devices, total] = await Promise.all([
    Device.find(filter)
      .populate('userId', 'email')
      .select('-wgPrivateKey -encryptedXrayUUID -__v')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Device.countDocuments(filter),
  ]);

  res.json({
    devices,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

// ── Device lifecycle actions ─────────────────────────────────────────────────

async function findDeviceOr404(id) {
  const device = await Device.findById(id);
  if (!device) throw new ApiError(404, 'Device not found');
  return device;
}

// F1 — force-expire: run the full expiry flow now (wg peer remove, xray user
// remove, tc cleanup) and mark the device expired.
exports.expireDevice = asyncHandler(async (req, res) => {
  const device = await findDeviceOr404(req.params.id);
  if (device.userId.toString() === req.user._id.toString()) {
    throw new ApiError(403, 'You cannot expire your own device');
  }
  if (!device.isActive) throw new ApiError(400, 'Device is already inactive');

  await provisioning.revokeDevice(device, { status: 'expired' });

  logger.info('Admin force-expired device', {
    adminId: req.user._id.toString(),
    deviceId: device._id.toString(),
  });
  audit({
    adminId: req.user._id,
    action: 'device.expire',
    targetType: 'device',
    targetId: device._id.toString(),
    details: { userId: device.userId.toString(), deviceName: device.deviceName },
    ip: req.ip,
  });
  res.json({ message: 'Device expired', deviceId: device._id, status: 'expired' });
});

// F2 — revoke (permanent ban): same teardown but the device can never be
// reactivated through normal flows.
exports.revokeDevice = asyncHandler(async (req, res) => {
  const device = await findDeviceOr404(req.params.id);
  if (device.userId.toString() === req.user._id.toString()) {
    throw new ApiError(403, 'You cannot revoke your own device');
  }
  if (!device.isActive) throw new ApiError(400, 'Device is already inactive');

  await provisioning.revokeDevice(device, { status: 'revoked' });

  logger.info('Admin revoked device', {
    adminId: req.user._id.toString(),
    deviceId: device._id.toString(),
  });
  audit({
    adminId: req.user._id,
    action: 'device.revoke',
    targetType: 'device',
    targetId: device._id.toString(),
    details: { userId: device.userId.toString(), deviceName: device.deviceName },
    ip: req.ip,
  });
  res.json({ message: 'Device revoked', deviceId: device._id, status: 'revoked' });
});

// F3 — extend: add N days to the user's plan expiry; if the device had already
// been expired, re-add the peer (and Xray user + throttle for basic) first.
exports.extendDevice = asyncHandler(async (req, res) => {
  const { days } = req.body;
  const device = await findDeviceOr404(req.params.id);
  const user = await User.findById(device.userId);
  if (!user) throw new ApiError(404, 'User not found');

  if (!device.isActive) {
    await provisioning.reactivateDevice(device, { plan: device.plan || user.plan });
  }

  const now = new Date();
  const base = user.planExpiresAt && user.planExpiresAt > now ? user.planExpiresAt : now;
  user.planExpiresAt = new Date(base.getTime() + days * 86400000);
  user.plan = device.plan || user.plan || 'basic';
  user.isActive = true;
  user.notified = {};
  await user.save();

  logger.info('Admin extended device expiry', {
    adminId: req.user._id.toString(),
    deviceId: device._id.toString(),
    days,
    planExpiresAt: user.planExpiresAt,
  });
  audit({
    adminId: req.user._id,
    action: 'device.extend',
    targetType: 'device',
    targetId: device._id.toString(),
    details: { userId: user._id.toString(), days, planExpiresAt: user.planExpiresAt },
    ip: req.ip,
  });
  res.json({
    message: `Expiry extended by ${days} days`,
    deviceId: device._id,
    planExpiresAt: user.planExpiresAt,
  });
});

// F4 — ban: suspend the account and tear down every active device immediately.
exports.banUser = asyncHandler(async (req, res) => {
  const { banReason } = req.body;

  if (req.params.id === req.user._id.toString()) {
    throw new ApiError(403, 'You cannot ban your own account');
  }

  const user = await User.findById(req.params.id);
  if (!user) throw new ApiError(404, 'User not found');

  user.isActive = false;
  user.banReason = banReason;
  user.bannedAt = new Date();
  await user.save();

  const devices = await Device.find({ userId: user._id, isActive: true });
  let revoked = 0;
  let failed = 0;

  for (const device of devices) {
    try {
      await provisioning.revokeDevice(device, { status: 'revoked' });
      revoked += 1;
    } catch (err) {
      failed += 1;
      logger.error('Ban: device revoke failed — will retry on expiry pass', {
        deviceId: device._id.toString(),
        error: err.message,
      });
      alertError({
        source: 'admin.ban',
        title: `Device revoke failed while banning user ${user._id}`,
        message: err.message,
        details: { deviceId: device._id.toString(), userId: user._id.toString() },
        err,
      });
    }
  }

  logger.info('Admin banned user', {
    adminId: req.user._id.toString(),
    targetUserId: user._id.toString(),
    revoked,
    failed,
  });
  audit({
    adminId: req.user._id,
    action: 'user.ban',
    targetType: 'user',
    targetId: user._id.toString(),
    details: { banReason: banReason || null, revoked, failed },
    ip: req.ip,
  });
  res.json({
    message: `User banned · ${revoked} device(s) revoked${failed ? ` · ${failed} failed (retry scheduled)` : ''}`,
    userId: user._id,
    revoked,
    failed,
  });
});

// F5 — manual bandwidth reset: zero the device counter and drop the wg
// baselines so the next sync pass restarts from the new baseline.
exports.resetBandwidth = asyncHandler(async (req, res) => {
  const device = await findDeviceOr404(req.params.id);

  device.bandwidthUsedMB = 0;
  device.lastWgRxBytes = null;
  device.lastWgTxBytes = null;
  device.quotaExceeded = false;
  await device.save();

  logger.info('Admin reset device bandwidth', {
    adminId: req.user._id.toString(),
    deviceId: device._id.toString(),
  });
  audit({
    adminId: req.user._id,
    action: 'device.reset-bandwidth',
    targetType: 'device',
    targetId: device._id.toString(),
    details: { userId: device.userId.toString(), deviceName: device.deviceName },
    ip: req.ip,
  });
  res.json({ message: 'Bandwidth usage reset', deviceId: device._id, bandwidthUsedMB: 0 });
});

// ADMIN-02: read the audit trail. Plain pagination (no identifiers in the
// query string), newest first, 90-day TTL retention on the collection.
exports.listAuditLogs = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);

  const [logs, total] = await Promise.all([
    AuditLog.find()
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('adminId', 'email')
      .lean(),
    AuditLog.countDocuments(),
  ]);

  res.json({
    logs: logs.map((l) => ({
      id: l._id,
      adminEmail: l.adminId?.email || null,
      action: l.action,
      targetType: l.targetType,
      targetId: l.targetId,
      details: l.details,
      ip: l.ip,
      createdAt: l.createdAt,
    })),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});