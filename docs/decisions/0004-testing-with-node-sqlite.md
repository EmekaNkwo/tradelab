# ADR 0004: Test real SQL with Node's built-in SQLite

**Status:** accepted (Phase 1)

**Context.** Repositories, migrations, and backup/restore are only trustworthy if tested against real SQL. `expo-sqlite` needs a device.

**Decision.** Code depends on the small `SqlDatabase` interface. Tests use `testing/nodeSqlite.ts`, an adapter over `node:sqlite` (Node ≥ 22.13; project uses Node 24) with savepoint-based transactions. Jest runs two projects: `logic` (Node, `*.test.ts`) and `ui` (`jest-expo/android`, `*.test.tsx`).

**Consequences.** Migrations, constraint failures, rollbacks, and restore are tested with the same SQL the app runs. SQLite version differences between Node and Android are possible but unlikely for the SQL used; device runs (Phase 12 Maestro) remain the final check.

## Addendum: transactions take an explicit handle (code review, Phase 1)

`SqlDatabase.transactionAsync(task: (tx) => …)` replaces expo-sqlite's non-exclusive `withTransactionAsync`, in which any statement issued during an `await` (e.g. a live-query reload) joins the open transaction. On device it uses `withExclusiveTransactionAsync`, which runs on its own connection. Two consequences:

- Code inside a transaction **must** use `tx`, never the outer `db`.
- Connection pragmas such as `foreign_keys` are per-connection. When foreign keys are introduced (Phase 2+), turn them on for the transaction connection too, and test this on a device.

The Node test adapter runs synchronously, so it cannot reproduce interleaving. Device runs remain the final check.

## Addendum 2: one connection plus a write lock (Phase 1 re-review, Phase 2)

`PRAGMA foreign_keys` is a no-op inside a transaction, so it can never be enabled on the separate connection used by `withExclusiveTransactionAsync`. Phase 2 introduces foreign keys, so the device adapter now:

- runs transactions with `withTransactionAsync` on the main connection (which has `foreign_keys`, `busy_timeout`, and WAL set at open);
- routes every `execAsync`/`runAsync` and every transaction through one in-process write lock (`data/db/writeLock.ts`), so a write issued outside `tx` while a transaction is open waits instead of joining it.

Reads are not locked. A read issued during an open transaction may see its uncommitted rows; repositories emit change events only after commit, so screens re-query and settle on committed data. Code inside a transaction must still use `tx`: calling the outer `db.runAsync` there would wait on the lock it already holds and deadlock.
