require('dotenv').config();
const mongoose = require('mongoose');
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

  // CRON_ENABLED gates all scheduled jobs. Run the API on any number of
  // replicas, but set CRON_ENABLED=true on exactly ONE of them — otherwise
  // every replica fires expiry emails, bandwidth deltas and SSH polls.
  if (env.CRON_ENABLED) {
    startExpiryCron();
    startBandwidthCron();
    startHealthCheckCron();
    logger.info('Cron jobs started');
  } else {
    logger.warn('CRON_ENABLED=false — scheduled jobs are NOT running on this worker');
  }

  const server = app.listen(env.PORT, () => {
    logger.info(`StealthVPN API listening on port ${env.PORT} [${env.NODE_ENV}]`);
  });

  // ── Graceful shutdown ────────────────────────────────────────────────────
  // A deploy mid-provision previously killed the process between
  // provisionPeer() and Device.create(), leaving a live WireGuard peer with
  // no DB row — unrevokable, invisible, permanent free access. SIGTERM now
  // stops accepting connections, drains in-flight requests (including a
  // mid-provision rollback), closes MongoDB, then exits. Forced exit after
  // 15s if something hangs.
  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.warn(`${signal} received — draining connections (15s budget)`);

    const forceExit = setTimeout(() => {
      logger.error('Graceful shutdown timed out — forcing exit');
      process.exit(1);
    }, 15000);
    forceExit.unref();

    server.close(async (err) => {
      if (err) {
        logger.error('Error closing HTTP server', { error: err.message });
      }
      try {
        await mongoose.disconnect();
        logger.info('Shutdown complete');
        process.exit(0);
      } catch (disconnectErr) {
        logger.error('Error disconnecting MongoDB', { error: disconnectErr.message });
        process.exit(1);
      }
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
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