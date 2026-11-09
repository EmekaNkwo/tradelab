import { useCallback, useMemo, useRef, useState } from 'react';
import { gradeQuestions } from '../../domain/learning/assessment';
import type { Source } from '../../domain/models/content';
import type { SavedListKind, SavedStrategy, Strategy, Trader } from '../../domain/models/strategies';
import {
  encodeAnswers,
  NO_FILTERS,
  searchLibrary,
  STRATEGY_PASS_MARK,
  strategyCompletion,
  type LibraryFilters,
  type LibraryGroup,
  type StrategyAttempt,
  type StrategyCompletion,
} from '../../domain/strategies';
import type { AppError } from '../../shared/errors';
import { ok, type Result } from '../../shared/result';
import { toUtcIso } from '../../shared/time';
import { useContainer, useLiveQuery, type QueryState } from '../app';
import { filterDimensionsFor, type FilterDimension } from './labels';

/** Strategy Library search (spec §16.1). */
export function useStrategyLibrary(): {
  readonly query: string;
  readonly setQuery: (q: string) => void;
  readonly filters: LibraryFilters;
  readonly setFilters: (f: LibraryFilters) => void;
  readonly groups: readonly LibraryGroup[];
  readonly total: number;
  /** Filters to show: market choices no strategy covers are left out. */
  readonly dimensions: readonly FilterDimension[];
} {
  const { content } = useContainer();
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<LibraryFilters>(NO_FILTERS);
  const groups = useMemo(
    () => searchLibrary(content.strategies(), query, filters, (id) => content.trader(id)?.name ?? null),
    [content, query, filters],
  );
  const dimensions = useMemo(() => filterDimensionsFor(content.strategies()), [content]);
  return { query, setQuery, filters, setFilters, groups, total: content.strategies().length, dimensions };
}

/** Read-only strategy, trader and source content. Unreviewed attributed content never gets this far (spec §15.1). */
export function useStrategyContent() {
  const { content } = useContainer();
  return useMemo(
    () => ({
      strategy: (id: string): Strategy | null => content.strategy(id),
      strategies: (): readonly Strategy[] => content.strategies(),
      trader: (id: string): Trader | null => content.trader(id),
      traders: (): readonly Trader[] => content.traders(),
      /** Reviewed sources only: screens never cite or link an unreviewed one. */
      reviewedSource: (id: string): Source | null => content.reviewedSource(id),
      reviewedSources: (): readonly Source[] => content.reviewedSources(),
      lessonTitle: (id: string) => content.lesson(id)?.title ?? null,
      /** The Study the Great Traders program, once its modules have passed review. */
      greatTradersProgram: () => content.program('study-the-great-traders'),
    }),
    [content],
  );
}

export interface SavedLists {
  readonly bookmarks: ReadonlySet<string>;
  readonly study: readonly SavedStrategy[];
  readonly inStudy: ReadonlySet<string>;
}

export function useSavedStrategies(): QueryState<SavedLists> {
  const c = useContainer();
  return useLiveQuery(async () => {
    const r = await c.strategies.saved();
    if (!r.ok) return r;
    const study = r.value.filter((s) => s.list === 'study');
    return ok({ bookmarks: new Set(r.value.filter((s) => s.list === 'bookmark').map((s) => s.strategyId)), study, inStudy: new Set(study.map((s) => s.strategyId)) });
  }, ['strategy_saved']);
}

export function useStrategyActions() {
  const c = useContainer();
  return useMemo(
    () => ({
      add: (id: string, list: SavedListKind) => c.strategies.add(id, list, toUtcIso(c.clock.now())),
      remove: (id: string, list: SavedListKind) => c.strategies.remove(id, list),
      /** `visibleIds`: the study list as shown, so hidden saved items never block a move. */
      move: (id: string, direction: -1 | 1, visibleIds: readonly string[]) => c.strategies.move(id, direction, visibleIds),
    }),
    [c],
  );
}

const toStrategyAttempt = (a: { readonly kind: string; readonly refId: string; readonly score: number }): StrategyAttempt[] =>
  a.kind === 'strategy_exercise' || a.kind === 'strategy_check' ? [{ kind: a.kind, refId: a.refId, score: a.score }] : [];

/** Completion of every strategy page, from recorded attempts (spec §15.3 item 14). */
export function useStrategyProgress(): QueryState<ReadonlyMap<string, StrategyCompletion>> {
  const c = useContainer();
  return useLiveQuery(async () => {
    const r = await c.labs.attempts();
    if (!r.ok) return r;
    const attempts = r.value.flatMap(toStrategyAttempt);
    return ok(new Map(c.content.strategies().map((s) => [s.id, strategyCompletion(s, attempts)])));
  }, ['lab_attempt']);
}

export interface KnowledgeCheck {
  readonly answers: Readonly<Record<string, readonly string[]>>;
  /** Set when every question is answered. */
  readonly result: { readonly score: number; readonly passed: boolean } | null;
  readonly saving: boolean;
  readonly error: AppError | null;
  answer(questionId: string, chosen: readonly string[]): void;
  finish(): Promise<void>;
  restart(): void;
}

/**
 * The strategy knowledge check, run through the same question flow as a
 * checkpoint: one try per question, graded on first answers, 80% to pass.
 * The result is saved as a lab attempt; a failed save still shows the score.
 */
export function useKnowledgeCheck(strategy: Strategy): KnowledgeCheck {
  const c = useContainer();
  const [answers, setAnswers] = useState<Readonly<Record<string, readonly string[]>>>({});
  const [result, setResult] = useState<KnowledgeCheck['result']>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  const busy = useRef(false);
  // First answers, kept in a ref too so `finish` right after the last answer sees it.
  const latest = useRef<Readonly<Record<string, readonly string[]>>>({});

  const answer = useCallback((questionId: string, chosen: readonly string[]) => {
    setAnswers((a) => (a[questionId] ? a : { ...a, [questionId]: chosen }));
    latest.current = latest.current[questionId] ? latest.current : { ...latest.current, [questionId]: chosen };
  }, []);

  const finish = useCallback(async () => {
    if (busy.current || result) return;
    busy.current = true;
    setSaving(true);
    const graded = gradeQuestions(strategy.knowledgeCheck, latest.current, STRATEGY_PASS_MARK);
    setResult({ score: graded.score, passed: graded.passed });
    const saved: Result<unknown, AppError> = await c.labs.record(
      { kind: 'strategy_check', refId: strategy.id, picked: encodeAnswers(latest.current), score: graded.score },
      toUtcIso(c.clock.now()),
    );
    setError(saved.ok ? null : saved.error);
    setSaving(false);
    busy.current = false;
  }, [c, strategy, result]);

  const restart = useCallback(() => {
    setAnswers({});
    latest.current = {};
    setResult(null);
    setError(null);
  }, []);

  return { answers, result, saving, error, answer, finish, restart };
}
