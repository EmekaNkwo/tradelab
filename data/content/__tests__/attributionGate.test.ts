import { shippedBundle, withReviewedFixtures } from '../../../testing/strategyFixtures';
import { applyAttributionGate } from '../attributionGate';
import type { ContentBundle } from '../bundle';
import { createContentRepository } from '../contentLoader';
import { checkCrossReferences } from '../crossReferences';
import { strategySchema, sourceSchema } from '../schemas';

const ids = (items: readonly { readonly id: string }[]) => items.map((i) => i.id);

describe('attribution gate', () => {
  it('ships reviewed traders and documented strategies, and withholds the rest', () => {
    const { bundle, withheld } = applyAttributionGate(withReviewedFixtures());
    expect(ids(bundle.traders)).toEqual(['fixture-trader']);
    expect(ids(bundle.strategies)).toContain('fixture-documented');
    expect(ids(bundle.strategies)).not.toContain('fixture-held');
    expect(bundle.traders[0]?.strategyIds).toEqual(['fixture-documented']);
    expect(withheld.map((w) => `${w.type}:${w.id}`).sort()).toEqual(['strategies:fixture-held', 'traders:fixture-unreviewed-trader']);
  });

  it('withholds a reviewed trader whose only sources are unreviewed', () => {
    const b = withReviewedFixtures();
    const t = b.traders[0]!;
    const { bundle } = applyAttributionGate({ ...b, traders: [{ ...t, sourceIds: ['fixture-unreviewed'] }] });
    expect(bundle.traders).toEqual([]);
    expect(ids(bundle.strategies)).not.toContain('fixture-documented');
  });

  it('withholds a module about a withheld trader with its lessons, checkpoint and program', () => {
    const b = shippedBundle();
    const mod = b.modules.find((m) => m.id === 'forex-rules-based-strategies')!;
    const gated: ContentBundle = {
      ...withReviewedFixtures(b),
      modules: b.modules.map((m) => (m.id === mod.id ? { ...m, traderIds: ['fixture-unreviewed-trader'] } : m)),
    };
    const { bundle, withheld } = applyAttributionGate(gated);
    expect(ids(bundle.modules)).not.toContain(mod.id);
    expect(ids(bundle.lessons)).not.toContain('fx-ma-trend-following');
    expect(ids(bundle.quizzes)).not.toContain(mod.checkpointQuizId);
    expect(ids(bundle.programs)).not.toContain('practical-forex-trader');
    expect(withheld.some((w) => w.type === 'programs' && w.id === 'practical-forex-trader')).toBe(true);
  });

  it('keeps a module about a reviewed trader', () => {
    const b = withReviewedFixtures();
    const gated = { ...b, modules: b.modules.map((m) => (m.id === 'forex-rules-based-strategies' ? { ...m, traderIds: ['fixture-trader'] } : m)) };
    expect(ids(applyAttributionGate(gated).bundle.modules)).toContain('forex-rules-based-strategies');
  });

  it('leaves no dangling references when any module is withheld', () => {
    const b = withReviewedFixtures();
    // Includes forex-rules-based-strategies and forex-indicators, whose lessons strategies and lab concepts link to.
    for (const mod of b.modules) {
      const gated = { ...b, modules: b.modules.map((m) => (m.id === mod.id ? { ...m, traderIds: ['fixture-unreviewed-trader'] } : m)) };
      const { bundle } = applyAttributionGate(gated);
      expect({ module: mod.id, errors: checkCrossReferences(bundle).filter((i) => i.severity === 'error') }).toEqual({ module: mod.id, errors: [] });
    }
  });

  it('strips withheld lessons from strategy and lab-concept links', () => {
    const b = withReviewedFixtures();
    const gated = {
      ...b,
      modules: b.modules.map((m) => (m.id === 'forex-indicators' || m.id === 'forex-rules-based-strategies' ? { ...m, traderIds: ['fixture-unreviewed-trader'] } : m)),
    };
    const { bundle } = applyAttributionGate(gated);
    expect(bundle.strategies.find((s) => s.id === 'mean-reversion-rsi-bands')?.lessonIds).not.toContain('fx-rsi');
    expect(bundle.strategies.find((s) => s.id === 'trend-following-moving-averages')?.lessonIds).toEqual(['fx-trends', 'fx-drawdown-ruin']);
    expect(bundle.labConcepts.flatMap((c) => c.lessonIds)).not.toContain('fx-rsi');
    const repo = createContentRepository(gated);
    expect(repo.strategy('trend-following-moving-averages')?.lessonIds.every((id) => repo.lesson(id) !== null)).toBe(true);
  });

  it('drops trader statements without a reviewed source, and withholds a trader left with none documented', () => {
    const b = withReviewedFixtures();
    const t = b.traders[0]!;
    const mixed = {
      ...t,
      documented: [...t.documented, { text: 'Unreviewed claim.', sourceIds: ['fixture-unreviewed'] }],
      interpretations: [{ text: 'Unreviewed reading.', sourceIds: ['fixture-unreviewed'] }],
    };
    const kept = applyAttributionGate({ ...b, traders: [mixed] }).bundle.traders[0]!;
    expect(kept.documented.map((d) => d.text)).toEqual(['Fixture documented statement.']);
    expect(kept.interpretations).toEqual([]);

    const none = { ...t, documented: [{ text: 'Unreviewed claim.', sourceIds: ['fixture-unreviewed'] }] };
    const r = applyAttributionGate({ ...b, traders: [none] });
    expect(r.bundle.traders).toEqual([]);
    expect(r.withheld).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'traders', id: 'fixture-trader', reason: expect.stringMatching(/no documented statement/) })]));
  });

  it('needs strategy evidence to cite a reviewed source', () => {
    const b = withReviewedFixtures();
    const unreviewedEvidence = { level: 'primary' as const, summary: 'S', sourceIds: ['fixture-unreviewed'] };
    const strategies = b.strategies.map((s) =>
      s.id === 'fixture-documented' || s.id === 'range-trading' ? { ...s, evidence: unreviewedEvidence } : s,
    );
    const { bundle, withheld } = applyAttributionGate({ ...b, strategies });
    expect(ids(bundle.strategies)).not.toContain('fixture-documented');
    expect(withheld).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'fixture-documented', reason: 'its evidence cites no reviewed source' })]));
    expect(bundle.strategies.find((s) => s.id === 'range-trading')?.evidence).toBeNull();
  });

  it('looks up only reviewed sources, and hides sources whose related pages are all withheld', () => {
    const b = withReviewedFixtures();
    const orphan = { ...b.sources.find((s) => s.id === 'fixture-secondary')!, id: 'fixture-orphan', relatedTraderIds: ['fixture-unreviewed-trader'] };
    const repo = createContentRepository({ ...b, sources: [...b.sources, orphan] });
    expect(repo.reviewedSource('fixture-unreviewed')).toBeNull();
    expect(repo.source('fixture-unreviewed')?.id).toBe('fixture-unreviewed');
    expect(repo.reviewedSource('fixture-primary')?.id).toBe('fixture-primary');
    expect(ids(repo.reviewedSources())).not.toContain('fixture-orphan');
    expect(ids(repo.reviewedSources())).toContain('fixture-secondary');
  });

  it('the repository gates content at load time too', () => {
    const repo = createContentRepository(withReviewedFixtures());
    expect(repo.trader('fixture-unreviewed-trader')).toBeNull();
    expect(repo.strategy('fixture-held')).toBeNull();
    expect(repo.trader('fixture-trader')?.name).toBe('Fixture Trader');
    expect(ids(repo.reviewedSources())).toEqual(expect.arrayContaining(['fixture-primary', 'fixture-secondary']));
    expect(ids(repo.reviewedSources())).not.toContain('fixture-unreviewed');
  });
});

describe('shipped content and the gate', () => {
  const shipped = shippedBundle();

  it('ships no traders and no attributed strategies until a person reviews them', () => {
    expect(shipped.traders).toEqual([]);
    for (const s of shipped.strategies) {
      expect({ id: s.id, attribution: s.attribution, traderIds: s.traderIds }).toEqual({ id: s.id, attribution: 'generic', traderIds: [] });
      expect(s.rules === null || /simplified educational version/i.test(s.rules.label)).toBe(true);
    }
    expect(shipped.modules.every((m) => (m.traderIds ?? []).length === 0)).toBe(true);
    expect(shipped.programs.find((p) => p.id === 'study-the-great-traders')).toBeUndefined();
  });

  it('withholds nothing from the shipped bundle', () => {
    expect(applyAttributionGate(shipped).withheld).toEqual([]);
  });

  it('ships about twelve generic strategy pages across all three categories, each with a full template', () => {
    expect(shipped.strategies.length).toBeGreaterThanOrEqual(12);
    expect(new Set(shipped.strategies.map((s) => s.category))).toEqual(new Set(['trading', 'investing', 'risk_principle']));
    for (const s of shipped.strategies) {
      expect(s.knowledgeCheck.length).toBeGreaterThanOrEqual(3);
      expect(s.exercise).not.toBeNull();
      expect(s.failureAnalysis.length).toBeGreaterThan(0);
      expect(s.limitations.length).toBeGreaterThan(0);
    }
  });

  it('places the rules-based module ninth in Practical Forex Trader', () => {
    const program = shipped.programs.find((p) => p.id === 'practical-forex-trader')!;
    expect(program.moduleIds[8]).toBe('forex-rules-based-strategies');
    expect(program.moduleIds[7]).toBe('forex-fundamentals');
  });
});

describe('strategy and source schemas', () => {
  const base = shippedBundle().strategies[0]!;

  it('refuses a generic strategy that names a trader', () => {
    expect(strategySchema.safeParse({ ...base, traderIds: ['someone'] }).success).toBe(false);
    expect(strategySchema.safeParse({ ...base, attribution: 'documented', traderIds: ['someone'] }).success).toBe(true);
  });

  it('refuses generic rules without the educational label', () => {
    expect(strategySchema.safeParse({ ...base, rules: { label: 'The rules', rules: ['x'] } }).success).toBe(false);
  });

  it('refuses a knowledge check with fewer than 3 questions, and an exercise with nothing to leave out', () => {
    expect(strategySchema.safeParse({ ...base, knowledgeCheck: base.knowledgeCheck.slice(0, 2) }).success).toBe(false);
    const ex = base.exercise!;
    expect(strategySchema.safeParse({ ...base, exercise: { ...ex, options: ex.options.map((o) => ({ ...o, correct: true })) } }).success).toBe(false);
  });

  it('refuses a reviewed source without reviewer and date', () => {
    const src = { id: 's', title: 'T', author: null, publisher: null, url: null, publishedOn: null, type: 'book', quality: 'primary', claimsSupported: ['c'], limitations: 'l', lastVerifiedOn: '2026-10-01', humanReviewed: true, reviewedBy: null, reviewedAt: null, relatedStrategyIds: [], relatedTraderIds: [], disagreements: [] };
    expect(sourceSchema.safeParse(src).success).toBe(false);
    expect(sourceSchema.safeParse({ ...src, reviewedBy: 'R', reviewedAt: '2026-10-01' }).success).toBe(true);
  });
});
