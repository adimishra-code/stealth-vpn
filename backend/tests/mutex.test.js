const { withUserLock } = require('../src/services/provisioning.service');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe('withUserLock (per-user provisioning mutex)', () => {
  test('serializes concurrent provisioning for the same user', async () => {
    const timeline = [];
    const fn = async () => {
      timeline.push('start');
      await sleep(50);
      timeline.push('end');
    };

    await Promise.all([withUserLock('u1', fn), withUserLock('u1', fn)]);
    expect(timeline).toEqual(['start', 'end', 'start', 'end']);
  });

  test('allows different users to run concurrently', async () => {
    const active = { count: 0, max: 0 };
    const fn = async () => {
      active.count += 1;
      active.max = Math.max(active.max, active.count);
      await sleep(50);
      active.count -= 1;
    };

    await Promise.all([
      withUserLock('u1', fn),
      withUserLock('u2', fn),
      withUserLock('u3', fn),
    ]);
    expect(active.max).toBe(3);
  });

  test('a failed run does not poison the lock for the next caller', async () => {
    const failing = withUserLock('u1', async () => {
      throw new Error('provisioning exploded');
    });
    await expect(failing).rejects.toThrow('provisioning exploded');

    const outcome = await withUserLock('u1', async () => 'second attempt ok');
    expect(outcome).toBe('second attempt ok');
  });
});
