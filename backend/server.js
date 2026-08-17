require('dotenv').config();
const mongoose = require('mongoose');
const env = require('./src/config/env');
const connectDB = require('./src/config/db');
const createApp = require('./src/app');
const logger = require('./src/config/logger');
const { transporter } = require('./src/services/email.service');
const { closeSshConnections } = require('./src/services/vpn.service');
const { alertError, registerProcessHandlers } = require('./src/services/alert.service');
const { startExpiryCron } = require('./src/cron/expiry.cron');
const { startBandwidthCron } = require('./src/cron/bandwidth.cron');
const { startHealthCheckCron, startWeeklyTlsCheckCron } = require('./src/cron/health.cron');
const { startBandwidthSnapshotCron } = require('./src/cron/bandwidthSnapshot.cron');
const { startPendingInvoiceCron } = require('./src/cron/pendingInvoice.cron');
const { startPurgeCron } = require('./src/cron/purgeExpiredData.cron');
const { startRevocationRetryCron } = require('./src/cron/revocationRetry.cron');
const { startKeyRotationCron } = require('./src/cron/keyRotation.cron');

const app = createApp();

async function start() {
  await connectDB();

  // SMTP is configured, so surface a clear warning at boot if it's broken —
  // but never crash: the API can serve traffic while mail is down, and the
  // alert service itself relies on the API being up.
  transporter
    .verify()
    .then(() => logger.info('SMTP connection verified'))
    .catch((err) =>
      logger.warn('SMTP misconfigured — transactional emails will fail', {
        error: err.message,
      })
    );

  // CRON_ENABLED gates all scheduled jobs. Run the API on any number of
  // replicas, but set CRON_ENABLED=true on exactly ONE of them — otherwise
  // every replica fires expiry emails, bandwidth deltas and SSH polls.
  if (env.CRON_ENABLED) {
    startExpiryCron();
    startBandwidthCron();
    startHealthCheckCron();
    startWeeklyTlsCheckCron();
    startBandwidthSnapshotCron();
    startPendingInvoiceCron();
    startPurgeCron();
    startRevocationRetryCron();
    startKeyRotationCron();
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
    logger.warn(`${signal} received — draining connections (10s budget)`);

    const forceExit = setTimeout(() => {
      logger.error('Graceful shutdown timed out — forcing exit');
      process.exit(1);
    }, 10000);
    forceExit.unref();

    server.close(async (err) => {
      if (err) {
        logger.error('Error closing HTTP server', { error: err.message });
      }
      try {
        await closeSshConnections();
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
  alertError({
    source: 'process',
    title: 'Server failed to start',
    message: err.message,
    details: { stack: err.stack },
    err,
  })
    .catch(() => {})
    .finally(() => process.exit(1));
});

registerProcessHandlers();