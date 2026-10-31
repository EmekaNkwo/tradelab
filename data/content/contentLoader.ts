import type {
  Disclosure,
  DisclosureTrigger,
  GlossaryEntry,
  Lesson,
  MetaTraderTask,
  PsychScenario,
  Module,
  Program,
  Question,
  Quiz,
  Source,
} from '../../domain/models/content';
import type { Strategy, Trader } from '../../domain/models/strategies';
import type { Challenge, SkillId } from '../../domain/models/progress';
import type { ComparisonDimension, FictionalCompany, LabConcept, MarketScenario, RedFlagCase } from '../../domain/models/labs';
import type { CalendarEventType } from '../../domain/models/calendar';
import { dataQualityError, type AppError } from '../../shared/errors';
import { err, ok, type Result } from '../../shared/result';
import { applyAttributionGate, isReviewedSource } from './attributionGate';
import { contentBundleSchema, type ContentBundle } from './bundle';
import generatedBundle from './generated/contentBundle.json';

export interface QuestionInfo {
  readonly skills: readonly SkillId[];
  readonly lessonId: string | null;
  readonly moduleId: string | null;
  readonly strategyId: string | null;
}

/** Read-only access to the content shipped with the app. */
export interface ContentRepository {
  readonly version: string;
  readonly hash: string;
  glossary(): readonly GlossaryEntry[];
  glossaryEntry(id: string): GlossaryEntry | null;
  disclosuresFor(trigger: DisclosureTrigger): readonly Disclosure[];
  programs(): readonly Program[];
  program(id: string): Program | null;
  module(id: string): Module | null;
  lesson(id: string): Lesson | null;
  quiz(id: string): Quiz | null;
  /** Any question by id: lesson quick checks and quiz questions. */
  question(id: string): Question | null;
  mtTasks(): readonly MetaTraderTask[];
  mtTask(id: string): MetaTraderTask | null;
  psychScenarios(): readonly PsychScenario[];
  psychScenario(id: string): PsychScenario | null;
  modules(): readonly Module[];
  companies(): readonly FictionalCompany[];
  company(id: string): FictionalCompany | null;
  redFlagCases(): readonly RedFlagCase[];
  redFlagCase(id: string): RedFlagCase | null;
  marketScenarios(category?: MarketScenario['category']): readonly MarketScenario[];
  marketScenario(id: string): MarketScenario | null;
  /** Market calendar event types (spec §25), each with fictional sample events. */
  calendarEvents(): readonly CalendarEventType[];
  calendarEvent(id: string): CalendarEventType | null;
  /** In display order. */
  marketComparison(): readonly ComparisonDimension[];
  /** One lab's concepts, by level then order. */
  labConcepts(lab: LabConcept['lab']): readonly LabConcept[];
  labConcept(id: string): LabConcept | null;
  /** Strategy pages that passed the attribution gate (spec §15.1), by title. */
  strategies(): readonly Strategy[];
  strategy(id: string): Strategy | null;
  /** Famous-trader pages; only human-reviewed ones ever reach here. */
  traders(): readonly Trader[];
  trader(id: string): Trader | null;
  /**
   * Research Library: human-reviewed sources only (spec §26). A source whose
   * related traders and strategies are all withheld is left out too.
   */
  reviewedSources(): readonly Source[];
  source(id: string): Source | null;
  /** A source only if a person has reviewed it; screens cite and link only these. */
  reviewedSource(id: string): Source | null;
  /** Challenges that passed the attribution gate (spec §27), in content order. */
  challenges(): readonly Challenge[];
  challenge(id: string): Challenge | null;
  /**
   * Where a question lives and which skills it gives evidence for (spec §23):
   * its own tags, else its lesson's, else its module's (lesson or checkpoint),
   * else its strategy page's. Null for an unknown question.
   */
  questionInfo(id: string): QuestionInfo | null;
  counts(): Readonly<Record<'glossary' | 'disclosures' | 'sources' | 'lessons' | 'modules' | 'programs', number>>;
}

/** Validates the bundle at load time; a broken bundle never reaches the UI as if it were fine. */
export function parseContentBundle(raw: unknown): Result<ContentBundle, AppError> {
  const parsed = contentBundleSchema.safeParse(raw);
  if (!parsed.success) {
    return err(
      dataQualityError('Bundled content failed validation', {
        issues: parsed.error.issues.slice(0, 10).map((i) => `${i.path.join('.')}: ${i.message}`),
      }),
    );
  }
  return ok(parsed.data);
}

/** Builds the repository over the gated bundle, so unreviewed attributed content can never reach a screen. */
export function createContentRepository(raw: ContentBundle): ContentRepository {
  const { bundle } = applyAttributionGate(raw);
  const glossaryById = new Map(bundle.glossary.map((g) => [g.id, g]));
  const sortedGlossary = [...bundle.glossary].sort((a, b) => a.term.localeCompare(b.term));
  const byId = <T extends { readonly id: string }>(items: readonly T[]) => new Map(items.map((i) => [i.id, i]));
  const programs = byId(bundle.programs);
  const modules = byId(bundle.modules);
  const lessons = byId(bundle.lessons);
  const quizzes = byId(bundle.quizzes);
  const mtTasks = byId(bundle.mtTasks);
  const psych = byId(bundle.psychScenarios);
  const companies = byId(bundle.companies);
  const redFlags = byId(bundle.redFlagCases);
  const scenarios = byId(bundle.marketScenarios);
  const concepts = byId(bundle.labConcepts);
  const calendarById = byId(bundle.calendarEvents);
  const strategies = byId(bundle.strategies);
  const sortedStrategies = [...bundle.strategies].sort((a, b) => a.title.localeCompare(b.title));
  const traders = byId(bundle.traders);
  const sortedTraders = [...bundle.traders].sort((a, b) => a.name.localeCompare(b.name));
  const sources = byId(bundle.sources);
  const relatedShips = (s: Source) => {
    const related = [...s.relatedTraderIds.map((id) => traders.has(id)), ...s.relatedStrategyIds.map((id) => strategies.has(id))];
    return related.length === 0 || related.some(Boolean);
  };
  const reviewedSources = bundle.sources
    .filter((s) => isReviewedSource(s) && relatedShips(s))
    .sort((a, b) => a.title.localeCompare(b.title));
  const reviewedById = new Map(bundle.sources.filter(isReviewedSource).map((s) => [s.id, s]));
  const comparison = [...bundle.marketComparison].sort((a, b) => a.order - b.order);
  const LEVEL_ORDER = { beginner: 0, intermediate: 1, advanced: 2 } as const;
  const sortedConcepts = [...bundle.labConcepts].sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || a.order - b.order);
  const questions = byId([
    ...bundle.lessons.flatMap((l) => l.quickCheck),
    ...bundle.quizzes.flatMap((q) => q.questions),
    ...bundle.mtTasks.flatMap((t) => t.afterQuestions),
    ...bundle.strategies.flatMap((st) => st.knowledgeCheck),
  ]);
  const challenges = byId(bundle.challenges);
  const questionInfo = questionIndex(bundle);
  return {
    version: bundle.version,
    hash: bundle.hash,
    glossary: () => sortedGlossary,
    glossaryEntry: (id) => glossaryById.get(id) ?? null,
    disclosuresFor: (trigger) => bundle.disclosures.filter((d) => d.triggers.includes(trigger)),
    programs: () => bundle.programs,
    program: (id) => programs.get(id) ?? null,
    module: (id) => modules.get(id) ?? null,
    lesson: (id) => lessons.get(id) ?? null,
    quiz: (id) => quizzes.get(id) ?? null,
    question: (id) => questions.get(id) ?? null,
    mtTasks: () => bundle.mtTasks,
    mtTask: (id) => mtTasks.get(id) ?? null,
    psychScenarios: () => bundle.psychScenarios,
    psychScenario: (id) => psych.get(id) ?? null,
    modules: () => bundle.modules,
    companies: () => bundle.companies,
    company: (id) => companies.get(id) ?? null,
    redFlagCases: () => bundle.redFlagCases,
    redFlagCase: (id) => redFlags.get(id) ?? null,
    marketScenarios: (category) => (category ? bundle.marketScenarios.filter((s) => s.category === category) : bundle.marketScenarios),
    marketScenario: (id) => scenarios.get(id) ?? null,
    calendarEvents: () => bundle.calendarEvents,
    calendarEvent: (id) => calendarById.get(id) ?? null,
    marketComparison: () => comparison,
    labConcepts: (lab) => sortedConcepts.filter((c) => c.lab === lab),
    labConcept: (id) => concepts.get(id) ?? null,
    strategies: () => sortedStrategies,
    strategy: (id) => strategies.get(id) ?? null,
    traders: () => sortedTraders,
    trader: (id) => traders.get(id) ?? null,
    reviewedSources: () => reviewedSources,
    source: (id) => sources.get(id) ?? null,
    reviewedSource: (id) => reviewedById.get(id) ?? null,
    challenges: () => bundle.challenges,
    challenge: (id) => challenges.get(id) ?? null,
    questionInfo: (id) => questionInfo.get(id) ?? null,
    counts: () => ({
      glossary: bundle.glossary.length,
      disclosures: bundle.disclosures.length,
      sources: bundle.sources.length,
      lessons: bundle.lessons.length,
      modules: bundle.modules.length,
      programs: bundle.programs.length,
    }),
  };
}

function questionIndex(bundle: ContentBundle): ReadonlyMap<string, QuestionInfo> {
  const modules = new Map(bundle.modules.map((m) => [m.id, m]));
  const index = new Map<string, QuestionInfo>();
  for (const l of bundle.lessons) {
    const moduleSkills = modules.get(l.moduleId)?.skills ?? [];
    for (const q of l.quickCheck) index.set(q.id, { skills: q.skills ?? l.skills ?? moduleSkills, lessonId: l.id, moduleId: l.moduleId, strategyId: null });
  }
  for (const m of bundle.modules) {
    const quiz = bundle.quizzes.find((q) => q.id === m.checkpointQuizId);
    for (const q of quiz?.questions ?? []) if (!index.has(q.id)) index.set(q.id, { skills: q.skills ?? m.skills, lessonId: null, moduleId: m.id, strategyId: null });
  }
  for (const st of bundle.strategies) {
    for (const q of st.knowledgeCheck) index.set(q.id, { skills: q.skills ?? st.skills, lessonId: null, moduleId: null, strategyId: st.id });
  }
  return index;
}

export function loadBundledContent(): Result<ContentRepository, AppError> {
  const bundle = parseContentBundle(generatedBundle);
  return bundle.ok ? ok(createContentRepository(bundle.value)) : bundle;
}
