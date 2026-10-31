import type { ProgressFacts } from '../records';

export const at = (n: number): string => new Date(Date.UTC(2026, 9, 1) + n * 3_600_000).toISOString();

export const emptyFacts: ProgressFacts = {
  answers: [],
  retests: [],
  drills: [],
  checkedTrades: [],
  replays: [],
  labs: [],
  strategyExercises: [],
  psych: [],
  backtests: [],
  passedCheckpointModuleIds: new Set(),
  masteredLessonIds: new Set(),
  completedStrategyIds: new Set(),
  tradersStudied: 0,
  completedMtTaskIds: new Set(),
  classDates: [],
  program: null,
  timeZone: 'UTC',
};

export const facts = (over: Partial<ProgressFacts>): ProgressFacts => ({ ...emptyFacts, ...over });
