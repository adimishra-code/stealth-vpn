const ServerNode = require('../models/ServerNode');
const Device = require('../models/Device');
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
  const node = await ServerNode.findOne({ name: serverNodeName });
  if (!node) {
    throw new ApiError(404, `Server node "${serverNodeName}" not found`);
  }

  // Scan active devices on this node to find currently used octets
  const activeDevices = await Device.find({
    serverNode: serverNodeName,
    isActive: true,
  }).select('assignedIP').lean();

  const usedOctets = new Set(
    activeDevices
      .map((d) => (d.assignedIP ? octetFromIP(d.assignedIP) : null))
      .filter((o) => typeof o === 'number' && !isNaN(o))
  );

  let nextOctet = null;
  for (let octet = HOST_MIN; octet <= HOST_MAX; octet++) {
    if (!usedOctets.has(octet)) {
      nextOctet = octet;
      break;
    }
  }

  if (nextOctet === null) {
    throw new ApiError(503, `Server "${serverNodeName}" has exhausted its IP space`);
  }

  const subnetBase = node.subnetCIDR ? node.subnetCIDR.split('/')[0] : '10.8.0.0';
  const assignedIP = ipFromOctet(subnetBase, nextOctet);
  if (!ipaddr.isValid(assignedIP)) {
    throw new ApiError(500, 'Generated IP is invalid — check node config');
  }

  // Update diagnostic nextIP on node document
  await ServerNode.updateOne(
    { _id: node._id },
    { $set: { nextIP: nextOctet + 1 } }
  );

  return { assignedIP, serverNode: node };
}

module.exports = { allocateIP, octetFromIP, HOST_MIN, HOST_MAX };