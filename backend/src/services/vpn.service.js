const { NodeSSH } = require('node-ssh');
const env = require('../config/env');
const ServerNode = require('../models/ServerNode');
const logger = require('../config/logger');
const { ApiError } = require('../utils/ApiError');
const { generateWGKeypair, generateTCHandle, isValidPublicKey } = require('../utils/wireguard');
const { encryptPrivateKey, decryptPrivateKey, randomUUID } = require('../utils/crypto');

async function sshConnect(serverNode) {
  const ssh = new NodeSSH();
  try {
    await ssh.connect({
      host: serverNode.ip,
      username: 'root',
      privateKeyPath: env.SSH_PRIVATE_KEY_PATH,
      readyTimeout: 10000,
      keepaliveInterval: 15000,
    });
  } catch (err) {
    logger.error('SSH connect failed', { node: serverNode.name, ip: serverNode.ip, error: err.message });
    throw new ApiError(502, `Cannot reach VPN node ${serverNode.name}`);
  }
  return ssh;
}

async function getServerNode(name) {
  const node = await ServerNode.findOne({ name });
  if (!node || !node.isOnline) {
    throw new ApiError(503, `Server "${name}" offline or not found`);
  }
  return node;
}

function generateWGConfig({ privateKey, assignedIP, serverNode, mode }) {
  const endpoint = `${serverNode.ip}:${serverNode.wgPort}`;

  // IPv4-only tunnel: clients get an IPv4 address with no IPv6 route inside
  // the tunnel. Routing ::/0 here would send native-IPv6 traffic (e.g. DNS or
  // a dual-stack app) outside the tunnel — an IPv6 leak. IPv6 is blocked by
  // the server's net.ipv6.conf.wg0.disable_ipv6=1 and the client kill switch.
  const allowedIPs = '0.0.0.0/0';
  const postUp = `iptables -I OUTPUT ! -o %i -m mark ! --mark $(wg show %i fwmark) -m addrtype ! --dst-type LOCAL -j REJECT`;
  const preDown = `iptables -D OUTPUT ! -o %i -m mark ! --mark $(wg show %i fwmark) -m addrtype ! --dst-type LOCAL -j REJECT`;

  return `[Interface]
PrivateKey = ${privateKey}
Address = ${assignedIP}/32
DNS = 10.8.0.1
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
  const ssh = await sshConnect(serverNode);
  try {
    const { stdout: setOut, stderr: setErr } = await ssh.execCommand(
      `wg set wg0 peer ${publicKey} allowed-ips ${assignedIP}/32`
    );
    if (setErr && !setErr.includes('already exists')) {
      logger.error('wg set error', { node: serverNode.name, stderr: setErr });
      throw new Error(`wg set failed: ${setErr}`);
    }

    await ssh.execCommand('wg-quick save wg0');

    let tcHandle = null;
    if (plan === 'basic') {
      tcHandle = generateTCHandle();
      await ssh.execCommand(`
        tc class add dev wg0 parent 1:0 classid 1:${tcHandle} htb rate 10mbit burst 15mbit 2>/dev/null
        tc filter add dev wg0 protocol ip parent 1:0 prio 1 u32 match ip dst ${assignedIP}/32 flowid 1:${tcHandle}
        tc class add dev wg0 parent 1:0 classid 2:${tcHandle} htb rate 10mbit burst 15mbit 2>/dev/null
        tc filter add dev wg0 protocol ip parent 1:0 prio 1 u32 match ip src ${assignedIP}/32 flowid 2:${tcHandle}
      `);
    }

    logger.info('Peer provisioned', {
      node: serverNode.name,
      assignedIP,
      publicKey: publicKey.slice(0, 8) + '...',
      plan,
      tcHandle: tcHandle || 'none',
    });
    return { success: true, tcHandle };
  } finally {
    ssh.dispose();
  }
}

async function revokePeer({ serverNode, publicKey, tcHandle }) {
  if (!isValidPublicKey(publicKey)) {
    throw new ApiError(400, 'Invalid WireGuard public key');
  }
  const ssh = await sshConnect(serverNode);
  try {
    await ssh.execCommand(`wg set wg0 peer ${publicKey} remove`);
    await ssh.execCommand('wg-quick save wg0');

    if (tcHandle) {
      await ssh.execCommand(`
        tc class del dev wg0 classid 1:${tcHandle} 2>/dev/null
        tc class del dev wg0 classid 2:${tcHandle} 2>/dev/null
      `);
    }

    logger.info('Peer revoked', {
      node: serverNode.name,
      publicKey: publicKey.slice(0, 8) + '...',
      tcHandle: tcHandle || 'none',
    });
    return { success: true };
  } finally {
    ssh.dispose();
  }
}

async function createDeviceOnNode({ serverNodeName, plan }) {
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
  try {
    const { stdout } = await ssh.execCommand('wg show wg0 transfer');
    if (!stdout.trim()) return [];
    const entries = [];
    for (const line of stdout.trim().split('\n')) {
      const [pubkey, rx, tx] = line.split('\t');
      entries.push({ pubkey, rx: parseInt(rx, 10), tx: parseInt(tx, 10) });
    }
    return entries;
  } finally {
    ssh.dispose();
  }
}

module.exports = {
  generateWGKeypair,
  encryptPrivateKey,
  decryptPrivateKey,
  randomUUID,
  provisionPeer,
  revokePeer,
  generateWGConfig,
  createDeviceOnNode,
  fetchBandwidthForNode,
  getServerNode,
  sshConnect,
};