const User = require('../models/User');
const { signAccessToken, signRefreshToken, verifyRefreshToken } = require('../utils/jwt');
const { randomToken } = require('../utils/crypto');
const { setRefreshCookie, clearRefreshCookie, getRefreshCookie } = require('../utils/cookies');
const { ApiError, asyncHandler } = require('../utils/ApiError');
const emailService = require('../services/email.service');
const logger = require('../config/logger');

const VERIFY_TOKEN_TTL_HOURS = 24;
const RESET_TOKEN_TTL_HOURS = 1;

exports.register = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const existing = await User.findOne({ email });
  if (existing) {
    throw new ApiError(409, 'Email already registered');
  }

  const verifyToken = randomToken(32);
  const user = new User({
    email,
    passwordHash: password,
    emailVerifyToken: verifyToken,
    emailVerifyExpires: new Date(Date.now() + VERIFY_TOKEN_TTL_HOURS * 3600 * 1000),
  });
  await user.save();

  try {
    await emailService.sendVerifyEmail(user, verifyToken);
  } catch (err) {
    logger.warn('Failed to send verify email', { error: err.message });
  }

  logger.info('User registered', { userId: user._id.toString(), email });
  res.status(201).json({
    message: 'Account created. Check your email to verify.',
    userId: user._id,
  });
});

exports.verifyEmail = asyncHandler(async (req, res) => {
  const { token } = req.body;
  const user = await User.findOne({
    emailVerifyToken: token,
    emailVerifyExpires: { $gt: new Date() },
  });
  if (!user) {
    throw new ApiError(400, 'Invalid or expired verification token');
  }

  user.emailVerified = true;
  user.emailVerifyToken = undefined;
  user.emailVerifyExpires = undefined;
  await user.save();

  logger.info('Email verified', { userId: user._id.toString() });
  res.json({ message: 'Email verified. You can now log in.' });
});

exports.login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  if (!user) {
    throw new ApiError(401, 'Invalid credentials');
  }
  if (!user.emailVerified) {
    throw new ApiError(403, 'Please verify your email first');
  }
  if (!user.isActive) {
    throw new ApiError(403, 'Account suspended');
  }

  const match = await user.comparePassword(password);
  if (!match) {
    throw new ApiError(401, 'Invalid credentials');
  }

  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);

  user.refreshTokens = user.refreshTokens || [];
  user.refreshTokens.push(refreshToken);
  if (user.refreshTokens.length > 5) {
    user.refreshTokens = user.refreshTokens.slice(-5);
  }
  await user.save();

  setRefreshCookie(res, refreshToken);
  logger.info('User logged in', { userId: user._id.toString(), email: user.email });

  res.json({
    accessToken,
    user: {
      id: user._id,
      email: user.email,
      role: user.role,
      plan: user.plan,
      planExpiresAt: user.planExpiresAt,
    },
  });
});

exports.refresh = asyncHandler(async (req, res) => {
  const token = getRefreshCookie(req);
  if (!token) {
    throw new ApiError(401, 'No refresh token provided');
  }

  let decoded;
  try {
    decoded = verifyRefreshToken(token);
  } catch (err) {
    clearRefreshCookie(res);
    throw new ApiError(401, 'Invalid refresh token');
  }

  const user = await User.findById(decoded.sub);
  if (!user) {
    throw new ApiError(401, 'User not found');
  }
  if (!user.refreshTokens || !user.refreshTokens.includes(token)) {
    user.refreshTokens = [];
    await user.save();
    clearRefreshCookie(res);
    throw new ApiError(401, 'Refresh token revoked');
  }

  user.refreshTokens = user.refreshTokens.filter((t) => t !== token);
  const newAccessToken = signAccessToken(user);
  const newRefreshToken = signRefreshToken(user);
  user.refreshTokens.push(newRefreshToken);
  await user.save();

  setRefreshCookie(res, newRefreshToken);
  res.json({ accessToken: newAccessToken });
});

exports.logout = asyncHandler(async (req, res) => {
  const token = getRefreshCookie(req);
  if (token) {
    try {
      const decoded = verifyRefreshToken(token);
      const user = await User.findById(decoded.sub);
      if (user && user.refreshTokens) {
        user.refreshTokens = user.refreshTokens.filter((t) => t !== token);
        await user.save();
      }
    } catch {
      // ignore invalid token
    }
  }
  clearRefreshCookie(res);
  logger.info('User logged out');
  res.json({ message: 'Logged out' });
});

exports.forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email });
  if (!user) {
    res.json({ message: 'If the email exists, a reset link has been sent.' });
    return;
  }

  const resetToken = randomToken(32);
  user.passwordResetToken = resetToken;
  user.passwordResetExpires = new Date(Date.now() + RESET_TOKEN_TTL_HOURS * 3600 * 1000);
  await user.save();

  try {
    await emailService.sendPasswordResetEmail(user, resetToken);
  } catch (err) {
    logger.error('Failed to send reset email', { error: err.message });
  }

  res.json({ message: 'If the email exists, a reset link has been sent.' });
});

exports.resetPassword = asyncHandler(async (req, res) => {
  const { token, password } = req.body;
  const user = await User.findOne({
    passwordResetToken: token,
    passwordResetExpires: { $gt: new Date() },
  });
  if (!user) {
    throw new ApiError(400, 'Invalid or expired reset token');
  }

  user.passwordHash = password;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  user.refreshTokens = [];
  await user.save();

  logger.info('Password reset', { userId: user._id.toString() });
  res.json({ message: 'Password updated. You can now log in.' });
});