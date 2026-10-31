import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ScenarioKind } from '../../domain/market';
import type { Timeframe } from '../../domain/models/markets';
import { EXAMPLE_RISK_RULES, type CooldownState, type RiskRules } from '../../domain/risk';
import {
  advancePaper,
  cancelPaperOrder,
  closePaperPosition,
  editPaperPosition,
  paperView,
  placePaperOrder,
  practiceInstrument,
  type PaperState,
  type PaperView,
  type PracticeInstrument,
} from '../../domain/simulation';
import type { PaperAccount } from '../../data';
import type { Decimal } from '../../shared/decimal';
import { validationError, type AppError } from '../../shared/errors';
import { logger } from '../../shared/logger';
import { err, ok, type Result } from '../../shared/result';
import { toUtcIso } from '../../shared/time';
import { useContainer, useLiveQuery, type QueryState } from '../app';
import { seedFrom } from '../practice';
import { checkTicket, newPaperState, newTrades, paperCandles, paperCooldown, paperTradeToJournal, type OrderCheck, type TicketForm } from './paperSession';

export function usePaperAccounts(): QueryState<readonly PaperAccount[]> & { reload: () => void } {
  const c = useContainer();
  return useLiveQuery(() => c.paper.list(), ['paper_account']);
}

export interface NewAccountForm {
  readonly name: string;
  readonly instrumentId: string;
  readonly scenarioKind: ScenarioKind;
  readonly timeframe: Timeframe;
  readonly balance: string;
}

export function useCreatePaperAccount(): (form: NewAccountForm) => Promise<Result<PaperAccount, AppError>> {
  const c = useContainer();
  return useCallback(
    async (form) => {
      const instrument = practiceInstrument(form.instrumentId);
      if (!instrument) return err(validationError('Choose a market'));
      const seed = seedFrom(c.clock.now());
      const state = newPaperState(instrument, paperCandles(instrument, form.scenarioKind, seed, form.timeframe), seed, form.balance);
      if (!state.ok) return state;
      return c.paper.create({ name: form.name, instrumentId: instrument.id, scenarioKind: form.scenarioKind, seed, timeframe: form.timeframe, startingBalance: form.balance, state: state.value }, toUtcIso(c.clock.now()));
    },
    [c],
  );
}

export function useRiskRules(): RiskRules {
  return useRiskRulesState().rules;
}

/** The learner's rules, and whether they have loaded (until then the examples stand in). */
export function useRiskRulesState(): { readonly rules: RiskRules; readonly loaded: boolean } {
  const c = useContainer();
  const settings = useLiveQuery(() => c.settings.get(), ['settings']);
  return settings.status === 'success' ? { rules: settings.data.riskRules, loaded: true } : { rules: EXAMPLE_RISK_RULES, loaded: false };
}

export interface PaperSession {
  readonly account: PaperAccount;
  readonly instrument: PracticeInstrument;
  readonly view: PaperView;
  readonly cooldown: CooldownState | null;
  readonly busy: boolean;
  readonly error: string | null;
  /** Parses and checks the ticket against the learner's rules, without placing it. */
  check(form: TicketForm): Result<OrderCheck, AppError>;
  /** Places a checked order. Rule breaks must have been shown first; they are recorded with the trade. */
  place(check: OrderCheck): Promise<boolean>;
  next(steps?: number): Promise<void>;
  close(positionId: number, size: Decimal | null): Promise<boolean>;
  edit(positionId: number, stopLoss: Decimal | null, takeProfit: Decimal | null): Promise<boolean>;
  cancel(orderId: number): Promise<boolean>;
  reset(): Promise<void>;
  /** Deletes the account. Its journal entries are kept. */
  remove(): Promise<boolean>;
}

export type PaperSessionState = { readonly status: 'loading' } | { readonly status: 'error'; readonly error: AppError } | ({ readonly status: 'ready' } & PaperSession);

/** One paper account: each action runs the pure engine, saves the state, and journals closed trades. */
export function usePaperSession(id: string): PaperSessionState {
  const c = useContainer();
  const { rules, loaded: rulesLoaded } = useRiskRulesState();
  const query = useLiveQuery(() => c.paper.get(id), ['paper_account']);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const account = query.status === 'success' ? query.data : null;
  const instrument = account ? practiceInstrument(account.instrumentId) : null;
  const candles = useMemo(
    () => (account && instrument ? paperCandles(instrument, account.scenarioKind, account.seed, account.timeframe) : []),
    // Candles depend only on these fields; a new state on the same seed reuses them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [account?.id, account?.seed, account?.scenarioKind, account?.timeframe, instrument],
  );

  /**
   * Journals every closed trade of the account. Ids are deterministic, so trades
   * already in the journal are skipped; a write that failed earlier is retried.
   */
  const syncJournal = useCallback(
    async (acc: PaperAccount): Promise<void> => {
      if (!instrument || acc.state.history.length === 0) return;
      const entries = acc.state.history.map((t, k) => paperTradeToJournal(acc, instrument, candles, t, rules, k));
      const logged = await c.journal.addMany(entries, toUtcIso(c.clock.now()));
      if (!logged.ok) logger.warn('Journal entry for a paper trade failed', { error: logged.error.message });
    },
    [instrument, candles, c, rules],
  );

  // Catch up on trades whose journal write failed last time.
  const accountId = account?.id;
  const synced = useRef<string | null>(null);
  useEffect(() => {
    // Wait for the learner's rules, or catch-up entries would be scored against the examples for good.
    if (!account || !rulesLoaded || synced.current === account.id) return;
    synced.current = account.id;
    void syncJournal(account);
    // Once per account; later trades are journalled by `run`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, rulesLoaded, syncJournal]);

  /** Runs one change at a time: compute, save, then journal any trades that closed. */
  const run = useCallback(
    async (change: (s: PaperState) => Result<PaperState, AppError>): Promise<boolean> => {
      if (!account || !instrument || busyRef.current) return false;
      busyRef.current = true;
      setBusy(true);
      try {
        const latest = await c.paper.get(account.id);
        if (!latest.ok) {
          setError(latest.error.message);
          return false;
        }
        const next = change(latest.value.state);
        if (!next.ok) {
          setError(next.error.message);
          return false;
        }
        const now = toUtcIso(c.clock.now());
        const saved = await c.paper.saveState(account.id, next.value, now);
        if (!saved.ok) {
          setError(saved.error.message);
          return false;
        }
        if (newTrades(latest.value.state, next.value).length > 0) await syncJournal({ ...latest.value, state: next.value });
        setError(null);
        return true;
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [account, instrument, c, syncJournal],
  );

  if (query.status === 'loading') return { status: 'loading' };
  if (query.status === 'error') return { status: 'error', error: query.error };
  if (!account || !instrument) return { status: 'error', error: validationError('This practice market is no longer available') };
  const state = account.state;
  return {
    status: 'ready',
    account,
    instrument,
    view: paperView(state, instrument, candles),
    cooldown: paperCooldown(state, rules),
    busy,
    error,
    check: (form) => checkTicket(state, instrument, candles, form, rules),
    place: (check) => run((s) => placePaperOrder(s, instrument, candles, check.request)),
    next: async (steps = 1) => {
      await run((s) => {
        let out = s;
        for (let k = 0; k < steps && out.cursor < candles.length - 1; k += 1) {
          const before = out;
          out = advancePaper(out, instrument, candles);
          // Stop fast-forwarding as soon as something happens.
          if (out.history.length !== before.history.length || out.positions.length !== before.positions.length) break;
        }
        return ok(out);
      });
    },
    close: (positionId, size) => run((s) => closePaperPosition(s, instrument, candles, positionId, size)),
    edit: (positionId, stopLoss, takeProfit) => run((s) => editPaperPosition(s, instrument, candles, positionId, stopLoss, takeProfit)),
    cancel: (orderId) => run((s) => cancelPaperOrder(s, orderId)),
    reset: async () => {
      if (busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      try {
        const seed = seedFrom(c.clock.now());
        const fresh = newPaperState(instrument, paperCandles(instrument, account.scenarioKind, seed, account.timeframe), seed, account.startingBalance);
        if (!fresh.ok) {
          setError(fresh.error.message);
          return;
        }
        const r = await c.paper.reset(account.id, seed, fresh.value, toUtcIso(c.clock.now()));
        setError(r.ok ? null : r.error.message);
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    remove: async () => {
      if (busyRef.current) return false;
      const r = await c.paper.remove(account.id);
      if (!r.ok) setError(r.error.message);
      return r.ok;
    },
  };
}

