import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { planIssues, sessionsClock, type PlanVersion, type SessionsClock, type TradingPlan } from '../../domain/plan';
import { validationError, type AppError } from '../../shared/errors';
import { err, ok, type Result } from '../../shared/result';
import { deviceTimeZone, toUtcIso } from '../../shared/time';
import { useContainer, useLiveQuery, type QueryState } from '../app';

/** Every saved version of the learner's plan, newest first. */
export function usePlanVersions(): QueryState<readonly PlanVersion[]> & { reload: () => void } {
  const c = useContainer();
  return useLiveQuery(() => c.plan.versions(), ['trading_plan']);
}

export function useSavePlan(): (plan: TradingPlan) => Promise<Result<PlanVersion, AppError>> {
  const c = useContainer();
  return useCallback((plan) => c.plan.save(plan, toUtcIso(c.clock.now())), [c]);
}

/**
 * Copies the plan's risk-per-trade and daily-loss limits into the learner's
 * risk rules, so paper orders are checked against the same numbers. Other
 * rules are kept.
 */
export function useApplyPlanLimits(): (plan: TradingPlan) => Promise<Result<void, AppError>> {
  const c = useContainer();
  return useCallback(
    async (plan) => {
      if (planIssues(plan).length > 0) return err(validationError('Save a complete plan first'));
      const current = await c.settings.get();
      if (!current.ok) return current;
      const r = await c.settings.update(
        { riskRules: { ...current.value.riskRules, maxRiskPerTradePercent: plan.riskPerTradePercent, maxDailyLossPercent: plan.dailyLossPercent } },
        toUtcIso(c.clock.now()),
      );
      return r.ok ? ok(undefined) : r;
    },
    [c],
  );
}

/** Refresh rate of the sessions clock; minutes are the smallest unit it shows. */
export const SESSIONS_TICK_MS = 30_000;

/**
 * The sessions clock now, refreshed every 30 seconds and when the app comes
 * back to the foreground, with the learner's time zone for display (the
 * phone's zone until settings load).
 */
export function useSessionsClock(): { readonly clock: SessionsClock; readonly nowMs: number; readonly timeZone: string } {
  const c = useContainer();
  const [nowMs, setNowMs] = useState(() => c.clock.now().getTime());
  const settings = useLiveQuery(() => c.settings.get(), ['settings']);
  useEffect(() => {
    const tick = () => setNowMs(c.clock.now().getTime());
    const id = setInterval(tick, SESSIONS_TICK_MS);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') tick();
    });
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [c]);
  const clock = useMemo(() => sessionsClock(nowMs), [nowMs]);
  return { clock, nowMs, timeZone: settings.status === 'success' ? settings.data.timeZone : deviceTimeZone() };
}

export type MetaTraderChoice = 'mt4' | 'mt5';

/** What to tell the learner after trying to open MetaTrader from the checklist. */
export type OpenOutcome = 'opened' | 'not_installed' | 'unsupported' | 'failed';

export function useOpenMetaTrader(): {
  readonly open: (app: MetaTraderChoice) => Promise<OpenOutcome>;
  readonly openStore: (app: MetaTraderChoice) => Promise<boolean>;
} {
  const c = useContainer();
  const open = useCallback(
    async (app: MetaTraderChoice): Promise<OpenOutcome> => {
      const r = await c.apps.openApp(app);
      return r.ok ? r.value : 'failed';
    },
    [c],
  );
  const openStore = useCallback(async (app: MetaTraderChoice) => (await c.apps.openStoreListing(app)).ok, [c]);
  return { open, openStore };
}
