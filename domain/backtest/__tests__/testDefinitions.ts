import type { IndicatorOperand, StrategyDefinition } from '../model';

/** Shared fixtures for backtest tests: a simple EMA trend-following strategy. */
export const op = (indicator: IndicatorOperand['indicator'], period: number | null = null, ago = 0, times = 1): IndicatorOperand => ({ kind: 'indicator', indicator, period, ago, times });

export const TREND: StrategyDefinition = {
  instrumentId: 'sim-eurusd',
  timeframe: 'H1',
  direction: 'both',
  longEntry: {
    join: 'all',
    conditions: [
      { left: op('close'), op: 'crosses_above', right: op('ema', 50) },
      { left: op('ema', 50), op: 'above', right: op('ema', 50, 10) },
    ],
  },
  shortEntry: {
    join: 'all',
    conditions: [
      { left: op('close'), op: 'crosses_below', right: op('ema', 50) },
      { left: op('ema', 50), op: 'below', right: op('ema', 50, 10) },
    ],
  },
  longExit: { join: 'all', conditions: [{ left: op('close'), op: 'below', right: op('ema', 50) }] },
  shortExit: { join: 'all', conditions: [{ left: op('close'), op: 'above', right: op('ema', 50) }] },
  stop: { kind: 'atr', period: 14, multiple: 2 },
  target: { kind: 'none' },
  riskPercent: 1,
  limits: { maxTradesPerDay: 3, dailyLossPercent: null, pauseAfterLosses: null },
  session: null,
};
