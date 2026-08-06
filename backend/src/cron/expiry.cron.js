const cron = require('node-cron');
const User = require('../models/User');
const Device = require('../models/Device');
const ServerNode = require('../models/ServerNode');
const provisioning = require('../services/provisioning.service');
const emailService = require('../services/email.service');
const logger = require('../config/logger');

function startExpiryCron() {
  cron.schedule('0 2 * * *', async () => {
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
        logger.warn('Failed to send 3-day warning', { userId: user._id.toString(), error: err.message });
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
      for (const device of devices) {
        try {
          await provisioning.revokeDevice(device);
        } catch (err) {
          logger.warn('Failed to revoke device on expiry', {
            deviceId: device._id.toString(),
            error: err.message,
          });
          device.isActive = false;
          await device.save();
        }
      }

      user.plan = 'free';
      user.isActive = true;
      user.notified = {};
      await user.save();

      try {
        await emailService.sendExpiredEmail(user);
      } catch (err) {
        logger.warn('Failed to send expired email', { userId: user._id.toString(), error: err.message });
      }
    }

    logger.info('Expiry cron complete');
  }, { timezone: 'UTC' });
}

module.exports = { startExpiryCron };