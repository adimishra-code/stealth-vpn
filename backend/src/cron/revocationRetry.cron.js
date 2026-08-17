const cron = require('node-cron');
const Device = require('../models/Device');
const logger = require('../config/logger');
const provisioning = require('../services/provisioning.service');
const { alertError } = require('../services/alert.service');

// REVOKE-01: Retry failed device revocations with exponential backoff
let isRunning = false;

function startRevocationRetryCron() {
  // Run every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    if (isRunning) return;
    isRunning = true;

    try {
      const now = new Date();
      // Find devices marked for retry where the backoff window has passed
      const retryDevices = await Device.find({
        revokeRetryUntil: { $lte: now },
        revokeFailedAt: { $exists: true },
      });

      if (retryDevices.length === 0) {
        isRunning = false;
        return;
      }

      logger.info('Revocation retry cron: found retry candidates', { count: retryDevices.length });

      let succeededCount = 0;
      let failedCount = 0;

      for (const device of retryDevices) {
        try {
          await provisioning.revokeDevice(device, { status: 'revoked' });
          succeededCount++;
          logger.info('Revocation retry succeeded', {
            deviceId: device._id.toString(),
            userId: device.userId.toString(),
          });
        } catch (err) {
          failedCount++;
          logger.warn('Revocation retry failed — will retry again', {
            deviceId: device._id.toString(),
            userId: device.userId.toString(),
            retryCount: device.revokeRetryCount,
            error: err.message,
          });

          // If retry count exceeds threshold, alert and give up
          if (device.revokeRetryCount >= 5) {
            logger.error('Device revocation exhausted retries', {
              deviceId: device._id.toString(),
              userId: device.userId.toString(),
              serverNode: device.serverNode,
              retryCount: device.revokeRetryCount,
              error: err.message,
            });
            alertError({
              source: 'cron.revocation',
              title: `Device revocation failed after 5 retries: ${device.deviceName}`,
              message: `Device ${device.deviceName} (${device.assignedIP}) on ${device.serverNode} could not be revoked after 5 retry attempts.`,
              details: {
                deviceId: device._id.toString(),
                userId: device.userId.toString(),
                deviceName: device.deviceName,
                serverNode: device.serverNode,
                retryCount: device.revokeRetryCount,
                error: err.message,
              },
            });
          }
        }
      }

      logger.info('Revocation retry cron complete', {
        total: retryDevices.length,
        succeeded: succeededCount,
        failed: failedCount,
      });
    } catch (err) {
      logger.error('Revocation retry cron failed', { error: err.message });
      alertError({
        source: 'cron.revocation',
        title: 'Device revocation retry cron failed',
        message: `The revocation retry background job encountered an error: ${err.message}`,
        details: { error: err.message },
      });
    } finally {
      isRunning = false;
    }
  });
}

module.exports = {
  startRevocationRetryCron,
};
