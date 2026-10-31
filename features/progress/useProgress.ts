import { useCallback, useEffect, useRef, useState } from 'react';
import { localDateIn } from '../../domain/learning/dates';
import { bringForward } from '../../domain/learning/spacedRepetition';
import type { DailyClass } from '../../domain/models/learning';
import { SKILL_IDS, type SkillId } from '../../domain/models/progress';
import type { AppError } from '../../shared/errors';
import { logger } from '../../shared/logger';
import { ok, type Result } from '../../shared/result';
import { toUtcIso } from '../../shared/time';
import { useContainer, useLiveQuery, type Container, type QueryState } from '../app';
import { DRILL_INFO } from '../practice';
import { awardKey } from '../../domain/progress';
import { buildDashboard, type Dashboard, type DashboardContent } from './dashboard';
import { progressFacts } from './progressFacts';

/** How many recent replays and journal entries progress reads (as the Practice Progress Review does). */
export const PROGRESS_REPLAY_LIMIT = 1000;
export const PROGRESS_JOURNAL_LIMIT = 2000;

export const PROGRESS_TABLES = [
  'quiz_attempt',
  'drill_attempt',
  'replay_attempt',
  'lab_attempt',
  'journal_entry',
  'psych_attempt',
  'backtest_run',
  'mt_task_completion',
  'program_enrolment',
  'daily_class',
  'unit_completion',
  'review_queue',
  'settings',
  'award_unlock',
];

export function dashboardContent(c: Pick<Container, 'content'>): DashboardContent {
  const concepts = [...c.content.labConcepts('technical'), ...c.content.labConcepts('fundamental')];
  return {
    lessonTitle: (id) => c.content.lesson(id)?.title ?? null,
    firstLessonOf: (moduleId) => c.content.module(moduleId)?.lessonIds[0] ?? null,
    // Concepts for the missed lesson first, then ones teaching any lesson of its module, then any tagged with the skill.
    conceptsFor: ({ lessonId, moduleId }, skill) => {
      const moduleLessons = new Set(moduleId ? (c.content.module(moduleId)?.lessonIds ?? []) : []);
      const byLesson = concepts.filter((k) => lessonId !== null && k.lessonIds.includes(lessonId));
      const byModule = concepts.filter((k) => k.lessonIds.some((id) => moduleLessons.has(id)));
      const bySkill = concepts.filter((k) => k.skills.includes(skill));
      return [...new Set([...byLesson, ...byModule, ...bySkill])].map((k) => ({
        id: k.id,
        lab: k.lab,
        title: k.title,
        scenario: k.chart?.scenario ?? null,
      }));
    },
    drillTitle: (kind) => DRILL_INFO[kind as keyof typeof DRILL_INFO]?.title ?? kind,
    moduleTitle: (id) => c.content.module(id)?.title ?? c.content.strategy(id)?.title ?? null,
    strategyCount: () => c.content.strategies().length,
    challenges: () => c.content.challenges(),
    tradersAvailable: () => c.content.traders().length > 0,
  };
}

/**
 * `latch`: store awards met for the first time (the Progress screen). Home reads the same dashboard without
 * latching, so opening Home never changes when an award counts as earned.
 */
async function loadDashboard(c: Container, latch: boolean): Promise<Result<Dashboard, AppError>> {
  const [settings, enrolment] = await Promise.all([c.settings.get(), c.learning.currentEnrolment()]);
  if (!settings.ok) return settings;
  if (!enrolment.ok) return enrolment;
  const e = enrolment.value;
  const [quizzes, drills, labs, replays, journal, psych, runs, tasks, unlocks] = await Promise.all([
    c.learning.quizAttempts(),
    c.practice.drillAttempts(),
    c.labs.attempts(),
    c.practice.replayAttempts(PROGRESS_REPLAY_LIMIT),
    c.journal.list({ limit: PROGRESS_JOURNAL_LIMIT }),
    c.journal.psychAttempts(),
    c.backtests.runs(null),
    c.mtTasks.completions(),
    c.awards.unlocks(),
  ]);
  const [classes, units] = await Promise.all([
    e ? c.learning.classes(e.id) : Promise.resolve(ok([] as readonly DailyClass[])),
    e ? c.learning.completedUnitIds(e.id) : Promise.resolve(ok(new Set<string>() as ReadonlySet<string>)),
  ]);
  if (!quizzes.ok) return quizzes;
  if (!drills.ok) return drills;
  if (!labs.ok) return labs;
  if (!replays.ok) return replays;
  if (!journal.ok) return journal;
  if (!psych.ok) return psych;
  if (!runs.ok) return runs;
  if (!tasks.ok) return tasks;
  if (!unlocks.ok) return unlocks;
  if (!classes.ok) return classes;
  if (!units.ok) return units;
  const timeZone = settings.value.timeZone;
  const facts = progressFacts(c.content, {
    quizAttempts: quizzes.value,
    drillAttempts: drills.value,
    labAttempts: labs.value,
    replays: replays.value,
    journal: journal.value,
    psych: psych.value,
    backtests: runs.value,
    completedMtTaskIds: new Set(tasks.value.map((t) => t.taskId)),
    classes: classes.value,
    completedUnitIds: units.value,
    programId: e?.programId ?? null,
    timeZone,
    riskLimitPercent: settings.value.riskRules.maxRiskPerTradePercent,
  });
  const content = dashboardContent(c);
  const build = (unlocked: ReadonlyMap<string, string>) =>
    buildDashboard(content, {
      facts,
      journal: journal.value,
      today: localDateIn(c.clock.now(), timeZone),
      now: c.clock.now(),
      timeZone,
      studyDays: e?.settings.studyDays ?? [],
      streaks: settings.value.streaks,
      unlocked,
    });
  const stored = new Map(unlocks.value.map((u) => [awardKey(u.kind, u.awardId), u.unlockedAt as string]));
  const dashboard = build(stored);
  const fresh = dashboard.awards.newUnlocks;
  if (!latch || fresh.length === 0) return ok(dashboard);
  // Latch what was met for the first time (spec §29), so it stays earned with its date.
  const now = toUtcIso(c.clock.now());
  const saved = await c.awards.recordUnlocks(
    fresh.map((u) => ({ kind: u.kind, awardId: u.id })),
    now,
  );
  if (!saved.ok) {
    logger.warn('Awards not latched', { kind: saved.error.kind });
    return ok(dashboard);
  }
  return ok(build(new Map([...stored, ...fresh.map((u) => [awardKey(u.kind, u.id), now as string] as const)])));
}

/** Skills, recommendations, challenges, awards and learning stats (spec §23, §27, §29), kept live. */
export function useProgressDashboard(): QueryState<Dashboard> & { reload: () => void } {
  const c = useContainer();
  return useLiveQuery(() => loadDashboard(c, true), PROGRESS_TABLES);
}

/**
 * The dashboard for Home (this week's tiles, what to focus on next), read-only: it never latches awards.
 *
 * `active`: whether Home is the focused screen. A write while Home is in the background only marks the data stale;
 * it is rebuilt once, when Home is focused again, so practising elsewhere never rebuilds Home's dashboard on every
 * write. The Progress screen's `useProgressDashboard` is unchanged.
 */
export function useHomeProgress(active: boolean): QueryState<Dashboard> & { reload: () => void } {
  const c = useContainer();
  const [state, setState] = useState<QueryState<Dashboard>>({ status: 'loading' });
  const runId = useRef(0);
  const stale = useRef(true);
  const activeRef = useRef(active);

  const reload = useCallback(() => {
    stale.current = false;
    runId.current += 1;
    const current = runId.current;
    loadDashboard(c, false).then(
      (r) => {
        if (current === runId.current) setState(r.ok ? { status: 'success', data: r.value } : { status: 'error', error: r.error });
      },
      (cause: unknown) => {
        if (current === runId.current) setState({ status: 'error', error: { kind: 'StorageError', message: String(cause), cause } });
      },
    );
  }, [c]);

  useEffect(() => {
    const unsubscribe = c.bus.subscribe(PROGRESS_TABLES, () => {
      if (activeRef.current) reload();
      else stale.current = true;
    });
    return () => {
      runId.current += 1;
      unsubscribe();
    };
  }, [c, reload]);

  useEffect(() => {
    activeRef.current = active;
    if (active && stale.current) reload();
  }, [active, reload]);

  return { ...state, reload };
}

export const isSkillId = (value: string | undefined): value is SkillId => SKILL_IDS.some((s) => s === value);

/**
 * "Review these now": makes the questions a recommendation names due today in
 * the existing spaced review, so the learner can practise them straight away.
 */
export function useBringReviewsForward(): { readonly bring: (questionIds: readonly string[]) => Promise<boolean>; readonly busy: boolean } {
  const c = useContainer();
  const [busy, setBusy] = useState(false);
  const bring = useCallback(
    async (questionIds: readonly string[]) => {
      setBusy(true);
      try {
        const [settings, items] = await Promise.all([c.settings.get(), c.learning.reviewItems()]);
        if (!settings.ok || !items.ok) return false;
        const known = questionIds.filter((id) => c.content.question(id) !== null);
        const changed = bringForward(items.value, known, localDateIn(c.clock.now(), settings.value.timeZone));
        if (changed.length === 0) return true;
        const saved = await c.learning.saveReviewItems(changed, toUtcIso(c.clock.now()));
        if (!saved.ok) logger.warn('Reviews not brought forward', { kind: saved.error.kind });
        return saved.ok;
      } finally {
        setBusy(false);
      }
    },
    [c],
  );
  return { bring, busy };
}
