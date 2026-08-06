const { computeBandwidthDelta } = require('../src/services/bandwidth.service');

describe('computeBandwidthDelta (wg show transfer is cumulative)', () => {
  test('first sync stores baseline, reports zero delta', () => {
    const d = computeBandwidthDelta({ rx: 1048576, tx: 0, lastRx: null, lastTx: null });
    expect(d.deltaRx).toBe(0);
    expect(d.deltaTx).toBe(0);
    expect(d.deltaMB).toBe(0);
  });

  test('second sync reports only the difference, not the total', () => {
    // 1 GB cumulative after first baseline of 500 MB
    const d = computeBandwidthDelta({ rx: 1048576, tx: 524288, lastRx: 524288, lastTx: 262144 });
    expect(d.deltaRx).toBe(524288);
    expect(d.deltaTx).toBe(262144);
    expect(d.deltaMB).toBe(0.75);
  });

  test('idle device accrues nothing (the compounding bug)', () => {
    // Counter did not move since last pass — old code would add the whole total
    const d = computeBandwidthDelta({ rx: 1048576, tx: 1048576, lastRx: 1048576, lastTx: 1048576 });
    expect(d.deltaMB).toBe(0);
  });

  test('node reboot (counter resets to 0) never produces negative delta', () => {
    const d = computeBandwidthDelta({ rx: 0, tx: 0, lastRx: 1048576, lastTx: 1048576 });
    expect(d.deltaRx).toBe(0);
    expect(d.deltaTx).toBe(0);
    expect(d.deltaMB).toBe(0);
  });

  test('partial counter reset (single direction) clamps that direction only', () => {
    const d = computeBandwidthDelta({ rx: 1048576, tx: 0, lastRx: 1048576, lastTx: 524288 });
    expect(d.deltaRx).toBe(0);
    expect(d.deltaTx).toBe(0);
  });
});
