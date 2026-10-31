import { toLocalDate, type PlannedClass } from '../../../domain/learning';
import type { UtcIso } from '../../../shared/time';
import { openTestDatabase, type TestDatabase } from '../../../testing/nodeSqlite';
import { createBackup } from '../../backup/export';
import { restoreBackup } from '../../backup/restore';
import { createChangeBus } from '../../db/changeBus';
import { runMigrations } from '../../db/migrate';
import { MIGRATIONS } from '../../db/migrations';
import { createLearningRepository } from '../learningRepository';
import { createMissionRepository } from '../missionRepository';
import { createProfileRepository } from '../profileRepository';

const NOW = '2026-10-29T10:00:00.000Z' as UtcIso;
const d = toLocalDate;
const settings = { startDate: d('2026-10-29'), timeline: { kind: 'weeks' as const, weeks: 2 }, studyDays: [1, 2, 3, 4, 5] as const, dailyMinutes: 15 };
const plan: PlannedClass[] = [
  { index: 0, date: d('2026-10-29'), kind: 'lesson', moduleId: 'm', unitIds: ['m:l1'], minutes: 15 },
  { index: 1, date: d('2026-10-30'), kind: 'checkpoint', moduleId: 'm', unitIds: ['m:checkpoint'], minutes: 15 },
];

async function fresh(): Promise<TestDatabase> {
  const db = openTestDatabase();
  await runMigrations(db, MIGRATIONS, NOW);
  return db;
}

let seq = 0;
const newId = (prefix: string) => `${prefix}_${(seq += 1)}`;

describe('learningRepository', () => {
  it('rejects invalid settings and class times at the boundary', async () => {
    const repo = createLearningRepository(await fresh(), createChangeBus(), newId);
    const bad = await repo.enrol({ programId: 'p', settings: { ...settings, dailyMinutes: 0 }, classTime: null, remindersEnabled: false, plan, completedUnitIds: [] }, NOW);
    expect(!bad.ok && bad.error.kind).toBe('ValidationError');
    const badTime = await repo.enrol({ programId: 'p', settings, classTime: '7pm', remindersEnabled: false, plan, completedUnitIds: [] }, NOW);
    expect(badTime.ok).toBe(false);
  });

  it('replacing the plan keeps completed and in-progress classes', async () => {
    const db = await fresh();
    const repo = createLearningRepository(db, createChangeBus(), newId);
    const e = await repo.enrol({ programId: 'p', settings, classTime: null, remindersEnabled: false, plan, completedUnitIds: [] }, NOW);
    if (!e.ok) throw new Error(e.error.message);
    const before = await repo.classes(e.value.id);
    if (!before.ok) throw new Error(before.error.message);
    await repo.startClass(before.value[0]!.id, NOW);
    await repo.replacePlannedClasses(e.value.id, [{ ...plan[1]!, date: d('2026-11-02') }], settings, NOW);
    const after = await repo.classes(e.value.id);
    expect(after.ok && after.value.map((c) => [c.status, c.date, c.index])).toEqual([
      ['in_progress', '2026-10-29', 0],
      ['planned', '2026-11-02', 1],
    ]);
  });

  it('missions: saved once per date, progress capped at target', async () => {
    const db = await fresh();
    const missions = createMissionRepository(db, createChangeBus());
    const list = { focus: 'F', totalMinutes: 18, missions: [{ kind: 'complete_class', title: 'Class', minutes: 15, target: 1, progress: 0 }] };
    await missions.saveIfAbsent(d('2026-10-29'), list);
    await missions.addProgress(d('2026-10-29'), 'complete_class', 5);
    await missions.saveIfAbsent(d('2026-10-29'), list);
    const got = await missions.forDate(d('2026-10-29'));
    expect(got.ok && got.value?.missions[0]?.progress).toBe(1);
    const none = await missions.forDate(d('2026-10-30'));
    expect(none.ok && none.value).toBeNull();
  });

  it('profile: corrupt rows surface as data-quality errors, not crashes', async () => {
    const db = await fresh();
    await db.runAsync(
      "INSERT INTO user_profile (id, experience, markets, goals, explanation_level, metatrader, time_zone, risk_acknowledged_at, created_at, updated_at) VALUES ('u', 'x', '{oops', '[]', 'simple', NULL, 'UTC', NULL, ?, ?)",
      [NOW, NOW],
    );
    const got = await createProfileRepository(db, createChangeBus()).get();
    expect(!got.ok && got.error.kind).toBe('DataQualityError');
  });

  it('restore rejects rows whose JSON cells would break the app later', async () => {
    const db = await fresh();
    const repo = createLearningRepository(db, createChangeBus(), newId);
    await repo.enrol({ programId: 'p', settings, classTime: null, remindersEnabled: false, plan, completedUnitIds: [] }, NOW);
    const backup = await createBackup(db, '0.1.0', NOW);
    if (!backup.ok) throw new Error(backup.error.message);
    const tables = backup.value.tables;
    const broken = { ...backup.value, tables: { ...tables, program_enrolment: tables.program_enrolment!.map((r) => ({ ...r, settings: '{"oops":1}' })) } };
    const target = await fresh();
    const r = await restoreBackup(target, createChangeBus(), broken);
    expect(!r.ok && r.error.message).toMatch(/program_enrolment has an invalid row/);
    const badClass = { ...backup.value, tables: { ...tables, daily_class: tables.daily_class!.map((r) => ({ ...r, unit_ids: 'nope' })) } };
    expect((await restoreBackup(target, createChangeBus(), badClass)).ok).toBe(false);
  });

  it('learning progress survives backup and restore (parent tables restored first)', async () => {
    const db = await fresh();
    const repo = createLearningRepository(db, createChangeBus(), newId);
    const e = await repo.enrol({ programId: 'p', settings, classTime: null, remindersEnabled: false, plan, completedUnitIds: ['m:l0'] }, NOW);
    if (!e.ok) throw new Error(e.error.message);
    const classes = await repo.classes(e.value.id);
    const cls = classes.ok ? classes.value[0]! : null;
    await repo.addNote(cls!.id, 'note', NOW);
    const backup = await createBackup(db, '0.1.0', NOW);
    if (!backup.ok) throw new Error(backup.error.message);
    const target = await fresh();
    expect((await restoreBackup(target, createChangeBus(), backup.value)).ok).toBe(true);
    expect(await target.getAllAsync('SELECT * FROM daily_class', [])).toHaveLength(2);
    expect(await target.getAllAsync('SELECT * FROM class_note', [])).toHaveLength(1);
    expect(await target.getAllAsync('SELECT * FROM unit_completion', [])).toHaveLength(1);
  });

  it('saves review items on their own and reports the review queue as changed', async () => {
    const db = await fresh();
    const bus = createChangeBus();
    const changed = jest.fn();
    bus.subscribe(['review_queue'], changed);
    const repo = createLearningRepository(db, bus, newId);
    const item = { conceptId: 'q1', box: 3, dueDate: d('2026-10-29'), lapses: 1 };
    expect((await repo.saveReviewItems([item], NOW)).ok).toBe(true);
    // Brought forward: due now, remembering the real date.
    expect((await repo.saveReviewItems([{ ...item, dueDate: d('2026-10-28'), earlyFrom: d('2026-10-29') }], NOW)).ok).toBe(true);
    const items = await repo.reviewItems();
    expect(items.ok && items.value).toEqual([{ ...item, dueDate: d('2026-10-28'), earlyFrom: d('2026-10-29') }]);
    expect(changed).toHaveBeenCalledWith(['review_queue']);
    db.close();
  });

  it('records quiz attempts made outside a class, such as the placement quiz', async () => {
    const db = await fresh();
    const repo = createLearningRepository(db, createChangeBus(), newId);
    expect((await repo.recordAttempts([], NOW)).ok).toBe(true);
    expect((await repo.recordAttempts([{ kind: 'placement', refId: 'forex-risk-checkpoint', answers: { q1: ['a'] }, score: 1, passed: true }], NOW)).ok).toBe(true);
    const attempts = await repo.quizAttempts();
    expect(attempts.ok && attempts.value.map((a) => [a.kind, a.refId, a.passed])).toEqual([['placement', 'forex-risk-checkpoint', true]]);
    db.close();
  });
});
