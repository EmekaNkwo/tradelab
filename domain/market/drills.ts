import { positionSize } from '../calculators/forex';
import type { Candle } from '../models/markets';
import { atr, sma } from './indicators';
import { createRng } from './random';
import { generateScenario, type Scenario, type ScenarioKind } from './scenarios';

/**
 * Chart drills and "What would you do?" (spec §13.4). The learner commits to
 * an answer (or to skipping) before anything more is revealed, then gets
 * feedback that explains the reasoning, not just right or wrong. Drills are
 * built from simulated scenarios with a fixed seed, so each one is repeatable.
 */

export const DRILL_KINDS = ['find_the_trend', 'breakout_or_fake', 'where_is_the_stop', 'size_it'] as const;
export type DrillKind = (typeof DRILL_KINDS)[number];

export interface DrillOption {
  readonly id: string;
  readonly text: string;
}

export interface Drill {
  readonly kind: DrillKind;
  readonly seed: number;
  readonly prompt: string;
  readonly scenario: Scenario;
  /** Candles shown before the learner answers; the rest are revealed afterwards. */
  readonly shownBefore: number;
  readonly options: readonly DrillOption[];
  readonly correctOptionId: string;
  /** Choices that are reasonable but neither right nor wrong (e.g. waiting for more evidence). */
  readonly neutralOptionIds: readonly string[];
  /** Feedback lines for each option: why it is or is not the best choice. */
  readonly feedback: Readonly<Record<string, readonly string[]>>;
  /** What the revealed candles showed, for drills that reveal an outcome. */
  readonly outcome: string | null;
}

export interface DrillResult {
  readonly correct: boolean;
  /** A valid choice that is not scored either way. */
  readonly neutral: boolean;
  readonly feedback: readonly string[];
}

export function gradeDrill(drill: Drill, optionId: string): DrillResult {
  return { correct: optionId === drill.correctOptionId, neutral: drill.neutralOptionIds.includes(optionId), feedback: drill.feedback[optionId] ?? [] };
}

/** Whether a stored answer was a neutral choice; neutral answers are left out of drill scores. */
export function isNeutralAnswer(kind: string, optionId: string): boolean {
  return kind === 'breakout_or_fake' && optionId === 'wait';
}

/**
 * The drill's own random stream. It must not share the scenario's stream:
 * the scenario's first draw sets the break direction, and reusing it made the
 * answer readable from the direction alone.
 */
const drillRng = (seed: number) => createRng((seed ^ 0x5bd1e995) >>> 0);

const closes = (candles: readonly Candle[]) => candles.map((c) => Number(c.close));
const fmt = (n: number, dp = 5) => n.toFixed(dp);
const pct = (from: number, to: number) => `${(((to - from) / from) * 100).toFixed(2)}%`;

function findTheTrend(seed: number): Drill {
  const rng = drillRng(seed);
  const kinds: readonly ScenarioKind[] = ['strong_uptrend', 'downtrend', 'range'];
  const kind = kinds[rng.int(0, kinds.length - 1)] as ScenarioKind;
  const scenario = generateScenario({ kind, seed, count: 120 });
  const c = closes(scenario.candles);
  const first = c[0] as number;
  const last = c[c.length - 1] as number;
  const ma = sma(c, 20);
  const maStart = ma[19] as number;
  const maEnd = ma[ma.length - 1] as number;
  const evidence = [
    `Over the chart, price went from ${fmt(first)} to ${fmt(last)} (${pct(first, last)}).`,
    `The 20-candle average moved from ${fmt(maStart)} to ${fmt(maEnd)}.`,
  ];
  const answer = scenario.truth.overallTrend;
  const why: Record<string, string> = {
    up: 'An uptrend makes higher highs and higher lows, and its average slopes up.',
    down: 'A downtrend makes lower highs and lower lows, and its average slopes down.',
    sideways: 'A sideways market keeps returning to the middle of a range; its average stays roughly flat.',
  };
  const feedbackFor = (id: string) => [id === answer ? 'Yes.' : `Not quite: this one is ${answer === 'sideways' ? 'sideways' : `${answer}trend`}.`, why[answer] as string, ...evidence];
  return {
    kind: 'find_the_trend',
    seed,
    prompt: 'What is the overall trend on this chart?',
    scenario,
    shownBefore: scenario.candles.length,
    options: [
      { id: 'up', text: 'Uptrend' },
      { id: 'down', text: 'Downtrend' },
      { id: 'sideways', text: 'Sideways (range)' },
    ],
    correctOptionId: answer,
    neutralOptionIds: [],
    feedback: { up: feedbackFor('up'), down: feedbackFor('down'), sideways: feedbackFor('sideways') },
    outcome: null,
  };
}

function breakoutOrFake(seed: number): Drill {
  const rng = drillRng(seed);
  const kind: ScenarioKind = rng.next() < 0.5 ? 'breakout' : 'false_breakout';
  const scenario = generateScenario({ kind, seed, count: 160 });
  const key = scenario.truth.keyIndex as number;
  const shownBefore = key + 3;
  const real = kind === 'breakout';
  const high = scenario.truth.rangeHigh as number;
  const low = scenario.truth.rangeLow as number;
  const last = Number(scenario.candles[scenario.candles.length - 1]?.close);
  const backInRange = last <= high && last >= low;
  const outcome = real
    ? `Price kept going: the last close was ${fmt(last)}, outside the earlier range of ${fmt(low)}–${fmt(high)}.`
    : `The move failed: price came back${backInRange ? ' into' : ' through'} the earlier range of ${fmt(low)}–${fmt(high)} and closed at ${fmt(last)}.`;
  const lesson =
    'Breakouts are easier to judge after the fact. Some traders wait for follow-through or a retest of the broken level: it gives up part of the move in exchange for more evidence before acting.';
  return {
    kind: 'breakout_or_fake',
    seed,
    prompt: 'Price has just left its range. Real breakout, fake, or would you wait?',
    scenario,
    shownBefore,
    options: [
      { id: 'real', text: 'Real breakout: it will keep going' },
      { id: 'fake', text: 'Fake: it will come back' },
      { id: 'wait', text: 'Wait for more evidence' },
    ],
    correctOptionId: real ? 'real' : 'fake',
    neutralOptionIds: ['wait'],
    feedback: {
      real: [real ? 'It did keep going.' : 'This one failed.', outcome, lesson],
      fake: [real ? 'This one kept going.' : 'It did fail.', outcome, lesson],
      wait: ['Waiting is a valid plan, not a mistake, so it is not scored either way. You act on more evidence instead of a guess.', outcome, lesson],
    },
    outcome,
  };
}

function whereIsTheStop(seed: number): Drill {
  const scenario = generateScenario({ kind: 'pullback', seed, count: 100 });
  const shownBefore = (scenario.truth.keyIndex as number) + Math.round(100 * 0.2);
  const shown = scenario.candles.slice(0, shownBefore);
  const entry = Number(shown[shown.length - 1]?.close);
  const recent = shown.slice(-20);
  const swingLow = Math.min(...recent.map((c) => Number(c.low)));
  const vol = atr(shown.map((c) => ({ high: Number(c.high), low: Number(c.low), close: Number(c.close) })), 14).at(-1) as number;
  const options = [
    { id: 'tight', text: `Just under the entry, at ${fmt(entry - vol * 0.2)}` },
    { id: 'swing', text: `Below the recent swing low, at ${fmt(swingLow - vol * 0.3)}` },
    { id: 'none', text: 'No stop: I will watch it' },
  ];
  const context = `Average true range (14) is about ${fmt(vol)}, so normal candles move roughly that much.`;
  return {
    kind: 'where_is_the_stop',
    seed,
    prompt: `You plan to buy at ${fmt(entry)} because you think the pullback has ended and the uptrend is resuming. Which stop fits that idea?`,
    scenario,
    shownBefore,
    options,
    correctOptionId: 'swing',
    neutralOptionIds: [],
    feedback: {
      tight: ['Probably too tight: it is only about a fifth of a normal candle away, so ordinary movement could close the trade before the idea is tested.', context],
      swing: [
        'This fits the idea best. If price breaks below the swing low, the pullback idea is no longer true, so the trade ends there. Other methods exist; what matters is that the stop marks where your idea is wrong.',
        context,
        'Then size the trade so this distance risks only your planned amount.',
      ],
      none: ['A trade without a stop has no defined risk. A gap or fast move can cost far more than planned.', context],
    },
    outcome: null,
  };
}

function sizeIt(seed: number): Drill {
  const rng = drillRng(seed);
  const balance = [500, 1000, 2000, 5000, 10000][rng.int(0, 4)] as number;
  const stopPips = rng.int(10, 40);
  const r = positionSize({ balance: String(balance), riskPercent: '1', stopPips: String(stopPips), pipValuePerLot: '10' });
  const lots = r.ok ? r.value.lots : null;
  const right = lots ? lots.toFixed(2) : '0.00';
  const tooBig = lots ? lots.times(10).toFixed(2) : '0.10';
  const wrong = lots ? lots.plus('0.01').toFixed(2) : '0.01';
  const risk = (balance * 0.01).toFixed(2);
  const riskOf = (lotsText: string) => {
    const amount = Number(lotsText) * stopPips * 10;
    return `${amount.toFixed(2)} USD (${((amount / balance) * 100).toFixed(1)}% of the account)`;
  };
  const scenario = generateScenario({ kind: 'range', seed, count: 60 });
  const working = `1% of ${balance} is ${risk}. A ${stopPips}-pip stop at 10 per pip per lot costs ${stopPips * 10} per lot. ${risk} ÷ ${stopPips * 10} = ${right} lots after rounding down.`;
  return {
    kind: 'size_it',
    seed,
    prompt: `Account ${balance} USD, risk 1%, stop ${stopPips} pips on EUR/USD (10 USD per pip per lot). What size?`,
    scenario,
    shownBefore: scenario.candles.length,
    options: [
      { id: 'right', text: `${right} lots` },
      { id: 'round_up', text: `${wrong} lots` },
      { id: 'ten_x', text: `${tooBig} lots` },
    ],
    correctOptionId: 'right',
    neutralOptionIds: [],
    feedback: {
      right: ['Yes.', working],
      round_up: [`Close, but ${wrong} lots risks ${riskOf(wrong)}, above the 1% limit. Round size down, never up.`, working],
      ten_x: [`That risks ${riskOf(tooBig)} on one trade.`, working],
    },
    outcome: null,
  };
}

/** Seeded shuffle, so the right answer is not always in the same place. Option ids stay stable. */
function shuffled(drill: Drill): Drill {
  const rng = createRng((drill.seed ^ 0x27d4eb2d) >>> 0);
  const options = [...drill.options];
  for (let i = options.length - 1; i > 0; i -= 1) {
    const j = rng.int(0, i);
    [options[i], options[j]] = [options[j] as DrillOption, options[i] as DrillOption];
  }
  return { ...drill, options };
}

function build(kind: DrillKind, seed: number): Drill {
  switch (kind) {
    case 'find_the_trend':
      return findTheTrend(seed);
    case 'breakout_or_fake':
      return breakoutOrFake(seed);
    case 'where_is_the_stop':
      return whereIsTheStop(seed);
    case 'size_it':
      return sizeIt(seed);
  }
}

export function createDrill(kind: DrillKind, seed: number): Drill {
  return shuffled(build(kind, seed));
}
