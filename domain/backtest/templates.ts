import type { IndicatorOperand, StrategyDefinition } from './model';

/**
 * Builder versions of the rule-based Strategy Library pages (spec §16.2).
 * Each follows the page's educational rules as closely as the builder's
 * blocks allow, and lists every place it simplifies them. A learner's copy
 * is their own strategy; a template is never changed.
 */

export interface BacktestTemplate {
  /** The Strategy Library page id. */
  readonly strategyId: string;
  readonly name: string;
  readonly definition: StrategyDefinition;
  /** Where the builder's version differs from the page's rules. Empty when it follows them exactly. */
  readonly simplifications: readonly string[];
}

const v = (indicator: IndicatorOperand['indicator'], period: number | null = null, ago = 0, times = 1): IndicatorOperand => ({ kind: 'indicator', indicator, period, ago, times });

const ONE_PERCENT = { riskPercent: 1, limits: { maxTradesPerDay: 3, dailyLossPercent: null, pauseAfterLosses: null }, session: null } as const;

export const BACKTEST_TEMPLATES: readonly BacktestTemplate[] = [
  {
    strategyId: 'trend-following-moving-averages',
    name: 'Trend following (EMA 50)',
    definition: {
      instrumentId: 'sim-eurusd',
      timeframe: 'D1',
      direction: 'both',
      longEntry: { join: 'all', conditions: [{ left: v('close'), op: 'crosses_above', right: v('ema', 50) }, { left: v('ema', 50), op: 'above', right: v('ema', 50, 10) }] },
      shortEntry: { join: 'all', conditions: [{ left: v('close'), op: 'crosses_below', right: v('ema', 50) }, { left: v('ema', 50), op: 'below', right: v('ema', 50, 10) }] },
      longExit: { join: 'all', conditions: [{ left: v('close'), op: 'below', right: v('ema', 50) }] },
      shortExit: { join: 'all', conditions: [{ left: v('close'), op: 'above', right: v('ema', 50) }] },
      stop: { kind: 'atr', period: 14, multiple: 2 },
      target: { kind: 'none' },
      ...ONE_PERCENT,
    },
    simplifications: ['Entries need the close to cross the average, so the strategy does not enter a trend it is already in on the first candle.'],
  },
  {
    strategyId: 'channel-breakout',
    name: 'Channel breakout (20 / 15)',
    definition: {
      instrumentId: 'sim-gold',
      timeframe: 'D1',
      direction: 'both',
      longEntry: { join: 'all', conditions: [{ left: v('close'), op: 'above', right: v('channel_high', 20) }] },
      shortEntry: { join: 'all', conditions: [{ left: v('close'), op: 'below', right: v('channel_low', 20) }] },
      longExit: { join: 'all', conditions: [{ left: v('close'), op: 'below', right: v('channel_low', 15) }] },
      shortExit: { join: 'all', conditions: [{ left: v('close'), op: 'above', right: v('channel_high', 15) }] },
      stop: { kind: 'channel', period: 15 },
      target: { kind: 'none' },
      ...ONE_PERCENT,
    },
    simplifications: ['The stop is set once, at the 15-candle low (or high) when the trade opens, and does not move; the exit rule follows the channel.'],
  },
  {
    strategyId: 'breakout-volume-confirmation',
    name: 'Breakout with volume',
    definition: {
      instrumentId: 'sim-stock',
      timeframe: 'D1',
      direction: 'long',
      longEntry: {
        join: 'all',
        conditions: [
          { left: v('close'), op: 'above', right: v('channel_high', 20) },
          { left: v('volume'), op: 'above', right: v('volume_sma', 20, 0, 1.5) },
        ],
      },
      shortEntry: null,
      longExit: { join: 'all', conditions: [{ left: v('close'), op: 'below', right: v('channel_high', 20, 1) }] },
      shortExit: null,
      stop: { kind: 'atr', period: 14, multiple: 1 },
      target: { kind: 'none' },
      ...ONE_PERCENT,
    },
    simplifications: [
      'The stop is 1 × ATR below the signal candle’s close, not below the breakout level.',
      'The exit is any close below the previous candle’s 20-day high, without the 3-day window.',
      'The 20-day average volume includes the breakout day.',
    ],
  },
  {
    strategyId: 'mean-reversion-rsi-bands',
    name: 'Mean reversion (RSI + bands)',
    definition: {
      instrumentId: 'sim-eurusd',
      timeframe: 'H1',
      direction: 'long',
      longEntry: {
        join: 'all',
        conditions: [
          { left: v('close'), op: 'below', right: v('bollinger_lower', 20) },
          { left: v('rsi', 14), op: 'below', right: { kind: 'number', value: 30 } },
        ],
      },
      shortEntry: null,
      longExit: { join: 'all', conditions: [{ left: v('close'), op: 'above', right: v('bollinger_middle', 20) }] },
      shortExit: null,
      stop: { kind: 'atr', period: 14, multiple: 1 },
      target: { kind: 'none' },
      ...ONE_PERCENT,
    },
    simplifications: [
      'The regime filter (at least 4 crosses of the MA 20 in 40 candles) is left out: the builder has no block for counting crosses. Check the results by regime instead.',
      'The take profit at the middle band is an exit on a close above it, filled at the next open.',
    ],
  },
  {
    strategyId: 'pullback-in-trend',
    name: 'Pullback in a trend',
    definition: {
      instrumentId: 'sim-eurusd',
      timeframe: 'H4',
      direction: 'long',
      longEntry: {
        join: 'all',
        conditions: [
          { left: v('close'), op: 'above', right: v('ema', 50) },
          { left: v('ema', 50), op: 'above', right: v('ema', 50, 10) },
          { left: v('low', null, 1), op: 'below', right: v('ema', 20, 1) },
          { left: v('close'), op: 'above', right: v('high', null, 1) },
        ],
      },
      shortEntry: null,
      longExit: { join: 'all', conditions: [{ left: v('close'), op: 'below', right: v('ema', 50) }] },
      shortExit: null,
      stop: { kind: 'channel', period: 5 },
      target: { kind: 'r_multiple', r: 2 },
      ...ONE_PERCENT,
    },
    simplifications: [
      'Swing lows are not detected. A pullback is the previous candle’s low dipping below the EMA 20 while the trend filter holds.',
      'The stop is the lowest low of the previous 5 candles.',
    ],
  },
  {
    strategyId: 'range-trading',
    name: 'Range trading (support bounce)',
    definition: {
      instrumentId: 'sim-eurusd',
      timeframe: 'H1',
      direction: 'long',
      longEntry: {
        join: 'all',
        conditions: [
          { left: v('low'), op: 'below', right: v('channel_low', 30) },
          { left: v('close'), op: 'above', right: v('channel_low', 30) },
        ],
      },
      shortEntry: null,
      longExit: { join: 'all', conditions: [{ left: v('close'), op: 'above', right: v('channel_high', 30, 0, 0.999) }] },
      shortExit: null,
      stop: { kind: 'atr', period: 14, multiple: 0.5 },
      target: { kind: 'none' },
      ...ONE_PERCENT,
    },
    simplifications: [
      'Touches are not counted. Support and resistance are the lowest low and highest high of the previous 30 candles.',
      'The stop is 0.5 × ATR below the signal candle’s close, not below support. The take profit is an exit on a close just below resistance.',
      'There is no "stop trading after a close outside the range" rule.',
    ],
  },
];

export const templateFor = (strategyId: string): BacktestTemplate | null => BACKTEST_TEMPLATES.find((t) => t.strategyId === strategyId) ?? null;
