const cron = require('node-cron');
const Device = require('../models/Device');
const { decryptPrivateKey, encryptPrivateKey, CRYPTO_PURPOSES } = require('../utils/crypto');
const logger = require('../config/logger');
const env = require('../config/env');
const { alertError } = require('../services/alert.service');

// CRYPTO-01: re-encrypt Device fields that were written under
// WG_ENCRYPTION_KEY_PREVIOUS to the current derived key. Runs only when
// WG_ENCRYPTION_KEY_PREVIOUS is set; exits early otherwise. Safe to run
// repeatedly — devices already on the current key are skipped.

const BATCH_SIZE = 50;
let isRunning = false;

async function runKeyRotation() {
  if (!env.WG_ENCRYPTION_KEY_PREVIOUS) {
    logger.debug('Key rotation cron: WG_ENCRYPTION_KEY_PREVIOUS not set — nothing to do');
    return;
  }

  if (isRunning) {
    logger.warn('Key rotation cron: skipping — previous run still active');
    return;
  }
  isRunning = true;

  let rotated = 0;
  let errors = 0;

  try {
    let lastId = null;

    while (true) {
      const filter = lastId ? { _id: { $gt: lastId } } : {};
      const devices = await Device.find(filter)
        .select('_id wgPrivateKey encryptedXrayUUID')
        .sort({ _id: 1 })
        .limit(BATCH_SIZE)
        .lean();

      if (!devices.length) break;
      lastId = devices[devices.length - 1]._id;

      for (const doc of devices) {
        try {
          const wgPlain = decryptPrivateKey(doc.wgPrivateKey, CRYPTO_PURPOSES.wg);
          const newWgEnc = encryptPrivateKey(wgPlain, CRYPTO_PURPOSES.wg);

          const update = { wgPrivateKey: newWgEnc };

          if (doc.encryptedXrayUUID) {
            const uuidPlain = decryptPrivateKey(doc.encryptedXrayUUID, CRYPTO_PURPOSES.wg);
            update.encryptedXrayUUID = encryptPrivateKey(uuidPlain, CRYPTO_PURPOSES.wg);
          }

          await Device.updateOne({ _id: doc._id }, { $set: update });
          rotated++;
        } catch (err) {
          errors++;
          logger.error('Key rotation: failed to re-encrypt device', {
            deviceId: doc._id.toString(),
            error: err.message,
          });
        }
      }
    }

    logger.info('Key rotation cron complete', { rotated, errors });

    if (errors > 0) {
      await alertError({
        source: 'cron.keyRotation',
        title: `Key rotation completed with ${errors} error(s)`,
        message: 'Check logs for details on which devices failed to re-encrypt',
        details: { rotated, errors },
      });
    }
  } catch (err) {
    logger.error('Key rotation cron failed', { error: err.message });
    await alertError({
      source: 'cron.keyRotation',
      title: 'Device key rotation cron failed',
      message: `The key rotation background job encountered an error: ${err.message}`,
      details: { error: err.message },
    });
  } finally {
    isRunning = false;
  }
}

function startKeyRotationCron() {
  cron.schedule('17 3 * * *', runKeyRotation, { timezone: 'UTC' });
  logger.info('Key rotation cron scheduled (daily 03:17 UTC)');
}

module.exports = { startKeyRotationCron, runKeyRotation };
