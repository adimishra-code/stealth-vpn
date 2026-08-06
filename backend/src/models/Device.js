const mongoose = require('mongoose');

const DeviceSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  deviceName: {
    type: String,
    required: true,
    trim: true,
  },
  wgPublicKey: {
    type: String,
    required: true,
    unique: true,
  },
  wgPrivateKey: {
    type: String,
    required: true,
  },
  assignedIP: {
    type: String,
    required: true,
  },
  serverNode: {
    type: String,
    enum: ['mumbai', 'frankfurt'],
    required: true,
  },
  mode: {
    type: String,
    enum: ['stealth', 'gaming'],
    default: 'stealth',
  },
  xrayUUID: {
    type: String,
  },
  plan: {
    type: String,
    enum: ['basic', 'pro', 'team'],
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  bandwidthUsedMB: {
    type: Number,
    default: 0,
  },
  tcHandle: String,
  lastSeen: Date,
  createdAt: {
    type: Date,
    default: Date.now,
  },
}, {
  toJSON: {
    transform(doc, ret) {
      delete ret.wgPrivateKey;
      delete ret.__v;
      return ret;
    },
  },
});

DeviceSchema.index({ userId: 1 });
DeviceSchema.index({ wgPublicKey: 1 }, { unique: true });
DeviceSchema.index({ serverNode: 1, isActive: 1 });

module.exports = mongoose.model('Device', DeviceSchema);