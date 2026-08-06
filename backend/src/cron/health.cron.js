const cron = require('node-cron');
const ServerNode = require('../models/ServerNode');
const { sshConnect } = require('../services/vpn.service');
const logger = require('../config/logger');
const { alertError } = require('../services/alert.service');

const DOWN_ALERT_THRESHOLD_MS = 5 * 60 * 1000;

function startHealthCheckCron() {
  cron.schedule('*/2 * * * *', async () => {
    let nodes;
    try {
      nodes = await ServerNode.find();
    } catch (err) {
      // node-cron does not handle a rejected callback — without this the process exits.
      logger.error('Health cron: failed to load nodes', { error: err.message });
      return;
    }

    for (const node of nodes) {
      let ssh = null;
      try {
        ssh = await sshConnect(node);
        const { stdout: xrayStatus } = await ssh.execCommand('systemctl is-active xray');
        const { stdout: wgStatus } = await ssh.execCommand('wg show wg0');

        const isOnline = xrayStatus.trim() === 'active' && wgStatus.includes('wg0');
        await ServerNode.findByIdAndUpdate(node._id, {
          isOnline: isOnline,
          lastHealthCheck: new Date(),
        });

        if (!isOnline && node.isOnline) {
          logger.warn('Node went offline', { node: node.name, ip: node.ip });
          if (new Date() - new Date(node.lastHealthCheck) > DOWN_ALERT_THRESHOLD_MS) {
            logger.error('Node has been offline >5min', { node: node.name });
            alertError({
              source: 'cron.health',
              title: `VPN node offline >5min: ${node.name}`,
              message: `${node.name} (${node.ip}) unreachable — check xray/wg0 status`,
              details: { node: node.name, ip: node.ip },
            });
          }
        }
      } catch (err) {
        try {
          await ServerNode.findByIdAndUpdate(node._id, {
            isOnline: false,
            lastHealthCheck: new Date(),
          });
        } catch (dbErr) {
          logger.error('Health cron: status write failed', { node: node.name, error: dbErr.message });
        }
        if (new Date() - new Date(node.lastHealthCheck) > DOWN_ALERT_THRESHOLD_MS) {
          logger.error('Node health check failed >5min', { node: node.name, error: err.message });
          alertError({
            source: 'cron.health',
            title: `VPN node health check failing >5min: ${node.name}`,
            message: `${node.name} (${node.ip}) — ${err.message}`,
            details: { node: node.name, ip: node.ip, error: err.message },
            err,
          });
        }
      } finally {
        // Runs every 2 minutes against every node; disposing only on the happy
        // path leaks a socket per failure and eventually exhausts descriptors.
        ssh?.dispose();
      }
    }
  });
}

module.exports = { startHealthCheckCron };