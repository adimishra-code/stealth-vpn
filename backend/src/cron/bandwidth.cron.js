const cron = require('node-cron');
const ServerNode = require('../models/ServerNode');
const bandwidthService = require('../services/bandwidth.service');
const logger = require('../config/logger');

function startBandwidthCron() {
  cron.schedule('*/5 * * * *', async () => {
    try {
      const results = await bandwidthService.syncAllNodes();
      const updated = results.filter((r) => r.updated > 0).length;
      const errors = results.filter((r) => r.error).length;
      if (results.length > 0) {
        logger.info('Bandwidth sync', { nodes: results.length, updated, errors });
      }
    } catch (err) {
      logger.error('Bandwidth cron error', { error: err.message });
    }
  });
}

module.exports = { startBandwidthCron };