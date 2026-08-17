const { NodeSSH } = require('node-ssh');
const env = require('../config/env');
const ServerNode = require('../models/ServerNode');
const logger = require('../config/logger');
const { ApiError } = require('../utils/ApiError');
const { generateWGKeypair, generateTCHandle, isValidPublicKey, isValidIPv4 } = require('../utils/wireguard');
const { encryptPrivateKey, decryptPrivateKey, randomUUID } = require('../utils/crypto');

// ── SSH singleton + resilience ────────────────────────────────────────────────
// One connection per node, reused across every operation — a fresh handshake
// per call is ~200ms+ of latency and sshd load. Connections survive errors
// unless they're gone; dead cached connections are dropped so the next call
// reconnects automatically.

const sshClients = new Map(); // node name -> { ssh: NodeSSH|null, connecting: Promise|null }

const RETRY_DELAYS_MS = [500, 1000, 2000]; // 3 attempts after the first
const TRANSIENT_CODES = ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EHOSTUNREACH', 'ENOTFOUND', 'ENETUNREACH'];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Normalizes node-ssh/net errors into ApiError(502) so callers distinguish
// "node unreachable" from WG/Xray logic failures, and the error handler
// sends a clean 502 instead of a 500 with an SSH stack trace.
function wrapSshError(serverNode, err) {
  if (err instanceof ApiError) return err;
  return new ApiError(502, `Cannot reach VPN node ${serverNode.name}: ${err.message}`);
}

function isTransient(err) {
  return !!TRANSIENT_CODES.includes(err && err.code) ||
    /connect ECONNREFUSED|socket hang up|timed out|host unreachable/i.test(err && err.message);
}

async function connectWithRetry(serverNode) {
  let lastErr;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    const ssh = new NodeSSH();
    try {
      await ssh.connect({
        host: serverNode.ip,
        // Least-privilege SSH user (created by provision-node.sh / setup.sh).
        // Must never be root — privileged commands run via the sudoers
        // whitelist below (wg/wg-quick/tc/xray api only).
        username: env.NODE_SSH_USER || 'stealthnode',
        privateKeyPath: env.SSH_PRIVATE_KEY_PATH,
        readyTimeout: 10000,
        keepaliveInterval: 15000,
      });
      return ssh;
    } catch (err) {
      lastErr = err;
      if (!isTransient(err)) break;
      if (attempt < RETRY_DELAYS_MS.length) {
        logger.warn('SSH connect failed — retrying', {
          node: serverNode.name,
          attempt: attempt + 1,
          delayMs: RETRY_DELAYS_MS[attempt],
          error: err.message,
        });
        await sleep(RETRY_DELAYS_MS[attempt]);
      }
    }
  }
  logger.error('SSH connect failed', {
    node: serverNode.name,
    ip: serverNode.ip,
    error: lastErr && lastErr.message,
  });
  throw wrapSshError(serverNode, lastErr);
}

async function sshConnect(serverNode) {
  const cached = sshClients.get(serverNode.name);
  if (cached && cached.ssh && cached.ssh.isConnected()) return cached.ssh;

  // Single-flight: concurrent callers share one connect attempt instead of
  // each opening their own session against a node that just restarted sshd.
  if (cached && cached.connecting) return cached.connecting;

  const connecting = connectWithRetry(serverNode)
    .then((ssh) => {
      sshClients.set(serverNode.name, { ssh, connecting: null });
      return ssh;
    })
    .catch((err) => {
      sshClients.delete(serverNode.name);
      throw err;
    });
  sshClients.set(serverNode.name, { ssh: null, connecting });
  return connecting;
}

// Dropped by the graceful-shutdown path so a restart does not leak sockets.
async function closeSshConnections() {
  const entries = [...sshClients.values()];
  sshClients.clear();
  for (const entry of entries) {
    try {
      if (entry.ssh) entry.ssh.dispose();
    } catch (err) {
      logger.warn('SSH dispose failed', { error: err.message });
    }
  }
  logger.info('SSH connections closed');
}

async function getServerNode(name) {
  const node = await ServerNode.findOne({ name });
  if (!node || !node.isOnline) {
    throw new ApiError(503, `Server "${name}" offline or not found`);
  }
  return node;
}

function generateWGConfig({ privateKey, assignedIP, serverNode }) {
  const endpoint = `${serverNode.ip}:${serverNode.wgPort}`;

  // IPv4-only tunnel: routing ::/0 inside would send native-IPv6 traffic
  // outside the tunnel (IPv6 leak). MTU 1380 avoids IPv4 fragmentation and
  // its packet drops on many networks.
  const allowedIPs = '0.0.0.0/0';
  const postUp = `iptables -I OUTPUT ! -o %i -m mark ! --mark $(wg show %i fwmark) -m addrtype ! --dst-type LOCAL -j REJECT`;
  const preDown = `iptables -D OUTPUT ! -o %i -m mark ! --mark $(wg show %i fwmark) -m addrtype ! --dst-type LOCAL -j REJECT`;

  return `[Interface]
PrivateKey = ${privateKey}
Address = ${assignedIP}/32
MTU = 1380
DNS = 10.8.0.1
# Kill switch, enforced by the official Android/iOS/macOS/Windows apps
# (BlockUntunneledTraffic = true). wg-quick on Linux ignores this key and
# uses the PostUp/PreDown REJECT rules below instead.
BlockUntunneledTraffic = true
PostUp = ${postUp}
PreDown = ${preDown}

[Peer]
PublicKey = ${serverNode.wgPublicKey}
Endpoint = ${endpoint}
AllowedIPs = ${allowedIPs}
PersistentKeepalive = 25`;
}

async function provisionPeer({ serverNode, publicKey, assignedIP, plan }) {
  if (!isValidPublicKey(publicKey)) {
    throw new ApiError(400, 'Invalid WireGuard public key');
  }
  if (!isValidIPv4(assignedIP)) {
    throw new ApiError(400, 'Invalid IP address format');
  }
  const ssh = await sshConnect(serverNode);
  const { stderr } = await ssh.execCommand(
    `sudo -n wg set wg0 peer ${publicKey} allowed-ips ${assignedIP}/32`
  );
  if (stderr && !stderr.includes('already exists')) {
    logger.error('wg set error', { node: serverNode.name, stderr });
    throw new Error(`wg set failed: ${stderr}`);
  }

  await ssh.execCommand('sudo -n wg-quick save wg0');

  let tcHandle = null;
  if (plan === 'basic') {
    tcHandle = generateTCHandle();
    const { stderr } = await ssh.execCommand(`
        sudo -n tc class add dev wg0 parent 1:0 classid 1:${tcHandle} htb rate 10mbit burst 15mbit
        sudo -n tc filter add dev wg0 protocol ip parent 1:0 prio 1 u32 match ip dst ${assignedIP}/32 flowid 1:${tcHandle}
        sudo -n tc class add dev wg0 parent 1:0 classid 2:${tcHandle} htb rate 10mbit burst 15mbit
        sudo -n tc filter add dev wg0 protocol ip parent 1:0 prio 1 u32 match ip src ${assignedIP}/32 flowid 2:${tcHandle}
      `);
    // Throttle failures used to be hidden behind 2>/dev/null, leaving basic
    // peers at FULL speed (free bandwidth). Anything except the idempotent
    // "File exists" is a real failure: throw so the rollback revokes the peer.
    const realErrors = stderr.split('\n').filter((l) => l && !l.includes('File exists'));
    if (realErrors.length) {
      logger.error('tc throttling failed', {
        node: serverNode.name,
        stderr: realErrors.join('\n'),
      });
      throw new Error(`tc throttling failed: ${realErrors.join('; ')}`);
    }
  }

  logger.info('Peer provisioned', {
    node: serverNode.name,
    assignedIP,
    publicKey: publicKey.slice(0, 8) + '...',
    plan,
    tcHandle: tcHandle || 'none',
  });
  return { success: true, tcHandle };
}

async function removeThrottle({ serverNode, tcHandle }) {
  if (!tcHandle) return;
  const ssh = await sshConnect(serverNode);
  await ssh.execCommand(`
      sudo -n tc class del dev wg0 classid 1:${tcHandle} 2>/dev/null
      sudo -n tc class del dev wg0 classid 2:${tcHandle} 2>/dev/null
    `);
  logger.info('Throttle removed', {
    node: serverNode.name,
    tcHandle,
  });
}

async function revokePeer({ serverNode, publicKey, tcHandle }) {
  if (!isValidPublicKey(publicKey)) {
    throw new ApiError(400, 'Invalid WireGuard public key');
  }
  const ssh = await sshConnect(serverNode);
  await ssh.execCommand(`sudo -n wg set wg0 peer ${publicKey} remove`);
  await ssh.execCommand('sudo -n wg-quick save wg0');

  if (tcHandle) {
    await removeThrottle({ serverNode, tcHandle });
  }

  logger.info('Peer revoked', {
    node: serverNode.name,
    publicKey: publicKey.slice(0, 8) + '...',
    tcHandle: tcHandle || 'none',
  });
  return { success: true };
}

async function createDeviceOnNode({ serverNodeName }) {
  const serverNode = await getServerNode(serverNodeName);
  const { privateKey, publicKey } = generateWGKeypair();
  return {
    privateKey,
    publicKey,
    encryptedPrivateKey: encryptPrivateKey(privateKey),
    serverNode,
  };
}

async function fetchBandwidthForNode(serverNode) {
  const ssh = await sshConnect(serverNode);
  const { stdout } = await ssh.execCommand('sudo -n wg show wg0 transfer');
  if (!stdout.trim()) return [];
  const entries = [];
  for (const line of stdout.trim().split('\n')) {
    const [pubkey, rx, tx] = line.split('\t');
    entries.push({ pubkey, rx: parseInt(rx, 10), tx: parseInt(tx, 10) });
  }
  return entries;
}

module.exports = {
  generateWGKeypair,
  encryptPrivateKey,
  decryptPrivateKey,
  randomUUID,
  provisionPeer,
  revokePeer,
  removeThrottle,
  generateWGConfig,
  createDeviceOnNode,
  fetchBandwidthForNode,
  getServerNode,
  sshConnect,
  closeSshConnections,
  wrapSshError,
};