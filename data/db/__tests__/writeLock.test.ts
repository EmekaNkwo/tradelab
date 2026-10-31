import { createWriteLock } from '../writeLock';

describe('writeLock', () => {
  it('runs tasks one at a time in order, even when one fails', async () => {
    const lock = createWriteLock();
    const log: string[] = [];
    const slow = (name: string, ms: number, fail = false) => () =>
      new Promise<string>((resolve, reject) =>
        setTimeout(() => {
          log.push(name);
          if (fail) reject(new Error(name));
          else resolve(name);
        }, ms),
      );
    const a = lock.run(slow('a', 20));
    const b = lock.run(slow('b', 1, true));
    const c = lock.run(slow('c', 1));
    await expect(a).resolves.toBe('a');
    await expect(b).rejects.toThrow('b');
    await expect(c).resolves.toBe('c');
    expect(log).toEqual(['a', 'b', 'c']);
  });
});
