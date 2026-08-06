const cron = require('node-cron');
const ServerNode = require('../models/ServerNode');
const { sshConnect } = require('../services/vpn.service');
const logger = require('../config/logger');

const DOWN_ALERT_THRESHOLD_MS = 5 * 60 * 1000;

function startHealthCheckCron() {
  cron.schedule('*/2 * * * *', async () => {
    const nodes = await ServerNode.find();
    for (const node of nodes) {
      try {
        const ssh = await sshConnect(node);
        const { stdout: xrayStatus } = await ssh.execCommand('systemctl is-active xray');
        const { stdout: wgStatus } = await ssh.execCommand('wg show wg0');
        ssh.dispose();

        const isOnline = xrayStatus.trim() === 'active' && wgStatus.includes('wg0');
        await ServerNode.findByIdAndUpdate(node._id, {
          isOnline: isOnline,
          lastHealthCheck: new Date(),
        });

        if (!isOnline && node.isOnline) {
          logger.warn('Node went offline', { node: node.name, ip: node.ip });
          if (new Date() - new Date(node.lastHealthCheck) > DOWN_ALERT_THRESHOLD_MS) {
            logger.error('Node has been offline >5min', { node: node.name });
          }
        }
      } catch (err) {
        await ServerNode.findByIdAndUpdate(node._id, {
          isOnline: false,
          lastHealthCheck: new Date(),
        });
        if (new Date() - new Date(node.lastHealthCheck) > DOWN_ALERT_THRESHOLD_MS) {
          logger.error('Node health check failed >5min', { node: node.name, error: err.message });
        }
      }
    }
  });
}

module.exports = { startHealthCheckCron };