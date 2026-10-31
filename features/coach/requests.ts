import { curatedReply } from '../../domain/coach/curated';
import type { BacktestContext, CoachRequest, ConceptContext, JournalContext } from '../../domain/coach/types';
import { processScore } from '../../domain/journal/processScore';
import { pickLevelledText, type GlossaryEntry } from '../../domain/models/content';
import { JOURNAL_SOURCE_LABELS, type JournalEntry } from '../../domain/models/journal';
import { ruleShortName } from '../../domain/risk/rules';
import type { ContentRepository } from '../../data';
import { dec } from '../../shared/decimal';
import type { ExplanationLevel } from '../../shared/types';
import { describeStrategy, METRIC_ROWS, type BacktestRun, type StrategyVersion } from '../backtest';

/**
 * Builds coach requests from the app's own records. Every fact here (rule
 * breaks, the process score, risk, metrics, warnings) is computed by tested
 * code; the coach only ever receives it.
 */

const stripLinks = (text: string) => text.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2').replace(/\[\[([^\]]+)\]\]/g, '$1');

/** The glossary entry for an id, term or alias (case-insensitive). */
export function findGlossaryEntry(content: Pick<ContentRepository, 'glossary' | 'glossaryEntry'>, query: string): GlossaryEntry | null {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return null;
  return content.glossaryEntry(q) ?? content.glossary().find((g) => g.term.toLowerCase() === q || g.aliases.some((a) => a.toLowerCase() === q)) ?? null;
}

export function conceptContext(content: Pick<ContentRepository, 'glossary' | 'glossaryEntry' | 'modules' | 'lesson'>, query: string, level: ExplanationLevel): ConceptContext {
  const g = findGlossaryEntry(content, query);
  if (!g) return { term: query.trim().slice(0, 80), definition: null, example: null, related: [], lessonTitles: [] };
  const lessonTitles = content
    .modules()
    .flatMap((m) => m.lessonIds)
    .map((id) => content.lesson(id))
    .filter((l): l is NonNullable<typeof l> => l !== null && JSON.stringify(l).includes(`[[${g.id}`))
    .slice(0, 3)
    .map((l) => l.title);
  return {
    term: g.term,
    definition: stripLinks(pickLevelledText(g.definition, level)),
    example: g.example ? stripLinks(g.example) : null,
    related: g.related.map((id) => content.glossaryEntry(id)?.term ?? id),
    lessonTitles,
  };
}

export function journalContext(e: JournalEntry, riskLimitPercent: number, strategyRules: readonly string[] | null): JournalContext {
  const scored = processScore(e, riskLimitPercent);
  const riskPercent = e.plannedRisk && e.equityAtEntry && dec(e.equityAtEntry).gt(0) ? dec(e.plannedRisk).div(e.equityAtEntry).times(100).toDecimalPlaces(2).toString() : null;
  const failedChecks = scored.checks.filter((c) => c.passed === false && c.id === 'risk_within_limit').map((c) => `${c.label}: no`);
  const emotions = e.emotion ? [`confidence ${e.emotion.confidence}/5`, `stress ${e.emotion.stress}/5`, `patience ${e.emotion.patience}/5`, ...(e.emotion.feeling ? [e.emotion.feeling] : [])] : [];
  return {
    instrument: e.instrument,
    side: e.direction,
    source: JOURNAL_SOURCE_LABELS[e.source],
    hadStop: e.stop !== null && e.stop.trim() !== '',
    hadTarget: e.target !== null && e.target.trim() !== '',
    plannedRiskPercent: riskPercent,
    riskLimitPercent: String(riskLimitPercent),
    ruleBreaks: [...e.ruleViolations.map(ruleShortName), ...failedChecks],
    processScorePercent: scored.score === null ? null : Math.round(scored.score * 100),
    rationale: [e.entryRationale, e.exitRationale].filter((t): t is string => !!t && t.trim() !== '').join(' / '),
    review: e.review ? [e.review.thesis, e.review.planVsActual, e.review.lesson, e.review.nextGoal].filter((t) => t.trim() !== '').join(' / ') : '',
    emotions,
    strategyRules,
  };
}

export function backtestContext(run: BacktestRun, version: StrategyVersion | null, includeRules: boolean): BacktestContext {
  const r = run.result;
  return {
    strategyName: version ? `${version.name} v${version.version}` : 'This strategy',
    dataLabel: r.dataLabel,
    metrics: METRIC_ROWS.slice(0, 10).map((m) => ({ label: m.label, value: m.format(r.metrics) })),
    warnings: r.warnings.slice(0, 10),
    strategyRules: includeRules && version ? describeStrategy(version.definition) : null,
  };
}

export const conceptRequest = (concept: ConceptContext, level: ExplanationLevel, question: string): CoachRequest => ({ task: 'explain_concept', level, concept, question });
export const practiceRequest = (concept: ConceptContext, level: ExplanationLevel): CoachRequest => ({ task: 'extra_practice', level, concept });

export { curatedReply };
