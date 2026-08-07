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
  // PRIV-05: the Reality UUID is a live credential (with the node's public
  // key + shortId, anyone holding it can build a working VLESS link), so it
  // is stored AES-256-GCM encrypted (encryptPrivateKey envelope, key =
  // WG_ENCRYPTION_KEY) — never in plaintext. Plaintext field xrayUUID was
  // migrated by scripts/migrate-xray-uuid.js.
  encryptedXrayUUID: {
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
  // Terminal lifecycle marker set by admin flows: 'expired' (plan ended) or
  // 'revoked' (permanent ban). The operative flag remains isActive — status
  // only records why a device was deactivated.
  status: {
    type: String,
    enum: ['active', 'expired', 'revoked'],
    default: 'active',
  },
  bandwidthUsedMB: {
    type: Number,
    default: 0,
  },
  // wg show wg0 transfer returns CUMULATIVE counters since interface start.
  // We store the last-seen baseline and $inc only the delta each sync pass.
  lastWgRxBytes: {
    type: Number,
  },
  lastWgTxBytes: {
    type: Number,
  },
  quotaMB: {
    type: Number,
    default: null,
  },
  quotaExceeded: {
    type: Boolean,
    default: false,
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
      // The Reality UUID is a usable credential (with the node's public key +
      // shortId, anyone holding it can build a working VLESS link). It must
      // never leave the server — serialization is the last line of defense
      // after the per-route .select() exclusions.
      delete ret.encryptedXrayUUID;
      delete ret.__v;
      return ret;
    },
  },
});

DeviceSchema.index({ userId: 1 });
DeviceSchema.index({ wgPublicKey: 1 }, { unique: true });
DeviceSchema.index({ serverNode: 1, assignedIP: 1 }, { unique: true });
DeviceSchema.index({ serverNode: 1, isActive: 1 });
// Device-limit enforcement and per-user listing hot path.
DeviceSchema.index({ userId: 1, isActive: 1 });

module.exports = mongoose.model('Device', DeviceSchema);