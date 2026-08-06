const mongoose = require('mongoose');

const ServerNodeSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  ip: {
    type: String,
    required: true,
  },
  country: {
    type: String,
    required: true,
  },
  region: {
    type: String,
    required: true,
  },
  subnetCIDR: {
    type: String,
    default: '10.8.0.0/16',
  },
  nextIP: {
    type: Number,
    default: 2,
  },
  wgPublicKey: {
    type: String,
    required: true,
  },
  xrayPort: {
    type: Number,
    default: 443,
  },
  wgPort: {
    type: Number,
    default: 51820,
  },
  isOnline: {
    type: Boolean,
    default: true,
  },
  lastHealthCheck: Date,
  realityPublicKey: String,
  realityShortId: String,
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

ServerNodeSchema.index({ name: 1 }, { unique: true });

module.exports = mongoose.model('ServerNode', ServerNodeSchema);