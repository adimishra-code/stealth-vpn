const ServerNode = require('../models/ServerNode');
const { ApiError } = require('../utils/ApiError');
const ipaddr = require('ipaddr.js');

function octetFromIP(ip) {
  return parseInt(ip.split('.').pop(), 10);
}

function ipFromOctet(subnetBase, octet) {
  const base = subnetBase.split('.').slice(0, 3).join('.');
  return `${base}.${octet}`;
}

async function allocateIP(serverNodeName) {
  const node = await ServerNode.findOneAndUpdate(
    { name: serverNodeName },
    { $inc: { nextIP: 1 } },
    { new: true }
  );
  if (!node) {
    throw new ApiError(404, `Server node "${serverNodeName}" not found`);
  }

  let nextOctet = node.nextIP - 1;
  const hostMax = 254;
  if (nextOctet > hostMax) {
    throw new ApiError(503, `Server "${serverNodeName}" has exhausted its IP space`);
  }

  const subnetBase = node.subnetCIDR.split('/')[0];
  const assignedIP = ipFromOctet(subnetBase, nextOctet);
  if (!ipaddr.isValid(assignedIP)) {
    throw new ApiError(500, 'Generated IP is invalid — check node config');
  }

  return { assignedIP, serverNode: node };
}

module.exports = { allocateIP, octetFromIP };