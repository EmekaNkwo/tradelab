import { EMPTY_PLAN, type TradingPlan } from '../../../domain/plan';
import type { UtcIso } from '../../../shared/time';
import { openTestDatabase, type TestDatabase } from '../../../testing/nodeSqlite';
import { createBackup } from '../../backup/export';
import { restoreBackup } from '../../backup/restore';
import { createChangeBus } from '../../db/changeBus';
import { runMigrations } from '../../db/migrate';
import { MIGRATIONS } from '../../db/migrations';
import { createLearningRepository } from '../learningRepository';
import { createPlanRepository, parsePlan } from '../planRepository';
import { createSettingsRepository } from '../settingsRepository';

const NOW = '2026-10-29T10:00:00.000Z' as UtcIso;
const LATER = '2026-10-29T11:00:00.000Z' as UtcIso;
let seq = 0;
const newId = (prefix: string) => `${prefix}_${(seq += 1)}`;

async function fresh(): Promise<TestDatabase> {
  const db = openTestDatabase();
  await runMigrations(db, MIGRATIONS, NOW);
  return db;
}

const PLAN: TradingPlan = {
  ...EMPTY_PLAN,
  instruments: [' eurusd ', 'GBPUSD'],
  sessions: ['london'],
  timeframes: ['H1'],
  entryRules: '  Retest of a broken level  ',
  exitRules: 'Target or stop',
  stopRules: 'Beyond the last swing',
  stopTradingWhen: 'After 2 losses in a day',
};

describe('trading plan repository', () => {
  it('saves numbered versions, newest first, tidying the text', async () => {
    const db = await fresh();
    const bus = createChangeBus();
    let changes = 0;
    bus.subscribe(['trading_plan'], () => {
      changes += 1;
    });
    const repo = createPlanRepository(db, bus);
    expect(await repo.latest()).toEqual({ ok: true, value: null });

    const v1 = await repo.save(PLAN, NOW);
    expect(v1.ok && v1.value.version).toBe(1);
    expect(v1.ok && v1.value.plan.instruments).toEqual(['EURUSD', 'GBPUSD']);
    expect(v1.ok && v1.value.plan.entryRules).toBe('Retest of a broken level');
    await repo.save({ ...PLAN, maxTradesPerDay: 2 }, LATER);

    const all = await repo.versions();
    expect(all.ok && all.value.map((v) => [v.version, v.plan.maxTradesPerDay, v.createdAt])).toEqual([
      [2, 2, LATER],
      [1, 3, NOW],
    ]);
    expect(changes).toBe(2);
  });

  it('refuses an incomplete plan with the first problem and every field', async () => {
    const repo = createPlanRepository(await fresh(), createChangeBus());
    const r = await repo.save({ ...PLAN, stopRules: '   ', riskPerTradePercent: 40 }, NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe('ValidationError');
      expect(r.error.message).toBe('This part of the plan is required');
      expect(r.error.issues).toEqual(['stopRules', 'riskPerTradePercent']);
    }
    expect(await repo.versions()).toEqual({ ok: true, value: [] });
  });

  it('skips stored versions that are not valid plans', async () => {
    const db = await fresh();
    const repo = createPlanRepository(db, createChangeBus());
    await repo.save(PLAN, NOW);
    await db.runAsync('INSERT INTO trading_plan (version, plan, created_at) VALUES (?, ?, ?)', [2, '{"instruments":[]}', LATER]);
    await db.runAsync('INSERT INTO trading_plan (version, plan, created_at) VALUES (?, ?, ?)', [3, 'not json', LATER]);
    const latest = await repo.latest();
    expect(latest.ok && latest.value?.version).toBe(1);
    expect(parsePlan('{"instruments":["EURUSD"],"extra":1}')).toBeNull();
  });

  it('reports a storage failure instead of throwing', async () => {
    const db = await fresh();
    await db.execAsync('DROP TABLE trading_plan');
    const repo = createPlanRepository(db, createChangeBus());
    expect((await repo.versions()).ok).toBe(false);
    const saved = await repo.save(PLAN, NOW);
    expect(!saved.ok && saved.error.kind).toBe('StorageError');
  });

  it('survives backup and restore, and restore rejects a corrupt plan', async () => {
    const db = await fresh();
    await createPlanRepository(db, createChangeBus()).save(PLAN, NOW);
    const backup = await createBackup(db, '0.1.0', NOW);
    if (!backup.ok) throw new Error(backup.error.message);
    const target = await fresh();
    expect((await restoreBackup(target, createChangeBus(), backup.value)).ok).toBe(true);
    const restored = await createPlanRepository(target, createChangeBus()).latest();
    expect(restored.ok && restored.value?.plan.instruments).toEqual(['EURUSD', 'GBPUSD']);

    const bad = { ...backup.value, tables: { ...backup.value.tables, trading_plan: [{ version: 1, plan: '{"instruments":[]}', created_at: NOW }] } };
    expect((await restoreBackup(await fresh(), createChangeBus(), bad)).ok).toBe(false);
  });
});

describe('pre-trade checklist setting', () => {
  it('is on by default and can be turned off', async () => {
    const repo = createSettingsRepository(await fresh(), createChangeBus());
    const initial = await repo.get();
    expect(initial.ok && initial.value.preTradeChecklist).toBe(true);
    const off = await repo.update({ preTradeChecklist: false }, NOW);
    expect(off.ok && off.value.preTradeChecklist).toBe(false);
  });
});

describe('quiz attempts for the progress review', () => {
  it('lists attempts newest first and skips unreadable answers', async () => {
    const db = await fresh();
    const repo = createLearningRepository(db, createChangeBus(), newId);
    await repo.recordReviewSession({ kind: 'review', refId: 'review', answers: { q1: ['a'] }, score: 1, passed: true }, [], NOW);
    await repo.recordReviewSession({ kind: 'review', refId: 'review', answers: { q2: ['b'] }, score: 0, passed: false }, [], LATER);
    await db.runAsync("INSERT INTO quiz_attempt (id, kind, ref_id, answers, score, passed, created_at) VALUES ('bad', 'review', 'review', 'not json', 0, 0, ?)", [LATER]);
    const r = await repo.quizAttempts();
    expect(r.ok && r.value.map((a) => [a.answers, a.passed, a.createdAt])).toEqual([
      [{ q2: ['b'] }, false, LATER],
      [{ q1: ['a'] }, true, NOW],
    ]);
  });
});

describe('saving an unchanged plan', () => {
  it('returns the latest version instead of adding an identical one', async () => {
    const repo = createPlanRepository(await fresh(), createChangeBus());
    await repo.save(PLAN, NOW);
    const again = await repo.save({ ...PLAN, instruments: ['EURUSD', 'gbpusd '] }, LATER);
    expect(again.ok && [again.value.version, again.value.createdAt]).toEqual([1, NOW]);
    const all = await repo.versions();
    expect(all.ok && all.value).toHaveLength(1);
  });
});
