const cron = require('node-cron');
const User = require('../models/User');
const Device = require('../models/Device');
const Invoice = require('../models/Invoice');
const provisioning = require('../services/provisioning.service');
const logger = require('../config/logger');
const { alertCronFailure } = require('../services/alert.service');

function startPurgeCron() {
  let running = false;
  cron.schedule('15 3 * * *', async () => {
    if (running) {
      logger.warn('Purge cron skipped — previous run still active');
      return;
    }
    running = true;
    try {
      await runPurgePass();
    } catch (err) {
      // node-cron does not handle a rejected callback — without this the
      // process exits. A failed purge leaves scheduled deletions un-applied
      // (GDPR exposure); alert operators.
      logger.error('Purge cron failed', { error: err.message, stack: err.stack });
      alertCronFailure('purge', err);
    } finally {
      running = false;
    }
  }, { timezone: 'UTC' });
}

async function runPurgePass() {
  await clearExpiredAuthTokens();

  const due = await User.find({ deletionScheduledAt: { $lt: new Date() } });
  if (!due.length) return;

  for (const user of due) {
    // Belt-and-braces before the hard delete: anything still live on a node
    // (e.g. revocation failed at request time) gets revoked now.
    const devices = await Device.find({ userId: user._id, isActive: true });
    for (const device of devices) {
      try {
        await provisioning.revokeDevice(device, { status: 'revoked' });
      } catch (err) {
        // Leave the row so the next pass retries — deleting it here would
        // strand a live peer on the node with nothing left to revoke it.
        logger.error('Purge: revoke failed — deferring account', {
          userId: user._id.toString(),
          deviceId: device._id.toString(),
          error: err.message,
        });
        alertCronFailure('purge', err);
        continue;
      }
    }

    await Device.deleteMany({ userId: user._id });
    await Invoice.deleteMany({ userId: user._id });
    await user.deleteOne();
    logger.info('Account purged', { userId: user._id.toString() });
  }

  logger.info('Purge complete', { purged: due.length });
}

// DB-01: expired email-verify and password-reset tokens must not linger —
// stale digests waste storage/index space and shadow fresh requests.
//
// Deliberately NOT a Mongo TTL index: a TTL index on these Date fields
// DELETES THE WHOLE DOCUMENT when the indexed date passes, silently
// destroying a verified, paying account the moment a fresh reset link is
// requested. Field-level cleanup keeps the account, drops only the stale
// secret.
async function clearExpiredAuthTokens() {
  const now = new Date();
  const verify = await User.updateMany(
    { emailVerifyExpires: { $lt: now } },
    { $unset: { emailVerifyToken: '', emailVerifyExpires: '' } }
  );
  const reset = await User.updateMany(
    { passwordResetExpires: { $lt: now } },
    { $unset: { passwordResetToken: '', passwordResetExpires: '' } }
  );
  if (verify.modifiedCount || reset.modifiedCount) {
    logger.info('Cleared expired auth tokens', {
      verify: verify.modifiedCount,
      reset: reset.modifiedCount,
    });
  }
}

module.exports = { startPurgeCron, runPurgePass };
