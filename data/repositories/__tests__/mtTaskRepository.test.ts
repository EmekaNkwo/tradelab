import type { UtcIso } from '../../../shared/time';
import { openTestDatabase, type TestDatabase } from '../../../testing/nodeSqlite';
import { createBackup } from '../../backup/export';
import { restoreBackup } from '../../backup/restore';
import { createChangeBus } from '../../db/changeBus';
import { runMigrations } from '../../db/migrate';
import { MIGRATIONS } from '../../db/migrations';
import { createMtTaskRepository, MAX_TASK_NOTE_LENGTH, type MetaTraderTaskCompletionInput } from '../mtTaskRepository';

const NOW = '2026-10-29T10:00:00.000Z' as UtcIso;
const FREE = { requiresDemo: false };
let seq = 0;
const newId = (prefix: string) => `${prefix}_${(seq += 1)}`;

async function fresh(): Promise<TestDatabase> {
  const db = openTestDatabase();
  await runMigrations(db, MIGRATIONS, NOW);
  return db;
}

const input: MetaTraderTaskCompletionInput = {
  taskId: 'mt-read-spread',
  platform: 'mt5',
  demoConfirmedAt: null,
  answers: { q1: ['a'] },
  score: 1,
  note: '  spread 1.2 pips  ',
};

describe('mtTaskRepository', () => {
  it('records completions, trims notes, and lists newest first', async () => {
    const db = await fresh();
    const bus = createChangeBus();
    const seen: string[][] = [];
    bus.subscribe(['mt_task_completion'], (tables) => seen.push([...tables]));
    const repo = createMtTaskRepository(db, bus, newId);
    const first = await repo.record(input, NOW, FREE);
    expect(first.ok && first.value.note).toBe('spread 1.2 pips');
    await repo.record({ ...input, note: '' }, '2026-10-30T10:00:00.000Z' as UtcIso, FREE);
    await repo.record({ ...input, taskId: 'other' }, NOW, FREE);
    const list = await repo.completions('mt-read-spread');
    expect(list.ok && list.value.map((c) => c.completedAt)).toEqual(['2026-10-30T10:00:00.000Z', NOW]);
    expect(list.ok && list.value[0]?.note).toBeNull();
    const all = await repo.completions();
    expect(all.ok && all.value).toHaveLength(3);
    expect(seen).toContainEqual(['mt_task_completion']);
  });

  it('rejects invalid input before writing', async () => {
    const repo = createMtTaskRepository(await fresh(), createChangeBus(), newId);
    expect((await repo.record({ ...input, score: 2 }, NOW, FREE)).ok).toBe(false);
    expect((await repo.record({ ...input, note: 'x'.repeat(MAX_TASK_NOTE_LENGTH + 1) }, NOW, FREE)).ok).toBe(false);
    expect((await repo.record({ ...input, platform: 'mt6' as 'mt5' }, NOW, FREE)).ok).toBe(false);
    const list = await repo.completions();
    expect(list.ok && list.value).toEqual([]);
  });

  it('saves, replaces, reads, and clears an unfinished draft; a corrupt draft reads as none', async () => {
    const db = await fresh();
    const repo = createMtTaskRepository(db, createChangeBus(), newId);
    const draft = { platform: 'mt4' as const, demoConfirmed: true, stepsDone: [0, 2], answers: { q: ['a'] }, note: 'hi' };
    expect((await repo.saveDraft('t', draft, NOW)).ok).toBe(true);
    expect((await repo.saveDraft('t', { ...draft, stepsDone: [0, 1, 2] }, NOW)).ok).toBe(true);
    const read = await repo.draft('t');
    expect(read.ok && read.value?.stepsDone).toEqual([0, 1, 2]);
    expect((await repo.saveDraft('t', { ...draft, stepsDone: [-1] }, NOW)).ok).toBe(false);
    await db.runAsync("UPDATE mt_task_draft SET draft = '{oops' WHERE task_id = 't'", []);
    expect(await repo.draft('t')).toEqual({ ok: true, value: null });
    await db.runAsync(`UPDATE mt_task_draft SET draft = '{"platform":"mt9"}' WHERE task_id = 't'`, []);
    expect(await repo.draft('t')).toEqual({ ok: true, value: null });
    expect((await repo.clearDraft('t')).ok).toBe(true);
    expect(await repo.draft('t')).toEqual({ ok: true, value: null });
    expect(await repo.draft('missing')).toEqual({ ok: true, value: null });
  });

  it('refuses a demo-required task without the demo confirmation', async () => {
    const repo = createMtTaskRepository(await fresh(), createChangeBus(), newId);
    const refused = await repo.record(input, NOW, { requiresDemo: true });
    expect(!refused.ok && refused.error.issues).toEqual(['demoConfirmedAt']);
    expect((await repo.record({ ...input, demoConfirmedAt: NOW }, NOW, { requiresDemo: true })).ok).toBe(true);
  });

  it('returns a StorageError when the database fails', async () => {
    const db = await fresh();
    const repo = createMtTaskRepository(db, createChangeBus(), newId);
    db.close();
    expect((await repo.record(input, NOW, FREE)).ok).toBe(false);
    expect((await repo.draft('t')).ok).toBe(false);
    expect((await repo.saveDraft('t', { platform: 'mt5', demoConfirmed: false, stepsDone: [], answers: {}, note: '' }, NOW)).ok).toBe(false);
    expect((await repo.clearDraft('t')).ok).toBe(false);
    const list = await repo.completions();
    expect(!list.ok && list.error.kind).toBe('StorageError');
  });

  it('survives backup and restore; bad answers JSON is rejected', async () => {
    const db = await fresh();
    await createMtTaskRepository(db, createChangeBus(), newId).record(input, NOW, FREE);
    const backup = await createBackup(db, '0.1.0', NOW);
    if (!backup.ok) throw new Error(backup.error.message);
    const target = await fresh();
    expect((await restoreBackup(target, createChangeBus(), backup.value)).ok).toBe(true);
    const restored = await createMtTaskRepository(target, createChangeBus(), newId).completions();
    expect(restored.ok && restored.value[0]?.answers).toEqual({ q1: ['a'] });

    const rows = backup.value.tables.mt_task_completion!;
    const broken = { ...backup.value, tables: { ...backup.value.tables, mt_task_completion: rows.map((r) => ({ ...r, answers: '[1]' })) } };
    expect((await restoreBackup(target, createChangeBus(), broken)).ok).toBe(false);
  });
});
