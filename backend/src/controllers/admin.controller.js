const User = require('../models/User');
const Invoice = require('../models/Invoice');
const Device = require('../models/Device');
const ServerNode = require('../models/ServerNode');
const { asyncHandler } = require('../utils/ApiError');
const logger = require('../config/logger');

exports.listUsers = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const search = req.query.search ? String(req.query.search).trim() : '';
  const plan = req.query.plan;

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
  const user = await User.findById(req.params.id);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  if (plan) user.plan = plan;
  if (typeof isActive === 'boolean') user.isActive = isActive;
  user.banReason = banReason;
  if (banReason && isActive === false) {
    user.bannedAt = new Date();
  }
  await user.save();

  logger.info('Admin updated user', {
    adminId: req.user._id.toString(),
    targetUserId: user._id.toString(),
    changes: { plan, isActive, banReason },
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