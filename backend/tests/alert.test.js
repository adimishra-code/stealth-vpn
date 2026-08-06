const { createThrottle } = require('../src/services/alert.service');

describe('createThrottle', () => {
  test('first occurrence sends, repeats within cooldown are blocked', () => {
    const t = createThrottle(5000);
    const now = 1_000_000;

    expect(t.shouldSend('a', now)).toBe(true);
    expect(t.shouldSend('a', now + 1000)).toBe(false);
    expect(t.shouldSend('a', now + 4999)).toBe(false);
  });

  test('same key sends again after the cooldown window', () => {
    const t = createThrottle(5000);
    const now = 1_000_000;

    expect(t.shouldSend('a', now)).toBe(true);
    expect(t.shouldSend('a', now + 5000)).toBe(true);
    expect(t.shouldSend('a', now + 5000)).toBe(false);
  });

  test('different keys are independent', () => {
    const t = createThrottle(5000);
    const now = 1_000_000;

    expect(t.shouldSend('a', now)).toBe(true);
    expect(t.shouldSend('b', now)).toBe(true);
    expect(t.shouldSend('a', now + 1000)).toBe(false);
    expect(t.shouldSend('b', now + 1000)).toBe(false);
  });

  test('a long-running flapping error does not grow the map unbounded', () => {
    const t = createThrottle(5000);
    const now = 1_000_000;

    // Three batches, each > 2x cooldown apart in simulated time, so prune
    // has something to evict between batches.
    for (let batch = 0; batch < 3; batch++) {
      const base = now + batch * 50_000;
      for (let i = 0; i < 500; i++) {
        t.shouldSend(`err-${batch}-${i}`, base + i);
      }
    }
    expect(t.size()).toBeLessThanOrEqual(500);
  });

  test('pruned keys can alert again', () => {
    const t = createThrottle(5000);
    const now = 1_000_000;

    for (let batch = 0; batch < 3; batch++) {
      const base = now + batch * 50_000;
      for (let i = 0; i < 500; i++) {
        t.shouldSend(`err-${batch}-${i}`, base + i);
      }
    }

    expect(t.shouldSend('err-0-0', now + 150_000)).toBe(true);
  });
});
