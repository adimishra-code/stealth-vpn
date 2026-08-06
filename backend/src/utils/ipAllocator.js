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

// .0 is the network address and .1 is the node's own wg0 address.
const HOST_MIN = 2;
const HOST_MAX = 254;

async function allocateIP(serverNodeName) {
  // Bounding the increment keeps a full node from ratcheting nextIP upward on
  // every rejected call, and the atomic $inc guarantees two concurrent
  // registrations never receive the same octet.
  const node = await ServerNode.findOneAndUpdate(
    { name: serverNodeName, nextIP: { $lte: HOST_MAX } },
    { $inc: { nextIP: 1 } },
    { new: true }
  );

  if (!node) {
    const exists = await ServerNode.exists({ name: serverNodeName });
    if (!exists) {
      throw new ApiError(404, `Server node "${serverNodeName}" not found`);
    }
    throw new ApiError(503, `Server "${serverNodeName}" has exhausted its IP space`);
  }

  const nextOctet = node.nextIP - 1;
  if (nextOctet < HOST_MIN) {
    throw new ApiError(500, `Server "${serverNodeName}" has an invalid nextIP counter`);
  }

  const subnetBase = node.subnetCIDR.split('/')[0];
  const assignedIP = ipFromOctet(subnetBase, nextOctet);
  if (!ipaddr.isValid(assignedIP)) {
    throw new ApiError(500, 'Generated IP is invalid — check node config');
  }

  return { assignedIP, serverNode: node };
}

module.exports = { allocateIP, octetFromIP };