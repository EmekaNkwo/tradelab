import type { ContentBundle } from './bundle';

/**
 * The attribution gate (spec §15.1): trader and strategy content written
 * about real people ships only after a person has researched and reviewed it.
 *
 * Withheld from the shipped bundle:
 * - a trader without a human review, or without at least one reviewed source;
 * - a strategy that names traders or claims documented rules, unless it is
 *   reviewed the same way and every trader it names also ships;
 * - a module about traders unless every one of them ships, with its lessons
 *   and checkpoint quiz;
 * - a program that contains a withheld module;
 * - a challenge about famous traders while no trader ships, or one that names a
 *   withheld trader or needs a withheld module's checkpoint.
 *
 * It also removes what would otherwise point at unreviewed or withheld content:
 * - trader statements (documented and interpretations) with no reviewed source;
 *   a trader left with no documented statement is withheld;
 * - strategy evidence with no reviewed source (an attributed strategy is then
 *   withheld; a generic one keeps no evidence section);
 * - links from strategies and lab concepts to withheld lessons.
 *
 * Generic strategy families (no traders, attribution "generic") need no review.
 * The gate runs at build time and again when the app loads the bundle, and the
 * build re-checks cross-references on the gated bundle.
 */

export interface WithheldItem {
  readonly type: 'traders' | 'strategies' | 'modules' | 'lessons' | 'quizzes' | 'programs' | 'challenges';
  readonly id: string;
  readonly reason: string;
}

export interface GateResult {
  readonly bundle: ContentBundle;
  readonly withheld: readonly WithheldItem[];
}

type Reviewable = { readonly review: { readonly status: string } | null; readonly sourceIds: readonly string[] };
type Trader = ContentBundle['traders'][number];
type Strategy = ContentBundle['strategies'][number];

export const isReviewedSource = (s: ContentBundle['sources'][number]): boolean => s.humanReviewed && s.reviewedBy !== null && s.reviewedAt !== null;

export function applyAttributionGate(bundle: ContentBundle): GateResult {
  const reviewedSources = new Set(bundle.sources.filter(isReviewedSource).map((s) => s.id));
  const cited = (ids: readonly string[]) => ids.some((id) => reviewedSources.has(id));
  const reviewed = (item: Reviewable): boolean => item.review?.status === 'human_reviewed' && cited(item.sourceIds);
  const withheld: WithheldItem[] = [];
  const hold = (type: WithheldItem['type'], id: string, reason: string) => withheld.push({ type, id, reason });

  const candidates = bundle.traders.flatMap((t): Trader[] => {
    if (!reviewed(t)) {
      hold('traders', t.id, 'not yet human-reviewed against a reviewed source');
      return [];
    }
    const documented = t.documented.filter((d) => cited(d.sourceIds));
    if (documented.length === 0) {
      hold('traders', t.id, 'no documented statement cites a reviewed source');
      return [];
    }
    return [{ ...t, documented, interpretations: t.interpretations.filter((d) => cited(d.sourceIds)) }];
  });
  const traderIds = new Set(candidates.map((t) => t.id));

  const strategies = bundle.strategies.flatMap((s): Strategy[] => {
    const attributed = s.attribution === 'documented' || s.traderIds.length > 0;
    const evidenceOk = s.evidence === null || cited(s.evidence.sourceIds);
    if (!attributed) return [evidenceOk ? s : { ...s, evidence: null }];
    if (!reviewed(s)) {
      hold('strategies', s.id, 'names traders or documented rules but is not yet human-reviewed against a reviewed source');
      return [];
    }
    if (!evidenceOk) {
      hold('strategies', s.id, 'its evidence cites no reviewed source');
      return [];
    }
    const missingTrader = s.traderIds.find((id) => !traderIds.has(id));
    if (missingTrader) {
      hold('strategies', s.id, `names trader "${missingTrader}", who is withheld`);
      return [];
    }
    return [s];
  });
  const strategyIds = new Set(strategies.map((s) => s.id));
  const traders = candidates.map((t) => ({ ...t, strategyIds: t.strategyIds.filter((id) => strategyIds.has(id)) }));

  const modules = bundle.modules.filter((m) => {
    const missingTrader = (m.traderIds ?? []).find((id) => !traderIds.has(id));
    if (missingTrader) hold('modules', m.id, `about trader "${missingTrader}", who is withheld`);
    return !missingTrader;
  });
  const moduleIds = new Set(modules.map((m) => m.id));
  const heldModules = bundle.modules.filter((m) => !moduleIds.has(m.id));

  const lessons = bundle.lessons.filter((l) => {
    if (moduleIds.has(l.moduleId)) return true;
    hold('lessons', l.id, `its module "${l.moduleId}" is withheld`);
    return false;
  });
  const keptQuizIds = new Set(modules.map((m) => m.checkpointQuizId));
  const heldQuizIds = new Set(heldModules.map((m) => m.checkpointQuizId).filter((id) => !keptQuizIds.has(id)));
  const quizzes = bundle.quizzes.filter((q) => {
    if (!heldQuizIds.has(q.id)) return true;
    hold('quizzes', q.id, 'checkpoint of a withheld module');
    return false;
  });
  const programs = bundle.programs.filter((p) => {
    const missingModule = p.moduleIds.find((id) => !moduleIds.has(id));
    if (missingModule) hold('programs', p.id, `contains withheld module "${missingModule}"`);
    return !missingModule;
  });

  const challenges = bundle.challenges
    .filter((c) => {
      const reason = challengeHoldReason(c, traderIds, moduleIds);
      if (reason) hold('challenges', c.id, reason);
      return reason === null;
    })
    .map((c) => ({ ...c, criteria: c.criteria.map((x) => (x.kind === 'checkpoint_passed' ? shippedAlternatives(x, moduleIds) : x)) }));

  const lessonIds = new Set(lessons.map((l) => l.id));
  const keptLessons = (ids: readonly string[]) => ids.filter((id) => lessonIds.has(id));
  const gatedBundle: ContentBundle = {
    ...bundle,
    traders,
    strategies: strategies.map((s) => ({ ...s, lessonIds: keptLessons(s.lessonIds) })),
    labConcepts: bundle.labConcepts.map((c) => ({ ...c, lessonIds: keptLessons(c.lessonIds) })),
    calendarEvents: bundle.calendarEvents.map((e) => ({ ...e, lessonIds: keptLessons(e.lessonIds) })),
    modules,
    lessons,
    quizzes,
    programs,
    challenges,
  };
  return { bundle: gatedBundle, withheld };
}

type CheckpointCriterion = Extract<ContentBundle['challenges'][number]['criteria'][number], { kind: 'checkpoint_passed' }>;

/** Drops withheld modules from a checkpoint criterion's alternatives; at least one ships, or the challenge is held. */
function shippedAlternatives(x: CheckpointCriterion, moduleIds: ReadonlySet<string>): CheckpointCriterion {
  const [first, ...rest] = [x.moduleId, ...(x.orModuleIds ?? [])].filter((id) => moduleIds.has(id));
  if (!first) return x;
  const { orModuleIds: _dropped, ...base } = x;
  return rest.length > 0 ? { ...base, moduleId: first, orModuleIds: rest } : { ...base, moduleId: first };
}

function challengeHoldReason(c: ContentBundle['challenges'][number], traderIds: ReadonlySet<string>, moduleIds: ReadonlySet<string>): string | null {
  const studiesTraders = c.type === 'famous_trader' || c.criteria.some((x) => x.kind === 'traders_studied');
  if (studiesTraders && traderIds.size === 0) return 'about famous traders, and no trader has passed human review yet';
  const missingTrader = (c.traderIds ?? []).find((id) => !traderIds.has(id));
  if (missingTrader) return `names trader "${missingTrader}", who is withheld`;
  // A criterion is held only when none of its alternative modules ships.
  const missingModule = c.criteria
    .flatMap((x) => (x.kind === 'checkpoint_passed' && ![x.moduleId, ...(x.orModuleIds ?? [])].some((id) => moduleIds.has(id)) ? [x.moduleId] : []))
    .find(Boolean);
  return missingModule ? `needs the checkpoint of withheld module "${missingModule}"` : null;
}
