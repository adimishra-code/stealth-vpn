const mongoose = require('mongoose');

const BandwidthSnapshotSchema = new mongoose.Schema({
  nodeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ServerNode',
    required: true,
  },
  // Day granularity, UTC midnight. One snapshot per node per day.
  date: {
    type: Date,
    required: true,
  },
  // Total MB used on the node that day (sum of device usage at snapshot time).
  totalMB: {
    type: Number,
    default: 0,
  },
  active: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// A re-run on the same day must overwrite, not duplicate.
BandwidthSnapshotSchema.index({ nodeId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('BandwidthSnapshot', BandwidthSnapshotSchema);
