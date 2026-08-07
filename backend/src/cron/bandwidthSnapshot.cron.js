const cron = require('node-cron');
const ServerNode = require('../models/ServerNode');
const Device = require('../models/Device');
const BandwidthSnapshot = require('../models/BandwidthSnapshot');
const logger = require('../config/logger');
const { alertError } = require('../services/alert.service');
const { resetMonthlyQuotas } = require('../services/bandwidth.service');

function utcMidnight(date) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

async function runSnapshotPass() {
  const nodes = await ServerNode.find();
  if (!nodes.length) {
    logger.info('Bandwidth snapshot: no server nodes registered');
    return;
  }

  const today = utcMidnight(new Date());

  // PRIV-19: the quota window is monthly — roll it over when the calendar
  // flips to the 1st, before today's snapshot is taken.
  if (today.getUTCDate() === 1) {
    try {
      await resetMonthlyQuotas(today);
    } catch (err) {
      logger.error('Monthly quota reset failed', { error: err.message });
      alertError({
        source: 'cron.bandwidthSnapshot',
        title: 'Monthly quota reset failed',
        message: err.message,
        details: { stack: err.stack },
        err,
      });
    }
  }

  for (const node of nodes) {
    try {
      const [agg] = await Device.aggregate([
        { $match: { serverNode: node.name } },
        { $group: { _id: null, totalMB: { $sum: '$bandwidthUsedMB' } } },
      ]);

      await BandwidthSnapshot.findOneAndUpdate(
        { nodeId: node._id, date: today },
        {
          $set: {
            totalMB: agg?.totalMB || 0,
            active: !!node.isOnline,
            createdAt: new Date(),
          },
        },
        { upsert: true, new: true }
      );
    } catch (err) {
      logger.error('Bandwidth snapshot failed for node', {
        node: node.name,
        error: err.message,
      });
      alertError({
        source: 'cron.bandwidthSnapshot',
        title: `Snapshot failed for node ${node.name}`,
        message: err.message,
        details: { node: node.name },
        err,
      });
    }
  }

  logger.info('Bandwidth snapshots recorded', { nodes: nodes.length, date: today.toISOString() });
}

function startBandwidthSnapshotCron() {
  // Overlap guard: a slow pass must never stack a second one at midnight.
  let running = false;
  // UTC midnight. Snapshot is a point-in-time per-day number per node.
  cron.schedule('0 0 * * *', async () => {
    if (running) {
      logger.warn('Bandwidth snapshot cron skipped — previous run still active');
      return;
    }
    running = true;
    try {
      await runSnapshotPass();
    } catch (err) {
      // node-cron does not handle a rejected callback — without this the process exits.
      logger.error('Bandwidth snapshot cron failed', { error: err.message, stack: err.stack });
      alertError({
        source: 'cron.bandwidthSnapshot',
        title: 'Bandwidth snapshot cron failed',
        message: err.message,
        details: { stack: err.stack },
        err,
      });
    } finally {
      running = false;
    }
  }, { timezone: 'UTC' });
}

module.exports = { startBandwidthSnapshotCron, runSnapshotPass, utcMidnight };
