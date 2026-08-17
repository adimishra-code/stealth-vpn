const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
  },
  passwordHash: {
    type: String,
    required: true,
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user',
  },
  emailVerified: {
    type: Boolean,
    default: false,
  },
  // CRYPTO-02: these hold SHA-256 digests of the tokens (see
  // utils/crypto.js hashToken) — the raw values live only in email links.
  emailVerifyToken: String,
  emailVerifyExpires: Date,
  passwordResetToken: String,
  passwordResetExpires: Date,

  plan: {
    type: String,
    enum: ['free', 'basic', 'pro', 'team'],
    default: 'free',
  },
  planExpiresAt: Date,
  isActive: {
    type: Boolean,
    default: true,
  },
  banReason: String,
  bannedAt: Date,

  razorpayCustomerId: String,
  stripeCustomerId: String,

  notified: {
    threeDayWarning: { type: Boolean, default: false },
    oneDayWarning: { type: Boolean, default: false },
  },

  refreshTokens: [String],

  // SESSION-02: JTI-based refresh token tracking replaces hash array to prevent
  // concurrent refresh race conditions. Each session stores the jti (JWT ID) from
  // the refresh token payload, enabling atomic rotation via JTI lookup.
  activeSessions: [{
    jti: String,
    createdAt: { type: Date, default: Date.now },
  }],

  // ADMIN-01: TOTP 2FA for admin accounts. The secret is stored AES-256-GCM
  // encrypted (WG_ENCRYPTION_KEY envelope); totpEnabled is the operative
  // flag — setup re-generates the secret, disabling clears it.
  totpSecretEnc: String,
  totpEnabled: {
    type: Boolean,
    default: false,
  },
  // TOTP brute-force protection: track failed attempts and lock on threshold
  totpFailedAttempts: {
    type: Number,
    default: 0,
  },
  totpLockedUntil: Date,

  // When the user requested account deletion; the purge cron hard-deletes
  // the account once this passes, the grace period lets support cancel.
  deletionScheduledAt: Date,

  createdAt: {
    type: Date,
    default: Date.now,
  },
}, {
  toJSON: {
    transform(doc, ret) {
      delete ret.passwordHash;
      delete ret.refreshTokens;
      delete ret.totpSecretEnc;
      delete ret.emailVerifyToken;
      delete ret.emailVerifyExpires;
      delete ret.passwordResetToken;
      delete ret.passwordResetExpires;
      delete ret.__v;
      return ret;
    },
  },
});

UserSchema.index({ email: 1 }, { unique: true });
UserSchema.index({ planExpiresAt: 1 });
UserSchema.index({ isActive: 1, plan: 1 });
// Token lookups (verify/reset) run by digest — index so they stay O(log n).
UserSchema.index({ emailVerifyToken: 1 }, { sparse: true });
UserSchema.index({ passwordResetToken: 1 }, { sparse: true });
// Purge cron: accounts past their scheduled deletion.
UserSchema.index({ deletionScheduledAt: 1 }, { sparse: true });
// TOTP lockout check
UserSchema.index({ totpLockedUntil: 1 }, { sparse: true });

UserSchema.pre('save', async function (next) {
  if (!this.isModified('passwordHash')) return next();
  this.passwordHash = await bcrypt.hash(this.passwordHash, 12);
  next();
});

UserSchema.methods.comparePassword = async function (candidate) {
  return bcrypt.compare(candidate, this.passwordHash);
};

module.exports = mongoose.model('User', UserSchema);