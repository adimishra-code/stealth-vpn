require('dotenv').config();
const env = require('./src/config/env');
const connectDB = require('./src/config/db');
const createApp = require('./src/app');
const logger = require('./src/config/logger');
const { startExpiryCron } = require('./src/cron/expiry.cron');
const { startBandwidthCron } = require('./src/cron/bandwidth.cron');
const { startHealthCheckCron } = require('./src/cron/health.cron');

const app = createApp();

async function start() {
  await connectDB();

  startExpiryCron();
  startBandwidthCron();
  startHealthCheckCron();
  logger.info('Cron jobs started');

  app.listen(env.PORT, () => {
    logger.info(`StealthVPN API listening on port ${env.PORT} [${env.NODE_ENV}]`);
  });
}

start().catch((err) => {
  logger.error('Failed to start server', { error: err.message, stack: err.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', { reason });
});
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', { error: err.message, stack: err.stack });
  process.exit(1);
});