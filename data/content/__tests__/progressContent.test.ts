import famousTrader from '../../../content/challenges/famous-trader.json';
import { shippedBundle, withReviewedFixtures } from '../../../testing/strategyFixtures';
import { applyAttributionGate } from '../attributionGate';
import type { ContentBundle } from '../bundle';
import { createContentRepository } from '../contentLoader';
import { checkCrossReferences } from '../crossReferences';
import { challengeSchema, labConceptSchema, moduleSchema } from '../schemas';

type ChallengeContent = ContentBundle['challenges'][number];
const famous = challengeSchema.parse(famousTrader) as ChallengeContent;
const ids = (items: readonly { readonly id: string }[]) => items.map((i) => i.id);

describe('skill tags (spec §23)', () => {
  const b = shippedBundle();

  it('every module, lab concept and strategy that ships names at least one skill', () => {
    for (const item of [...b.modules, ...b.labConcepts, ...b.strategies]) expect({ id: item.id, tagged: item.skills.length > 0 }).toEqual({ id: item.id, tagged: true });
  });

  it('rejects missing, unknown and repeated skill tags', () => {
    const m = b.modules[0]!;
    expect(moduleSchema.safeParse({ ...m, skills: [] }).success).toBe(false);
    expect(moduleSchema.safeParse({ ...m, skills: ['day_trading'] }).success).toBe(false);
    expect(moduleSchema.safeParse({ ...m, skills: ['chart_reading', 'chart_reading'] }).success).toBe(false);
    const { skills: _skills, ...untagged } = b.labConcepts[0]!;
    expect(labConceptSchema.safeParse(untagged).success).toBe(false);
  });

  it('resolves a question’s skills from the question, then its lesson, module or strategy page', () => {
    const repo = createContentRepository(b);
    // fx-position-sizing overrides its module's skills.
    expect(repo.questionInfo('fx-position-sizing-q1')).toEqual({ skills: ['risk_management'], lessonId: 'fx-position-sizing', moduleId: 'forex-risk', strategyId: null });
    const basics = repo.module('forex-basics')!;
    const lesson = repo.lesson(basics.lessonIds[0]!)!;
    expect(repo.questionInfo(lesson.quickCheck[0]!.id)?.skills).toEqual(basics.skills);
    const checkpoint = repo.quiz(basics.checkpointQuizId)!;
    expect(repo.questionInfo(checkpoint.questions[0]!.id)).toMatchObject({ skills: basics.skills, lessonId: null, moduleId: 'forex-basics' });
    const strategy = repo.strategy('carry-concept')!;
    expect(repo.questionInfo(strategy.knowledgeCheck[0]!.id)).toEqual({ skills: strategy.skills, lessonId: null, moduleId: null, strategyId: 'carry-concept' });
    expect(repo.questionInfo('no-such-question')).toBeNull();
  });
});

describe('challenges (spec §27)', () => {
  it('ships eight challenges and withholds the famous-trader one until a trader passes review', () => {
    const b = shippedBundle();
    expect(ids(b.challenges).sort()).toEqual(['backtesting', 'beginner-market', 'chart-reading', 'forex-metatrader', 'fundamental-analysis', 'replay', 'risk-management', 'strategy-research']);
    expect(checkCrossReferences(b)).toEqual(checkCrossReferences({ ...b, challenges: [] }));
    const gated = applyAttributionGate({ ...b, challenges: [...b.challenges, famous] });
    expect(ids(gated.bundle.challenges)).not.toContain('famous-trader');
    expect(gated.withheld).toContainEqual({ type: 'challenges', id: 'famous-trader', reason: 'about famous traders, and no trader has passed human review yet' });
    const reviewed = applyAttributionGate({ ...withReviewedFixtures(b), challenges: [...b.challenges, famous] });
    expect(ids(reviewed.bundle.challenges)).toContain('famous-trader');
  });

  it('withholds a challenge naming a withheld trader or needing a withheld module', () => {
    const b = withReviewedFixtures();
    const named: ChallengeContent = { ...famous, id: 'named', traderIds: ['fixture-unreviewed-trader'] };
    const base = b.challenges.find((c) => c.id === 'risk-management')!;
    const gated = applyAttributionGate({
      ...b,
      modules: b.modules.map((m) => (m.id === 'forex-risk' ? { ...m, traderIds: ['fixture-unreviewed-trader'] } : m)),
      challenges: [base, named],
    });
    expect(gated.bundle.challenges).toEqual([]);
    expect(gated.withheld.filter((w) => w.type === 'challenges').map((w) => w.reason)).toEqual([
      'needs the checkpoint of withheld module "forex-risk"',
      'names trader "fixture-unreviewed-trader", who is withheld',
    ]);
  });

  it('rejects criteria that point at nothing or can never be met', () => {
    const b = shippedBundle();
    const c = b.challenges[0]!;
    const broken: ChallengeContent = {
      ...c,
      id: 'broken',
      traderIds: ['ghost'],
      criteria: [
        { kind: 'checkpoint_passed', moduleId: 'no-module', label: 'x', dimension: 'understanding' },
        { kind: 'mt_tasks', taskIds: ['no-task'], label: 'x', dimension: 'rule_use' },
        { kind: 'lab_cases', labKind: 'red_flag', count: 99, minScore: 0.8, label: 'x', dimension: 'reasoning' },
        { kind: 'strategies_completed', count: 99, label: 'x', dimension: 'understanding' },
      ],
    };
    const messages = checkCrossReferences({ ...b, challenges: [broken] }).map((i) => `${i.file}: ${i.message}`);
    expect(messages).toEqual([
      'challenges/broken: unknown module "no-module"',
      'challenges/broken: unknown MetaTrader task "no-task"',
      'challenges/broken: unknown trader "ghost"',
      expect.stringMatching(/^challenges\/broken: needs 99 red_flag cases but only \d+ exist$/),
      expect.stringMatching(/^challenges\/broken: needs 99 strategies but only \d+ exist$/),
    ]);
  });

  it('validates challenge shape: never a profit criterion, and famous-trader challenges must count traders', () => {
    const c = shippedBundle().challenges[0]!;
    expect(challengeSchema.safeParse({ ...c, criteria: [{ kind: 'profit', amount: 100, label: 'x', dimension: 'understanding' }] }).success).toBe(false);
    expect(challengeSchema.safeParse({ ...c, criteria: [] }).success).toBe(false);
    expect(challengeSchema.safeParse({ ...c, type: 'famous_trader' }).success).toBe(false);
    expect(challengeSchema.safeParse({ ...c, criteria: [{ ...c.criteria[0], dimension: 'returns' }] }).success).toBe(false);
  });
});
