import { LEVEL_NAMES, type Strategy } from '../../features/strategies';
import { STUDY_MARKET_LABELS } from '../../shared/types';
import type { StrategyChip } from './StrategyCard';

export interface ChipFacts {
  /** The page links a Replay scenario and Replay is switched on. */
  readonly replay: boolean;
  /** The page has a builder template and the Backtesting Lab is switched on. */
  readonly backtest: boolean;
  readonly completed: boolean;
  /** The page covers a market the learner chose (Settings → What I want to learn). */
  readonly forYou?: boolean;
}

/**
 * A library card's chips, only from the content and what is switched on: For you (when it covers a market the learner chose), level, markets, then Replay and Backtest
 * when the page offers them, and Completed from the learner's own record. Nothing else is claimed.
 */
export function strategyChips(s: Pick<Strategy, 'level' | 'markets'>, facts: ChipFacts): readonly StrategyChip[] {
  return [
    ...(facts.forYou ? [{ label: 'For you', tone: 'brand' as const }] : []),
    { label: LEVEL_NAMES[s.level], tone: 'brand' as const },
    ...s.markets.map((m) => ({ label: STUDY_MARKET_LABELS[m], tone: 'neutral' as const })),
    ...(facts.replay ? [{ label: 'Replay', tone: 'neutral' as const }] : []),
    ...(facts.backtest ? [{ label: 'Backtest', tone: 'neutral' as const }] : []),
    ...(facts.completed ? [{ label: 'Completed', tone: 'done' as const }] : []),
  ];
}
