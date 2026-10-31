import { z } from 'zod';
import type { Timeframe } from '../../domain/models/markets';
import { SCENARIO_KINDS } from '../../domain/market/scenarios';
import { RULE_IDS } from '../../domain/risk/rules';
import { PAPER_CANDLE_COUNT, PRACTICE_INSTRUMENTS } from '../../domain/simulation/instruments';
import type { PaperState } from '../../domain/simulation/paper';
import { dec, isDecimalString } from '../../shared/decimal';
import { fromUnknown, notFound, validationError, type AppError } from '../../shared/errors';
import { logger } from '../../shared/logger';
import { err, ok, type Result } from '../../shared/result';
import type { UtcIso } from '../../shared/time';
import type { ChangeBus } from '../db/changeBus';
import type { SqlDatabase } from '../db/client';
import { STORED_TIMEFRAMES } from './practiceRepository';

/** A saved paper trading account (spec §17). Candles come from the scenario seed. */
export interface PaperAccount {
  readonly id: string;
  readonly name: string;
  readonly instrumentId: string;
  readonly scenarioKind: string;
  readonly seed: number;
  readonly timeframe: Timeframe;
  readonly startingBalance: string;
  readonly state: PaperState;
  readonly resets: number;
  readonly createdAt: UtcIso;
  readonly updatedAt: UtcIso;
}

export type PaperAccountInput = Pick<PaperAccount, 'name' | 'instrumentId' | 'scenarioKind' | 'seed' | 'timeframe' | 'startingBalance' | 'state'>;

export interface PaperRepository {
  /** Newest first. An account whose state cannot be read is skipped (and logged). */
  list(): Promise<Result<readonly PaperAccount[], AppError>>;
  get(id: string): Promise<Result<PaperAccount, AppError>>;
  create(input: PaperAccountInput, now: UtcIso): Promise<Result<PaperAccount, AppError>>;
  saveState(id: string, state: PaperState, now: UtcIso): Promise<Result<void, AppError>>;
  /** Starts the account over on a new scenario seed and counts the reset. */
  reset(id: string, seed: number, state: PaperState, now: UtcIso): Promise<Result<void, AppError>>;
  remove(id: string): Promise<Result<void, AppError>>;
}

export const MAX_ACCOUNT_NAME_LENGTH = 40;

const decimalText = z.string().refine(isDecimalString, 'must be a decimal');
const side = z.enum(['buy', 'sell']);
const ruleIds = z.array(z.enum(RULE_IDS));
/** A candle index: anything past the scenario's end would crash the chart. */
const index = z.number().int().min(0).max(PAPER_CANDLE_COUNT - 1);
const instrumentId = z.string().refine((id) => PRACTICE_INSTRUMENTS.some((i) => i.id === id), 'unknown practice instrument');

const storedOrder = z
  .object({
    id: z.number().int().min(0),
    placedAt: index,
    side,
    type: z.enum(['market', 'limit', 'stop']),
    size: decimalText,
    price: decimalText.nullable(),
    stopLoss: decimalText.nullable(),
    takeProfit: decimalText.nullable(),
    violations: ruleIds,
    plannedRisk: decimalText.nullable(),
    equityAtOrder: decimalText,
  })
  .strict();

const storedPosition = z
  .object({
    id: z.number().int().min(0),
    side,
    size: decimalText,
    entry: decimalText,
    openedAt: index,
    stopLoss: decimalText.nullable(),
    takeProfit: decimalText.nullable(),
    initialStop: decimalText.nullable(),
    carried: decimalText,
    violations: ruleIds,
    plannedRisk: decimalText.nullable(),
    equityAtOrder: decimalText,
  })
  .strict();

const storedTrade = z
  .object({
    positionId: z.number().int().min(0),
    side,
    size: decimalText,
    entry: decimalText,
    exit: decimalText,
    openedAt: index,
    closedAt: index,
    reason: z.enum(['stop_loss', 'take_profit', 'manual', 'end_of_data', 'stop_out']),
    gross: decimalText,
    costs: decimalText,
    net: decimalText,
    initialStop: decimalText.nullable(),
    violations: ruleIds,
    plannedRisk: decimalText.nullable(),
    equityAtOrder: decimalText,
  })
  .strict();

export const storedPaperStateSchema = z
  .object({
    instrumentId,
    cursor: index,
    startingBalance: decimalText,
    balance: decimalText,
    positions: z.array(storedPosition),
    orders: z.array(storedOrder),
    history: z.array(storedTrade),
    nextId: z.number().int().min(1),
    peakEquity: decimalText,
    maxDrawdown: decimalText,
    day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    dayStartBalance: decimalText,
    events: z.array(z.string()),
  })
  .strict();

type StoredState = z.infer<typeof storedPaperStateSchema>;

const decOrNull = (v: string | null) => (v === null ? null : dec(v));
const strOrNull = (v: { toString(): string } | null) => (v === null ? null : v.toString());

/** Decimals become strings for storage; nothing else changes shape. */
export function serialisePaperState(s: PaperState): StoredState {
  return {
    ...s,
    startingBalance: s.startingBalance.toString(),
    balance: s.balance.toString(),
    peakEquity: s.peakEquity.toString(),
    maxDrawdown: s.maxDrawdown.toString(),
    dayStartBalance: s.dayStartBalance.toString(),
    events: [...s.events],
    orders: s.orders.map((o) => ({ ...o, violations: [...o.violations], plannedRisk: strOrNull(o.plannedRisk), equityAtOrder: o.equityAtOrder.toString(), size: o.size.toString(), price: strOrNull(o.price), stopLoss: strOrNull(o.stopLoss), takeProfit: strOrNull(o.takeProfit) })),
    positions: s.positions.map((p) => ({
      ...p,
      violations: [...p.violations],
      plannedRisk: strOrNull(p.plannedRisk),
      equityAtOrder: p.equityAtOrder.toString(),
      size: p.size.toString(),
      entry: p.entry.toString(),
      stopLoss: strOrNull(p.stopLoss),
      takeProfit: strOrNull(p.takeProfit),
      initialStop: strOrNull(p.initialStop),
      carried: p.carried.toString(),
    })),
    history: s.history.map((t) => ({
      ...t,
      violations: [...t.violations],
      plannedRisk: strOrNull(t.plannedRisk),
      equityAtOrder: t.equityAtOrder.toString(),
      size: t.size.toString(),
      entry: t.entry.toString(),
      exit: t.exit.toString(),
      gross: t.gross.toString(),
      costs: t.costs.toString(),
      net: t.net.toString(),
      initialStop: strOrNull(t.initialStop),
    })),
  };
}

export function parsePaperState(json: string): PaperState | null {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  const parsed = storedPaperStateSchema.safeParse(raw);
  if (!parsed.success) return null;
  const s = parsed.data;
  return {
    ...s,
    startingBalance: dec(s.startingBalance),
    balance: dec(s.balance),
    peakEquity: dec(s.peakEquity),
    maxDrawdown: dec(s.maxDrawdown),
    dayStartBalance: dec(s.dayStartBalance),
    orders: s.orders.map((o) => ({ ...o, plannedRisk: decOrNull(o.plannedRisk), equityAtOrder: dec(o.equityAtOrder), size: dec(o.size), price: decOrNull(o.price), stopLoss: decOrNull(o.stopLoss), takeProfit: decOrNull(o.takeProfit) })),
    positions: s.positions.map((p) => ({
      ...p,
      size: dec(p.size),
      entry: dec(p.entry),
      stopLoss: decOrNull(p.stopLoss),
      takeProfit: decOrNull(p.takeProfit),
      initialStop: decOrNull(p.initialStop),
      carried: dec(p.carried),
      plannedRisk: decOrNull(p.plannedRisk),
      equityAtOrder: dec(p.equityAtOrder),
    })),
    history: s.history.map((t) => ({
      ...t,
      size: dec(t.size),
      entry: dec(t.entry),
      exit: dec(t.exit),
      gross: dec(t.gross),
      costs: dec(t.costs),
      net: dec(t.net),
      initialStop: decOrNull(t.initialStop),
      plannedRisk: decOrNull(t.plannedRisk),
      equityAtOrder: dec(t.equityAtOrder),
    })),
  };
}

interface AccountRow {
  readonly id: string;
  readonly name: string;
  readonly instrument_id: string;
  readonly scenario_kind: string;
  readonly seed: number;
  readonly timeframe: string;
  readonly starting_balance: string;
  readonly state: string;
  readonly resets: number;
  readonly created_at: string;
  readonly updated_at: string;
}

function fromRow(r: AccountRow): PaperAccount | null {
  const state = parsePaperState(r.state);
  if (!state || !(STORED_TIMEFRAMES as readonly string[]).includes(r.timeframe) || !(SCENARIO_KINDS as readonly string[]).includes(r.scenario_kind)) return null;
  if (state.instrumentId !== r.instrument_id) return null;
  return {
    id: r.id,
    name: r.name,
    instrumentId: r.instrument_id,
    scenarioKind: r.scenario_kind,
    seed: r.seed,
    timeframe: r.timeframe as Timeframe,
    startingBalance: r.starting_balance,
    state,
    resets: r.resets,
    createdAt: r.created_at as UtcIso,
    updatedAt: r.updated_at as UtcIso,
  };
}

const inputSchema = z
  .object({
    name: z.string().trim().min(1).max(MAX_ACCOUNT_NAME_LENGTH),
    instrumentId,
    scenarioKind: z.enum(SCENARIO_KINDS),
    seed: z.number().int(),
    timeframe: z.enum(STORED_TIMEFRAMES),
    startingBalance: decimalText,
  })
  .strict();

export function createPaperRepository(db: SqlDatabase, bus: ChangeBus, newId: (prefix: string) => string): PaperRepository {
  const write = async (sql: string, args: (string | number | null)[], what: string): Promise<Result<void, AppError>> => {
    try {
      const r = await db.runAsync(sql, args);
      if (r.changes === 0) return err(notFound('That paper account no longer exists'));
    } catch (cause) {
      return err(fromUnknown('StorageError', what, cause));
    }
    bus.emit(['paper_account']);
    return ok(undefined);
  };

  return {
    async list() {
      try {
        const rows = await db.getAllAsync<AccountRow>('SELECT * FROM paper_account ORDER BY updated_at DESC, id DESC', []);
        const accounts = rows.map(fromRow);
        const skipped = accounts.filter((a) => a === null).length;
        if (skipped > 0) logger.warn('Unreadable paper accounts skipped', { count: skipped });
        return ok(accounts.filter((a): a is PaperAccount => a !== null));
      } catch (cause) {
        return err(fromUnknown('StorageError', 'Reading paper accounts failed', cause));
      }
    },

    async get(id) {
      try {
        const row = await db.getFirstAsync<AccountRow>('SELECT * FROM paper_account WHERE id = ?', [id]);
        if (!row) return err(notFound('That paper account no longer exists'));
        const account = fromRow(row);
        return account ? ok(account) : err(validationError('This paper account could not be read. Reset it to start again.'));
      } catch (cause) {
        return err(fromUnknown('StorageError', 'Reading the paper account failed', cause));
      }
    },

    async create(input, now) {
      const { state, ...fields } = input;
      const parsed = inputSchema.safeParse(fields);
      if (!parsed.success) return err(validationError('Invalid paper account', { issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) }));
      const account: PaperAccount = { ...parsed.data, state, id: newId('pap'), resets: 0, createdAt: now, updatedAt: now };
      try {
        await db.runAsync(
          'INSERT INTO paper_account (id, name, instrument_id, scenario_kind, seed, timeframe, starting_balance, state, resets, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)',
          [account.id, account.name, account.instrumentId, account.scenarioKind, account.seed, account.timeframe, account.startingBalance, JSON.stringify(serialisePaperState(state)), now, now],
        );
      } catch (cause) {
        return err(fromUnknown('StorageError', 'Creating the paper account failed', cause));
      }
      bus.emit(['paper_account']);
      return ok(account);
    },

    saveState: (id, state, now) =>
      write('UPDATE paper_account SET state = ?, updated_at = ? WHERE id = ?', [JSON.stringify(serialisePaperState(state)), now, id], 'Saving the paper account failed'),

    async reset(id, seed, state, now) {
      if (!Number.isInteger(seed)) return err(validationError('Invalid seed'));
      return write(
        'UPDATE paper_account SET seed = ?, state = ?, resets = resets + 1, updated_at = ? WHERE id = ?',
        [seed, JSON.stringify(serialisePaperState(state)), now, id],
        'Resetting the paper account failed',
      );
    },

    remove: (id) => write('DELETE FROM paper_account WHERE id = ?', [id], 'Deleting the paper account failed'),
  };
}
