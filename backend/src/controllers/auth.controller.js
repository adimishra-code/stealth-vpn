const User = require('../models/User');
const bcrypt = require('bcryptjs');
const { authenticator } = require('otplib');
const { signAccessToken, signRefreshToken, verifyRefreshToken, hashRefreshToken } = require('../utils/jwt');
const { randomToken, hashToken, encryptPrivateKey, decryptPrivateKey, CRYPTO_PURPOSES } = require('../utils/crypto');
const { setRefreshCookie, clearRefreshCookie, getRefreshCookie } = require('../utils/cookies');
const { ApiError, asyncHandler } = require('../utils/ApiError');
const emailService = require('../services/email.service');
const logger = require('../config/logger');
const { alertError } = require('../services/alert.service');
const { audit } = require('../services/audit.service');

const VERIFY_TOKEN_TTL_HOURS = 24;
const RESET_TOKEN_TTL_HOURS = 1;
const MAX_ACTIVE_SESSIONS = 5;
const TOTP_MAX_ATTEMPTS = 5;
const TOTP_LOCKOUT_MINUTES = 15;

// TOTP is admin-only (ADMIN-01); one step of clock drift is tolerated.
authenticator.options = { window: 1, step: 30, digits: 6 };

// allowUnenabled is set during enrollment, where the secret exists but the
// flag has not flipped on yet.
function verifyTotpCode(user, code, allowUnenabled = false) {
  if (!user.totpSecretEnc) return false;
  if (!user.totpEnabled && !allowUnenabled) return false;
  try {
    const secret = decryptPrivateKey(user.totpSecretEnc, CRYPTO_PURPOSES.totp);
    return authenticator.verify({ token: code, secret });
  } catch (err) {
    logger.error('TOTP secret decrypt failed', { userId: user._id.toString(), error: err.message });
    return false;
  }
}

async function checkTotpLockout(user) {
  if (user.totpLockedUntil && new Date() < user.totpLockedUntil) {
    const minutesRemaining = Math.ceil((user.totpLockedUntil - new Date()) / 60000);
    throw new ApiError(429, `Too many failed attempts. Try again in ${minutesRemaining} minute(s)`);
  }
  // Clear lockout if expired
  if (user.totpLockedUntil && new Date() >= user.totpLockedUntil) {
    await User.updateOne({ _id: user._id }, { $set: { totpFailedAttempts: 0, totpLockedUntil: null } });
    user.totpFailedAttempts = 0;
    user.totpLockedUntil = null;
  }
}

async function recordTotpFailure(user) {
  const newAttempts = (user.totpFailedAttempts || 0) + 1;
  const update = { $set: { totpFailedAttempts: newAttempts } };

  if (newAttempts >= TOTP_MAX_ATTEMPTS) {
    update.$set.totpLockedUntil = new Date(Date.now() + TOTP_LOCKOUT_MINUTES * 60 * 1000);
    logger.warn('TOTP account locked due to brute-force attempts', {
      userId: user._id.toString(),
      attempts: newAttempts,
    });
    alertError({
      source: 'auth.totp',
      title: `TOTP brute-force lockout — userId ${user._id}`,
      message: `Account locked after ${newAttempts} failed TOTP attempts`,
      details: { userId: user._id.toString() },
    });
    audit({
      adminId: user._id,
      actorType: 'system',
      action: 'auth.lockout',
      targetType: 'user',
      targetId: user._id.toString(),
      details: { reason: 'totp_brute_force', attempts: newAttempts },
    });
  }

  await User.updateOne({ _id: user._id }, update);
}

async function recordTotpSuccess(user) {
  if (user.totpFailedAttempts > 0 || user.totpLockedUntil) {
    await User.updateOne({ _id: user._id }, { $set: { totpFailedAttempts: 0, totpLockedUntil: null } });
  }
}

function publicUser(user) {
  return {
    id: user._id,
    email: user.email,
    role: user.role,
    plan: user.plan,
    planExpiresAt: user.planExpiresAt,
    emailVerified: user.emailVerified,
    // ADMIN-01: surface the flag (never the secret) so the settings UI can
    // render the 2FA card.
    totpEnabled: !!user.totpEnabled,
  };
}

exports.register = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const existing = await User.findOne({ email });
  if (existing) {
    // Anti-enumeration: same 201 + bcrypt burn, so the two branches are
    // indistinguishable by response or timing.
    await bcrypt.hash(password, 12);
    logger.warn('Register attempt for existing email', { email });
    // API-01: identical response shape to the success path (userId: null) —
    // a missing vs. null field would fingerprint enumerators.
    return res.status(201).json({
      message: 'Account created. Check your email to verify.',
      userId: null,
    });
  }

  const verifyToken = randomToken(32);
  const user = new User({
    email,
    passwordHash: password,
    // CRYPTO-02: only the SHA-256 digest is stored — the raw token lives in
    // the email link only, so a DB leak yields nothing replayable.
    emailVerifyToken: hashToken(verifyToken),
    emailVerifyExpires: new Date(Date.now() + VERIFY_TOKEN_TTL_HOURS * 3600 * 1000),
  });
  await user.save();

  // Email delivery never blocks account creation — a slow or dead SMTP would
  // hang the request; failures are logged and the user can request a new link.
  emailService.sendVerifyEmail(user, verifyToken).catch((err) => {
    logger.warn('Failed to send verify email', { error: err.message });
  });

  logger.info('User registered', { userId: user._id.toString(), email });
  res.status(201).json({
    message: 'Account created. Check your email to verify.',
    userId: user._id,
  });
});

exports.verifyEmail = asyncHandler(async (req, res) => {
  const { token } = req.body;
  const user = await User.findOne({
    emailVerifyToken: hashToken(token),
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
    // Anti-enumeration + timing: burn the same bcrypt cost the real path
    // pays, so "no such user" and "wrong password" are indistinguishable.
    await bcrypt.hash(password, 12);
    audit({
      actorType: 'system',
      action: 'auth.failed',
      targetType: 'user',
      targetId: 'unknown',
      details: { email, reason: 'user_not_found' },
      ip: req.ip,
    });
    throw new ApiError(401, 'Invalid credentials');
  }

  // Password is checked FIRST — learning an account's verification/suspension
  // state already requires knowing its password.
  const match = await user.comparePassword(password);
  if (!match) {
    audit({
      adminId: user._id,
      actorType: 'user',
      action: 'auth.failed',
      targetType: 'user',
      targetId: user._id.toString(),
      details: { email: user.email, reason: 'invalid_password' },
      ip: req.ip,
    });
    throw new ApiError(401, 'Invalid credentials');
  }

  // ADMIN-01 & SEC-09: TOTP challenge for admin accounts — mandatory 2FA
  let mfaCompleted = false;
  if (user.role === 'admin') {
    if (!user.totpEnabled) {
      throw new ApiError(403, 'Two-factor authentication is required for administrator accounts');
    }
    await checkTotpLockout(user);
    const { totpCode } = req.body;
    if (!totpCode || !verifyTotpCode(user, totpCode)) {
      await recordTotpFailure(user);
      audit({
        adminId: user._id,
        actorType: 'admin',
        action: 'auth.totp-failed',
        targetType: 'user',
        targetId: user._id.toString(),
        details: { email: user.email },
        ip: req.ip,
      });
      throw new ApiError(401, totpCode ? 'Invalid two-factor code' : 'Two-factor code required');
    }
    await recordTotpSuccess(user);
    mfaCompleted = true;
  }

  if (!user.emailVerified || !user.isActive) {
    // Anti-enumeration + timing parity with wrong-password: a correct
    // password against an unverified or suspended account must look
    // identical to a wrong-password attempt (same 401, same message).
    // The user can re-request verification via "Forgot password" if stuck.
    throw new ApiError(401, 'Invalid credentials');
  }

  const accessToken = signAccessToken(user, { amr: mfaCompleted ? ['mfa'] : ['pwd'] });
  const refreshToken = signRefreshToken(user);
  const { jti } = verifyRefreshToken(refreshToken);

  user.refreshTokens = user.refreshTokens || [];
  user.refreshTokens.push(hashRefreshToken(refreshToken));
  if (user.refreshTokens.length > MAX_ACTIVE_SESSIONS) {
    user.refreshTokens = user.refreshTokens.slice(-MAX_ACTIVE_SESSIONS);
  }
  // SESSION-02: initialize JTI-based sessions for new logins
  user.activeSessions = user.activeSessions || [];
  user.activeSessions.push({ jti, createdAt: new Date() });
  if (user.activeSessions.length > MAX_ACTIVE_SESSIONS) {
    user.activeSessions = user.activeSessions.slice(-MAX_ACTIVE_SESSIONS);
  }
  await user.save();

  setRefreshCookie(res, refreshToken);
  logger.info('User logged in', { userId: user._id.toString(), email: user.email });

  audit({
    adminId: user._id,
    actorType: 'user',
    action: 'auth.login',
    targetType: 'user',
    targetId: user._id.toString(),
    ip: req.ip,
  });

  res.json({
    accessToken,
    user: publicUser(user),
  });
});

exports.me = asyncHandler(async (req, res) => {
  res.json({ user: publicUser(req.user) });
});

exports.refresh = asyncHandler(async (req, res) => {
  const token = getRefreshCookie(req);
  if (!token) {
    throw new ApiError(401, 'No refresh token provided');
  }

  let decoded;
  try {
    decoded = verifyRefreshToken(token);
  } catch {
    clearRefreshCookie(res);
    throw new ApiError(401, 'Invalid refresh token');
  }

  // SESSION-02: Atomically consume the presented JTI. If the JTI is not found
  // in activeSessions, it's been rotated away (replay/theft), so revoke all.
  const user = await User.findOneAndUpdate(
    { _id: decoded.sub, 'activeSessions.jti': decoded.jti },
    { $pull: { activeSessions: { jti: decoded.jti } } },
    { new: true }
  );

  if (!user) {
    // Check if this JTI was rotated within the 10-second grace window (multi-tab race)
    const existingUser = await User.findOne({ _id: decoded.sub });
    const now = Date.now();
    const recentMatch = existingUser?.recentRotations?.find(
      (r) => r.oldJti === decoded.jti && (now - new Date(r.rotatedAt).getTime()) < 10000
    );

    if (recentMatch && existingUser.isActive) {
      logger.info('Refresh token rotation grace window hit — issuing access token without rotation', {
        userId: decoded.sub,
        oldJti: decoded.jti,
        newJti: recentMatch.newJti,
        rotatedAt: recentMatch.rotatedAt,
      });
      const accessToken = signAccessToken(existingUser);
      return res.json({ accessToken });
    }

    clearRefreshCookie(res);
    await User.updateOne({ _id: decoded.sub }, { $set: { activeSessions: [], recentRotations: [] } });
    logger.warn('Refresh token reuse detected — all sessions revoked', { userId: decoded.sub });
    alertError({
      source: 'auth.refresh',
      title: `Refresh token replay detected — userId ${decoded.sub}`,
      message: 'Possible session theft: all sessions revoked',
      details: { userId: decoded.sub },
    });
    audit({
      actorType: 'system',
      action: 'auth.token-replay',
      targetType: 'user',
      targetId: decoded.sub,
      details: { jti: decoded.jti, reason: 'replayed_token_outside_grace' },
      ip: req.ip,
    });
    throw new ApiError(401, 'Refresh token revoked');
  }

  if (!user.isActive) {
    clearRefreshCookie(res);
    throw new ApiError(403, 'Account suspended');
  }

  const amr = (user.role === 'admin' && user.totpEnabled) ? ['mfa'] : ['pwd'];
  const newAccessToken = signAccessToken(user, { amr });
  const newRefreshToken = signRefreshToken(user);
  const { jti: newJti } = verifyRefreshToken(newRefreshToken);

  // SESSION-02: atomically issue new JTI and record rotation for multi-tab grace
  await User.updateOne(
    { _id: user._id },
    {
      $push: {
        activeSessions: {
          $each: [{ jti: newJti, createdAt: new Date() }],
          $slice: -MAX_ACTIVE_SESSIONS,
        },
        recentRotations: {
          $each: [{ oldJti: decoded.jti, newJti, rotatedAt: new Date() }],
          $slice: -MAX_ACTIVE_SESSIONS,
        },
      },
    }
  );

  setRefreshCookie(res, newRefreshToken);
  res.json({ accessToken: newAccessToken });
});

exports.logout = asyncHandler(async (req, res) => {
  const token = getRefreshCookie(req);
  if (token) {
    try {
      const decoded = verifyRefreshToken(token);
      // SESSION-02: revoke by JTI instead of token hash
      await User.updateOne(
        { _id: decoded.sub },
        { $pull: { activeSessions: { jti: decoded.jti } } }
      );
      audit({
        adminId: decoded.sub,
        actorType: 'user',
        action: 'auth.logout',
        targetType: 'user',
        targetId: decoded.sub,
        ip: req.ip,
      });
    } catch {
      // invalid token — nothing to revoke
    }
  }
  clearRefreshCookie(res);
  res.json({ message: 'Logged out' });
});

// SESSION-01 — log out every device: wipes all active sessions so no refresh
// token can rotate again; the access token dies at its short expiry.
exports.logoutAll = asyncHandler(async (req, res) => {
  await User.updateOne({ _id: req.user._id }, { $set: { activeSessions: [] } });
  clearRefreshCookie(res);
  logger.info('All sessions revoked by user', { userId: req.user._id.toString() });
  res.json({ message: 'All devices signed out', sessionsRevoked: true });
});

// ADMIN-01 — generate a fresh TOTP secret for an admin account. Returns the
// plaintext exactly once (for the authenticator app + QR); only the encrypted
// copy remains, and totpEnabled stays false until the code round-trips.
exports.totpSetup = asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') {
    throw new ApiError(403, 'Two-factor authentication is for admin accounts');
  }

  const secret = authenticator.generateSecret();
  const otpauth = authenticator.keyuri(req.user.email, 'StealthVPN', secret);
  await User.updateOne(
    { _id: req.user._id },
    { $set: { totpSecretEnc: encryptPrivateKey(secret, CRYPTO_PURPOSES.totp), totpEnabled: false } }
  );

  logger.info('TOTP secret generated', { userId: req.user._id.toString() });
  // The otpauth URI is enough for the client to render the QR itself.
  res.json({ secret, otpauth });
});

// ADMIN-01 — complete enrollment: the code must verify against the secret
// that was issued by setup, then the flag flips on.
exports.totpVerify = asyncHandler(async (req, res) => {
  const { totpCode } = req.body;
  const user = await User.findById(req.user._id);
  if (!user.totpSecretEnc) throw new ApiError(400, 'Run setup first');

  if (!verifyTotpCode(user, totpCode, true)) {
    throw new ApiError(400, 'Invalid code');
  }

  await User.updateOne({ _id: user._id }, { $set: { totpEnabled: true } });
  logger.info('TOTP enabled', { userId: user._id.toString() });
  res.json({ message: 'Two-factor authentication enabled', totpEnabled: true });
});

// ADMIN-01 — disable 2FA. Requires a valid code from the authenticator app;
// a stolen session alone cannot strip it.
exports.totpDisable = asyncHandler(async (req, res) => {
  const { totpCode } = req.body;
  const user = await User.findById(req.user._id);
  if (!user.totpEnabled) throw new ApiError(400, 'Two-factor authentication is not enabled');

  if (!verifyTotpCode(user, totpCode)) {
    throw new ApiError(400, 'Invalid code');
  }

  await User.updateOne(
    { _id: user._id },
    { $set: { totpEnabled: false }, $unset: { totpSecretEnc: '' } }
  );
  logger.info('TOTP disabled', { userId: user._id.toString() });
  res.json({ message: 'Two-factor authentication disabled', totpEnabled: false });
});

exports.forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email });
  if (!user) {
    // Constant-time branch: burn the same token generation the real path pays
    // so account existence is not observable through response timing.
    randomToken(32);
    res.json({ message: 'If the email exists, a reset link has been sent.' });
    return;
  }

  const resetToken = randomToken(32);
  // TODO(security): resetToken travels to the client via the email link's
  // query string. nginx must keep logging query strings off (deploy/nginx.conf
  // log_format) — if the link format ever changes to a path-based token,
  // keep it out of access logs the same way.
  // CRYPTO-02: store the digest only; the raw token never touches the DB.
  user.passwordResetToken = hashToken(resetToken);
  user.passwordResetExpires = new Date(Date.now() + RESET_TOKEN_TTL_HOURS * 3600 * 1000);
  await user.save();

  // Same rule as register: never block the response on email delivery.
  emailService.sendPasswordResetEmail(user, resetToken).catch((err) => {
    logger.error('Failed to send reset email', { error: err.message });
  });

  res.json({ message: 'If the email exists, a reset link has been sent.' });
});

exports.resendVerify = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email });
  if (!user || user.emailVerified) {
    // Same anti-enumeration shape as forgot-password: tell the caller a link
    // is on its way regardless of whether the email exists/is verified.
    randomToken(32);
    return res.json({ message: 'If the email exists and is unverified, a new link has been sent.' });
  }

  const verifyToken = randomToken(32);
  user.emailVerifyToken = hashToken(verifyToken);
  user.emailVerifyExpires = new Date(Date.now() + VERIFY_TOKEN_TTL_HOURS * 3600 * 1000);
  await user.save();

  emailService.sendVerifyEmail(user, verifyToken).catch((err) => {
    logger.warn('Failed to send resend-verify email', { error: err.message });
  });

  res.json({ message: 'If the email exists and is unverified, a new link has been sent.' });
});

exports.resetPassword = asyncHandler(async (req, res) => {
  const { token, password } = req.body;
  const user = await User.findOne({
    passwordResetToken: hashToken(token),
    passwordResetExpires: { $gt: new Date() },
  });
  if (!user) {
    throw new ApiError(400, 'Invalid or expired reset token');
  }

  user.passwordHash = password;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  user.refreshTokens = [];
  user.activeSessions = [];
  user.recentRotations = [];
  user.passwordChangedAt = new Date();
  await user.save();

  logger.info('Password reset', { userId: user._id.toString() });

  audit({
    adminId: user._id,
    actorType: 'user',
    action: 'auth.password-reset',
    targetType: 'user',
    targetId: user._id.toString(),
    ip: req.ip,
  });

  res.json({ message: 'Password updated. You can now log in.' });
});