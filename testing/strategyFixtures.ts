/**
 * Test-only: fictional, human-reviewed trader and source content layered on
 * the shipped bundle, so trader pages, documented strategies and the Research
 * Library can be exercised. None of this ships; no real person is described.
 */
import type { ContentBundle } from '../data/content/bundle';
import { createContentRepository, parseContentBundle, type ContentRepository } from '../data/content/contentLoader';
import generated from '../data/content/generated/contentBundle.json';

type Source = ContentBundle['sources'][number];
type Trader = ContentBundle['traders'][number];
type Strategy = ContentBundle['strategies'][number];

const REVIEW = { status: 'human_reviewed', reviewer: 'Fixture reviewer', reviewedAt: '2026-10-20' } as const;

export function shippedBundle(): ContentBundle {
  const parsed = parseContentBundle(generated);
  if (!parsed.ok) throw new Error(parsed.error.message);
  return parsed.value;
}

const source = (over: Partial<Source> & Pick<Source, 'id' | 'title'>): Source => ({
  author: 'Fixture Author',
  publisher: null,
  url: 'https://example.org/fixture',
  publishedOn: null,
  type: 'book',
  quality: 'primary',
  claimsSupported: ['A fictional claim used only in tests'],
  limitations: 'Fictional test fixture.',
  lastVerifiedOn: '2026-10-20',
  humanReviewed: true,
  reviewedBy: 'Fixture reviewer',
  reviewedAt: '2026-10-20',
  relatedStrategyIds: [],
  relatedTraderIds: [],
  disagreements: [],
  ...over,
});

export const FIXTURE_SOURCES: readonly Source[] = [
  source({
    id: 'fixture-primary',
    title: 'Fixture Primary Book',
    relatedTraderIds: ['fixture-trader'],
    relatedStrategyIds: ['fixture-documented'],
    disagreements: [{ sourceId: 'fixture-secondary', note: 'The two fixtures give different exit rules.' }],
  }),
  source({ id: 'fixture-secondary', title: 'Fixture Secondary Article', type: 'article', quality: 'strong_secondary' }),
  source({ id: 'fixture-unreviewed', title: 'Fixture Unreviewed Source', humanReviewed: false, reviewedBy: null, reviewedAt: null }),
];

const trader = (over: Partial<Trader> & Pick<Trader, 'id' | 'name'>): Trader => ({
  markets: ['futures'],
  knownFor: 'A fictional test trader',
  summary: 'Fictional summary for tests.',
  documented: [{ text: 'Fixture documented statement.', sourceIds: ['fixture-primary'] }],
  interpretations: [{ text: 'Fixture interpretation.', sourceIds: ['fixture-secondary'] }],
  unverified: ['Fixture unverified claim.'],
  strategyIds: ['fixture-documented', 'fixture-held'],
  sourceIds: ['fixture-primary', 'fixture-secondary'],
  review: REVIEW,
  ...over,
});

export const FIXTURE_TRADERS: readonly Trader[] = [
  trader({ id: 'fixture-trader', name: 'Fixture Trader' }),
  trader({ id: 'fixture-unreviewed-trader', name: 'Unreviewed Fixture Trader', review: null, strategyIds: [] }),
];

/** A documented copy of a shipped strategy, with its question ids renamed to stay unique. */
function documented(base: Strategy, id: string, review: Strategy['review']): Strategy {
  return {
    ...base,
    id,
    title: `Fixture documented ${id}`,
    attribution: 'documented',
    traderIds: ['fixture-trader'],
    evidence: { level: 'primary', summary: 'Fixture evidence summary.', sourceIds: ['fixture-primary'] },
    rules: base.rules ? { label: 'Fixture documented rules', rules: base.rules.rules } : null,
    knowledgeCheck: base.knowledgeCheck.map((q, i) => ({ ...q, id: `${id}-q${i + 1}` })),
    sourceIds: ['fixture-primary'],
    review,
  };
}

export function withReviewedFixtures(bundle: ContentBundle = shippedBundle()): ContentBundle {
  const base = bundle.strategies.find((s) => s.id === 'trend-following-moving-averages');
  if (!base) throw new Error('shipped strategy missing');
  return {
    ...bundle,
    sources: [...bundle.sources, ...FIXTURE_SOURCES],
    traders: [...bundle.traders, ...FIXTURE_TRADERS],
    strategies: [...bundle.strategies, documented(base, 'fixture-documented', REVIEW), documented(base, 'fixture-held', null)],
  };
}

export const fixtureContent = (): ContentRepository => createContentRepository(withReviewedFixtures());
/** The shipped content exactly as the app loads it. */
export const shippedContent = (): ContentRepository => createContentRepository(shippedBundle());

/** The shipped content with one module taken out of every program, as content was before that module was added. */
export function contentWithoutModule(moduleId: string): ContentRepository {
  const b = shippedBundle();
  return createContentRepository({ ...b, programs: b.programs.map((p) => ({ ...p, moduleIds: p.moduleIds.filter((m) => m !== moduleId) })) });
}

/** The fixture content with one module about an unreviewed trader, so the gate withholds it and its lessons. */
export function contentWithWithheldModule(moduleId: string): ContentRepository {
  const b = withReviewedFixtures();
  return createContentRepository({ ...b, modules: b.modules.map((m) => (m.id === moduleId ? { ...m, traderIds: ['fixture-unreviewed-trader'] } : m)) });
}

/** Fixture content where the reviewed trader also cites, and disagrees with, an unreviewed source. */
export function contentCitingUnreviewed(): ContentRepository {
  const b = withReviewedFixtures();
  return createContentRepository({
    ...b,
    sources: b.sources.map((s) =>
      s.id === 'fixture-primary' ? { ...s, disagreements: [...s.disagreements, { sourceId: 'fixture-unreviewed', note: 'Unreviewed disagreement.' }] } : s,
    ),
    traders: b.traders.map((t) =>
      t.id === 'fixture-trader'
        ? { ...t, documented: t.documented.map((d) => ({ ...d, sourceIds: [...d.sourceIds, 'fixture-unreviewed'] })), sourceIds: [...t.sourceIds, 'fixture-unreviewed'] }
        : t,
    ),
  });
}
