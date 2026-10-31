import { z } from 'zod';
import { JOURNAL_SOURCES, SIMULATED_SOURCES, type JournalEntry, type JournalReview, type JournalSource, type PsychAttempt } from '../../domain/models/journal';
import { isDecimalString } from '../../shared/decimal';
import { fromUnknown, notFound, validationError, type AppError } from '../../shared/errors';
import { logger } from '../../shared/logger';
import { err, ok, type Result } from '../../shared/result';
import { MARKET_KINDS, type MarketKind } from '../../shared/types';
import type { UtcIso } from '../../shared/time';
import type { ChangeBus } from '../db/changeBus';
import type { SqlDatabase } from '../db/client';

export type JournalEntryInput = Omit<JournalEntry, 'id' | 'review' | 'processScore' | 'createdAt' | 'updatedAt'> & {
  readonly processScore: number | null;
};

/** Fields the learner can edit after the trade. */
export type JournalNotesPatch = Partial<
  Pick<JournalEntry, 'strategy' | 'conditions' | 'entryRationale' | 'exitRationale' | 'emotion' | 'noteBefore' | 'noteAfter' | 'screenshotUri'>
>;

export interface AddManyResult {
  readonly added: number;
  /** Already in the journal (same source and external id). */
  readonly duplicates: number;
}

/** The trading journal and Psychology Lab answers (spec §21, §22). */
export interface JournalRepository {
  /** Newest first, at most `limit`; optionally one source. Unreadable rows are skipped and logged. */
  list(options?: { readonly source?: JournalSource; readonly limit?: number }): Promise<Result<readonly JournalEntry[], AppError>>;
  get(id: string): Promise<Result<JournalEntry, AppError>>;
  add(input: JournalEntryInput, now: UtcIso): Promise<Result<JournalEntry, AppError>>;
  /** Adds entries in one transaction, skipping any whose (source, externalId) is already stored. */
  addMany(inputs: readonly JournalEntryInput[], now: UtcIso): Promise<Result<AddManyResult, AppError>>;
  /** External ids already stored for a source, to mark duplicates in an import preview. */
  externalIds(source: JournalSource): Promise<Result<ReadonlySet<string>, AppError>>;
  saveReview(id: string, review: JournalReview, processScore: number | null, now: UtcIso): Promise<Result<void, AppError>>;
  /** `processScore`, when given, is stored too, so the list and summaries match the entry screen. */
  updateNotes(id: string, patch: JournalNotesPatch, now: UtcIso, processScore?: number | null): Promise<Result<void, AppError>>;
  remove(id: string): Promise<Result<void, AppError>>;
  recordPsych(input: Omit<PsychAttempt, 'id' | 'answeredAt'>, now: UtcIso): Promise<Result<PsychAttempt, AppError>>;
  psychAttempts(): Promise<Result<readonly PsychAttempt[], AppError>>;
}

export const DEFAULT_JOURNAL_LIMIT = 200;
/** Newest first by when the learner did the trade; simulated trades use when they were logged (see `activityDate`). */
// Built from SIMULATED_SOURCES (fixed identifiers, not user input) so it cannot drift from `activityDate`.
// closed_at breaks ties, since trades journalled together share a created_at.
const NEWEST_FIRST = `ORDER BY CASE WHEN source IN (${SIMULATED_SOURCES.map((s) => `'${s}'`).join(', ')}) THEN created_at ELSE COALESCE(closed_at, created_at) END DESC, closed_at DESC, id DESC`;
export const MAX_JOURNAL_TEXT = 4000;

const decimalText = z.string().refine(isDecimalString, 'must be a decimal');
const text = z.string().trim().max(MAX_JOURNAL_TEXT);
const optionalText = text.nullable().transform((v) => (v === null || v === '' ? null : v));
const rating = z.number().int().min(1).max(5);

export const emotionSchema = z
  .object({ confidence: rating, stress: rating, patience: rating, feeling: z.string().trim().max(60).nullable() })
  .strict();

export const reviewSchema = z
  .object({
    thesis: text,
    planVsActual: text,
    rulesFollowed: z.boolean(),
    resultNote: text,
    lesson: text.min(1, 'Write one lesson'),
    nextGoal: text,
    reviewedAt: z.string().min(1),
  })
  .strict();

export const violationsSchema = z.array(z.string().min(1).max(40)).max(20);

const inputSchema = z
  .object({
    source: z.enum(JOURNAL_SOURCES),
    sourceRef: z.string().max(80).nullable(),
    externalId: z.string().max(80).nullable(),
    market: z.enum(MARKET_KINDS as [MarketKind, ...MarketKind[]]).nullable(),
    instrument: z.string().trim().min(1).max(60),
    direction: z.enum(['buy', 'sell']),
    strategy: optionalText,
    entry: decimalText,
    stop: decimalText.nullable(),
    target: decimalText.nullable(),
    size: decimalText,
    sizeUnit: z.string().trim().min(1).max(20),
    exit: decimalText.nullable(),
    pnlMoney: decimalText.nullable(),
    pnlPips: decimalText.nullable(),
    pnlR: decimalText.nullable(),
    plannedRisk: decimalText.nullable(),
    costs: decimalText.nullable(),
    equityAtEntry: decimalText.nullable(),
    openedAt: z.string().max(40).nullable(),
    closedAt: z.string().max(40).nullable(),
    conditions: optionalText,
    entryRationale: optionalText,
    exitRationale: optionalText,
    emotion: emotionSchema.nullable(),
    ruleViolations: violationsSchema,
    noteBefore: optionalText,
    noteAfter: optionalText,
    screenshotUri: z.string().max(500).nullable(),
    processScore: z.number().min(0).max(1).nullable(),
  })
  .strict();

const notesSchema = inputSchema.pick({
  strategy: true,
  conditions: true,
  entryRationale: true,
  exitRationale: true,
  emotion: true,
  noteBefore: true,
  noteAfter: true,
  screenshotUri: true,
}).partial();

const COLUMNS: readonly [keyof JournalEntry, string][] = [
  ['id', 'id'],
  ['source', 'source'],
  ['sourceRef', 'source_ref'],
  ['externalId', 'external_id'],
  ['market', 'market'],
  ['instrument', 'instrument'],
  ['direction', 'direction'],
  ['strategy', 'strategy'],
  ['entry', 'entry'],
  ['stop', 'stop'],
  ['target', 'target'],
  ['size', 'size'],
  ['sizeUnit', 'size_unit'],
  ['exit', 'exit'],
  ['pnlMoney', 'pnl_money'],
  ['pnlPips', 'pnl_pips'],
  ['pnlR', 'pnl_r'],
  ['plannedRisk', 'planned_risk'],
  ['costs', 'costs'],
  ['equityAtEntry', 'equity_at_entry'],
  ['openedAt', 'opened_at'],
  ['closedAt', 'closed_at'],
  ['conditions', 'conditions'],
  ['entryRationale', 'entry_rationale'],
  ['exitRationale', 'exit_rationale'],
  ['emotion', 'emotion'],
  ['ruleViolations', 'rule_violations'],
  ['noteBefore', 'note_before'],
  ['noteAfter', 'note_after'],
  ['screenshotUri', 'screenshot_uri'],
  ['review', 'review'],
  ['processScore', 'process_score'],
  ['createdAt', 'created_at'],
  ['updatedAt', 'updated_at'],
];
const JSON_FIELDS = new Set<keyof JournalEntry>(['emotion', 'ruleViolations', 'review']);
const INSERT_SQL = `INSERT INTO journal_entry (${COLUMNS.map(([, c]) => c).join(', ')}) VALUES (${COLUMNS.map(() => '?').join(', ')})`;

type Row = Readonly<Record<string, string | number | null>>;

function toArgs(e: JournalEntry): (string | number | null)[] {
  return COLUMNS.map(([field]) => {
    const v = e[field];
    if (JSON_FIELDS.has(field)) return v === null ? null : JSON.stringify(v);
    return v as string | number | null;
  });
}

const parseJson = <T>(value: string | number | null, schema: z.ZodType<T>): T | null | undefined => {
  if (value === null) return null;
  try {
    const parsed = schema.safeParse(JSON.parse(String(value)));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
};

/** Reads a row back through the same validation; a bad row returns null. */
export function journalFromRow(r: Row): JournalEntry | null {
  const emotion = parseJson(r.emotion ?? null, emotionSchema);
  const violations = parseJson(r.rule_violations ?? null, violationsSchema);
  const review = parseJson(r.review ?? null, reviewSchema);
  if (emotion === undefined || violations === undefined || violations === null || review === undefined) return null;
  const fields = Object.fromEntries(COLUMNS.filter(([f]) => !JSON_FIELDS.has(f)).map(([f, c]) => [f, r[c] ?? null]));
  const { id, createdAt, updatedAt, ...rest } = fields as Record<string, unknown>;
  const parsed = inputSchema.safeParse({ ...rest, emotion, ruleViolations: violations });
  if (!parsed.success || typeof id !== 'string') return null;
  return { ...parsed.data, id, review: review as JournalReview | null, createdAt: createdAt as UtcIso, updatedAt: updatedAt as UtcIso };
}

const issuesOf = (e: z.ZodError) => ({ issues: e.issues.map((i) => `${i.path.join('.')}: ${i.message}`) });

export function createJournalRepository(db: SqlDatabase, bus: ChangeBus, newId: (prefix: string) => string): JournalRepository {
  const build = (input: JournalEntryInput, now: UtcIso): Result<JournalEntry, AppError> => {
    const parsed = inputSchema.safeParse(input);
    if (!parsed.success) return err(validationError('Invalid journal entry', issuesOf(parsed.error)));
    return ok({ ...parsed.data, id: newId('jrn'), review: null, createdAt: now, updatedAt: now });
  };
  const change = async (sql: string, args: (string | number | null)[], what: string, table = 'journal_entry'): Promise<Result<void, AppError>> => {
    try {
      const r = await db.runAsync(sql, args);
      if (r.changes === 0) return err(notFound('That journal entry no longer exists'));
    } catch (cause) {
      return err(fromUnknown('StorageError', what, cause));
    }
    bus.emit([table]);
    return ok(undefined);
  };

  return {
    async list(options = {}) {
      const limit = Math.max(1, Math.floor(options.limit ?? DEFAULT_JOURNAL_LIMIT));
      try {
        const rows = options.source
          ? await db.getAllAsync<Row>(`SELECT * FROM journal_entry WHERE source = ? ${NEWEST_FIRST} LIMIT ?`, [options.source, limit])
          : await db.getAllAsync<Row>(`SELECT * FROM journal_entry ${NEWEST_FIRST} LIMIT ?`, [limit]);
        const entries = rows.map(journalFromRow);
        const skipped = entries.filter((e) => e === null).length;
        if (skipped > 0) logger.warn('Unreadable journal entries skipped', { count: skipped });
        return ok(entries.filter((e): e is JournalEntry => e !== null));
      } catch (cause) {
        return err(fromUnknown('StorageError', 'Reading the journal failed', cause));
      }
    },

    async get(id) {
      try {
        const row = await db.getFirstAsync<Row>('SELECT * FROM journal_entry WHERE id = ?', [id]);
        if (!row) return err(notFound('That journal entry no longer exists'));
        const entry = journalFromRow(row);
        return entry ? ok(entry) : err(validationError('This journal entry could not be read'));
      } catch (cause) {
        return err(fromUnknown('StorageError', 'Reading the journal entry failed', cause));
      }
    },

    async add(input, now) {
      const built = build(input, now);
      if (!built.ok) return built;
      try {
        await db.runAsync(INSERT_SQL, toArgs(built.value));
      } catch (cause) {
        return err(fromUnknown('StorageError', 'Saving the journal entry failed', cause));
      }
      bus.emit(['journal_entry']);
      return built;
    },

    async addMany(inputs, now) {
      const built: JournalEntry[] = [];
      for (const input of inputs) {
        const r = build(input, now);
        if (!r.ok) return r;
        built.push(r.value);
      }
      let added = 0;
      try {
        await db.transactionAsync(async (tx) => {
          for (const e of built) {
            // Only the (source, external_id) clash counts as a duplicate; a CHECK or NOT NULL failure still throws.
            const r = await tx.runAsync(`${INSERT_SQL} ON CONFLICT(source, external_id) DO NOTHING`, toArgs(e));
            added += r.changes;
          }
        });
      } catch (cause) {
        return err(fromUnknown('StorageError', 'Saving the imported trades failed', cause));
      }
      if (added > 0) bus.emit(['journal_entry']);
      return ok({ added, duplicates: built.length - added });
    },

    async externalIds(source) {
      try {
        const rows = await db.getAllAsync<{ external_id: string }>('SELECT external_id FROM journal_entry WHERE source = ? AND external_id IS NOT NULL', [source]);
        return ok(new Set(rows.map((r) => r.external_id)));
      } catch (cause) {
        return err(fromUnknown('StorageError', 'Reading the journal failed', cause));
      }
    },

    async saveReview(id, review, processScore, now) {
      const parsed = reviewSchema.safeParse(review);
      if (!parsed.success) return err(validationError('Invalid review', issuesOf(parsed.error)));
      if (processScore !== null && !(processScore >= 0 && processScore <= 1)) return err(validationError('Invalid process score'));
      return change('UPDATE journal_entry SET review = ?, process_score = ?, updated_at = ? WHERE id = ?', [JSON.stringify(parsed.data), processScore, now, id], 'Saving the review failed');
    },

    async updateNotes(id, patch, now, processScore) {
      const parsed = notesSchema.strict().safeParse(patch);
      if (!parsed.success) return err(validationError('Invalid notes', issuesOf(parsed.error)));
      if (processScore != null && !(processScore >= 0 && processScore <= 1)) return err(validationError('Invalid process score'));
      const fields = Object.entries(parsed.data) as [keyof JournalEntry, unknown][];
      if (fields.length === 0 && processScore === undefined) return ok(undefined);
      const columns = fields.map(([f]) => `${(COLUMNS.find(([k]) => k === f) as [string, string])[1]} = ?`);
      const values: (string | number | null)[] = fields.map(([f, v]) => (JSON_FIELDS.has(f) ? (v === null ? null : JSON.stringify(v)) : (v as string | null)));
      if (processScore !== undefined) {
        columns.push('process_score = ?');
        values.push(processScore);
      }
      return change(`UPDATE journal_entry SET ${columns.join(', ')}, updated_at = ? WHERE id = ?`, [...values, now, id], 'Saving the notes failed');
    },

    remove: (id) => change('DELETE FROM journal_entry WHERE id = ?', [id], 'Deleting the journal entry failed'),

    async recordPsych(input, now) {
      const parsed = z
        .object({ scenarioId: z.string().min(1), responseId: z.string().min(1), quality: z.enum(['helpful', 'mixed', 'harmful']) })
        .strict()
        .safeParse(input);
      if (!parsed.success) return err(validationError('Invalid answer', issuesOf(parsed.error)));
      const attempt: PsychAttempt = { ...parsed.data, id: newId('psy'), answeredAt: now };
      try {
        await db.runAsync('INSERT INTO psych_attempt (id, scenario_id, response_id, quality, answered_at) VALUES (?, ?, ?, ?, ?)', [
          attempt.id,
          attempt.scenarioId,
          attempt.responseId,
          attempt.quality,
          now,
        ]);
      } catch (cause) {
        return err(fromUnknown('StorageError', 'Saving the answer failed', cause));
      }
      bus.emit(['psych_attempt']);
      return ok(attempt);
    },

    async psychAttempts() {
      try {
        const rows = await db.getAllAsync<{ id: string; scenario_id: string; response_id: string; quality: PsychAttempt['quality']; answered_at: string }>(
          'SELECT * FROM psych_attempt ORDER BY answered_at DESC, id DESC',
          [],
        );
        return ok(rows.map((r) => ({ id: r.id, scenarioId: r.scenario_id, responseId: r.response_id, quality: r.quality, answeredAt: r.answered_at as UtcIso })));
      } catch (cause) {
        return err(fromUnknown('StorageError', 'Reading answers failed', cause));
      }
    },
  };
}
