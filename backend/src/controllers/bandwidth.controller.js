const mongoose = require('mongoose');
const BandwidthSnapshot = require('../models/BandwidthSnapshot');
const { ApiError, asyncHandler } = require('../utils/ApiError');

const MAX_DAYS = 90;
const DEFAULT_DAYS = 30;

exports.getDailyBandwidth = asyncHandler(async (req, res) => {
  const days = Math.min(
    parseInt(req.query.days, 10) || DEFAULT_DAYS,
    MAX_DAYS
  );
  const from = new Date();
  from.setUTCHours(0, 0, 0, 0);
  from.setUTCDate(from.getUTCDate() - (days - 1));

  const filter = { date: { $gte: from } };
  if (req.query.nodeId) {
    // Unvalidated ObjectIds become a Mongo CastError → 500. Reject early.
    if (!mongoose.isValidObjectId(req.query.nodeId)) {
      throw new ApiError(400, 'Invalid nodeId');
    }
    filter.nodeId = req.query.nodeId;
  }

  const snapshots = await BandwidthSnapshot.find(filter)
    .sort({ date: 1 })
    .lean();

  res.json({
    daily: snapshots.map((s) => ({
      date: s.date.toISOString().slice(0, 10),
      totalMB: s.totalMB,
      nodeId: s.nodeId,
      active: s.active,
    })),
  });
});
