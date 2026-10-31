import { z } from 'zod';
import { definitionIssues, type BacktestResult, type StrategyDefinition } from '../../domain/backtest';
import { dataQualityError, fromUnknown, validationError, type AppError } from '../../shared/errors';
import { logger } from '../../shared/logger';
import { err, ok, type Result } from '../../shared/result';
import type { UtcIso } from '../../shared/time';
import type { ChangeBus } from '../db/changeBus';
import type { SqlDatabase } from '../db/client';
import { parseJson, runInputsSchema, storedResultSchema, strategyDefinitionSchema, type RunInputs, type StoredResult } from './backtestSchemas';

/**
 * The learner's own strategies, backtest runs and playbook (spec §16.2–16.5).
 * A strategy is a list of numbered versions; saving always adds a version and
 * never changes an old one. Rows that fail validation are skipped and logged.
 */

export interface StrategyVersion {
  readonly strategyId: string;
  readonly version: number;
  readonly name: string;
  readonly definition: StrategyDefinition;
  /** The Strategy Library page it was copied from, if any. */
  readonly templateId: string | null;
  readonly note: string;
  readonly createdAt: UtcIso;
}

export interface SaveVersionInput {
  /** null starts a new strategy. */
  readonly strategyId: string | null;
  readonly name: string;
  readonly definition: StrategyDefinition;
  readonly templateId: string | null;
  readonly note: string;
}

export interface BacktestRun {
  readonly id: string;
  readonly strategyId: string;
  readonly version: number;
  readonly inputs: RunInputs;
  readonly inputHash: string;
  readonly result: StoredResult;
  readonly createdAt: UtcIso;
}

export interface PlaybookEntry {
  readonly strategyId: string;
  readonly hypothesis: string;
  readonly conditions: string;
  readonly invalidation: string;
  readonly limitations: string;
  readonly notes: string;
  /** The run the entry's results come from. */
  readonly runId: string | null;
  readonly updatedAt: UtcIso;
}

export type PlaybookInput = Omit<PlaybookEntry, 'updatedAt'>;

export interface BacktestRepository {
  /** The latest version of every strategy, newest first. */
  strategies(): Promise<Result<readonly StrategyVersion[], AppError>>;
  /** Every version of one strategy, newest first. */
  versions(strategyId: string): Promise<Result<readonly StrategyVersion[], AppError>>;
  /** Adds a version. Saving a definition, name and note identical to the latest returns the latest unchanged. */
  saveVersion(input: SaveVersionInput, now: UtcIso): Promise<Result<StrategyVersion, AppError>>;
  saveRun(strategyId: string, version: number, inputs: RunInputs, result: BacktestResult, now: UtcIso): Promise<Result<BacktestRun, AppError>>;
  /** Runs newest first; all strategies when `strategyId` is null. */
  runs(strategyId: string | null): Promise<Result<readonly BacktestRun[], AppError>>;
  run(id: string): Promise<Result<BacktestRun | null, AppError>>;
  playbook(strategyId: string): Promise<Result<PlaybookEntry | null, AppError>>;
  savePlaybook(entry: PlaybookInput, now: UtcIso): Promise<Result<PlaybookEntry, AppError>>;
}

export const MAX_STRATEGY_NAME = 60;
export const MAX_PLAYBOOK_TEXT = 4000;
export const MAX_VERSION_NOTE = 500;

const TABLES = ['strategy_version', 'backtest_run', 'playbook_entry'];

interface VersionRow {
  readonly strategy_id: string;
  readonly version: number;
  readonly name: string;
  readonly definition: string;
  readonly template_id: string | null;
  readonly note: string;
  readonly created_at: string;
}

interface RunRow {
  readonly id: string;
  readonly strategy_id: string;
  readonly version: number;
  readonly inputs: string;
  readonly input_hash: string;
  readonly result: string;
  readonly created_at: string;
}

interface PlaybookRow {
  readonly strategy_id: string;
  readonly hypothesis: string;
  readonly conditions: string;
  readonly invalidation: string;
  readonly limitations: string;
  readonly notes: string;
  readonly run_id: string | null;
  readonly updated_at: string;
}

const id = z.string().min(1).max(80);
const text = z.string().max(MAX_PLAYBOOK_TEXT);

export function versionFromRow(r: VersionRow): StrategyVersion | null {
  if (typeof r.strategy_id !== 'string' || r.strategy_id.length === 0 || typeof r.definition !== 'string') return null;
  const definition = parseJson(strategyDefinitionSchema, r.definition);
  if (!definition || typeof r.name !== 'string' || !Number.isInteger(r.version)) return null;
  return { strategyId: r.strategy_id, version: r.version, name: r.name, definition, templateId: r.template_id ?? null, note: r.note ?? '', createdAt: r.created_at as UtcIso };
}

export function runFromRow(r: RunRow): BacktestRun | null {
  const ids = [r.id, r.strategy_id, r.input_hash];
  if (ids.some((v) => typeof v !== 'string' || v.length === 0) || !Number.isInteger(r.version) || typeof r.inputs !== 'string' || typeof r.result !== 'string') return null;
  const inputs = parseJson(runInputsSchema, r.inputs);
  const result = parseJson(storedResultSchema, r.result);
  if (!inputs || !result) return null;
  return { id: r.id, strategyId: r.strategy_id, version: r.version, inputs, inputHash: r.input_hash, result, createdAt: r.created_at as UtcIso };
}

const playbookFromRow = (r: PlaybookRow): PlaybookEntry => ({
  strategyId: r.strategy_id,
  hypothesis: r.hypothesis,
  conditions: r.conditions,
  invalidation: r.invalidation,
  limitations: r.limitations,
  notes: r.notes,
  runId: r.run_id,
  updatedAt: r.updated_at as UtcIso,
});

/** The stored part of a result: everything except the trades, which a rerun recreates. */
export function storedResult(result: BacktestResult): StoredResult {
  const { trades, ...rest } = result;
  return { ...rest, tradeCount: trades.length } as unknown as StoredResult;
}

function keep<R, T>(rows: readonly R[], parse: (r: R) => T | null, what: string): T[] {
  const parsed = rows.map(parse);
  const skipped = parsed.filter((p) => p === null).length;
  if (skipped > 0) logger.warn(`Unreadable ${what} skipped`, { count: skipped });
  return parsed.filter((p): p is T => p !== null);
}

export function createBacktestRepository(db: SqlDatabase, bus: ChangeBus, newId: (prefix: string) => string): BacktestRepository {
  const read = async <T>(run: () => Promise<T>, failure: string): Promise<Result<T, AppError>> => {
    try {
      return ok(await run());
    } catch (cause) {
      return err(fromUnknown('StorageError', failure, cause));
    }
  };

  const versions = (strategyId: string) =>
    read(
      async () => keep(await db.getAllAsync<VersionRow>('SELECT * FROM strategy_version WHERE strategy_id = ? ORDER BY version DESC', [strategyId]), versionFromRow, 'strategy versions'),
      'Reading your strategy failed',
    );

  return {
    strategies: () =>
      read(
        async () =>
          keep(
            await db.getAllAsync<VersionRow>(
              `SELECT v.* FROM strategy_version v
               JOIN (SELECT strategy_id, MAX(version) AS top FROM strategy_version GROUP BY strategy_id) t
                 ON t.strategy_id = v.strategy_id AND t.top = v.version
               ORDER BY v.created_at DESC, v.strategy_id`,
              [],
            ),
            versionFromRow,
            'strategy versions',
          ),
        'Reading your strategies failed',
      ),

    versions,

    async saveVersion(input, now) {
      const name = input.name.trim();
      const note = input.note.trim();
      if (name.length < 1 || name.length > MAX_STRATEGY_NAME) return err(validationError(`Give the strategy a name of 1 to ${MAX_STRATEGY_NAME} characters`, { issues: ['name'] }));
      if (note.length > MAX_VERSION_NOTE) return err(validationError(`Keep the note under ${MAX_VERSION_NOTE} characters`, { issues: ['note'] }));
      const issues = definitionIssues(input.definition);
      if (issues.length > 0) return err(validationError(issues[0]?.message ?? 'The strategy is not complete', { issues: issues.map((i) => i.field) }));
      const parsed = strategyDefinitionSchema.safeParse(input.definition);
      if (!parsed.success) return err(validationError('The strategy is not valid'));
      if (input.strategyId !== null && !id.safeParse(input.strategyId).success) return err(validationError('Unknown strategy'));
      const json = JSON.stringify(parsed.data);
      try {
        const outcome: { result?: StrategyVersion; inserted?: boolean; unreadable?: boolean } = {};
        await db.transactionAsync(async (tx) => {
          const strategyId = input.strategyId ?? newId('stg');
          const top = (await tx.getAllAsync<VersionRow>('SELECT * FROM strategy_version WHERE strategy_id = ? ORDER BY version DESC LIMIT 1', [strategyId]))[0];
          if (input.strategyId !== null && !top) return;
          if (top && versionFromRow(top) === null) {
            outcome.unreadable = true;
            return;
          }
          if (top && top.definition === json && top.name === name && top.note === note) {
            outcome.result = versionFromRow(top) ?? undefined;
            return;
          }
          const version = (top?.version ?? 0) + 1;
          const templateId = top ? top.template_id : input.templateId;
          await tx.runAsync(
            'INSERT INTO strategy_version (strategy_id, version, name, definition, template_id, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [strategyId, version, name, json, templateId, note, now],
          );
          outcome.result = { strategyId, version, name, definition: parsed.data, templateId, note, createdAt: now };
          outcome.inserted = true;
        });
        if (outcome.unreadable) return err(dataQualityError('The latest saved version of this strategy could not be read, so a new version was not added'));
        if (!outcome.result) return err(validationError('That strategy no longer exists'));
        if (outcome.inserted) bus.emit(TABLES);
        return ok(outcome.result);
      } catch (cause) {
        return err(fromUnknown('StorageError', 'Saving your strategy failed', cause));
      }
    },

    async saveRun(strategyId, version, inputs, result, now) {
      const parsedInputs = runInputsSchema.safeParse(inputs);
      const stored = storedResultSchema.safeParse(storedResult(result));
      if (!parsedInputs.success || !stored.success) return err(validationError('The run could not be saved: its data is not valid'));
      const runId = newId('run');
      try {
        await db.runAsync('INSERT INTO backtest_run (id, strategy_id, version, inputs, input_hash, result, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [
          runId,
          strategyId,
          version,
          JSON.stringify(parsedInputs.data),
          result.inputHash,
          JSON.stringify(stored.data),
          now,
        ]);
      } catch (cause) {
        return err(fromUnknown('StorageError', 'Saving the backtest failed', cause));
      }
      bus.emit(TABLES);
      return ok({ id: runId, strategyId, version, inputs: parsedInputs.data, inputHash: result.inputHash, result: stored.data, createdAt: now });
    },

    runs: (strategyId) =>
      read(
        async () =>
          keep(
            strategyId === null
              ? await db.getAllAsync<RunRow>('SELECT * FROM backtest_run ORDER BY created_at DESC, id DESC', [])
              : await db.getAllAsync<RunRow>('SELECT * FROM backtest_run WHERE strategy_id = ? ORDER BY created_at DESC, id DESC', [strategyId]),
            runFromRow,
            'backtest runs',
          ),
        'Reading your backtests failed',
      ),

    run: (runId) =>
      read(async () => {
        const row = await db.getFirstAsync<RunRow>('SELECT * FROM backtest_run WHERE id = ?', [runId]);
        return row ? runFromRow(row) : null;
      }, 'Reading the backtest failed'),

    playbook: (strategyId) =>
      read(async () => {
        const row = await db.getFirstAsync<PlaybookRow>('SELECT * FROM playbook_entry WHERE strategy_id = ?', [strategyId]);
        return row ? playbookFromRow(row) : null;
      }, 'Reading your playbook failed'),

    async savePlaybook(entry, now) {
      const fields = [entry.hypothesis, entry.conditions, entry.invalidation, entry.limitations, entry.notes].map((t) => t.trim());
      if (!fields.every((f) => text.safeParse(f).success)) return err(validationError(`Keep each playbook section under ${MAX_PLAYBOOK_TEXT} characters`));
      if (fields[0] === '') return err(validationError('Write the hypothesis: what you expect the rules to capture, and why', { issues: ['hypothesis'] }));
      const [hypothesis, conditions, invalidation, limitations, notes] = fields as [string, string, string, string, string];
      try {
        const exists = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM strategy_version WHERE strategy_id = ?', [entry.strategyId]);
        if (!exists || exists.n === 0) return err(validationError('That strategy no longer exists'));
        if (entry.runId !== null) {
          const run = await db.getFirstAsync<{ strategy_id: string }>('SELECT strategy_id FROM backtest_run WHERE id = ?', [entry.runId]);
          if (!run || run.strategy_id !== entry.strategyId) return err(validationError('Link a run of this strategy'));
        }
        await db.runAsync(
          `INSERT INTO playbook_entry (strategy_id, hypothesis, conditions, invalidation, limitations, notes, run_id, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (strategy_id) DO UPDATE SET hypothesis = excluded.hypothesis, conditions = excluded.conditions,
             invalidation = excluded.invalidation, limitations = excluded.limitations, notes = excluded.notes,
             run_id = excluded.run_id, updated_at = excluded.updated_at`,
          [entry.strategyId, hypothesis, conditions, invalidation, limitations, notes, entry.runId, now],
        );
      } catch (cause) {
        return err(fromUnknown('StorageError', 'Saving your playbook failed', cause));
      }
      bus.emit(TABLES);
      return ok({ strategyId: entry.strategyId, hypothesis, conditions, invalidation, limitations, notes, runId: entry.runId, updatedAt: now });
    },
  };
}
