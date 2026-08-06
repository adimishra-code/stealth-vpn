const ServerNode = require('../models/ServerNode');
const Device = require('../models/Device');
const { fetchBandwidthForNode } = require('./vpn.service');
const logger = require('../config/logger');

async function syncBandwidthForNode(node) {
  try {
    const entries = await fetchBandwidthForNode(node);
    let updated = 0;
    for (const { pubkey, rx, tx } of entries) {
      const device = await Device.findOneAndUpdate(
        { wgPublicKey: pubkey, isActive: true },
        {
          $inc: { bandwidthUsedMB: Math.round((rx + tx) / 1048576) },
          lastSeen: new Date(),
        }
      );
      if (device) updated++;
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

module.exports = { syncBandwidthForNode, syncAllNodes };