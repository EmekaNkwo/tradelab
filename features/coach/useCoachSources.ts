import { useMemo } from 'react';
import type { CoachRequest } from '../../domain/coach/types';
import type { ExplanationLevel } from '../../shared/types';
import { useContainer } from '../app';
import { useMyStrategies, useRuns, type BacktestRun, type StrategyVersion } from '../backtest';
import { useJournalList, type JournalEntry } from '../journal';
import { useRiskRules } from '../paper';
import { useSettings } from '../settings';
import { backtestContext, conceptContext, conceptRequest, journalContext, practiceRequest } from './requests';

/** How many recent journal entries and runs the coach screen offers. */
export const COACH_PICK_LIMIT = 15;

/**
 * What the coach can be asked about: the learner's recent journal entries and
 * backtest runs, with request builders that attach only app-computed facts.
 * Strategy rules are attached only with strategy consent in cloud mode.
 */
export function useCoachSources() {
  const c = useContainer();
  const settings = useSettings();
  const journal = useJournalList(null);
  const runs = useRuns(null);
  const strategies = useMyStrategies();
  const rules = useRiskRules();
  const ready = settings.status === 'success';
  const level: ExplanationLevel = ready ? settings.data.explanationLevel : 'balanced';
  const shareRules = ready && settings.data.integrations.coach === 'cloud' && settings.data.integrations.coachConsent.strategies;
  const latest = useMemo(() => new Map<string, StrategyVersion>(strategies.status === 'success' ? strategies.data.map((s) => [s.strategyId, s]) : []), [strategies]);
  return {
    settings,
    level,
    entries: journal.status === 'success' ? journal.data.slice(0, COACH_PICK_LIMIT) : [],
    runs: runs.status === 'success' ? runs.data.slice(0, COACH_PICK_LIMIT) : [],
    strategyName: (r: BacktestRun) => latest.get(r.strategyId)?.name ?? 'Strategy',
    concept: (term: string, question: string): CoachRequest => conceptRequest(conceptContext(c.content, term, level), level, question.trim()),
    practice: (term: string): CoachRequest => practiceRequest(conceptContext(c.content, term, level), level),
    journal: (e: JournalEntry): CoachRequest => ({ task: 'review_journal', level, journal: journalContext(e, rules.maxRiskPerTradePercent, null) }),
    backtest: (r: BacktestRun): CoachRequest => {
      const v = latest.get(r.strategyId);
      return { task: 'explain_backtest', level, backtest: backtestContext(r, v && v.version === r.version ? v : null, shareRules) };
    },
  };
}
