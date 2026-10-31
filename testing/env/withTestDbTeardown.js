/**
 * Test-only: wraps a Jest environment so that, when a test file finishes,
 * every Node SQLite test database it left open is closed.
 *
 * It runs in the environment's `teardown()`, which Jest calls after all of
 * the file's own hooks (`afterEach`, `afterAll`) have run, so a file's own
 * cleanup always sees its databases still open. `testing/nodeSqlite.ts`
 * keeps the open databases in a Set on the test file's global under
 * `REGISTRY_KEY`; a file that never opens one has no registry and nothing
 * happens.
 */
const REGISTRY_KEY = '__tradelabOpenTestDatabases';

function withTestDbTeardown(Base) {
  return class TestDbTeardownEnvironment extends Base {
    async teardown() {
      const registry = this.global && this.global[REGISTRY_KEY];
      if (registry && typeof registry.forEach === 'function') {
        registry.forEach((raw) => {
          if (raw.isOpen) raw.close();
        });
        registry.clear();
      }
      await super.teardown();
    }
  };
}

module.exports = { withTestDbTeardown, REGISTRY_KEY };
