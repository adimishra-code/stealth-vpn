const { NodeSSH } = require('node-ssh');
const env = require('../config/env');
const { sshConnect } = require('./vpn.service');
const logger = require('../config/logger');

const FLOW_VISION = 'xtls-rprx-vision';

function emailTagFor(uuid) {
  return `${uuid}@stealth`;
}

async function addXrayUser({ serverNode, uuid, flow = FLOW_VISION }) {
  const ssh = await sshConnect(serverNode);
  try {
    const cmd = `xray api adduser \
      --server=127.0.0.1:10085 \
      --email="${emailTagFor(uuid)}" \
      --uuid="${uuid}" \
      --flow="${flow}" \
      --level=0`;

    const { stdout, stderr } = await ssh.execCommand(cmd);

    if (stderr && !stderr.includes('already')) {
      logger.warn('Xray adduser stderr', { node: serverNode.name, stderr });
    }
    logger.info('Xray user added', { node: serverNode.name, uuid: uuid.slice(0, 8) + '...' });
    return { success: true };
  } finally {
    ssh.dispose();
  }
}

async function removeXrayUser({ serverNode, uuid }) {
  const ssh = await sshConnect(serverNode);
  try {
    const cmd = `xray api removeuser \
      --server=127.0.0.1:10085 \
      --email="${emailTagFor(uuid)}"`;

    const { stdout, stderr } = await ssh.execCommand(cmd);

    if (stderr && !stderr.includes('not found')) {
      logger.warn('Xray removeuser stderr', { node: serverNode.name, stderr });
    }
    logger.info('Xray user removed', { node: serverNode.name, uuid: uuid.slice(0, 8) + '...' });
    return { success: true };
  } finally {
    ssh.dispose();
  }
}

async function fetchStatsForNode(serverNode) {
  const ssh = await sshConnect(serverNode);
  try {
    const { stdout } = await ssh.execCommand('xray api stats --server=127.0.0.1:10085');
    return stdout;
  } finally {
    ssh.dispose();
  }
}

module.exports = {
  addXrayUser,
  removeXrayUser,
  fetchStatsForNode,
  FLOW_VISION,
};