import { SKILL_IDS, type SkillId } from '../models/progress';
import { countedRetests, isCleanTrade, latestAnswers, latestBy, newestFirst, share, type CheckedTradeRecord, type ProgressFacts } from './records';
import { DRILL_SKILLS, LAB_SKILLS, PSYCH_QUALITY_SCORE, PSYCH_SKILLS, REPLAY_SKILLS } from './skillMaps';

/**
 * Skill mastery (spec §23). Each skill gets up to five components, each 0–1,
 * or null when there is no evidence for it:
 *
 * - correctness (C, weight 0.35): share right of the latest counted answer to
 *   each question tagged with the skill (lesson checks, checkpoints, placement,
 *   strategy knowledge checks). An answer counts when it is the first attempt at
 *   the question or comes at least a day after the previous one, so retaking
 *   straight after the feedback changes nothing (`spacedAnswers`).
 * - application (A, 0.30): mean score of the recent practice items for the skill
 *   (the last APPLICATION_WINDOW of each kind): drills right or wrong, lab cases
 *   (latest attempt per case), strategy exercises, replay process scores, rule-
 *   checked trades (1 when clean: a stop, no rule broken, risk within the limit)
 *   and psychology answers (helpful 1, mixed 0.5, harmful 0). Hand-entered
 *   trades weigh half as much as paper trades, which the app checked itself.
 * - retention (T, 0.15): share right of the last RETENTION_WINDOW counted
 *   spaced re-tests: genuinely due, one per question per day (`countedRetests`).
 * - breadth (S, 0.10): min(1, good contexts ÷ BREADTH_TARGET), where a context
 *   (a module or strategy page, drill kind, replay condition or lab case) is
 *   good when its items average at least GOOD_CONTEXT.
 * - reasoning (R, 0.10), for execution discipline: share of the recent
 *   rule-checked trades with a substantial entry reason and journal review
 *   (hand-entered trades at half weight).
 *
 * Mastery is the weighted mean over the components present (weights are
 * renormalised). Breadth and reasoning only adjust a score built from answers,
 * practice or re-tests; on their own they give no score. Time spent is never
 * an input. Item counts for the level count distinct questions and items.
 */

export const MASTERY_WEIGHTS = { correctness: 0.35, application: 0.3, retention: 0.15, breadth: 0.1, reasoning: 0.1 } as const;
export type MasteryComponent = keyof typeof MASTERY_WEIGHTS;

export const APPLICATION_WINDOW = 20;
export const RETENTION_WINDOW = 20;
export const BREADTH_TARGET = 3;
export const GOOD_CONTEXT = 0.6;
/** Below this many evidence items a skill is "early", whatever the score. */
export const EARLY_ITEMS = 5;
export const SECURE_ITEMS = 10;
export const SECURE_SCORE = 0.8;
export const PRACTISING_SCORE = 0.6;

/** Skills where rule-checked trades count as evidence. */
export const TRADE_SKILLS: readonly SkillId[] = ['execution_discipline', 'risk_management'];
/** Skills where journal reasoning is evidence. A written entry reason says little about psychology, so it is not used there. */
export const REASONING_SKILLS: readonly SkillId[] = ['execution_discipline'];
/** Weight of a hand-entered trade relative to a paper trade the app checked. */
export const MANUAL_TRADE_WEIGHT = 0.5;

export type MasteryLevel = 'no_evidence' | 'early' | 'developing' | 'practising' | 'secure';

export const MASTERY_LEVEL_LABELS: Readonly<Record<MasteryLevel, string>> = {
  no_evidence: 'Not started',
  early: 'Too early to tell',
  developing: 'Developing',
  practising: 'Practising',
  secure: 'Secure',
};

/** Shown wherever a level or award could be read as a verdict on trading. */
export const READINESS_DISCLAIMER = 'None of this shows you are ready to trade real money.';

/** What a level means, in words; the "Secure" text carries the readiness disclaimer. */
export const MASTERY_LEVEL_NOTES: Readonly<Record<MasteryLevel, string>> = {
  no_evidence: 'No answers or practice on this skill yet.',
  early: 'Fewer than five pieces of evidence, so no score is shown yet.',
  developing: 'Some evidence, with results still below 60%.',
  practising: 'Results at 60% or better so far.',
  secure: `At least 80% across ten or more pieces of evidence of two kinds. This is about understanding and process in practice; ${READINESS_DISCLAIMER.charAt(0).toLowerCase()}${READINESS_DISCLAIMER.slice(1)}`,
};

/** Whether a level has enough evidence to show its score as a percentage. */
export const showsScore = (m: Pick<SkillMastery, 'level' | 'score'>): boolean => m.score !== null && m.level !== 'no_evidence' && m.level !== 'early';

export interface SkillEvidence {
  readonly answers: number;
  readonly exercises: number;
  readonly retests: number;
  readonly trades: number;
}

export interface SkillMastery {
  readonly skill: SkillId;
  /** 0–1, or null without evidence. */
  readonly score: number | null;
  readonly level: MasteryLevel;
  readonly components: Readonly<Record<MasteryComponent, number | null>>;
  readonly evidence: SkillEvidence;
}

interface Item {
  readonly context: string;
  readonly score: number;
  /** 1 for most evidence; less for evidence the app could not check itself. */
  readonly weight: number;
}

const item = (context: string, score: number, weight = 1): Item => ({ context, score, weight });
const tradeWeight = (t: CheckedTradeRecord) => (t.appVerified ? 1 : MANUAL_TRADE_WEIGHT);

const mean = (xs: readonly number[]): number | null => (xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length);
const weightedMean = (items: readonly Item[]): number | null => {
  const total = items.reduce((s, i) => s + i.weight, 0);
  return total === 0 ? null : items.reduce((s, i) => s + i.score * i.weight, 0) / total;
};
const weightOf = (items: readonly Item[]): number => items.reduce((s, i) => s + i.weight, 0);
const recent = <T extends { readonly at: string }>(items: readonly T[]): T[] => newestFirst(items).slice(0, APPLICATION_WINDOW);
const has = (skills: readonly SkillId[], skill: SkillId) => skills.includes(skill);

function applicationItems(facts: ProgressFacts, skill: SkillId): Item[] {
  const drills = recent(facts.drills.filter((d) => has(DRILL_SKILLS[d.kind] ?? [], skill))).map((d) => item(`drill:${d.kind}`, d.correct ? 1 : 0));
  const labs = recent(latestBy(facts.labs, (l) => `${l.kind}:${l.refId}`).filter((l) => has(LAB_SKILLS[l.kind], skill))).map((l) => item(`lab:${l.refId}`, l.score));
  const exercises = recent(latestBy(facts.strategyExercises, (e) => e.strategyId).filter((e) => has(e.skills, skill))).map((e) => item(`strategy:${e.strategyId}`, e.score));
  const replays = has(REPLAY_SKILLS, skill) ? recent(facts.replays.filter((r) => r.processScore !== null)).map((r) => item(`replay:${r.scenarioKind}`, r.processScore ?? 0)) : [];
  const trades = has(TRADE_SKILLS, skill) ? recent(facts.checkedTrades).map((t) => item('trades', isCleanTrade(t) ? 1 : 0, tradeWeight(t))) : [];
  const psych = has(PSYCH_SKILLS, skill) ? recent(latestBy(facts.psych, (p) => p.scenarioId)).map((p) => item(`psych:${p.scenarioId}`, PSYCH_QUALITY_SCORE[p.quality])) : [];
  return [...drills, ...labs, ...exercises, ...replays, ...trades, ...psych];
}

function breadth(items: readonly Item[]): number | null {
  if (items.length === 0) return null;
  const byContext = new Map<string, number[]>();
  for (const i of items) byContext.set(i.context, [...(byContext.get(i.context) ?? []), i.score]);
  const good = [...byContext.values()].filter((scores) => (mean(scores) ?? 0) >= GOOD_CONTEXT).length;
  return Math.min(1, good / BREADTH_TARGET);
}

export function levelFor(score: number | null, items: number, evidenceKinds: number): MasteryLevel {
  if (score === null || items === 0) return 'no_evidence';
  if (items < EARLY_ITEMS) return 'early';
  if (score >= SECURE_SCORE && items >= SECURE_ITEMS && evidenceKinds >= 2) return 'secure';
  return score >= PRACTISING_SCORE ? 'practising' : 'developing';
}

export function skillMastery(facts: ProgressFacts, skill: SkillId): SkillMastery {
  const answers = latestAnswers(facts.answers.filter((a) => has(a.skills, skill)));
  const answerItems = answers.map((a) => item(`in:${a.contextId}`, a.correct ? 1 : 0));
  const applied = applicationItems(facts, skill);
  const retests = newestFirst(countedRetests(facts).filter((r) => has(r.skills, skill))).slice(0, RETENTION_WINDOW);
  const reasoning = has(REASONING_SKILLS, skill) ? recent(facts.checkedTrades).map((t) => item('reasoning', t.hasRationale && t.reviewed ? 1 : 0, tradeWeight(t))) : [];
  const components: Record<MasteryComponent, number | null> = {
    correctness: share(answers.filter((a) => a.correct).length, answers.length),
    application: weightedMean(applied),
    retention: share(retests.filter((r) => r.correct).length, retests.length),
    breadth: breadth([...answerItems, ...applied]),
    reasoning: weightedMean(reasoning),
  };
  const present = (Object.keys(MASTERY_WEIGHTS) as MasteryComponent[]).filter((k) => components[k] !== null);
  const totalWeight = present.reduce((s, k) => s + MASTERY_WEIGHTS[k], 0);
  // Breadth and reasoning are not evidence of skill on their own; they only adjust a score from answers, practice or re-tests.
  const evidenceBearing = present.filter((k) => k !== 'breadth' && k !== 'reasoning');
  const score = evidenceBearing.length === 0 ? null : present.reduce((s, k) => s + MASTERY_WEIGHTS[k] * (components[k] ?? 0), 0) / totalWeight;
  const tradeCount = has(TRADE_SKILLS, skill) || has(REASONING_SKILLS, skill) ? recent(facts.checkedTrades).length : 0;
  const retestedQuestions = new Set(retests.map((r) => r.questionId)).size;
  const evidence: SkillEvidence = { answers: answers.length, exercises: applied.length, retests: retests.length, trades: tradeCount };
  const kinds = [answers.length, applied.length, retests.length].filter((n) => n > 0).length;
  // Levels count distinct questions and items; a hand-entered trade counts as half an item.
  const items = answers.length + weightOf(applied) + retestedQuestions;
  return { skill, score, level: levelFor(score, items, kinds), components, evidence };
}

export function allSkillMastery(facts: ProgressFacts): readonly SkillMastery[] {
  return SKILL_IDS.map((s) => skillMastery(facts, s));
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "Based on 12 answers, 5 exercises and 3 re-tests." */
export function evidenceSummary(e: SkillEvidence): string {
  const parts = [
    e.answers > 0 ? plural(e.answers, 'answer', 'answers') : null,
    e.exercises > 0 ? plural(e.exercises, 'exercise', 'exercises') : null,
    e.retests > 0 ? plural(e.retests, 're-test', 're-tests') : null,
  ].filter((p): p is string => p !== null);
  if (parts.length === 0) return 'No evidence yet.';
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
  return `Based on ${list}.`;
}
