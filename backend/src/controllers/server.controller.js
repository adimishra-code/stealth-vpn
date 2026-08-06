const ServerNode = require('../models/ServerNode');
const Device = require('../models/Device');
const { sshConnect } = require('../services/vpn.service');
const { ApiError, asyncHandler } = require('../utils/ApiError');
const logger = require('../config/logger');

exports.listServers = asyncHandler(async (req, res) => {
  const nodes = await ServerNode.find().select('-realityPublicKey -realityShortId -nextIP -__v');
  res.json({ servers: nodes });
});

exports.serverHealth = asyncHandler(async (req, res) => {
  const node = await ServerNode.findOne({ name: req.params.name });
  if (!node) throw new ApiError(404, 'Server not found');

  let wgOk = false;
  let xrayOk = false;
  let peerCount = 0;

  let ssh = null;
  try {
    ssh = await sshConnect(node);
    const { stdout: wgOut } = await ssh.execCommand('wg show wg0');
    wgOk = wgOut.includes('wg0');
    peerCount = (wgOut.match(/peer:/g) || []).length;
    const { stdout: xrayOut } = await ssh.execCommand('systemctl is-active xray');
    xrayOk = xrayOut.trim() === 'active';
  } catch (err) {
    logger.warn('Health check SSH failed', { node: node.name, error: err.message });
  } finally {
    ssh?.dispose();
  }

  res.json({
    name: node.name,
    ip: node.ip,
    country: node.country,
    region: node.region,
    wireguard: { ok: wgOk, peers: peerCount },
    xray: { ok: xrayOk },
    isOnline: wgOk && xrayOk,
    lastHealthCheck: node.lastHealthCheck,
  });
});