import { z } from 'zod';
import { PSYCH_TOPICS } from '../../domain/models/content';
import type { ComparisonDimension, FictionalCompany, LabConcept, MarketScenario, RedFlagCase } from '../../domain/models/labs';
import { CALENDAR_EVENT_KINDS, type CalendarEventType } from '../../domain/models/calendar';
import { MARKET_KINDS } from '../../shared/types';
import { ANALYSIS_KINDS, STRATEGY_CATEGORIES, STRATEGY_FAMILIES, STRATEGY_HORIZONS, STRATEGY_STYLES, type Strategy, type Trader } from '../../domain/models/strategies';
import { CHART_OVERLAY_IDS, CHART_PANE_IDS } from '../../domain/market/chartIds';
import { DRILL_KINDS } from '../../domain/market/drills';
import { SCENARIO_KINDS } from '../../domain/market/scenarios';
import { CHALLENGE_DIMENSIONS, CHALLENGE_TYPES, SKILL_IDS, type Challenge } from '../../domain/models/progress';
import type {
  Disclosure,
  GlossaryEntry,
  Lesson,
  MetaTraderTask,
  Module,
  Program,
  PsychScenario,
  Question,
  Quiz,
  Source,
} from '../../domain/models/content';

/**
 * Runtime schemas for every content type. Each is checked against its domain
 * model with `satisfies`, so the model and the schema cannot drift apart.
 * JSON Schemas in `content/schemas/` are generated from these.
 */

export const contentId = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'ids are lowercase kebab-case');
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'dates are YYYY-MM-DD');
const text = z.string().trim().min(1);
const level = z.enum(['beginner', 'intermediate', 'advanced']);
const market = z.enum(['forex', 'stocks', 'penny_stocks', 'commodities', 'futures', 'options']);
/** Skill tags (spec §23): at least one, no repeats. */
const skillTags = z
  .array(z.enum(SKILL_IDS))
  .min(1)
  .refine((s) => new Set(s).size === s.length, 'skills must not repeat');

export const levelledTextSchema = z.object({ simple: text, balanced: text.optional(), advanced: text.optional() }).strict();

export const glossaryEntrySchema = z
  .object({
    id: contentId,
    term: text,
    aliases: z.array(text),
    definition: levelledTextSchema,
    example: text.optional(),
    related: z.array(contentId),
    markets: z.array(market),
    level,
    sourceIds: z.array(contentId),
  })
  .strict() satisfies z.ZodType<GlossaryEntry>;

export const disclosureSchema = z
  .object({
    id: contentId,
    version: z.number().int().positive(),
    title: text,
    body: z.array(text).min(1),
    triggers: z.array(z.enum(['first_launch', 'futures', 'penny_stocks', 'options', 'leverage', 'final_module', 'always'])).min(1),
    statistics: z.array(
      z
        .object({
          id: contentId,
          statement: text,
          sourceId: contentId,
          jurisdiction: text,
          provider: text,
          publishedOn: isoDate,
          verifiedOn: isoDate,
          productsCovered: text,
        })
        .strict(),
    ),
  })
  .strict() satisfies z.ZodType<Disclosure>;

export const sourceSchema = z
  .object({
    id: contentId,
    title: text,
    author: text.nullable(),
    publisher: text.nullable(),
    url: z.url({ protocol: /^https$/ }).nullable(),
    publishedOn: isoDate.nullable(),
    type: z.enum(['book', 'interview', 'article', 'academic', 'regulator', 'dataset', 'website', 'other']),
    quality: z.enum(['primary', 'strong_secondary', 'limited_or_disputed']),
    claimsSupported: z.array(text).min(1),
    limitations: text,
    lastVerifiedOn: isoDate,
    humanReviewed: z.boolean(),
    reviewedBy: text.nullable(),
    reviewedAt: isoDate.nullable(),
    relatedStrategyIds: z.array(contentId),
    relatedTraderIds: z.array(contentId),
    disagreements: z.array(z.object({ sourceId: contentId, note: text }).strict()),
  })
  .strict()
  .refine((s) => !s.humanReviewed || (s.reviewedBy !== null && s.reviewedAt !== null), 'a human-reviewed source needs reviewedBy and reviewedAt') satisfies z.ZodType<Source>;

export const questionSchema = z
  .object({
    id: contentId,
    prompt: text,
    options: z.array(z.object({ id: contentId, text, explanation: text }).strict()).min(2),
    correctOptionIds: z.array(contentId).min(1),
    level,
    glossaryIds: z.array(contentId),
    skills: skillTags.optional(),
  })
  .strict() satisfies z.ZodType<Question>;

export const quizSchema = z
  .object({
    id: contentId,
    title: text,
    passMark: z.number().gt(0).lte(1),
    questions: z.array(questionSchema).min(1),
  })
  .strict() satisfies z.ZodType<Quiz>;

const practiceKind = z.enum(['chart_lab', 'replay', 'paper', 'backtest', 'fundamental', 'metatrader', 'calculator', 'reflection']);

const workedExample = z.object({ assumptions: z.array(text).min(1), steps: z.array(text).min(1) }).strict();

export const lessonSchema = z
  .object({
    id: contentId,
    moduleId: contentId,
    title: text,
    level,
    estimatedMinutes: z.number().int().min(1).max(60),
    inOneLine: levelledTextSchema,
    explain: levelledTextSchema,
    realNumbers: workedExample,
    anotherExample: workedExample,
    explainSimpler: text,
    commonMistake: text,
    quickCheck: z.array(questionSchema).min(2).max(3),
    doItNow: z.object({ kind: practiceKind, instructions: text, mtTaskId: contentId.optional() }).strict(),
    homework: text.optional(),
    glossaryIds: z.array(contentId),
    sourceIds: z.array(contentId),
    skills: skillTags.optional(),
  })
  .strict() satisfies z.ZodType<Lesson>;

export const metaTraderTaskSchema = z
  .object({
    id: contentId,
    title: text,
    summary: text,
    level,
    requiresDemo: z.boolean(),
    steps: z.array(z.object({ text, mt4: text.optional(), mt5: text.optional() }).strict()).min(1).max(12),
    afterQuestions: z.array(questionSchema).min(1).max(2),
    glossaryIds: z.array(contentId),
  })
  .strict() satisfies z.ZodType<MetaTraderTask>;

export const psychScenarioSchema = z
  .object({
    id: contentId,
    topic: z.enum(PSYCH_TOPICS),
    title: text,
    situation: text,
    question: text,
    responses: z
      .array(z.object({ id: z.string().regex(/^[a-z]$/), text, quality: z.enum(['helpful', 'mixed', 'harmful']), explanation: text }).strict())
      .min(3)
      .max(4)
      .refine((rs) => new Set(rs.map((r) => r.id)).size === rs.length, 'response ids must be unique')
      .refine((rs) => rs.some((r) => r.quality === 'helpful'), 'at least one response must be helpful'),
    takeaway: text,
    glossaryIds: z.array(contentId),
  })
  .strict() satisfies z.ZodType<PsychScenario>;

export const moduleSchema = z
  .object({
    id: contentId,
    title: text,
    summary: text,
    markets: z.array(market),
    level,
    lessonIds: z.array(contentId).min(1),
    checkpointQuizId: contentId,
    practicalResult: text,
    minPracticeDays: z.number().int().min(0),
    skills: skillTags,
    traderIds: z.array(contentId).optional(),
  })
  .strict() satisfies z.ZodType<Module>;

export const programSchema = z
  .object({
    id: contentId,
    title: text,
    summary: text,
    moduleIds: z.array(contentId).min(1),
    defaultWeeks: z.number().int().min(1).max(104),
  })
  .strict() satisfies z.ZodType<Program>;

const letterId = z.string().regex(/^[a-z]$/);
const uniqueIds = <T extends { readonly id: string }>(items: readonly T[]) => new Set(items.map((i) => i.id)).size === items.length;
const amount = z.number().finite();
const nonNegative = z.number().finite().min(0);
/** Lab content is fictional; names must say so, so a screen can never pass one off as a real firm. */
const fictionalName = text.refine((n) => /\(fictional\)/i.test(n), 'name must include "(fictional)"');

export const companySchema = z
  .object({
    id: contentId,
    name: fictionalName,
    sector: text,
    summary: text,
    assumptions: text,
    currency: z.literal('USD'),
    sharePrice: z.number().finite().positive(),
    sharesOutstanding: z.number().finite().positive(),
    years: z
      .array(
        z
          .object({
            label: text.refine((l) => !/\b(19|20)\d{2}\b/.test(l), 'use labels like "Year 1", not real calendar years'),
            revenue: z.number().finite().positive(),
            costOfSales: nonNegative,
            operatingExpenses: nonNegative,
            interest: nonNegative,
            tax: amount,
            operatingCashFlow: amount,
            capitalExpenditure: nonNegative,
            dividendsPaid: nonNegative,
            cash: nonNegative,
            debt: nonNegative,
            equity: amount,
          })
          .strict(),
      )
      .min(2)
      .max(5),
    notes: z.array(text).min(1),
    glossaryIds: z.array(contentId),
  })
  .strict() satisfies z.ZodType<FictionalCompany>;

export const redFlagCaseSchema = z
  .object({
    id: contentId,
    title: text,
    company: fictionalName,
    facts: z.array(z.object({ label: text, value: text }).strict()).min(3),
    question: text,
    signs: z
      .array(z.object({ id: letterId, text, isRedFlag: z.boolean(), explanation: text }).strict())
      .min(4)
      .max(10)
      .refine(uniqueIds, 'sign ids must be unique')
      .refine((s) => s.filter((x) => x.isRedFlag).length >= 2 && s.some((x) => !x.isRedFlag), 'need at least two red flags and one sign that is not'),
    investigate: z.array(text).min(2),
    verdict: text,
    glossaryIds: z.array(contentId),
  })
  .strict() satisfies z.ZodType<RedFlagCase>;

export const marketScenarioSchema = z
  .object({
    id: contentId,
    category: z.enum(['macro', 'commodity']),
    // Scenarios are made up (news.tsx calls them "fictional scenarios"); the title must say so on every screen.
    title: text.refine((t) => /\(fictional\)/i.test(t), 'scenario titles must include "(fictional)"'),
    setup: text,
    release: z.object({ name: text, unit: text, consensus: amount, actual: amount, previous: amount.nullable() }).strict().nullable(),
    pricedIn: text,
    question: text,
    reactions: z
      .array(z.object({ id: letterId, text, plausible: z.boolean(), explanation: text }).strict())
      .min(3)
      .max(6)
      .refine(uniqueIds, 'reaction ids must be unique')
      .refine((r) => r.some((x) => x.plausible), 'at least one reaction must be plausible'),
    takeaway: text,
    glossaryIds: z.array(contentId),
  })
  .strict() satisfies z.ZodType<MarketScenario>;

const sampleEventSchema = z
  .object({
    id: contentId,
    title: text.refine((t) => /\(fictional\)|\bsample\b/i.test(t), 'sample event titles must say they are fictional or a sample'),
    day: z.number().int().min(1).max(7),
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'time is HH:MM'),
    timeZone: z.literal('UTC'),
    where: text.refine((t) => /fictional/i.test(t), 'sample events happen in a fictional place or company'),
    details: text,
  })
  .strict();

export const calendarEventTypeSchema = z
  .object({
    id: contentId,
    kind: z.enum(CALENDAR_EVENT_KINDS as unknown as [CalendarEventType['kind'], ...CalendarEventType['kind'][]]),
    title: text,
    measures: text,
    whyItMatters: text,
    affectedMarkets: z.array(z.enum(['forex', 'stocks', 'penny_stocks', 'commodities', 'futures'])).min(1).refine((m) => new Set(m).size === m.length && m.every((k) => MARKET_KINDS.includes(k)), 'markets are listed once'),
    expectations: text,
    surprises: text,
    limits: text,
    keywords: z.array(z.string().trim().min(3).regex(/^[a-z0-9 '-]+$/, 'keywords are lowercase')).min(3),
    glossaryIds: z.array(contentId),
    lessonIds: z.array(contentId),
    scenarioIds: z.array(contentId),
    samples: z.array(sampleEventSchema).min(1).max(5).refine(uniqueIds, 'sample ids must be unique'),
  })
  .strict() satisfies z.ZodType<CalendarEventType>;

export const comparisonDimensionSchema = z
  .object({
    id: contentId,
    order: z.number().int().min(1),
    dimension: text,
    cells: z.object({ forex: text, stocks: text, penny_stocks: text, commodities: text, futures: text }).strict(),
    caveat: text,
  })
  .strict() satisfies z.ZodType<ComparisonDimension>;

export const labConceptSchema = z
  .object({
    id: contentId,
    lab: z.enum(['technical', 'fundamental']),
    level,
    order: z.number().int().min(1),
    title: text,
    summary: text,
    unreliableWhen: text,
    goodExample: text,
    badExample: text,
    lessonIds: z.array(contentId),
    chart: z
      .object({ scenario: z.enum(SCENARIO_KINDS), overlays: z.array(z.enum(CHART_OVERLAY_IDS)), pane: z.enum(CHART_PANE_IDS), lookFor: text })
      .strict()
      .nullable(),
    drillKind: z.enum(DRILL_KINDS).nullable(),
    scenarioIds: z.array(contentId),
    companyIds: z.array(contentId),
    redFlagCaseIds: z.array(contentId),
    skills: skillTags,
  })
  .strict()
  .refine((c) => c.lessonIds.length + (c.chart ? 1 : 0) + c.scenarioIds.length + c.companyIds.length + c.redFlagCaseIds.length > 0, 'a concept needs at least one lesson or practice') satisfies z.ZodType<LabConcept>;

/** A person's sign-off (spec §15.1). Only a person sets this; it is never generated. */
const humanReviewSchema = z.object({ status: z.literal('human_reviewed'), reviewer: text, reviewedAt: isoDate }).strict();
const chartPresetSchema = z
  .object({ scenario: z.enum(SCENARIO_KINDS), overlays: z.array(z.enum(CHART_OVERLAY_IDS)), pane: z.enum(CHART_PANE_IDS), lookFor: text })
  .strict();
const sourceQuality = z.enum(['primary', 'strong_secondary', 'limited_or_disputed']);
/** Generic rules must say they are a simplified teaching version, never anyone's system. */
const GENERIC_RULES_LABEL = /simplified educational version/i;

export const strategySchema = z
  .object({
    id: contentId,
    title: text,
    category: z.enum(STRATEGY_CATEGORIES),
    family: z.enum(STRATEGY_FAMILIES),
    markets: z.array(market).min(1),
    level,
    horizon: z.enum(STRATEGY_HORIZONS),
    style: z.enum(STRATEGY_STYLES),
    analysis: z.enum(ANALYSIS_KINDS),
    attribution: z.enum(['generic', 'documented']),
    traderIds: z.array(contentId),
    overview: z.object({ objective: text, holdingPeriod: text, context: text }).strict(),
    evidence: z.object({ level: sourceQuality, summary: text, sourceIds: z.array(contentId).min(1) }).strict().nullable(),
    simple: levelledTextSchema,
    reasoning: text,
    rules: z.object({ label: text, rules: z.array(text).min(1) }).strict().nullable(),
    demo: chartPresetSchema.nullable(),
    replay: z.object({ scenario: z.enum(SCENARIO_KINDS), instructions: text }).strict().nullable(),
    exercise: z
      .object({
        prompt: text,
        situation: text,
        options: z
          .array(z.object({ id: letterId, text, correct: z.boolean(), explanation: text }).strict())
          .min(3)
          .max(8)
          .refine(uniqueIds, 'exercise option ids must be unique')
          .refine((o) => o.some((x) => x.correct) && o.some((x) => !x.correct), 'need at least one option to pick and one to leave'),
      })
      .strict()
      .nullable(),
    failureAnalysis: z.array(text).min(1),
    limitations: z.array(text).min(1),
    knowledgeCheck: z.array(questionSchema).min(3),
    lessonIds: z.array(contentId),
    glossaryIds: z.array(contentId),
    sourceIds: z.array(contentId),
    review: humanReviewSchema.nullable(),
    skills: skillTags,
  })
  .strict()
  .refine((s) => s.attribution === 'documented' || s.traderIds.length === 0, 'a generic strategy cannot name traders; use attribution "documented"')
  .refine((s) => s.attribution === 'documented' || !s.rules || GENERIC_RULES_LABEL.test(s.rules.label), 'generic rules must be labelled "a simplified educational version"') satisfies z.ZodType<Strategy>;

const sourcedStatement = z.object({ text, sourceIds: z.array(contentId).min(1) }).strict();

export const traderSchema = z
  .object({
    id: contentId,
    name: text,
    markets: z.array(market).min(1),
    knownFor: text,
    summary: text,
    documented: z.array(sourcedStatement).min(1),
    interpretations: z.array(sourcedStatement),
    unverified: z.array(text),
    strategyIds: z.array(contentId),
    sourceIds: z.array(contentId).min(1),
    review: humanReviewSchema.nullable(),
  })
  .strict() satisfies z.ZodType<Trader>;

const fraction = z.number().gt(0).lte(1);
const count = z.number().int().min(1).max(500);
const criterionBase = { label: text, dimension: z.enum(CHALLENGE_DIMENSIONS) };
const challengeCriterionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('checkpoint_passed'), moduleId: contentId, orModuleIds: z.array(contentId).min(1).max(4).optional(), ...criterionBase }).strict(),
  z.object({ kind: z.literal('skill_questions'), skill: z.enum(SKILL_IDS), count, accuracy: fraction, ...criterionBase }).strict(),
  z.object({ kind: z.literal('drill'), drillKind: z.enum(DRILL_KINDS), count, accuracy: fraction, ...criterionBase }).strict(),
  z.object({ kind: z.literal('clean_trades'), count, ...criterionBase }).strict(),
  z.object({ kind: z.literal('reviewed_trades'), count, ...criterionBase }).strict(),
  z.object({ kind: z.literal('replays'), count, minProcessScore: z.number().min(0).lte(1), conditions: z.number().int().min(1).max(7), ...criterionBase }).strict(),
  z.object({ kind: z.literal('lab_cases'), labKind: z.enum(['red_flag', 'scenario']), count, minScore: fraction, ...criterionBase }).strict(),
  z.object({ kind: z.literal('strategies_completed'), count, ...criterionBase }).strict(),
  z.object({ kind: z.literal('backtests_tested_out_of_sample'), count, ...criterionBase }).strict(),
  z.object({ kind: z.literal('mt_tasks'), taskIds: z.array(contentId).min(1), ...criterionBase }).strict(),
  z.object({ kind: z.literal('traders_studied'), count, ...criterionBase }).strict(),
]);

export const challengeSchema = z
  .object({
    id: contentId,
    type: z.enum(CHALLENGE_TYPES),
    title: text,
    summary: text,
    skills: skillTags,
    criteria: z.array(challengeCriterionSchema).min(1).max(8),
    traderIds: z.array(contentId).optional(),
  })
  .strict()
  .refine((c) => c.type !== 'famous_trader' || c.criteria.some((x) => x.kind === 'traders_studied'), 'a famous-trader challenge must count traders studied') satisfies z.ZodType<Challenge>;

export const contentManifestSchema = z
  .object({ version: z.string().regex(/^\d{4}\.\d{1,2}\.\d+$/, 'version is YYYY.M.N') })
  .strict();

export const CONTENT_SCHEMAS = {
  glossary: glossaryEntrySchema,
  disclosures: disclosureSchema,
  sources: sourceSchema,
  quizzes: quizSchema,
  lessons: lessonSchema,
  mtTasks: metaTraderTaskSchema,
  psychScenarios: psychScenarioSchema,
  companies: companySchema,
  redFlagCases: redFlagCaseSchema,
  marketScenarios: marketScenarioSchema,
  marketComparison: comparisonDimensionSchema,
  labConcepts: labConceptSchema,
  strategies: strategySchema,
  traders: traderSchema,
  challenges: challengeSchema,
  calendarEvents: calendarEventTypeSchema,
  modules: moduleSchema,
  programs: programSchema,
} as const;

export type ContentType = keyof typeof CONTENT_SCHEMAS;
export const CONTENT_TYPES = Object.keys(CONTENT_SCHEMAS) as ContentType[];
