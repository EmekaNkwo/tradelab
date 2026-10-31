import { closeOpenTestDatabases, openTestDatabase } from '../nodeSqlite';

describe('test database teardown', () => {
  it('closes databases a test left open, once', async () => {
    closeOpenTestDatabases();
    const left = openTestDatabase();
    const closed = openTestDatabase();
    closed.close();
    expect(closeOpenTestDatabases()).toBe(1);
    expect(closeOpenTestDatabases()).toBe(0);
    await expect(left.getFirstAsync('SELECT 1', [])).rejects.toThrow();
  });

  it('lets a test close a database twice', () => {
    const db = openTestDatabase();
    db.close();
    expect(() => db.close()).not.toThrow();
    expect(closeOpenTestDatabases()).toBe(0);
  });
});
