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

  createdAt: {
    type: Date,
    default: Date.now,
  },
}, {
  toJSON: {
    transform(doc, ret) {
      delete ret.passwordHash;
      delete ret.refreshTokens;
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

UserSchema.pre('save', async function (next) {
  if (!this.isModified('passwordHash')) return next();
  this.passwordHash = await bcrypt.hash(this.passwordHash, 12);
  next();
});

UserSchema.methods.comparePassword = async function (candidate) {
  return bcrypt.compare(candidate, this.passwordHash);
};

module.exports = mongoose.model('User', UserSchema);