import { CURATED_LABEL, type BacktestContext, type CoachReply, type CoachRequest, type ConceptContext, type JournalContext } from './types';

/**
 * The always-available coach: fixed templates over the app's own content
 * and the facts computed by its code. Deterministic and offline. It is the
 * fallback whenever the cloud coach is off, unavailable or fails.
 */

function conceptParagraphs(c: ConceptContext): string[] {
  if (!c.definition) {
    return [
      `“${c.term}” is not in the app’s glossary, so there is no curated explanation for it.`,
      'Try the glossary search with a shorter or more common word, or look for it in the lessons. If it is a trading term from outside the app, check what it means in a reputable source before relying on it.',
    ];
  }
  return [
    c.definition,
    ...(c.example ? [`Example: ${c.example}`] : []),
    ...(c.related.length > 0 ? [`Related ideas: ${c.related.join(', ')}.`] : []),
    ...(c.lessonTitles.length > 0 ? [`Lessons that use it: ${c.lessonTitles.join('; ')}.`] : []),
  ];
}

function practiceParagraphs(c: ConceptContext): string[] {
  return [
    `Practice prompts for “${c.term}”. Answer them in your own words; they are not graded.`,
    `1. Explain ${c.term} to a friend who has never traded, in two or three sentences.`,
    `2. Make up a fictional example where ${c.term} matters, with numbers you choose yourself.`,
    `3. How could a beginner misunderstand ${c.term}, and what mistake might that lead to?`,
    ...(c.related.length > 0 ? [`4. How is ${c.term} different from ${c.related[0]}?`] : []),
    'Then compare your answers with the glossary entry and the lesson that uses it.',
  ];
}

function journalReply(j: JournalContext): { paragraphs: string[]; facts: string[] } {
  const facts = [
    j.ruleBreaks.length > 0 ? `Rule breaks found by the app: ${j.ruleBreaks.join('; ')}.` : 'The app found no broken rules on this trade.',
    ...(j.processScorePercent !== null ? [`Process score (from the app’s rubric): ${j.processScorePercent}%.`] : []),
    j.plannedRiskPercent !== null ? `Planned risk: ${j.plannedRiskPercent}% of the account (your limit is ${j.riskLimitPercent}%).` : 'Planned risk could not be worked out (no stop, or no size).',
  ];
  const missing = [
    ...(!j.hadStop ? ['a stop loss, so the possible loss was not defined before entry'] : []),
    ...(j.rationale.trim().length < 20 ? ['a written reason for the trade'] : []),
    ...(j.review.trim().length < 20 ? ['a review after the trade closed'] : []),
    ...(j.emotions.length === 0 ? ['how you felt before and during the trade'] : []),
  ];
  const paragraphs = [
    missing.length > 0 ? `Missing from this entry: ${missing.join('; ')}. Adding it makes the next review more useful.` : 'The entry has a stop, a reason, a review and your emotions noted, which is what a useful review needs.',
    'Questions to answer in your review:',
    '• Did the trade follow your written plan at entry, or did something else decide it?',
    '• If it worked out, would you take the same trade again for the same reasons? If it did not, was the process wrong or was it an acceptable loss?',
    '• What one thing will you do the same, or differently, next time?',
    'One trade says little about a strategy. Judge the process, not the result.',
  ];
  return { paragraphs, facts };
}

function backtestReply(b: BacktestContext): { paragraphs: string[]; facts: string[] } {
  const facts = [`Data: ${b.dataLabel}.`, ...b.metrics.map((m) => `${m.label}: ${m.value}`), ...b.warnings.map((w) => `Warning: ${w}`)];
  return {
    facts,
    paragraphs: [
      `This report describes how the rules of “${b.strategyName}” behaved on this data. It is not a forecast.`,
      'Read the warnings first: a small number of trades, many versions tried, or out-of-sample results already seen all make the numbers less trustworthy.',
      'Compare the in-sample and out-of-sample parts. Results that hold only in-sample were probably fitted to that data.',
      'Look at the drawdown as well as the return: could you have stuck with the rules through the worst stretch?',
      'Check the results by market condition. Rules that work in only one condition need a way to tell when that condition is present, which the rules may not have.',
    ],
  };
}

export function curatedReply(req: CoachRequest, fallbackReason: string | null = null): CoachReply {
  const base = { source: 'curated' as const, label: CURATED_LABEL, fallbackReason };
  switch (req.task) {
    case 'explain_concept':
      return { ...base, paragraphs: conceptParagraphs(req.concept), facts: [], ungraded: false };
    case 'extra_practice':
      return { ...base, paragraphs: practiceParagraphs(req.concept), facts: [], ungraded: true };
    case 'review_journal': {
      const r = journalReply(req.journal);
      return { ...base, ...r, ungraded: false };
    }
    case 'explain_backtest': {
      const r = backtestReply(req.backtest);
      return { ...base, ...r, ungraded: false };
    }
  }
}

/** Facts the app computed for this request, shown with any reply (curated or cloud). */
export function requestFacts(req: CoachRequest): readonly string[] {
  if (req.task === 'review_journal') return journalReply(req.journal).facts;
  if (req.task === 'explain_backtest') return backtestReply(req.backtest).facts;
  return [];
}
