const { computePoolUsage, HOST_MIN } = require('../src/utils/ipPool');

describe('computePoolUsage (admin pool-status)', () => {
  test('counts usable hosts as total minus network/broadcast/gateway', () => {
    const p = computePoolUsage({
      subnetCIDR: '10.8.0.0/24',
      nextIP: 2,
      wgPublicKey: 'k',
    });
    // 256 - 2 (network/broadcast) - 1 (gateway .1) = 253 usable; 0 allocated
    expect(p.total).toBe(253);
    expect(p.allocated).toBe(0);
    expect(p.free).toBe(253);
    expect(p.pct).toBe(0);
  });

  test('allocated equals nextIP minus the gateway host offset', () => {
    const p = computePoolUsage({ subnetCIDR: '10.8.0.0/24', nextIP: 55, wgPublicKey: 'k' });
    // nextIP starts at HOST_MIN (2 = .2 is the first client) → 55 - 2 = 53 clients
    expect(p.allocated).toBe(53);
    expect(p.free).toBe(200);
    expect(p.pct).toBe(21);
  });

  test('reports 100% when the pool is exhausted', () => {
    const p = computePoolUsage({ subnetCIDR: '10.8.0.0/24', nextIP: 255, wgPublicKey: 'k' });
    expect(p.allocated).toBe(253);
    expect(p.free).toBe(0);
    expect(p.pct).toBe(100);
  });

  test('larger subnet /16 scales the totals', () => {
    const p = computePoolUsage({ subnetCIDR: '10.8.0.0/16', nextIP: 1000, wgPublicKey: 'k' });
    expect(p.total).toBe(65533);
    expect(p.allocated).toBe(998);
    expect(p.pct).toBe(2);
  });

  test('HOST_MIN matches the allocator contract (first client = .2)', () => {
    expect(HOST_MIN).toBe(2);
  });
});
