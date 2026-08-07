const ipaddr = require('ipaddr.js');

// Usable host octets: .0 is the network address, .1 is the node's own wg0
// address. Must stay in sync with HOST_MIN in utils/ipAllocator.js.
const HOST_MIN = 2;

// Computes how much of a node's WireGuard pool is used. Pure function of the
// ServerNode document — no I/O — so the admin endpoint and tests share it.
function computePoolUsage(node) {
  let total = 253; // sane default for a /24 (spec: 253 usable IPs, .2–.254)
  try {
    const [, prefix] = ipaddr.parseCIDR(node.subnetCIDR || '10.8.0.0/24');
    // minus network + broadcast + the node's own wg0 gateway (.1) → .2–.254
    total = Math.max(2 ** (32 - prefix) - 3, 0);
  } catch {
    // fall back to the /24 default above
  }

  const allocated = Math.max((node.nextIP || HOST_MIN) - HOST_MIN, 0);
  const free = Math.max(total - allocated, 0);
  const pct = total > 0 ? Math.round((allocated / total) * 100) : 0;
  return { node: node.name, total, allocated, free, pct };
}

module.exports = { computePoolUsage, HOST_MIN };
