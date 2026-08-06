const cron = require('node-cron');
const User = require('../models/User');
const Device = require('../models/Device');
const provisioning = require('../services/provisioning.service');
const emailService = require('../services/email.service');
const logger = require('../config/logger');

function startExpiryCron() {
  cron.schedule('0 2 * * *', async () => {
    try {
      await runExpiryPass();
    } catch (err) {
      // node-cron does not handle a rejected callback — without this the process exits.
      logger.error('Expiry cron failed', { error: err.message, stack: err.stack });
    }
  }, { timezone: 'UTC' });
}

async function runExpiryPass() {
  logger.info('Expiry cron checking...');

  const threeDaysFromNow = new Date(Date.now() + 3 * 86400000);
  const expiringSoon = await User.find({
    planExpiresAt: { $gte: new Date(), $lte: threeDaysFromNow },
    isActive: true,
    plan: { $ne: 'free' },
    'notified.threeDayWarning': { $ne: true },
  });

  for (const user of expiringSoon) {
    try {
      await emailService.sendRenewalWarningEmail(user, 3);
      await User.findByIdAndUpdate(user._id, { 'notified.threeDayWarning': true });
      logger.info('3-day warning sent', { userId: user._id.toString(), email: user.email });
    } catch (err) {
      logger.warn('Failed to send 3-day warning', {
        userId: user._id.toString(),
        error: err.message,
      });
    }
  }

  const expired = await User.find({
    planExpiresAt: { $lt: new Date() },
    isActive: true,
    plan: { $ne: 'free' },
  });

  for (const user of expired) {
    logger.info('User expired — revoking devices', { userId: user._id.toString() });

    const devices = await Device.find({ userId: user._id, isActive: true });
    let allRevoked = true;

    for (const device of devices) {
      try {
        await provisioning.revokeDevice(device);
      } catch (err) {
        // Leave the device active so the next pass retries. Marking it inactive
        // here would hide a peer that is still live and tunnelling on the node.
        allRevoked = false;
        logger.error('Failed to revoke device on expiry — will retry next pass', {
          deviceId: device._id.toString(),
          error: err.message,
        });
      }
    }

    if (!allRevoked) {
      logger.warn('Downgrade deferred — some peers still active', {
        userId: user._id.toString(),
      });
      continue;
    }

    user.plan = 'free';
    user.notified = {};
    await user.save();

    try {
      await emailService.sendExpiredEmail(user);
    } catch (err) {
      logger.warn('Failed to send expired email', {
        userId: user._id.toString(),
        error: err.message,
      });
    }
  }

  logger.info('Expiry cron complete');
}

module.exports = { startExpiryCron };
