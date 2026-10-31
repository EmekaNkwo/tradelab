import type { UtcIso } from '../../shared/time';
import type { Timeframe } from './markets';

/** One answered chart drill (spec §13.4). The seed recreates the exact chart. */
export interface DrillAttempt {
  readonly id: string;
  readonly kind: string;
  readonly seed: number;
  readonly optionId: string;
  readonly correct: boolean;
  readonly answeredAt: UtcIso;
}

/** A closed replay trade as stored: decimals are kept as exact strings. */
export interface StoredReplayTrade {
  readonly side: 'buy' | 'sell';
  readonly units: string;
  readonly entry: string;
  readonly exit: string;
  readonly initialStop: string | null;
  readonly openedAt: number;
  readonly closedAt: number;
  readonly reason: 'stop_loss' | 'take_profit' | 'manual' | 'end_of_data';
  readonly profit: string;
}

/** A finished replay. Every run is a new record; replays never overwrite earlier attempts (spec §13.2). */
export interface ReplayAttempt {
  readonly id: string;
  readonly scenarioKind: string;
  readonly seed: number;
  readonly timeframe: Timeframe;
  readonly startingBalance: string;
  readonly finalBalance: string;
  readonly trades: readonly StoredReplayTrade[];
  /** Share of trades with a stop from the start and risk within the limit; null with no trades. */
  readonly processScore: number | null;
  /** Times the learner stepped back during the run (a second look that live trading does not allow). */
  readonly stepBacks: number;
  readonly note: string | null;
  readonly startedAt: UtcIso;
  readonly finishedAt: UtcIso;
}
