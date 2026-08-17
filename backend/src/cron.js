require('dotenv').config();
const mongoose = require('mongoose');
const env = require('./config/env');
const connectDB = require('./config/db');
const logger = require('./config/logger');
const { registerProcessHandlers } = require('./services/alert.service');
const { startExpiryCron } = require('./cron/expiry.cron');
const { startBandwidthCron } = require('./cron/bandwidth.cron');
const { startHealthCheckCron, startWeeklyTlsCheckCron } = require('./cron/health.cron');
const { startBandwidthSnapshotCron } = require('./cron/bandwidthSnapshot.cron');
const { startPendingInvoiceCron } = require('./cron/pendingInvoice.cron');
const { startPurgeCron } = require('./cron/purgeExpiredData.cron');
const { startRevocationRetryCron } = require('./cron/revocationRetry.cron');
const { startKeyRotationCron } = require('./cron/keyRotation.cron');

// Dedicated cron worker (PM2 app "stealth-vpn-cron", see
// deploy/ecosystem.config.cjs). Runs ONLY the scheduled jobs — no HTTP
// listener — so the API workers can scale horizontally (cluster mode)
// without every replica firing expiry emails and SSH polls, and a crash in
// one worker never takes down traffic.
//
// CRON_ENABLED is a hard gate: refuse to run rather than silently skip jobs
// operators expect to be firing (PM2 will restart the worker, which then
// exits again — the misconfiguration stays loud in the logs).
async function start() {
  await connectDB();

  if (!env.CRON_ENABLED) {
    logger.warn('CRON_ENABLED=false on cron worker — nothing to run, exiting');
    // eslint-disable-next-line no-process-exit -- a scheduler that runs nothing is fatal by design
    process.exit(0);
  }

  startExpiryCron();
  startBandwidthCron();
  startHealthCheckCron();
  startWeeklyTlsCheckCron();
  startBandwidthSnapshotCron();
  startPendingInvoiceCron();
  startPurgeCron();
  startRevocationRetryCron();
  startKeyRotationCron();
  logger.info('Cron jobs started (dedicated worker)');

  // No HTTP server here to keep the event loop alive — hold it explicitly.
  const keepAlive = setInterval(() => {}, 60000);

  // Same graceful-shutdown contract as server.js so PM2's kill_timeout
  // doesn't force-kill mid-job (a purge half-applied would strand peers).
  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.warn(`${signal} received — stopping cron worker`);

    const forceExit = setTimeout(() => {
      logger.error('Cron shutdown timed out — forcing exit');
      // eslint-disable-next-line no-process-exit -- a hung shutdown must not hang PM2 forever
      process.exit(1);
    }, 10000);
    forceExit.unref();

    clearInterval(keepAlive);
    mongoose
      .disconnect()
      .then(() => {
        logger.info('Cron worker shutdown complete');
        // eslint-disable-next-line no-process-exit -- normal worker exit path
        process.exit(0);
      })
      .catch((err) => {
        logger.error('Error disconnecting MongoDB', { error: err.message });
        // eslint-disable-next-line no-process-exit -- nothing left to serve
        process.exit(1);
      });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch((err) => {
  logger.error('Cron worker failed to start', { error: err.message, stack: err.stack });
  // eslint-disable-next-line no-process-exit -- a worker without crons is fatal by design
  process.exit(1);
});

registerProcessHandlers();
