import type { ContentBundle } from './bundle';

export interface ContentIssue {
  readonly severity: 'error' | 'warning';
  readonly file: string;
  readonly message: string;
}

/** Inline glossary link syntax inside content text: `[[pip]]` or `[[pip|pips]]`. */
export const GLOSSARY_LINK = /\[\[([a-z0-9-]+)(?:\|[^\]]+)?\]\]/g;

export function glossaryLinksIn(value: unknown): string[] {
  const json = JSON.stringify(value);
  return [...json.matchAll(GLOSSARY_LINK)].map((m) => m[1] as string);
}

type Item = { readonly id: string };
type Check = (bundle: ContentBundle, ids: IdSets) => ContentIssue[];

interface IdSets {
  readonly glossary: ReadonlySet<string>;
  readonly sources: ReadonlySet<string>;
  readonly quizzes: ReadonlySet<string>;
  readonly lessons: ReadonlySet<string>;
  readonly modules: ReadonlySet<string>;
  readonly mtTasks: ReadonlySet<string>;
}

const idSet = (items: readonly Item[]): ReadonlySet<string> => new Set(items.map((i) => i.id));
const error = (file: string, message: string): ContentIssue => ({ severity: 'error', file, message });
const warning = (file: string, message: string): ContentIssue => ({ severity: 'warning', file, message });

function missing(file: string, kind: string, refs: readonly string[], known: ReadonlySet<string>): ContentIssue[] {
  return refs.filter((r) => !known.has(r)).map((r) => error(file, `unknown ${kind} "${r}"`));
}

const checkGlossary: Check = (b, ids) =>
  b.glossary.flatMap((g) => {
    const file = `glossary/${g.id}`;
    return [
      ...missing(file, 'related glossary term', g.related, ids.glossary),
      ...missing(file, 'source', g.sourceIds, ids.sources),
      ...missing(file, 'glossary link', glossaryLinksIn(g), ids.glossary),
      ...(g.related.includes(g.id) ? [error(file, 'term lists itself as related')] : []),
    ];
  });

const checkDisclosures: Check = (b, ids) =>
  b.disclosures.flatMap((d) =>
    d.statistics.flatMap((s) => {
      const file = `disclosures/${d.id}`;
      const source = b.sources.find((src) => src.id === s.sourceId);
      if (!source) return [error(file, `statistic "${s.id}" cites unknown source "${s.sourceId}"`)];
      return source.humanReviewed ? [] : [error(file, `statistic "${s.id}" cites a source not yet human-reviewed`)];
    }),
  ).concat(b.disclosures.flatMap((d) => missing(`disclosures/${d.id}`, 'glossary link', glossaryLinksIn(d), ids.glossary)));

const checkSources: Check = (b) =>
  b.sources
    .filter((s) => !s.humanReviewed)
    .map((s) => warning(`sources/${s.id}`, 'not yet human-reviewed; must not back trader or strategy claims in a release'));

function checkQuestions(file: string, questions: ContentBundle['quizzes'][number]['questions'], ids: IdSets): ContentIssue[] {
  return questions.flatMap((q) => {
    const optionIds = q.options.map((o) => o.id);
    return [
      ...(new Set(optionIds).size !== optionIds.length ? [error(file, `question "${q.id}" has duplicate option ids`)] : []),
      ...q.correctOptionIds
        .filter((c) => !optionIds.includes(c))
        .map((c) => error(file, `question "${q.id}" answer key "${c}" is not an option`)),
      ...(q.correctOptionIds.length >= optionIds.length ? [error(file, `question "${q.id}" has no wrong options`)] : []),
      ...missing(file, 'glossary term', q.glossaryIds, ids.glossary),
    ];
  });
}

const checkQuizzes: Check = (b, ids) =>
  b.quizzes.flatMap((quiz) => [
    ...checkQuestions(`quizzes/${quiz.id}`, quiz.questions, ids),
    ...missing(`quizzes/${quiz.id}`, 'glossary link', glossaryLinksIn(quiz), ids.glossary),
  ]);

const checkLessons: Check = (b, ids) =>
  b.lessons.flatMap((l) => {
    const file = `lessons/${l.id}`;
    const owner = b.modules.find((m) => m.id === l.moduleId);
    return [
      ...(owner ? [] : [error(file, `unknown module "${l.moduleId}"`)]),
      ...(owner && !owner.lessonIds.includes(l.id) ? [error(file, `module "${owner.id}" does not list this lesson`)] : []),
      ...checkQuestions(file, l.quickCheck, ids),
      ...missing(file, 'glossary term', l.glossaryIds, ids.glossary),
      ...missing(file, 'glossary link', glossaryLinksIn(l), ids.glossary),
      ...missing(file, 'source', l.sourceIds, ids.sources),
      ...(l.doItNow.mtTaskId ? missing(file, 'MetaTrader task', [l.doItNow.mtTaskId], ids.mtTasks) : []),
      ...(l.doItNow.mtTaskId && l.doItNow.kind !== 'metatrader' ? [error(file, 'a MetaTrader task needs doItNow.kind "metatrader"')] : []),
    ];
  });

const checkModules: Check = (b, ids) =>
  b.modules.flatMap((m) => {
    const file = `modules/${m.id}`;
    return [
      ...missing(file, 'lesson', m.lessonIds, ids.lessons),
      ...missing(file, 'checkpoint quiz', [m.checkpointQuizId], ids.quizzes),
      ...(b.quizzes.find((q) => q.id === m.checkpointQuizId && q.passMark < 0.8)
        ? [error(file, 'checkpoint quiz pass mark must be at least 80%')]
        : []),
    ];
  });

const checkMtTasks: Check = (b, ids) =>
  b.mtTasks.flatMap((t) => {
    const file = `mtTasks/${t.id}`;
    return [
      ...checkQuestions(file, t.afterQuestions, ids),
      ...missing(file, 'glossary term', t.glossaryIds, ids.glossary),
      ...missing(file, 'glossary link', glossaryLinksIn(t), ids.glossary),
    ];
  });

const checkPsych: Check = (b, ids) =>
  b.psychScenarios.flatMap((s) => {
    const file = `psychScenarios/${s.id}`;
    return [...missing(file, 'glossary term', s.glossaryIds, ids.glossary), ...missing(file, 'glossary link', glossaryLinksIn(s), ids.glossary)];
  });

/** Glossary references in lab content: the listed terms and inline links. */
const glossaryRefs = (file: string, item: object & { readonly glossaryIds?: readonly string[] }, ids: IdSets): ContentIssue[] => [
  ...missing(file, 'glossary term', item.glossaryIds ?? [], ids.glossary),
  ...missing(file, 'glossary link', glossaryLinksIn(item), ids.glossary),
];

const checkLabContent: Check = (b, ids) => [
  ...b.companies.flatMap((c) => glossaryRefs(`companies/${c.id}`, c, ids)),
  ...b.redFlagCases.flatMap((c) => glossaryRefs(`redFlagCases/${c.id}`, c, ids)),
  ...b.marketScenarios.flatMap((s) => glossaryRefs(`marketScenarios/${s.id}`, s, ids)),
  ...b.marketComparison.flatMap((d) => glossaryRefs(`marketComparison/${d.id}`, d, ids)),
  ...b.marketComparison
    .filter((d, i) => b.marketComparison.findIndex((x) => x.order === d.order) !== i)
    .map((d) => error(`marketComparison/${d.id}`, `order ${d.order} is used more than once`)),
  ...b.labConcepts.flatMap((c) => {
    const file = `labConcepts/${c.id}`;
    return [
      ...glossaryRefs(file, c, ids),
      ...missing(file, 'lesson', c.lessonIds, ids.lessons),
      ...missing(file, 'market scenario', c.scenarioIds, idSet(b.marketScenarios)),
      ...missing(file, 'company', c.companyIds, idSet(b.companies)),
      ...missing(file, 'red-flag case', c.redFlagCaseIds, idSet(b.redFlagCases)),
    ];
  }),
];

const checkCalendar: Check = (b, ids) =>
  b.calendarEvents.flatMap((e) => {
    const file = `calendarEvents/${e.id}`;
    return [
      ...glossaryRefs(file, e, ids),
      ...missing(file, 'lesson', e.lessonIds, ids.lessons),
      ...missing(file, 'market scenario', e.scenarioIds, idSet(b.marketScenarios)),
      ...(b.calendarEvents.findIndex((x) => x.kind === e.kind) !== b.calendarEvents.indexOf(e) ? [error(file, `kind ${e.kind} is used by another event type`)] : []),
    ];
  });

const checkStrategies: Check = (b, ids) => {
  const traders = idSet(b.traders);
  return b.strategies.flatMap((st) => {
    const file = `strategies/${st.id}`;
    return [
      ...checkQuestions(file, st.knowledgeCheck, ids),
      ...glossaryRefs(file, st, ids),
      ...missing(file, 'lesson', st.lessonIds, ids.lessons),
      ...missing(file, 'source', [...st.sourceIds, ...(st.evidence?.sourceIds ?? [])], ids.sources),
      ...missing(file, 'trader', st.traderIds, traders),
    ];
  });
};

const checkTraders: Check = (b, ids) => {
  const strategies = idSet(b.strategies);
  return b.traders.flatMap((t) => {
    const file = `traders/${t.id}`;
    const cited = [...t.sourceIds, ...t.documented.flatMap((d) => d.sourceIds), ...t.interpretations.flatMap((d) => d.sourceIds)];
    return [...glossaryRefs(file, t, ids), ...missing(file, 'strategy', t.strategyIds, strategies), ...missing(file, 'source', cited, ids.sources)];
  });
};

/** Sources may relate to content that is still withheld, so those links only warn; disagreements must point at a real source. */
const checkSourceLinks: Check = (b, ids) => {
  const strategies = idSet(b.strategies);
  const traders = idSet(b.traders);
  return b.sources.flatMap((src) => {
    const file = `sources/${src.id}`;
    return [
      ...src.relatedStrategyIds.filter((r) => !strategies.has(r)).map((r) => warning(file, `related strategy "${r}" is not in this bundle`)),
      ...src.relatedTraderIds.filter((r) => !traders.has(r)).map((r) => warning(file, `related trader "${r}" is not in this bundle`)),
      ...missing(file, 'source in a disagreement', src.disagreements.map((d) => d.sourceId), ids.sources),
      ...(src.disagreements.some((d) => d.sourceId === src.id) ? [error(file, 'a source cannot disagree with itself')] : []),
    ];
  });
};

const checkModuleTraders: Check = (b) => {
  const traders = idSet(b.traders);
  return b.modules.flatMap((m) => missing(`modules/${m.id}`, 'trader', m.traderIds ?? [], traders));
};

/** Every challenge requirement must point at something that exists, or it could never be met. */
const checkChallenges: Check = (b, ids) =>
  b.challenges.flatMap((c) => {
    const file = `challenges/${c.id}`;
    return [
      ...missing(file, 'module', c.criteria.flatMap((x) => (x.kind === 'checkpoint_passed' ? [x.moduleId, ...(x.orModuleIds ?? [])] : [])), ids.modules),
      ...missing(file, 'MetaTrader task', c.criteria.flatMap((x) => (x.kind === 'mt_tasks' ? x.taskIds : [])), ids.mtTasks),
      ...missing(file, 'trader', c.traderIds ?? [], idSet(b.traders)),
      ...c.criteria.flatMap((x) => {
        if (x.kind === 'lab_cases') {
          const available = x.labKind === 'red_flag' ? b.redFlagCases.length : b.marketScenarios.length;
          return x.count > available ? [error(file, `needs ${x.count} ${x.labKind} cases but only ${available} exist`)] : [];
        }
        if (x.kind === 'strategies_completed' && x.count > b.strategies.length) return [error(file, `needs ${x.count} strategies but only ${b.strategies.length} exist`)];
        return [];
      }),
    ];
  });

const checkPrograms: Check = (b, ids) => b.programs.flatMap((p) => missing(`programs/${p.id}`, 'module', p.moduleIds, ids.modules));

/** Question ids are spaced-repetition keys, so they must be unique across all lessons and quizzes. */
const checkQuestionIds: Check = (b) => {
  const all = [
    ...b.lessons.flatMap((l) => l.quickCheck),
    ...b.quizzes.flatMap((q) => q.questions),
    ...b.mtTasks.flatMap((t) => t.afterQuestions),
    ...b.strategies.flatMap((st) => st.knowledgeCheck),
  ].map((q) => q.id);
  const dupes = [...new Set(all.filter((id, i) => all.indexOf(id) !== i))];
  return dupes.map((id) => error('questions', `question id "${id}" is used more than once`));
};

export function checkCrossReferences(bundle: ContentBundle): ContentIssue[] {
  const ids: IdSets = {
    glossary: idSet(bundle.glossary),
    sources: idSet(bundle.sources),
    quizzes: idSet(bundle.quizzes),
    lessons: idSet(bundle.lessons),
    modules: idSet(bundle.modules),
    mtTasks: idSet(bundle.mtTasks),
  };
  return [
    checkGlossary,
    checkDisclosures,
    checkSources,
    checkSourceLinks,
    checkQuizzes,
    checkLessons,
    checkModules,
    checkModuleTraders,
    checkMtTasks,
    checkPsych,
    checkLabContent,
    checkCalendar,
    checkStrategies,
    checkTraders,
    checkPrograms,
    checkChallenges,
    checkQuestionIds,
  ].flatMap((check) => check(bundle, ids));
}
