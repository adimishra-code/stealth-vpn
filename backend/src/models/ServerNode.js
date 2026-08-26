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
  maxPeers: {
    type: Number,
    default: 200,
  },
  lastHealthCheck: Date,
  // Advanced only by successful sweeps, so the health cron can measure true
  // offline duration and fire the >5-min alert — lastHealthCheck is rewritten
  // every sweep (success or failure) for diagnostics.
  lastOnlineAt: {
    type: Date,
    default: null,
  },
  realityPublicKey: String,
  realityShortId: String,
  realitySniDest: String,
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

ServerNodeSchema.index({ name: 1 }, { unique: true });
// Node selection (resolveServerNode) filters by online state every call.
ServerNodeSchema.index({ isOnline: 1 });

module.exports = mongoose.model('ServerNode', ServerNodeSchema);