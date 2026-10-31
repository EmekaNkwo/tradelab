import { openTestDatabase, type TestDatabase } from '../nodeSqlite';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { withTestDbTeardown, REGISTRY_KEY } = require('../env/withTestDbTeardown') as {
  withTestDbTeardown: (base: new () => { global: Record<string, unknown>; teardown(): Promise<void> }) => new () => { global: Record<string, unknown>; teardown(): Promise<void> };
  REGISTRY_KEY: string;
};

describe('test-database teardown environment', () => {
  it('closes open databases in teardown, then runs the base teardown', async () => {
    const calls: string[] = [];
    class Base {
      global: Record<string, unknown> = {};
      async teardown() {
        calls.push(`base:${String((this.global[REGISTRY_KEY] as Set<unknown>).size)}`);
      }
    }
    const Env = withTestDbTeardown(Base);
    const env = new Env();
    const closed: string[] = [];
    const fake = (name: string) => ({ isOpen: true, close() { closed.push(name); this.isOpen = false; } });
    const already = { isOpen: false, close: () => closed.push('twice') };
    env.global[REGISTRY_KEY] = new Set([fake('a'), fake('b'), already]);
    await env.teardown();
    expect(closed).toEqual(['a', 'b']);
    expect(calls).toEqual(['base:0']);
  });

  it('does nothing for a file that opened no database', async () => {
    class Base {
      global: Record<string, unknown> = {};
      async teardown() {}
    }
    const Env = withTestDbTeardown(Base);
    await expect(new Env().teardown()).resolves.toBeUndefined();
  });

  it('registers databases on the test file global, where the environment reads them', () => {
    const db = openTestDatabase();
    const registry = (globalThis as unknown as Record<string, Set<unknown>>)[REGISTRY_KEY];
    expect(registry?.size).toBeGreaterThan(0);
    db.close();
  });
});

// Ordering: the file's own afterAll must still find its database open. A global
// afterAll in a setup file would run first and close it; the environment's
// teardown runs only after every hook in the file.
let kept: TestDatabase;
beforeAll(() => {
  kept = openTestDatabase();
});
afterAll(async () => {
  await expect(kept.getFirstAsync<{ one: number }>('SELECT 1 AS one', [])).resolves.toEqual({ one: 1 });
});
describe('hook order', () => {
  it('leaves the database open for the file to close (or the environment to close later)', async () => {
    await expect(kept.getFirstAsync('SELECT 1 AS one', [])).resolves.toEqual({ one: 1 });
  });
});
