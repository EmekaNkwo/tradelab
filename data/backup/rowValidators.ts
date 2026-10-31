import { z } from 'zod';
import { isLocalDate } from '../../domain/learning/dates';
import { dataQualityError, type AppError } from '../../shared/errors';
import { scheduleSettingsSchema } from '../repositories/learningRepository';
import { STORED_TIMEFRAMES as REPLAY_TIMEFRAMES, storedTradesSchema } from '../repositories/practiceRepository';
import { isDecimalString } from '../../shared/decimal';
import { parseProfileRow, type ProfileRow } from '../repositories/profileRepository';
import { journalFromRow } from '../repositories/journalRepository';
import { parsePaperState } from '../repositories/paperRepository';
import { parsePlan } from '../repositories/planRepository';
import { MAX_PLAYBOOK_TEXT, runFromRow, versionFromRow } from '../repositories/backtestRepository';
import { decodeCandles, parseQuality } from '../repositories/marketDataRepository';
import { sha256 } from '../../shared/sha256';
import type { BackupFile, BackupRow } from './format';

/**
 * Some columns hold JSON or formatted text that SQL constraints cannot check.
 * A backup with a bad value there would restore cleanly and then break every
 * screen that reads it, so those cells are validated before anything is written.
 */
const jsonCell =
  (schema: z.ZodType) =>
  (value: unknown): boolean => {
    if (typeof value !== 'string') return false;
    try {
      return schema.safeParse(JSON.parse(value)).success;
    } catch {
      return false;
    }
  };

const decimalCell = (value: unknown) => typeof value === 'string' && isDecimalString(value);

const localDateCell = (value: unknown) => typeof value === 'string' && isLocalDate(value);

const ROW_CHECKS: Readonly<Record<string, (row: BackupRow) => boolean>> = {
  user_profile: (row) => parseProfileRow(row as unknown as ProfileRow).ok,
  program_enrolment: (row) => jsonCell(scheduleSettingsSchema)(row.settings),
  daily_class: (row) => jsonCell(z.array(z.string()))(row.unit_ids) && localDateCell(row.date),
  quiz_attempt: (row) => jsonCell(z.record(z.string(), z.array(z.string())))(row.answers),
  review_queue: (row) => localDateCell(row.due_date) && (row.early_from === undefined || row.early_from === null || localDateCell(row.early_from)),
  award_unlock: (row) =>
    typeof row.kind === 'string' &&
    ['challenge', 'badge', 'milestone'].includes(row.kind) &&
    typeof row.award_id === 'string' &&
    row.award_id.length > 0 &&
    row.award_id.length <= 100 &&
    typeof row.unlocked_at === 'string' &&
    !Number.isNaN(Date.parse(row.unlocked_at)),
  mission: (row) => localDateCell(row.date),
  mt_task_completion: (row) => jsonCell(z.record(z.string(), z.array(z.string())))(row.answers),
  replay_attempt: (row) =>
    jsonCell(storedTradesSchema)(row.trades) &&
    typeof row.timeframe === 'string' &&
    (REPLAY_TIMEFRAMES as readonly string[]).includes(row.timeframe) &&
    decimalCell(row.starting_balance) &&
    decimalCell(row.final_balance),
  drill_attempt: (row) => typeof row.kind === 'string' && row.kind.length > 0 && Number.isInteger(row.seed),
  paper_account: (row) =>
    typeof row.state === 'string' &&
    parsePaperState(row.state) !== null &&
    typeof row.timeframe === 'string' &&
    (REPLAY_TIMEFRAMES as readonly string[]).includes(row.timeframe) &&
    decimalCell(row.starting_balance),
  journal_entry: (row) => journalFromRow(row) !== null,
  lab_attempt: (row) => jsonCell(z.array(z.string()))(row.picked),
  strategy_saved: (row) => typeof row.strategy_id === 'string' && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(row.strategy_id) && Number.isInteger(row.position),
  strategy_version: (row) => typeof row.definition === 'string' && versionFromRow(row as never) !== null && Number.isInteger(row.version) && (row.version as number) >= 1,
  backtest_run: (row) => typeof row.inputs === 'string' && typeof row.result === 'string' && runFromRow(row as never) !== null,
  playbook_entry: (row) =>
    typeof row.strategy_id === 'string' &&
    row.strategy_id.length > 0 &&
    row.strategy_id.length <= 80 &&
    (row.run_id === null || (typeof row.run_id === 'string' && row.run_id.length > 0 && row.run_id.length <= 80)) &&
    ['hypothesis', 'conditions', 'invalidation', 'limitations', 'notes'].every((k) => typeof row[k] === 'string' && (row[k] as string).length <= MAX_PLAYBOOK_TEXT),
  imported_dataset: (row) => {
    if (typeof row.candles !== 'string' || parseQuality(row.quality) === null) return false;
    const candles = decodeCandles(row.candles);
    return candles !== null && candles.length === row.candle_count && sha256(row.candles) === row.content_hash;
  },
  trading_plan: (row) => typeof row.plan === 'string' && parsePlan(row.plan) !== null && Number.isInteger(row.version) && (row.version as number) >= 1,
};

export function checkRows(file: BackupFile): AppError | null {
  for (const [table, rows] of Object.entries(file.tables)) {
    const check = ROW_CHECKS[table];
    if (!check) continue;
    const bad = rows.findIndex((row) => !check(row));
    if (bad >= 0) return dataQualityError(`Backup table ${table} has an invalid row (#${bad + 1})`);
  }
  return null;
}
