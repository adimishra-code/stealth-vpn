const cron = require('node-cron');
const bandwidthService = require('../services/bandwidth.service');
const logger = require('../config/logger');
const { alertCronFailure } = require('../services/alert.service');

function startBandwidthCron() {
  // Overlap guard: a 5-minute pass against an unreachable node (3 SSH retries
  // × 2 nodes) can exceed 5 minutes — never run two passes concurrently.
  let running = false;
  cron.schedule('*/5 * * * *', async () => {
    if (running) {
      logger.warn('Bandwidth cron skipped — previous run still active');
      return;
    }
    running = true;
    try {
      const results = await bandwidthService.syncAllNodes();
      const updated = results.filter((r) => r.updated > 0).length;
      const errors = results.filter((r) => r.error).length;
      if (results.length > 0) {
        logger.info('Bandwidth sync', { nodes: results.length, updated, errors });
      }
    } catch (err) {
      logger.error('Bandwidth cron error', { error: err.message });
      alertCronFailure('bandwidth', err);
    } finally {
      running = false;
    }
  });
}

module.exports = { startBandwidthCron };