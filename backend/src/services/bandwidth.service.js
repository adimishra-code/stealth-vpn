const ServerNode = require('../models/ServerNode');
const Device = require('../models/Device');
const { fetchBandwidthForNode } = require('./vpn.service');
const { revokeDevice } = require('./provisioning.service');
const env = require('../config/env');
const logger = require('../config/logger');

// wg show wg0 transfer reports CUMULATIVE rx/tx bytes since the interface
// started. We store the last-seen baseline per device and $inc only the
// delta each 5-minute pass. Clamped to >= 0 so a node reboot (counters
// reset to 0) never produces a negative or inflated delta.
function computeBandwidthDelta({ rx, tx, lastRx = null, lastTx = null }) {
  const deltaRx = lastRx == null ? 0 : Math.max(rx - lastRx, 0);
  const deltaTx = lastTx == null ? 0 : Math.max(tx - lastTx, 0);
  return { deltaRx, deltaTx, deltaMB: (deltaRx + deltaTx) / 1048576 };
}

async function enforceQuota(device, newTotalMB) {
  if (!env.QUOTA_ENFORCE) return false;
  if (!device.quotaMB || device.quotaExceeded) return false;
  if (newTotalMB < device.quotaMB) return false;

  logger.warn('Device over quota — revoking peer', {
    deviceId: device._id.toString(),
    quotaMB: device.quotaMB,
    usedMB: Math.round(newTotalMB),
  });

  await Device.updateOne({ _id: device._id }, { $set: { quotaExceeded: true } });
  try {
    await revokeDevice(await Device.findById(device._id));
  } catch (err) {
    logger.error('Quota revoke failed', { deviceId: device._id.toString(), error: err.message });
  }
  return true;
}

async function syncBandwidthForNode(node) {
  try {
    const entries = await fetchBandwidthForNode(node);
    let updated = 0;
    for (const { pubkey, rx, tx } of entries) {
      const device = await Device.findOne({ wgPublicKey: pubkey, isActive: true });
      if (!device) continue;

      const { deltaMB } = computeBandwidthDelta({
        rx,
        tx,
        lastRx: device.lastWgRxBytes,
        lastTx: device.lastWgTxBytes,
      });

      // Optimistic concurrency: if another pass (or instance) already wrote a
      // new baseline between our read and write, modifiedCount is 0 and the
      // next pass reconciles — no double counting.
      const res = await Device.updateOne(
        { _id: device._id, lastWgRxBytes: device.lastWgRxBytes, lastWgTxBytes: device.lastWgTxBytes },
        {
          $inc: { bandwidthUsedMB: deltaMB },
          $set: { lastWgRxBytes: rx, lastWgTxBytes: tx, lastSeen: new Date() },
        }
      );
      if (res.modifiedCount !== 1) {
        logger.debug('Bandwidth baseline changed concurrently — skipping pass', { deviceId: device._id.toString() });
        continue;
      }
      updated++;

      await enforceQuota(device, device.bandwidthUsedMB + deltaMB);
    }
    logger.debug('Bandwidth sync', { node: node.name, peers: entries.length, updated });
    return { node: node.name, peers: entries.length, updated };
  } catch (err) {
    logger.warn('Bandwidth sync failed', { node: node.name, error: err.message });
    if (err.statusCode === 502) {
      await ServerNode.findByIdAndUpdate(node._id, {
        isOnline: false,
        lastHealthCheck: new Date(),
      });
    }
    return { node: node.name, error: err.message };
  }
}

async function syncAllNodes() {
  const nodes = await ServerNode.find({ isOnline: true });
  const results = await Promise.allSettled(
    nodes.map((n) => syncBandwidthForNode(n))
  );
  return results.map((r) => (r.status === 'fulfilled' ? r.value : { error: r.reason.message }));
}

// Quota disclosure (PRIV-19): the monthly window starts on the 1st of each
// month, 00:00 UTC. Exposed to clients so "X GB of 500 GB" is honest.
function nextQuotaResetAt(now = new Date()) {
  const next = new Date(now);
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + 1);
  next.setUTCHours(0, 0, 0, 0);
  return next;
}

// PRIV-19: quota is advertised as monthly, so at the month boundary every
// metered device starts from zero again. Only devices with a quotaMB are
// touched; baselines reset to null so the next delta pass starts fresh
// (cumulative wg counters make this double-count-proof).
async function resetMonthlyQuotas(now = new Date()) {
  const res = await Device.updateMany(
    { quotaMB: { $ne: null } },
    {
      $set: {
        bandwidthUsedMB: 0,
        quotaExceeded: false,
        lastWgRxBytes: null,
        lastWgTxBytes: null,
      },
    }
  );
  if (res.modifiedCount > 0) {
    logger.info('Monthly quota window reset', {
      devices: res.modifiedCount,
      windowStart: now.toISOString(),
    });
  }
  return res.modifiedCount;
}

module.exports = { syncBandwidthForNode, syncAllNodes, computeBandwidthDelta, nextQuotaResetAt, resetMonthlyQuotas };