import { SKILL_LABELS, type SkillId } from '../models/progress';
import type { SkillMastery } from './mastery';
import { latestAnswers, newestFirst, type AnswerRecord, type ProgressFacts } from './records';
import { DRILL_SKILLS, PSYCH_SKILLS, REPLAY_PRACTICE } from './skillMaps';

/**
 * Targeted practice (spec §23): for each weak skill, a short path built from
 * the learner's own results (lesson → drill or lab → replay), with the reason
 * in plain words. Questions answered wrong go to the existing spaced review.
 * A skill is recommended only once it has enough evidence to judge
 * (level "developing" or "practising"), and every recommendation has at least
 * one step the learner can take.
 */

export const MAX_RECOMMENDATIONS = 3;
/** A skill counts as weak below this score, once there is some evidence. */
export const WEAK_SCORE = 0.6;
export const DRILL_WINDOW = 10;
export const TRADE_WINDOW = 10;

export type PracticeStep =
  | { readonly kind: 'lesson'; readonly lessonId: string; readonly title: string }
  | { readonly kind: 'lab'; readonly conceptId: string; readonly lab: 'technical' | 'fundamental'; readonly title: string }
  | { readonly kind: 'drill'; readonly drillKind: string }
  | { readonly kind: 'replay'; readonly scenario: string }
  | { readonly kind: 'psych' }
  | { readonly kind: 'review'; readonly questionIds: readonly string[] };

export interface Recommendation {
  readonly skill: SkillId;
  readonly reason: string;
  readonly steps: readonly PracticeStep[];
}

/** What recommendations need to know about content, kept minimal so the domain stays pure. */
export interface RecommendationContent {
  lessonTitle(id: string): string | null;
  /** A module's (or strategy page's) title, for misses outside a lesson. */
  moduleTitle(id: string): string | null;
  /** The first lesson of a module, to reread after missing its checkpoint. */
  firstLessonOf(moduleId: string): string | null;
  /** Lab concepts teaching a lesson or belonging to a module, falling back to ones tagged with the skill. */
  conceptsFor(
    where: { readonly lessonId: string | null; readonly moduleId: string | null },
    skill: SkillId,
  ): readonly { readonly id: string; readonly lab: 'technical' | 'fundamental'; readonly title: string; readonly scenario: string | null }[];
  drillTitle(kind: string): string;
}

interface Miss {
  readonly lessonId: string | null;
  /** The module or strategy page the questions were asked in. */
  readonly contextId: string;
  readonly missed: number;
  readonly asked: number;
  readonly missedIds: readonly string[];
}

/**
 * Whether a wrong answer still stands: a later correct spaced re-test (even one
 * brought forward) shows the learner has since got it right.
 */
function stillMissed(facts: ProgressFacts, a: AnswerRecord): boolean {
  if (a.correct) return false;
  const later = newestFirst(facts.retests.filter((r) => r.questionId === a.questionId && r.at > a.at))[0];
  return !later?.correct;
}

/**
 * The lesson with the most missed questions among the latest answers on a
 * skill. Answers outside a lesson (checkpoints, strategy checks) are pooled
 * per module or strategy page, never across them.
 */
function worstLesson(facts: ProgressFacts, skill: SkillId): Miss | null {
  const latest = latestAnswers(facts.answers.filter((a) => a.skills.includes(skill)));
  const groups = new Map<string, AnswerRecord[]>();
  for (const a of latest) {
    const key = a.lessonId ?? `in:${a.contextId}`;
    groups.set(key, [...(groups.get(key) ?? []), a]);
  }
  const misses = [...groups.values()].map((answers): Miss => {
    const missed = answers.filter((a) => stillMissed(facts, a));
    return { lessonId: answers[0]?.lessonId ?? null, contextId: answers[0]?.contextId ?? '', missed: missed.length, asked: answers.length, missedIds: missed.map((a) => a.questionId) };
  });
  const worst = misses.filter((m) => m.missed > 0).sort((a, b) => b.missed / b.asked - a.missed / a.asked || b.missed - a.missed)[0];
  return worst ?? null;
}

function drillAccuracy(facts: ProgressFacts, kind: string): { readonly right: number; readonly of: number } {
  const last = newestFirst(facts.drills.filter((d) => d.kind === kind)).slice(0, DRILL_WINDOW);
  return { right: last.filter((d) => d.correct).length, of: last.length };
}

/**
 * The drill to practise a skill: the one the learner is actually weakest at
 * among the drills for it, or, before any attempt, the most specific one
 * (e.g. Size it for risk management).
 */
export function weakDrillFor(facts: ProgressFacts, skill: SkillId): string | null {
  const kinds = Object.entries(DRILL_SKILLS)
    .filter(([, skills]) => skills.includes(skill))
    .sort(([, a], [, b]) => a.length - b.length || Number(b[0] === skill) - Number(a[0] === skill));
  const tried = kinds
    .map(([kind]) => ({ kind, acc: drillAccuracy(facts, kind) }))
    .filter((d) => d.acc.of > 0)
    .sort((a, b) => a.acc.right / a.acc.of - b.acc.right / b.acc.of);
  return tried[0]?.kind ?? kinds[0]?.[0] ?? null;
}

function reasonFor(facts: ProgressFacts, m: SkillMastery, miss: Miss | null, drill: string | null, content: RecommendationContent): string {
  const label = SKILL_LABELS[m.skill].toLowerCase();
  if (miss && miss.missed > 0) {
    const where = miss.lessonId ? content.lessonTitle(miss.lessonId) : content.moduleTitle(miss.contextId);
    return `You missed ${miss.missed} of your last ${miss.asked} ${label} questions${where ? ` in "${where}"` : ''}.`;
  }
  const acc = drill ? drillAccuracy(facts, drill) : null;
  if (drill && acc && acc.of > 0 && acc.right / acc.of < WEAK_SCORE) return `You got ${acc.right} of your last ${acc.of} ${content.drillTitle(drill)} drills right.`;
  const trades = newestFirst(facts.checkedTrades).slice(0, TRADE_WINDOW);
  const broken = trades.filter((t) => t.ruleBroken || !t.hasStop).length;
  if ((m.skill === 'execution_discipline' || m.skill === 'risk_management') && broken > 0)
    return `${broken} of your last ${trades.length} rule-checked trades broke a rule, risked more than your limit or had no stop.`;
  return `Your ${label} results so far average ${Math.round((m.score ?? 0) * 100)}%.`;
}

function stepsFor(skill: SkillId, miss: Miss | null, drill: string | null, content: RecommendationContent): PracticeStep[] {
  const moduleId = miss?.contextId ?? null;
  // A miss outside a lesson (a checkpoint) sends the learner back to the module's first lesson.
  const lessonId = miss?.lessonId ?? (moduleId ? content.firstLessonOf(moduleId) : null);
  const title = lessonId ? content.lessonTitle(lessonId) : null;
  const lesson: PracticeStep[] = lessonId && title ? [{ kind: 'lesson', lessonId, title }] : [];
  const concept = content.conceptsFor({ lessonId, moduleId }, skill)[0];
  const lab: PracticeStep[] = concept ? [{ kind: 'lab', conceptId: concept.id, lab: concept.lab, title: concept.title }] : [];
  const drillStep: PracticeStep[] = drill ? [{ kind: 'drill', drillKind: drill }] : [];
  const psych: PracticeStep[] = PSYCH_SKILLS.includes(skill) ? [{ kind: 'psych' }] : [];
  const scenario = concept?.scenario ?? REPLAY_PRACTICE[skill] ?? null;
  const replay: PracticeStep[] = scenario ? [{ kind: 'replay', scenario }] : [];
  const review: PracticeStep[] = miss && miss.missedIds.length > 0 ? [{ kind: 'review', questionIds: miss.missedIds }] : [];
  return [...review, ...lesson, ...psych, ...drillStep, ...lab, ...replay];
}

export function recommendations(facts: ProgressFacts, mastery: readonly SkillMastery[], content: RecommendationContent): readonly Recommendation[] {
  return (
    mastery
      // Not before there is enough evidence to judge ("Too early to tell" is never called weak).
      .filter((m) => m.score !== null && m.score < WEAK_SCORE && (m.level === 'developing' || m.level === 'practising'))
      .sort((a, b) => (a.score ?? 0) - (b.score ?? 0))
      .map((m) => {
        const miss = worstLesson(facts, m.skill);
        const drill = weakDrillFor(facts, m.skill);
        return { skill: m.skill, reason: reasonFor(facts, m, miss, drill, content), steps: stepsFor(m.skill, miss, drill, content) };
      })
      .filter((r) => r.steps.length > 0)
      .slice(0, MAX_RECOMMENDATIONS)
  );
}

/** Questions whose latest answer was wrong and not since re-tested right, for the spaced review ("Review these now"). */
export function missedQuestionIds(facts: ProgressFacts): readonly string[] {
  return latestAnswers(facts.answers)
    .filter((a) => stillMissed(facts, a))
    .map((a) => a.questionId);
}
