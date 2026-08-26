const ServerNode = require('../models/ServerNode');
const { sshConnect } = require('../services/vpn.service');
const { ApiError, asyncHandler } = require('../utils/ApiError');
const logger = require('../config/logger');

exports.listServers = asyncHandler(async (req, res) => {
  const nodes = await ServerNode.find().select('-realityPublicKey -realityShortId -nextIP -__v');
  res.json({ servers: nodes });
});

// SEC-17: Read cached node status from database (updated by background health cron)
// instead of issuing live SSH commands on every client request.
exports.serverHealth = asyncHandler(async (req, res) => {
  const node = await ServerNode.findOne({ name: req.params.name });
  if (!node) throw new ApiError(404, 'Server not found');

  res.json({
    name: node.name,
    ip: node.ip,
    country: node.country,
    region: node.region,
    isOnline: node.isOnline,
    lastHealthCheck: node.lastHealthCheck,
    lastOnlineAt: node.lastOnlineAt,
  });
});