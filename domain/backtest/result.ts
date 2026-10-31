import { dec } from '../../shared/decimal';
import { sha256 } from '../../shared/sha256';
import type { AppError } from '../../shared/errors';
import { ok, type Result } from '../../shared/result';
import { DEFAULT_LIMIT_RULE } from '../market/fills';
import { missingCosts, type BacktestCosts } from './costs';
import type { DataCheck } from './dataset';
import { backtestTrades, createBacktest, ENGINE_VERSION, stepBacktest, type BacktestSetup, type BacktestState, type BacktestTrade, type SkipReason } from './engine';
import { backtestMetrics, downsampleLast, downsampleMax, drawdownSeries, regimeRows, tradeStats, type BacktestMetrics, type RegimeRow, type TradeStats } from './metrics';

/**
 * A finished backtest (spec §16.3): metrics, regimes, the in-sample /
 * out-of-sample or period-block split, curves, every convention used, and
 * the safeguard warnings. The input hash (SHA-256) identifies the run; the
 * result fingerprint (SHA-256) lets a rerun prove it gave the same answer.
 */

/** Version of the stored result shape; bump when fields change so old runs can be explained. */
export const RESULT_SCHEMA_VERSION = 1;

export const CURVE_POINTS = 200;

/** Fewer trades than this and results are flagged as a small sample. */
export const SMALL_SAMPLE = 30;
/** Trying this many versions on the same data is flagged as a risk of overfitting. */
export const MANY_VERSIONS = 5;

export interface SplitPart extends TradeStats {
  readonly label: string;
  readonly fromIndex: number;
  readonly toIndex: number;
}

/** What the learner has already seen, for the overfitting warnings. */
export interface RunContext {
  /** Versions of the strategy saved so far. */
  readonly versionsTried: number;
  /** Other versions of this strategy whose out-of-sample results have already been shown. */
  readonly otherVersionsWithOutOfSample: number;
}

export const FIRST_RUN: RunContext = { versionsTried: 1, otherVersionsWithOutOfSample: 0 };

export interface BacktestResult {
  readonly resultSchemaVersion: number;
  readonly engineVersion: number;
  readonly inputHash: string;
  readonly fingerprint: string;
  readonly dataLabel: string;
  readonly dataDescription: string;
  readonly candles: number;
  readonly warmup: number;
  readonly metrics: BacktestMetrics;
  readonly byRegime: readonly RegimeRow[];
  readonly split: readonly SplitPart[];
  /** Trades that crossed a split boundary, left out of every part. */
  readonly splitExcluded: number;
  readonly equityCurve: readonly number[];
  readonly drawdownCurve: readonly number[];
  readonly trades: readonly BacktestTrade[];
  readonly skipped: Readonly<Partial<Record<SkipReason, number>>>;
  readonly dataCheck: DataCheck;
  readonly warnings: readonly string[];
  readonly conventions: readonly string[];
}

/** Every rule the engine follows, listed in each report (spec §16.3). */
const SIMULATED_DATA_NOTE = 'Data: simulated candles from the app’s scenario generator, not real market history. Results are simulated and are never real account performance.';
const SIMULATED_SURVIVORSHIP = 'Survivorship bias: not applicable here, because the one simulated market always exists. With real data, markets that were delisted or dropped must be included.';

export const BACKTEST_CONVENTIONS: readonly string[] = [
  SIMULATED_DATA_NOTE,
  'Decisions use only candles that have closed. A signal on a close is filled at the next candle’s open.',
  'Buys fill at the ask and sells at the bid (mid price ± half the spread).',
  'Market fills, stop losses and stop outs pay slippage. Take profits never do.',
  'A take profit fills only when price trades beyond it (the "through" rule), at its own price. When price gaps past it, it still fills at its own price, never better.',
  'If a candle opens beyond the stop (a gap), the stop fills at that open, which is worse than the stop.',
  'If one candle reaches both the stop and the target, the stop is assumed to fill first.',
  'For entries at the open, stop and target are both checked on that candle, stop first.',
  'If the candle a trade would open on already opens beyond its stop or target, the trade is not taken (counted under "Signals not traded").',
  'Session hours apply to the candle the trade opens on. Market regimes are labelled from the entry candle with hindsight, for reporting only; the rules never see them.',
  'Trades that cross an in-sample / out-of-sample or block boundary are left out of every part, and their number is shown.',
  'One trade at a time. Rule exits fill at the next candle’s open.',
  'Commission is charged on entry and exit; swap is charged for each new UTC day a trade is held.',
  'Size keeps the loss at the stop, costs included, within the risk per trade, rounded down to the market’s size step. Gaps can make losses larger.',
  'Margin and stop-out rules are those of the practice market. Open trades are closed at the last candle.',
  SIMULATED_SURVIVORSHIP,
  'The account is in USD, and every practice market is quoted in USD, so no currency conversion is used.',
  'The same setup always gives the same result.',
];

const REAL_DATA_NOTES: readonly string[] = [
  'Data: real past prices from your own file or provider, labelled with their source. Trades and the account are simulated and are never real account performance.',
  'Survivorship bias: this is one market you chose, and it is still trading. Markets that were delisted, merged or dropped are missing, which tends to make past results look better than a fair test would.',
  'Real past prices are used as they are, with the practice market’s teaching-example contract terms and costs. Splits, dividends and futures rollovers are not adjusted for. Past results do not show what will happen next.',
];

/** The conventions shown with a run: the data and survivorship notes depend on whether the data was simulated. */
export function conventionsFor(origin: string): readonly string[] {
  return origin === 'simulated' ? BACKTEST_CONVENTIONS : [...REAL_DATA_NOTES, ...BACKTEST_CONVENTIONS.filter((c) => c !== SIMULATED_SURVIVORSHIP && c !== SIMULATED_DATA_NOTE)];
}

/** JSON with object keys sorted, so equal inputs always hash the same. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}

/** Costs written the same way whatever was typed ("0.00010" and "1e-4" are both "0.0001"). */
export function normaliseCosts(c: BacktestCosts): BacktestCosts {
  const n = (v: string) => {
    try {
      return dec(v).toString();
    } catch {
      return v;
    }
  };
  return { spread: n(c.spread), slippage: n(c.slippage), commissionPerSide: n(c.commissionPerSide), swapLong: n(c.swapLong), swapShort: n(c.swapShort) };
}

/** What identifies a run: engine version, fill rule, rules, data, capital, costs and split. */
export function setupInputs(setup: BacktestSetup): unknown {
  return {
    engineVersion: ENGINE_VERSION,
    limitRule: DEFAULT_LIMIT_RULE,
    definition: setup.definition,
    dataset: setup.dataset.spec,
    capital: setup.capital.toString(),
    costs: normaliseCosts(setup.costs),
    split: setup.split,
  };
}

export const inputHash = (setup: BacktestSetup): string => sha256(canonicalJson(setupInputs(setup)));

interface Bounds {
  readonly label: string;
  readonly from: number;
  readonly to: number;
}

function splitBounds(s: BacktestState): Bounds[] {
  const split = s.setup.split;
  const last = s.setup.dataset.candles.length - 1;
  const span = last - s.warmup;
  if (split.kind === 'holdout') {
    const cut = s.warmup + Math.floor((span * split.inSamplePercent) / 100);
    return [
      { label: 'In-sample', from: s.warmup, to: cut },
      { label: 'Out-of-sample', from: cut + 1, to: last },
    ];
  }
  if (split.kind === 'walk_forward') {
    const size = span / split.folds;
    return Array.from({ length: split.folds }, (_v, k) => ({
      label: `Block ${k + 1} of ${split.folds}`,
      from: s.warmup + Math.floor(k * size) + (k === 0 ? 0 : 1),
      to: k === split.folds - 1 ? last : s.warmup + Math.floor((k + 1) * size),
    }));
  }
  return [];
}

/** Each part counts only trades lying wholly inside it, from signal to exit; trades crossing a boundary are left out of all parts. */
function splitParts(s: BacktestState, trades: readonly BacktestTrade[]): { parts: SplitPart[]; excluded: number } {
  const bounds = splitBounds(s);
  if (bounds.length === 0) return { parts: [], excluded: 0 };
  const inside = (t: BacktestTrade, b: Bounds) => t.signalIndex >= b.from && t.exitIndex <= b.to;
  const parts = bounds.map((b) => ({ label: b.label, fromIndex: b.from, toIndex: b.to, ...tradeStats(trades.filter((t) => inside(t, b))) }));
  const excluded = trades.filter((t) => !bounds.some((b) => inside(t, b))).length;
  return { parts, excluded };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function splitWarnings(s: BacktestState, split: readonly SplitPart[], excluded: number, context: RunContext): string[] {
  const out: string[] = [];
  const kind = s.setup.split.kind;
  if (kind === 'none') {
    out.push('No out-of-sample test: every candle was used at once. Use a holdout or period-block split to see whether results hold up.');
    return out;
  }
  const [inSample, outSample] = split;
  if (kind === 'holdout' && inSample && outSample) {
    if ((inSample.expectancyR ?? 0) > 0 && (outSample.expectancyR ?? 0) <= 0) {
      out.push('The result did not hold up out of sample: positive in-sample, not positive out-of-sample. That is a common sign of rules fitted to one stretch of data.');
    }
    if (outSample.trades < SMALL_SAMPLE) out.push(`Only ${outSample.trades} out-of-sample trades: too few to confirm anything.`);
  }
  if (kind === 'walk_forward' && split.length > 0) {
    const positive = split.filter((p) => (p.expectancyR ?? 0) > 0).length;
    if (positive < split.length / 2) out.push(`Only ${positive} of ${split.length} blocks had a positive average result: the outcome depends heavily on which period you look at.`);
    const small = split.filter((p) => p.trades < SMALL_SAMPLE);
    if (small.length > 0) out.push(`Small samples in ${small.map((p) => `${p.label.toLowerCase()} (${p.trades})`).join(', ')}: fewer than ${SMALL_SAMPLE} trades in a block can be mostly luck.`);
  }
  if (excluded > 0) out.push(`${plural(excluded, 'trade crossed', 'trades crossed')} a split boundary and ${excluded === 1 ? 'is' : 'are'} left out of every part (still counted in the totals).`);
  if (context.otherVersionsWithOutOfSample > 0) {
    out.push(
      `Out-of-sample results have already been shown for ${plural(context.otherVersionsWithOutOfSample, 'other version', 'other versions')} of this strategy on this data. Once you have changed rules after seeing them, it is no longer an untouched test; use a new seed for a fair one.`,
    );
  }
  return out;
}

function warnings(s: BacktestState, trades: readonly BacktestTrade[], split: readonly SplitPart[], excluded: number, context: RunContext): string[] {
  const out: string[] = [];
  if (trades.length === 0) out.push('No trades: the rules never triggered on this data, so there is nothing to judge.');
  else if (trades.length < SMALL_SAMPLE) {
    out.push(`Small sample: ${plural(trades.length, 'trade', 'trades')}. Results from fewer than ${SMALL_SAMPLE} trades can be mostly luck.`);
  }
  if (context.versionsTried >= MANY_VERSIONS) {
    out.push(`You have tried ${context.versionsTried} versions of this strategy. The more versions are tried on the same data, the more likely the best one only fits that data (overfitting). Test it on new data before trusting it.`);
  }
  out.push(...splitWarnings(s, split, excluded, context));
  if (missingCosts(s.setup.costs)) out.push('Some costs are set to zero. Real trading always has a spread and usually commission or slippage, so these results flatter the rules.');
  const skipped = Object.values(s.skipped).reduce((a, b) => a + (b ?? 0), 0);
  if (skipped > 0) out.push(`${skipped} signal${skipped === 1 ? ' was' : 's were'} not traded (see "Signals not traded").`);
  out.push(...s.dataCheck.warnings);
  return out;
}

/** The report for a finished (or stopped) backtest. */
export function backtestResult(s: BacktestState, context: RunContext = FIRST_RUN): BacktestResult {
  const trades = backtestTrades(s);
  const metrics = backtestMetrics(trades, s.equity, s.setup.capital, s.candlesInMarket);
  const { parts: split, excluded } = splitParts(s, trades);
  const byRegime = regimeRows(trades);
  const fingerprint = sha256(canonicalJson({ metrics, trades: trades.map((t) => [t.entryIndex, t.exitIndex, t.net.toString()]) }));
  return {
    resultSchemaVersion: RESULT_SCHEMA_VERSION,
    engineVersion: ENGINE_VERSION,
    inputHash: inputHash(s.setup),
    fingerprint,
    dataLabel: s.setup.dataset.label,
    dataDescription: s.setup.dataset.description,
    candles: s.setup.dataset.candles.length,
    warmup: s.warmup,
    metrics,
    byRegime,
    split,
    splitExcluded: excluded,
    equityCurve: downsampleLast(s.equity, CURVE_POINTS),
    drawdownCurve: downsampleMax(drawdownSeries(s.equity), CURVE_POINTS),
    trades,
    skipped: s.skipped,
    dataCheck: s.dataCheck,
    warnings: warnings(s, trades, split, excluded, context),
    conventions: conventionsFor(s.setup.dataset.origin),
  };
}

/** Runs to the end in one go (tests and short reruns such as parameter sensitivity). */
export function runBacktest(setup: BacktestSetup, context: RunContext = FIRST_RUN): Result<BacktestResult, AppError> {
  const created = createBacktest(setup);
  if (!created.ok) return created;
  let state = created.value;
  while (!state.done) state = stepBacktest(state, 5000);
  return ok(backtestResult(state, context));
}
