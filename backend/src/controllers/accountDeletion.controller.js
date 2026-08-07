const User = require('../models/User');
const Device = require('../models/Device');
const Invoice = require('../models/Invoice');
const provisioning = require('../services/provisioning.service');
const { clearRefreshCookie } = require('../utils/cookies');
const { ApiError, asyncHandler } = require('../utils/ApiError');
const logger = require('../config/logger');

// Grace period between the deletion request and the hard purge, so an
// accidental request can be cancelled via support (they clear the field).
const PURGE_GRACE_DAYS = 14;

// DELETE /api/auth/me — GDPR-style right to be forgotten.
//   * immediately revokes every device on the nodes (no tunnel keeps working)
//   * invalidates all sessions (refresh tokens wiped)
//   * schedules the irreversible hard delete PURGE_GRACE_DAYS out — the
//     daily purge cron (src/cron/purgeExpiredData.cron.js) removes the user,
//     devices and invoices once deletionScheduledAt passes.
exports.requestAccountDeletion = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  const deletionScheduledAt = new Date(Date.now() + PURGE_GRACE_DAYS * 86400000);
  user.deletionScheduledAt = deletionScheduledAt;
  user.refreshTokens = [];
  await user.save();

  // Best-effort revocation now; the purge cron re-revokes anything missed
  // before the hard delete, so a live peer can never outlive the account.
  const devices = await Device.find({ userId: user._id, isActive: true });
  for (const device of devices) {
    try {
      await provisioning.revokeDevice(device, { status: 'revoked' });
    } catch (err) {
      logger.warn('Deletion: revoke failed — purge cron will retry', {
        deviceId: device._id.toString(),
        error: err.message,
      });
    }
  }

  await Invoice.updateMany({ userId: user._id }, { deletionScheduledAt });

  clearRefreshCookie(res);
  logger.info('Account deletion scheduled', { userId: user._id.toString() });
  res.json({
    message: `Account deletion scheduled for ${deletionScheduledAt.toISOString()}. Contact support to cancel within the grace period.`,
    deletionScheduledAt,
  });
});
