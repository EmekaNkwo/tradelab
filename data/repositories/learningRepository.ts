import { z } from 'zod';
import { isLocalDate, type LocalDate, type Weekday } from '../../domain/learning/dates';
import type { PlannedClass, ScheduleSettings } from '../../domain/learning/scheduler';
import type { ReviewItem } from '../../domain/learning/spacedRepetition';
import type { ClassNote, DailyClass, Enrolment, EnrolmentStatus, QuizAttempt } from '../../domain/models/learning';
import { fromUnknown, notFound, validationError, type AppError } from '../../shared/errors';
import { err, ok, type Result } from '../../shared/result';
import type { UtcIso } from '../../shared/time';
import type { ChangeBus } from '../db/changeBus';
import type { SqlDatabase, SqlExecutor } from '../db/client';

/**
 * Enrolments, scheduled classes, completed units, quiz attempts, the
 * spaced-repetition queue, and lesson progress (spec §6–7). Multi-row changes
 * are single transactions so progress is never half-saved.
 */

export const LEARNING_TABLES = [
  'program_enrolment',
  'daily_class',
  'class_note',
  'unit_completion',
  'lesson_progress',
  'quiz_attempt',
  'review_queue',
] as const;

export type NewId = (prefix: string) => string;

export interface EnrolInput {
  readonly programId: string;
  readonly settings: ScheduleSettings;
  readonly classTime: string | null;
  readonly remindersEnabled: boolean;
  readonly plan: readonly PlannedClass[];
  /** Units already demonstrated, e.g. by a placement checkpoint. */
  readonly completedUnitIds: readonly string[];
}

export interface EnrolmentPatch {
  readonly status?: EnrolmentStatus;
  readonly settings?: ScheduleSettings;
  readonly classTime?: string | null;
  readonly remindersEnabled?: boolean;
}

export interface LessonResult {
  readonly lessonId: string;
  readonly score: number;
  readonly completed: boolean;
}

export interface ClassCompletion {
  readonly classId: string;
  readonly score: number | null;
  readonly completedUnitIds: readonly string[];
  readonly lessonResults: readonly LessonResult[];
  readonly attempts: readonly Omit<QuizAttempt, 'id' | 'createdAt'>[];
  readonly reviewItems: readonly ReviewItem[];
  /** False keeps the class in progress (e.g. a checkpoint not yet passed). */
  readonly finished: boolean;
}

export interface LearningRepository {
  currentEnrolment(): Promise<Result<Enrolment | null, AppError>>;
  enrolments(): Promise<Result<readonly Enrolment[], AppError>>;
  enrol(input: EnrolInput, now: UtcIso): Promise<Result<Enrolment, AppError>>;
  updateEnrolment(id: string, patch: EnrolmentPatch, now: UtcIso): Promise<Result<Enrolment, AppError>>;
  /** Replaces all planned (not started) classes with `plan`, keeping history and classes in progress. */
  replacePlannedClasses(enrolmentId: string, plan: readonly PlannedClass[], settings: ScheduleSettings, now: UtcIso): Promise<Result<void, AppError>>;
  /**
   * Makes a queued enrolment the active one, in one transaction: the current
   * active or paused enrolment goes back to the queue (keeping its history),
   * and the chosen one's planned classes are replaced with `plan`.
   */
  activateEnrolment(id: string, plan: readonly PlannedClass[], settings: ScheduleSettings, now: UtcIso): Promise<Result<Enrolment, AppError>>;
  classes(enrolmentId: string): Promise<Result<readonly DailyClass[], AppError>>;
  getClass(id: string): Promise<Result<DailyClass, AppError>>;
  startClass(id: string, now: UtcIso): Promise<Result<void, AppError>>;
  saveSectionProgress(id: string, sectionsDone: number): Promise<Result<void, AppError>>;
  completeClass(input: ClassCompletion, now: UtcIso): Promise<Result<void, AppError>>;
  completedUnitIds(enrolmentId: string): Promise<Result<ReadonlySet<string>, AppError>>;
  recordReviewSession(attempt: Omit<QuizAttempt, 'id' | 'createdAt'>, items: readonly ReviewItem[], now: UtcIso): Promise<Result<void, AppError>>;
  /** Saves quiz attempts made outside a class (e.g. the placement quiz during onboarding). */
  recordAttempts(attempts: readonly Omit<QuizAttempt, 'id' | 'createdAt'>[], now: UtcIso): Promise<Result<void, AppError>>;
  reviewItems(): Promise<Result<readonly ReviewItem[], AppError>>;
  /** Saves changed review items without an attempt (e.g. concepts brought forward for targeted practice). */
  saveReviewItems(items: readonly ReviewItem[], now: UtcIso): Promise<Result<void, AppError>>;
  /** Every recorded quiz attempt, newest first (for the Practice Progress Review). Unreadable answers are skipped. */
  quizAttempts(): Promise<Result<readonly QuizAttempt[], AppError>>;
  notes(classId: string): Promise<Result<readonly ClassNote[], AppError>>;
  addNote(classId: string, body: string, now: UtcIso): Promise<Result<ClassNote, AppError>>;
}

const MAX_NOTE_LENGTH = 4000;
const storedAnswersSchema = z.record(z.string(), z.array(z.string()));
const safeJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};
const localDate = z.string().refine(isLocalDate) as unknown as z.ZodType<LocalDate>;
const weekday = z.number().int().min(0).max(6) as unknown as z.ZodType<Weekday>;

export const scheduleSettingsSchema = z
  .object({
    startDate: localDate,
    timeline: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('weeks'), weeks: z.number().int().min(1).max(104) }).strict(),
      z.object({ kind: z.literal('finishDate'), date: localDate }).strict(),
      z.object({ kind: z.literal('open') }).strict(),
    ]),
    studyDays: z.array(weekday).min(1).max(7),
    dailyMinutes: z.number().int().min(5).max(240),
    extraDates: z.array(localDate).optional(),
  })
  .strict() satisfies z.ZodType<ScheduleSettings>;

const classTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable();

interface EnrolmentRow {
  readonly id: string;
  readonly program_id: string;
  readonly status: EnrolmentStatus;
  readonly queue_position: number;
  readonly settings: string;
  readonly class_time: string | null;
  readonly reminders_enabled: number;
  readonly created_at: string;
  readonly updated_at: string;
}

interface ClassRow {
  readonly id: string;
  readonly enrolment_id: string;
  readonly class_index: number;
  readonly date: string;
  readonly kind: DailyClass['kind'];
  readonly module_id: string | null;
  readonly unit_ids: string;
  readonly minutes: number;
  readonly status: DailyClass['status'];
  readonly sections_done: number;
  readonly score: number | null;
  readonly started_at: string | null;
  readonly completed_at: string | null;
}

function toEnrolment(row: EnrolmentRow): Enrolment {
  const settings = scheduleSettingsSchema.parse(JSON.parse(row.settings));
  return {
    id: row.id,
    programId: row.program_id,
    status: row.status,
    queuePosition: row.queue_position,
    settings,
    classTime: row.class_time,
    remindersEnabled: row.reminders_enabled === 1,
    createdAt: row.created_at as UtcIso,
    updatedAt: row.updated_at as UtcIso,
  };
}

function toClass(row: ClassRow): DailyClass {
  return {
    id: row.id,
    enrolmentId: row.enrolment_id,
    index: row.class_index,
    date: row.date as LocalDate,
    kind: row.kind,
    moduleId: row.module_id,
    unitIds: z.array(z.string()).parse(JSON.parse(row.unit_ids)),
    minutes: row.minutes,
    status: row.status,
    sectionsDone: row.sections_done,
    score: row.score,
    startedAt: row.started_at as UtcIso | null,
    completedAt: row.completed_at as UtcIso | null,
  };
}

async function insertClasses(tx: SqlExecutor, enrolmentId: string, plan: readonly PlannedClass[], firstIndex: number, now: UtcIso, newId: NewId) {
  for (const [i, c] of plan.entries()) {
    await tx.runAsync(
      `INSERT INTO daily_class (id, enrolment_id, class_index, date, kind, module_id, unit_ids, minutes, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'planned', ?)`,
      [newId('cls'), enrolmentId, firstIndex + i, c.date, c.kind, c.moduleId, JSON.stringify(c.unitIds), c.minutes, now],
    );
  }
}

async function insertUnits(tx: SqlExecutor, enrolmentId: string, unitIds: readonly string[], now: UtcIso) {
  for (const unitId of unitIds) {
    await tx.runAsync('INSERT OR IGNORE INTO unit_completion (enrolment_id, unit_id, completed_at) VALUES (?, ?, ?)', [enrolmentId, unitId, now]);
  }
}

async function upsertReviewItems(tx: SqlExecutor, items: readonly ReviewItem[], now: UtcIso) {
  for (const item of items) {
    await tx.runAsync(
      `INSERT INTO review_queue (concept_id, box, due_date, lapses, early_from, updated_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(concept_id) DO UPDATE SET box = excluded.box, due_date = excluded.due_date, lapses = excluded.lapses, early_from = excluded.early_from, updated_at = excluded.updated_at`,
      [item.conceptId, item.box, item.dueDate, item.lapses, item.earlyFrom ?? null, now],
    );
  }
}

async function insertAttempts(tx: SqlExecutor, attempts: ClassCompletion['attempts'], now: UtcIso, newId: NewId) {
  for (const a of attempts) {
    await tx.runAsync(
      'INSERT INTO quiz_attempt (id, kind, ref_id, answers, score, passed, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [newId('qza'), a.kind, a.refId, JSON.stringify(a.answers), a.score, a.passed ? 1 : 0, now],
    );
  }
}

export function createLearningRepository(db: SqlDatabase, bus: ChangeBus, newId: NewId): LearningRepository {
  const guard = async <T>(message: string, task: () => Promise<T>, tables: readonly string[] = []): Promise<Result<T, AppError>> => {
    try {
      const value = await task();
      if (tables.length > 0) bus.emit(tables);
      return ok(value);
    } catch (cause) {
      return err(fromUnknown('StorageError', message, cause));
    }
  };

  const findEnrolment = async (id: string): Promise<Result<Enrolment, AppError>> => {
    const row = await guard('Reading enrolment failed', () => db.getFirstAsync<EnrolmentRow>('SELECT * FROM program_enrolment WHERE id = ?', [id]));
    if (!row.ok) return row;
    return row.value ? ok(toEnrolment(row.value)) : err(notFound(`Enrolment ${id} not found`));
  };

  const getClass = async (id: string): Promise<Result<DailyClass, AppError>> => {
    const row = await guard('Reading class failed', () => db.getFirstAsync<ClassRow>('SELECT * FROM daily_class WHERE id = ?', [id]));
    if (!row.ok) return row;
    return row.value ? ok(toClass(row.value)) : err(notFound(`Class ${id} not found`));
  };

  return {
    currentEnrolment: () =>
      guard('Reading enrolment failed', async () => {
        const row = await db.getFirstAsync<EnrolmentRow>(
          "SELECT * FROM program_enrolment WHERE status IN ('active','paused') ORDER BY updated_at DESC LIMIT 1",
          [],
        );
        return row ? toEnrolment(row) : null;
      }),

    enrolments: () =>
      guard('Reading enrolments failed', async () =>
        (await db.getAllAsync<EnrolmentRow>('SELECT * FROM program_enrolment ORDER BY status, queue_position, created_at', [])).map(toEnrolment),
      ),

    async enrol(input, now) {
      const settings = scheduleSettingsSchema.safeParse(input.settings);
      const classTime = classTimeSchema.safeParse(input.classTime);
      if (!settings.success || !classTime.success) return err(validationError('Invalid program settings'));
      const id = newId('enr');
      const result = await guard(
        'Saving enrolment failed',
        () =>
          db.transactionAsync(async (tx) => {
            const current = await tx.getFirstAsync<{ id: string }>("SELECT id FROM program_enrolment WHERE status IN ('active','paused')", []);
            const queued = current !== null;
            const position = queued
              ? ((await tx.getFirstAsync<{ p: number | null }>('SELECT MAX(queue_position) AS p FROM program_enrolment', []))?.p ?? 0) + 1
              : 0;
            await tx.runAsync(
              `INSERT INTO program_enrolment (id, program_id, status, queue_position, settings, class_time, reminders_enabled, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [id, input.programId, queued ? 'queued' : 'active', position, JSON.stringify(settings.data), classTime.data, input.remindersEnabled ? 1 : 0, now, now],
            );
            await insertUnits(tx, id, input.completedUnitIds, now);
            // A queued program gets its classes when it becomes active.
            if (!queued) await insertClasses(tx, id, input.plan, 0, now, newId);
          }),
        ['program_enrolment', 'daily_class', 'unit_completion'],
      );
      return result.ok ? findEnrolment(id) : result;
    },

    async updateEnrolment(id, patch, now) {
      const current = await findEnrolment(id);
      if (!current.ok) return current;
      const settings = patch.settings ? scheduleSettingsSchema.safeParse(patch.settings) : null;
      const classTime = patch.classTime !== undefined ? classTimeSchema.safeParse(patch.classTime) : null;
      if ((settings && !settings.success) || (classTime && !classTime.success)) return err(validationError('Invalid program settings'));
      const next = {
        ...current.value,
        ...(patch.status ? { status: patch.status } : {}),
        ...(settings?.success ? { settings: settings.data } : {}),
        ...(classTime?.success ? { classTime: classTime.data } : {}),
        ...(patch.remindersEnabled !== undefined ? { remindersEnabled: patch.remindersEnabled } : {}),
      };
      const saved = await guard(
        'Saving enrolment failed',
        () =>
          db.runAsync(
            'UPDATE program_enrolment SET status = ?, settings = ?, class_time = ?, reminders_enabled = ?, updated_at = ? WHERE id = ?',
            [next.status, JSON.stringify(next.settings), next.classTime, next.remindersEnabled ? 1 : 0, now, id],
          ),
        ['program_enrolment'],
      );
      return saved.ok ? findEnrolment(id) : saved;
    },

    async replacePlannedClasses(enrolmentId, plan, settings, now) {
      const parsed = scheduleSettingsSchema.safeParse(settings);
      if (!parsed.success) return err(validationError('Invalid program settings'));
      return guard(
        'Rebuilding the schedule failed',
        () =>
          db.transactionAsync(async (tx) => {
            await tx.runAsync("DELETE FROM daily_class WHERE enrolment_id = ? AND status = 'planned'", [enrolmentId]);
            const max = await tx.getFirstAsync<{ m: number | null }>('SELECT MAX(class_index) AS m FROM daily_class WHERE enrolment_id = ?', [enrolmentId]);
            await insertClasses(tx, enrolmentId, plan, (max?.m ?? -1) + 1, now, newId);
            await tx.runAsync('UPDATE program_enrolment SET settings = ?, updated_at = ? WHERE id = ?', [JSON.stringify(parsed.data), now, enrolmentId]);
          }),
        ['daily_class', 'program_enrolment'],
      );
    },

    async activateEnrolment(id, plan, settings, now) {
      const parsed = scheduleSettingsSchema.safeParse(settings);
      if (!parsed.success) return err(validationError('Invalid program settings'));
      const target = await findEnrolment(id);
      if (!target.ok) return target;
      if (target.value.status !== 'queued') return err(validationError('Only a queued program can be started'));
      const result = await guard(
        'Starting the program failed',
        () =>
          db.transactionAsync(async (tx) => {
            const back = ((await tx.getFirstAsync<{ p: number | null }>('SELECT MAX(queue_position) AS p FROM program_enrolment', []))?.p ?? 0) + 1;
            await tx.runAsync("UPDATE program_enrolment SET status = 'queued', queue_position = ?, updated_at = ? WHERE status IN ('active','paused')", [back, now]);
            await tx.runAsync("UPDATE program_enrolment SET status = 'active', queue_position = 0, settings = ?, updated_at = ? WHERE id = ?", [JSON.stringify(parsed.data), now, id]);
            await tx.runAsync("DELETE FROM daily_class WHERE enrolment_id = ? AND status = 'planned'", [id]);
            const max = await tx.getFirstAsync<{ m: number | null }>('SELECT MAX(class_index) AS m FROM daily_class WHERE enrolment_id = ?', [id]);
            await insertClasses(tx, id, plan, (max?.m ?? -1) + 1, now, newId);
          }),
        ['program_enrolment', 'daily_class'],
      );
      return result.ok ? findEnrolment(id) : result;
    },

    classes: (enrolmentId) =>
      guard('Reading classes failed', async () =>
        (await db.getAllAsync<ClassRow>('SELECT * FROM daily_class WHERE enrolment_id = ? ORDER BY date, class_index', [enrolmentId])).map(toClass),
      ),

    getClass,

    startClass: (id, now) =>
      guard(
        'Starting class failed',
        async () => {
          await db.runAsync(
            "UPDATE daily_class SET status = 'in_progress', started_at = COALESCE(started_at, ?) WHERE id = ? AND status IN ('planned','skipped')",
            [now, id],
          );
        },
        ['daily_class'],
      ),

    saveSectionProgress: (id, sectionsDone) =>
      guard(
        'Saving class progress failed',
        async () => {
          await db.runAsync('UPDATE daily_class SET sections_done = MAX(sections_done, ?) WHERE id = ?', [Math.max(0, Math.floor(sectionsDone)), id]);
        },
        ['daily_class'],
      ),

    async completeClass(input, now) {
      const target = await getClass(input.classId);
      if (!target.ok) return target;
      const cls = target.value;
      return guard(
        'Saving class results failed',
        () =>
          db.transactionAsync(async (tx) => {
            // Idempotent: a finished class is never saved twice (double taps, retries, stale screens).
            const current = await tx.getFirstAsync<{ status: string }>('SELECT status FROM daily_class WHERE id = ?', [cls.id]);
            if (current?.status === 'completed') return;
            await insertAttempts(tx, input.attempts, now, newId);
            await upsertReviewItems(tx, input.reviewItems, now);
            await insertUnits(tx, cls.enrolmentId, input.completedUnitIds, now);
            for (const l of input.lessonResults) {
              await tx.runAsync(
                `INSERT INTO lesson_progress (lesson_id, status, best_score, updated_at) VALUES (?, ?, ?, ?)
                 ON CONFLICT(lesson_id) DO UPDATE SET
                   status = CASE WHEN lesson_progress.status = 'completed' THEN 'completed' ELSE excluded.status END,
                   best_score = MAX(COALESCE(lesson_progress.best_score, 0), excluded.best_score), updated_at = excluded.updated_at`,
                [l.lessonId, l.completed ? 'completed' : 'started', l.score, now],
              );
            }
            if (input.finished) {
              await tx.runAsync("UPDATE daily_class SET status = 'completed', score = ?, completed_at = ? WHERE id = ?", [input.score, now, cls.id]);
            }
          }),
        ['daily_class', 'unit_completion', 'lesson_progress', 'quiz_attempt', 'review_queue'],
      );
    },

    completedUnitIds: (enrolmentId) =>
      guard('Reading progress failed', async () =>
        new Set((await db.getAllAsync<{ unit_id: string }>('SELECT unit_id FROM unit_completion WHERE enrolment_id = ?', [enrolmentId])).map((r) => r.unit_id)),
      ),

    recordReviewSession: (attempt, items, now) =>
      guard(
        'Saving review failed',
        () =>
          db.transactionAsync(async (tx) => {
            await insertAttempts(tx, [attempt], now, newId);
            await upsertReviewItems(tx, items, now);
          }),
        ['quiz_attempt', 'review_queue'],
      ),

    recordAttempts: (attempts, now) =>
      attempts.length === 0
        ? Promise.resolve(ok(undefined))
        : guard('Saving quiz attempts failed', () => db.transactionAsync((tx) => insertAttempts(tx, attempts, now, newId)), ['quiz_attempt']),

    saveReviewItems: (items, now) =>
      guard('Saving review items failed', () => db.transactionAsync((tx) => upsertReviewItems(tx, items, now)), ['review_queue']),

    quizAttempts: () =>
      guard('Reading quiz attempts failed', async () => {
        const rows = await db.getAllAsync<{ id: string; kind: QuizAttempt['kind']; ref_id: string; answers: string; score: number; passed: number; created_at: string }>(
          'SELECT * FROM quiz_attempt ORDER BY created_at DESC, id DESC',
          [],
        );
        return rows.flatMap((r): QuizAttempt[] => {
          const answers = storedAnswersSchema.safeParse(safeJson(r.answers));
          if (!answers.success) return [];
          return [{ id: r.id, kind: r.kind, refId: r.ref_id, answers: answers.data, score: r.score, passed: r.passed === 1, createdAt: r.created_at as UtcIso }];
        });
      }),

    reviewItems: () =>
      guard('Reading review queue failed', async () =>
        (await db.getAllAsync<{ concept_id: string; box: number; due_date: string; lapses: number; early_from: string | null }>('SELECT * FROM review_queue', [])).map((r) => ({
          conceptId: r.concept_id,
          box: r.box,
          dueDate: r.due_date as LocalDate,
          lapses: r.lapses,
          earlyFrom: r.early_from as LocalDate | null,
        })),
      ),

    notes: (classId) =>
      guard('Reading notes failed', async () =>
        (await db.getAllAsync<{ id: string; class_id: string; body: string; created_at: string }>(
          'SELECT * FROM class_note WHERE class_id = ? ORDER BY created_at, id',
          [classId],
        )).map((r) => ({ id: r.id, classId: r.class_id, body: r.body, createdAt: r.created_at as UtcIso })),
      ),

    async addNote(classId, body, now) {
      const text = body.trim();
      if (text.length === 0 || text.length > MAX_NOTE_LENGTH) return err(validationError(`A note must be 1–${MAX_NOTE_LENGTH} characters`));
      const note: ClassNote = { id: newId('note'), classId, body: text, createdAt: now };
      const saved = await guard(
        'Saving note failed',
        () => db.runAsync('INSERT INTO class_note (id, class_id, body, created_at) VALUES (?, ?, ?, ?)', [note.id, classId, text, now]),
        ['class_note'],
      );
      return saved.ok ? ok(note) : saved;
    },
  };
}
