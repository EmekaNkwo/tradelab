import type { UtcIso } from '../../../shared/time';
import { openTestDatabase, type TestDatabase } from '../../../testing/nodeSqlite';
import { createBackup } from '../../backup/export';
import { restoreBackup } from '../../backup/restore';
import { createChangeBus } from '../../db/changeBus';
import { runMigrations } from '../../db/migrate';
import { MIGRATIONS } from '../../db/migrations';
import { createPracticeRepository, type ReplayAttemptInput } from '../practiceRepository';

const NOW = '2026-10-29T10:00:00.000Z' as UtcIso;
const LATER = '2026-10-29T11:00:00.000Z' as UtcIso;
let seq = 0;
const newId = (prefix: string) => `${prefix}_${(seq += 1)}`;

async function fresh(): Promise<TestDatabase> {
  const db = openTestDatabase();
  await runMigrations(db, MIGRATIONS, NOW);
  return db;
}

const replay: ReplayAttemptInput = {
  scenarioKind: 'breakout',
  seed: 7,
  timeframe: 'H1',
  startingBalance: '10000',
  finalBalance: '9980',
  trades: [
    { side: 'buy', units: '10000', entry: '1.1', exit: '1.098', initialStop: '1.098', openedAt: 3, closedAt: 6, reason: 'stop_loss', profit: '-20' },
  ],
  processScore: 1,
  stepBacks: 2,
  note: '  waited for the retest  ',
  startedAt: NOW,
};

describe('practiceRepository', () => {
  it('records drill answers and lists them newest first, announcing the change', async () => {
    const db = await fresh();
    const bus = createChangeBus();
    const heard: string[][] = [];
    bus.subscribe(['drill_attempt'], (t) => heard.push([...t]));
    const repo = createPracticeRepository(db, bus, newId);
    await repo.recordDrill({ kind: 'size_it', seed: 1, optionId: 'right', correct: true }, NOW);
    await repo.recordDrill({ kind: 'find_the_trend', seed: 2, optionId: 'up', correct: false }, LATER);
    const list = await repo.drillAttempts();
    expect(list.ok && list.value.map((d) => [d.kind, d.correct])).toEqual([
      ['find_the_trend', false],
      ['size_it', true],
    ]);
    expect(heard).toHaveLength(2);
    expect((await repo.recordDrill({ kind: '', seed: 1, optionId: 'x', correct: true }, NOW)).ok).toBe(false);
  });

  it('adds a new record for every replay (never overwrites) and trims the note', async () => {
    const db = await fresh();
    const repo = createPracticeRepository(db, createChangeBus(), newId);
    const first = await repo.recordReplay(replay, NOW);
    expect(first.ok && first.value.note).toBe('waited for the retest');
    await repo.recordReplay({ ...replay, note: '   ', processScore: null, trades: [] }, LATER);
    const list = await repo.replayAttempts();
    expect(list.ok && list.value).toHaveLength(2);
    expect(list.ok && list.value[0]!.note).toBeNull();
    expect(list.ok && list.value[1]!.trades[0]!.initialStop).toBe('1.098');
  });

  it('rejects invalid replays', async () => {
    const repo = createPracticeRepository(await fresh(), createChangeBus(), newId);
    expect((await repo.recordReplay({ ...replay, finalBalance: 'lots' }, NOW)).ok).toBe(false);
    expect((await repo.recordReplay({ ...replay, processScore: 2 }, NOW)).ok).toBe(false);
    expect((await repo.recordReplay({ ...replay, timeframe: 'H2' as never }, NOW)).ok).toBe(false);
  });

  it('survives backup and restore; a corrupt trades cell is rejected', async () => {
    const db = await fresh();
    const repo = createPracticeRepository(db, createChangeBus(), newId);
    await repo.recordReplay(replay, NOW);
    await repo.recordDrill({ kind: 'size_it', seed: 1, optionId: 'right', correct: true }, NOW);
    const backup = await createBackup(db, '0.1.0', NOW);
    if (!backup.ok) throw new Error(backup.error.message);
    const target = await fresh();
    expect((await restoreBackup(target, createChangeBus(), backup.value)).ok).toBe(true);
    const restored = createPracticeRepository(target, createChangeBus(), newId);
    const replays = await restored.replayAttempts();
    expect(replays.ok && replays.value[0]!.trades).toEqual(replay.trades);
    const drills = await restored.drillAttempts();
    expect(drills.ok && drills.value).toHaveLength(1);

    const rows = backup.value.tables.replay_attempt!;
    const broken = { ...backup.value, tables: { ...backup.value.tables, replay_attempt: rows.map((r) => ({ ...r, trades: '[{"side":"long"}]' })) } };
    expect((await restoreBackup(target, createChangeBus(), broken)).ok).toBe(false);
  });

  it('returns a StorageError when the database fails', async () => {
    const db = await fresh();
    const repo = createPracticeRepository(db, createChangeBus(), newId);
    db.close();
    expect((await repo.recordDrill({ kind: 'size_it', seed: 1, optionId: 'right', correct: true }, NOW)).ok).toBe(false);
    expect((await repo.drillAttempts()).ok).toBe(false);
    expect((await repo.recordReplay(replay, NOW)).ok).toBe(false);
    const r = await repo.replayAttempts();
    expect(!r.ok && r.error.kind).toBe('StorageError');
  });
});

describe('practiceRepository reads (Phase 4 review)', () => {
  it('tallies drills per kind and option in SQL', async () => {
    const repo = createPracticeRepository(await fresh(), createChangeBus(), newId);
    await repo.recordDrill({ kind: 'size_it', seed: 1, optionId: 'right', correct: true }, NOW);
    await repo.recordDrill({ kind: 'size_it', seed: 2, optionId: 'right', correct: true }, NOW);
    await repo.recordDrill({ kind: 'size_it', seed: 3, optionId: 'ten_x', correct: false }, NOW);
    const t = await repo.drillTallies();
    expect(t.ok && [...t.value].sort((a, b) => a.optionId.localeCompare(b.optionId))).toEqual([
      { kind: 'size_it', optionId: 'right', answered: 2, correct: 2 },
      { kind: 'size_it', optionId: 'ten_x', answered: 1, correct: 0 },
    ]);
  });

  it('limits the replay list and skips an unreadable row instead of failing', async () => {
    const db = await fresh();
    const repo = createPracticeRepository(db, createChangeBus(), newId);
    for (let i = 0; i < 4; i += 1) await repo.recordReplay(replay, `2026-10-29T1${i}:00:00.000Z` as UtcIso);
    const limited = await repo.replayAttempts(2);
    expect(limited.ok && limited.value.map((r) => r.finishedAt)).toEqual(['2026-10-29T13:00:00.000Z', '2026-10-29T12:00:00.000Z']);
    await db.runAsync("UPDATE replay_attempt SET trades = '{oops' WHERE finished_at = '2026-10-29T13:00:00.000Z'", []);
    await db.runAsync(`UPDATE replay_attempt SET trades = '[{"side":"long"}]' WHERE finished_at = '2026-10-29T12:00:00.000Z'`, []);
    const all = await repo.replayAttempts();
    expect(all.ok && all.value).toHaveLength(2);
    const t = await createPracticeRepository(db, createChangeBus(), newId).drillTallies();
    expect(t.ok && t.value).toEqual([]);
    db.close();
    expect((await repo.drillTallies()).ok).toBe(false);
  });

  it('restore rejects a replay with an unknown timeframe or a non-decimal balance', async () => {
    const db = await fresh();
    await createPracticeRepository(db, createChangeBus(), newId).recordReplay(replay, NOW);
    const backup = await createBackup(db, '0.1.0', NOW);
    if (!backup.ok) throw new Error(backup.error.message);
    const rows = backup.value.tables.replay_attempt!;
    const target = await fresh();
    for (const bad of [{ timeframe: 'H2' }, { final_balance: 'lots' }] as Record<string, string>[]) {
      const broken = { ...backup.value, tables: { ...backup.value.tables, replay_attempt: rows.map((r) => ({ ...r, ...bad })) } };
      expect((await restoreBackup(target, createChangeBus(), broken)).ok).toBe(false);
    }
  });
});

it('stores step-backs, and a replay row from an older backup restores with 0', async () => {
  const db = await fresh();
  const repo = createPracticeRepository(db, createChangeBus(), newId);
  await repo.recordReplay(replay, NOW);
  expect((await repo.recordReplay({ ...replay, stepBacks: -1 }, NOW)).ok).toBe(false);
  const backup = await createBackup(db, '0.1.0', NOW);
  if (!backup.ok) throw new Error(backup.error.message);
  const rows = backup.value.tables.replay_attempt!;
  expect(rows[0]!.step_backs).toBe(2);
  const older = {
    ...backup.value,
    schemaVersion: 5,
    tables: { ...backup.value.tables, replay_attempt: rows.map(({ step_backs: _s, ...rest }) => rest) },
  };
  const target = await fresh();
  expect((await restoreBackup(target, createChangeBus(), older)).ok).toBe(true);
  const restored = await createPracticeRepository(target, createChangeBus(), newId).replayAttempts();
  expect(restored.ok && restored.value[0]!.stepBacks).toBe(0);
});
