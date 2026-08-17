const env = require('../config/env');
const { sshConnect } = require('./vpn.service');
const logger = require('../config/logger');
const { isValidUUID } = require('../utils/crypto');

const FLOW_VISION = 'xtls-rprx-vision';

// The xray api CLI takes a bare host:port, the env var a full URL.
function apiServer() {
  const u = new URL(env.XRAY_API_URL);
  return `${u.hostname}:${u.port || (u.protocol === 'https:' ? 443 : 80)}`;
}

function emailTagFor(uuid) {
  return `${uuid}@stealth`;
}

// Stealth-mode clients import this URI into any Xray/V2Ray client; it is the
// client-side counterpart of the server's Reality inbound. nodeKeys are the
// per-node Reality public key + shortId (from NODE_<NAME>_REALITY_* env vars).
function buildVlessUri({ serverNode, uuid, deviceName, nodeKeys, sni = env.XRAY_SNI_DEST }) {
  const query = [
    'encryption=none',
    'security=reality',
    `sni=${sni}`,
    'fp=chrome',
    nodeKeys?.realityPublicKey ? `pbk=${nodeKeys.realityPublicKey}` : null,
    nodeKeys?.realityShortId ? `sid=${nodeKeys.realityShortId}` : null,
  ]
    .filter(Boolean)
    .join('&');
  const fragment = encodeURIComponent(`StealthVPN-${deviceName || 'device'}`);
  return `vless://${uuid}@${serverNode.ip}:${serverNode.xrayPort || 443}?${query}#${fragment}`;
}

async function addXrayUser({ serverNode, uuid, flow = FLOW_VISION }) {
  if (!isValidUUID(uuid)) {
    throw new Error(`Invalid UUID format: ${uuid}`);
  }
  const ssh = await sshConnect(serverNode);
  const cmd = `sudo -n xray api adduser \
      --server=${apiServer()} \
      --email="${emailTagFor(uuid)}" \
      --uuid="${uuid}" \
      --flow="${flow}" \
      --level=0`;

  const { stderr } = await ssh.execCommand(cmd);

  if (stderr && !stderr.includes('already')) {
    logger.warn('Xray adduser stderr', { node: serverNode.name, stderr });
  }
  logger.info('Xray user added', { node: serverNode.name, uuid: uuid.slice(0, 8) + '...' });
  return { success: true };
}

async function removeXrayUser({ serverNode, uuid }) {
  if (!isValidUUID(uuid)) {
    throw new Error(`Invalid UUID format: ${uuid}`);
  }
  const ssh = await sshConnect(serverNode);
  const cmd = `sudo -n xray api removeuser \
      --server=${apiServer()} \
      --email="${emailTagFor(uuid)}"`;

  const { stderr } = await ssh.execCommand(cmd);

  if (stderr && !stderr.includes('not found')) {
    logger.warn('Xray removeuser stderr', { node: serverNode.name, stderr });
  }
  logger.info('Xray user removed', { node: serverNode.name, uuid: uuid.slice(0, 8) + '...' });
  return { success: true };
}

async function fetchStatsForNode(serverNode) {
  const ssh = await sshConnect(serverNode);
  const { stdout } = await ssh.execCommand(`sudo -n xray api stats --server=${apiServer()}`);
  return stdout;
}

module.exports = {
  addXrayUser,
  removeXrayUser,
  fetchStatsForNode,
  buildVlessUri,
  FLOW_VISION,
};