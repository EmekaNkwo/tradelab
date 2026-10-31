import { z } from 'zod';
import type { MetaTraderTaskCompletion } from '../../domain/models/learning';
import { fromUnknown, validationError, type AppError } from '../../shared/errors';
import { err, ok, type Result } from '../../shared/result';
import type { UtcIso } from '../../shared/time';
import type { ChangeBus } from '../db/changeBus';
import type { SqlDatabase } from '../db/client';

export const MAX_TASK_NOTE_LENGTH = 2000;

export type MetaTraderTaskCompletionInput = Omit<MetaTraderTaskCompletion, 'id' | 'completedAt'>;

/** Guided MetaTrader task completions (spec §14.3). */
export interface MtTaskRepository {
  /** `requiresDemo`: the task places orders, so it cannot be recorded without the demo-account confirmation. */
  record(input: MetaTraderTaskCompletionInput, now: UtcIso, rules: { readonly requiresDemo: boolean }): Promise<Result<MetaTraderTaskCompletion, AppError>>;
  /** Newest first; all tasks when `taskId` is omitted. */
  completions(taskId?: string): Promise<Result<readonly MetaTraderTaskCompletion[], AppError>>;
  /** The unfinished run of a task, if any; an unreadable draft is treated as none. */
  draft(taskId: string): Promise<Result<StoredTaskDraft | null, AppError>>;
  saveDraft(taskId: string, draft: StoredTaskDraft, now: UtcIso): Promise<Result<void, AppError>>;
  clearDraft(taskId: string): Promise<Result<void, AppError>>;
}

export const storedTaskDraftSchema = z
  .object({
    platform: z.enum(['mt4', 'mt5']),
    demoConfirmed: z.boolean(),
    stepsDone: z.array(z.number().int().min(0)),
    answers: z.record(z.string(), z.array(z.string())),
    note: z.string().max(MAX_TASK_NOTE_LENGTH),
  })
  .strict() satisfies z.ZodType<StoredTaskDraft>;

export interface StoredTaskDraft {
  readonly platform: 'mt4' | 'mt5';
  readonly demoConfirmed: boolean;
  readonly stepsDone: readonly number[];
  readonly answers: Readonly<Record<string, readonly string[]>>;
  readonly note: string;
}

const answersSchema = z.record(z.string(), z.array(z.string()));

const inputSchema = z
  .object({
    taskId: z.string().min(1),
    platform: z.enum(['mt4', 'mt5']),
    demoConfirmedAt: z.string().nullable(),
    answers: answersSchema,
    score: z.number().min(0).max(1),
    note: z.string().trim().max(MAX_TASK_NOTE_LENGTH).nullable(),
  })
  .strict();

interface Row {
  readonly id: string;
  readonly task_id: string;
  readonly platform: 'mt4' | 'mt5';
  readonly demo_confirmed_at: string | null;
  readonly answers: string;
  readonly score: number;
  readonly note: string | null;
  readonly completed_at: string;
}

function fromRow(row: Row): MetaTraderTaskCompletion {
  return {
    id: row.id,
    taskId: row.task_id,
    platform: row.platform,
    demoConfirmedAt: row.demo_confirmed_at as UtcIso | null,
    answers: answersSchema.parse(JSON.parse(row.answers)),
    score: row.score,
    note: row.note,
    completedAt: row.completed_at as UtcIso,
  };
}

export function createMtTaskRepository(db: SqlDatabase, bus: ChangeBus, newId: (prefix: string) => string): MtTaskRepository {
  return {
    async record(input, now, rules) {
      const parsed = inputSchema.safeParse(input);
      if (!parsed.success) {
        return err(validationError('Invalid task completion', { issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) }));
      }
      if (rules.requiresDemo && parsed.data.demoConfirmedAt === null) {
        return err(validationError('This task needs the demo-account confirmation', { issues: ['demoConfirmedAt'] }));
      }
      const p = parsed.data;
      const note = p.note === null || p.note === '' ? null : p.note;
      const completion: MetaTraderTaskCompletion = { ...p, note, demoConfirmedAt: p.demoConfirmedAt as UtcIso | null, id: newId('mtc'), completedAt: now };
      try {
        await db.runAsync(
          'INSERT INTO mt_task_completion (id, task_id, platform, demo_confirmed_at, answers, score, note, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [completion.id, completion.taskId, completion.platform, completion.demoConfirmedAt, JSON.stringify(completion.answers), completion.score, note, now],
        );
      } catch (cause) {
        return err(fromUnknown('StorageError', 'Saving the task failed', cause));
      }
      bus.emit(['mt_task_completion']);
      return ok(completion);
    },

    async completions(taskId) {
      try {
        const rows = taskId
          ? await db.getAllAsync<Row>('SELECT * FROM mt_task_completion WHERE task_id = ? ORDER BY completed_at DESC', [taskId])
          : await db.getAllAsync<Row>('SELECT * FROM mt_task_completion ORDER BY completed_at DESC', []);
        return ok(rows.map(fromRow));
      } catch (cause) {
        return err(fromUnknown('StorageError', 'Reading tasks failed', cause));
      }
    },

    async draft(taskId) {
      try {
        const row = await db.getFirstAsync<{ draft: string }>('SELECT draft FROM mt_task_draft WHERE task_id = ?', [taskId]);
        if (!row) return ok(null);
        const parsed = storedTaskDraftSchema.safeParse(JSON.parse(row.draft));
        return ok(parsed.success ? parsed.data : null);
      } catch (cause) {
        if (cause instanceof SyntaxError) return ok(null);
        return err(fromUnknown('StorageError', 'Reading the task draft failed', cause));
      }
    },

    async saveDraft(taskId, draft, now) {
      const parsed = storedTaskDraftSchema.safeParse(draft);
      if (!parsed.success) return err(validationError('Invalid task draft'));
      try {
        await db.runAsync(
          'INSERT INTO mt_task_draft (task_id, draft, updated_at) VALUES (?, ?, ?) ON CONFLICT(task_id) DO UPDATE SET draft = excluded.draft, updated_at = excluded.updated_at',
          [taskId, JSON.stringify(parsed.data), now],
        );
        return ok(undefined);
      } catch (cause) {
        return err(fromUnknown('StorageError', 'Saving the task draft failed', cause));
      }
    },

    async clearDraft(taskId) {
      try {
        await db.runAsync('DELETE FROM mt_task_draft WHERE task_id = ?', [taskId]);
        return ok(undefined);
      } catch (cause) {
        return err(fromUnknown('StorageError', 'Clearing the task draft failed', cause));
      }
    },
  };
}
