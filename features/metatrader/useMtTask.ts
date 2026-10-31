import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { gradeQuestion, gradeQuestions } from '../../domain/learning';
import type { MetaTraderStep, MetaTraderTask, Question } from '../../domain/models/content';
import type { MetaTraderTaskCompletion } from '../../domain/models/learning';
import { validationError, type AppError } from '../../shared/errors';
import { logger } from '../../shared/logger';
import { err, ok, type Result } from '../../shared/result';
import { toUtcIso } from '../../shared/time';
import { useContainer, useLiveQuery, type Container } from '../app';

export type Platform = 'mt4' | 'mt5';

/** The step text for the learner's MetaTrader version. */
export function stepText(step: MetaTraderStep, platform: Platform): string {
  return step[platform] ?? step.text;
}

export interface TaskDraft {
  readonly platform: Platform;
  readonly demoConfirmed: boolean;
  readonly stepsDone: ReadonlySet<number>;
  /** First answer per question; this is what gets scored. */
  readonly answers: Readonly<Record<string, readonly string[]>>;
  readonly note: string;
}

export type BlockReason = 'demo_not_confirmed' | 'steps_not_done' | 'questions_not_answered';

/** Why the task cannot be marked done yet, or null when it can (spec §14.1: completion is never faked). */
export function blockReason(task: MetaTraderTask, draft: TaskDraft): BlockReason | null {
  if (task.requiresDemo && !draft.demoConfirmed) return 'demo_not_confirmed';
  if (draft.stepsDone.size < task.steps.length) return 'steps_not_done';
  if (task.afterQuestions.some((q) => !(q.id in draft.answers))) return 'questions_not_answered';
  return null;
}

export async function completeMtTask(c: Pick<Container, 'mtTasks' | 'clock'>, task: MetaTraderTask, draft: TaskDraft): Promise<Result<MetaTraderTaskCompletion, AppError>> {
  const blocked = blockReason(task, draft);
  if (blocked) return err(validationError(`Task not finished: ${blocked}`));
  const now = toUtcIso(c.clock.now());
  return c.mtTasks.record(
    {
      taskId: task.id,
      platform: draft.platform,
      demoConfirmedAt: task.requiresDemo ? now : null,
      answers: draft.answers,
      score: gradeQuestions(task.afterQuestions, draft.answers, 1).score,
      note: draft.note.trim() === '' ? null : draft.note.trim(),
    },
    now,
    { requiresDemo: task.requiresDemo },
  );
}

export interface MtTaskSession {
  readonly task: MetaTraderTask;
  readonly completions: readonly MetaTraderTaskCompletion[];
  readonly preferredPlatform: Platform;
  /** The unfinished run saved earlier, so returning from MetaTrader loses nothing. */
  readonly savedDraft: TaskDraft | null;
}

/** A task with its past completions and the learner's MetaTrader version. */
export function useMtTask(id: string) {
  const c = useContainer();
  return useLiveQuery(async () => {
    const task = c.content.mtTask(id);
    if (!task) return err<AppError>({ kind: 'NotFound', message: `MetaTrader task ${id}` });
    const [completions, profile, stored] = await Promise.all([c.mtTasks.completions(id), c.profile.get(), c.mtTasks.draft(id)]);
    if (!completions.ok) return completions;
    const preferredPlatform: Platform = profile.ok && profile.value?.metaTrader?.version === 'mt4' ? 'mt4' : 'mt5';
    const validSteps = (steps: readonly number[]) => steps.filter((i) => i < task.steps.length);
    const savedDraft: TaskDraft | null =
      stored.ok && stored.value ? { ...stored.value, stepsDone: new Set(validSteps(stored.value.stepsDone)) } : null;
    return ok<MtTaskSession>({ task, completions: completions.value, preferredPlatform, savedDraft });
  }, ['mt_task_completion', 'user_profile']);
}

export interface MtTaskListItem {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly requiresDemo: boolean;
  readonly timesDone: number;
}

export function useMtTaskList() {
  const c = useContainer();
  return useLiveQuery(async () => {
    const done = await c.mtTasks.completions();
    if (!done.ok) return done;
    return ok<readonly MtTaskListItem[]>(
      c.content.mtTasks().map((t) => ({
        id: t.id,
        title: t.title,
        summary: t.summary,
        requiresDemo: t.requiresDemo,
        timesDone: done.value.filter((d) => d.taskId === t.id).length,
      })),
    );
  }, ['mt_task_completion']);
}

export type LaunchOutcome = 'opened' | 'not_installed' | 'unsupported' | 'failed';

/** State and commands for one run through a task. */
export function useMtTaskRunner(session: MtTaskSession) {
  const c = useContainer();
  const [draft, setDraft] = useState<TaskDraft>(
    () => session.savedDraft ?? { platform: session.preferredPlatform, demoConfirmed: false, stepsDone: new Set(), answers: {}, note: '' },
  );
  const [saved, setSaved] = useState<MetaTraderTaskCompletion | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [busy, setBusy] = useState(false);
  const [launch, setLaunch] = useState<LaunchOutcome | null>(null);
  const inFlight = useRef(false);

  // Save the run as it goes (spec §14.3: the learner leaves for MetaTrader and comes back).
  const taskId = session.task.id;
  useEffect(() => {
    if (saved) return;
    c.mtTasks.saveDraft(taskId, { ...draft, stepsDone: [...draft.stepsDone] }, toUtcIso(c.clock.now())).then((r) => {
      if (!r.ok) logger.warn('Task draft not saved', { kind: r.error.kind });
    });
  }, [c, draft, saved, taskId]);

  const toggleStep = useCallback((index: number) => {
    setDraft((d) => {
      const next = new Set(d.stepsDone);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return { ...d, stepsDone: next };
    });
  }, []);

  const answer = useCallback((question: Question, selected: readonly string[]) => {
    // Only the first answer counts towards the score.
    setDraft((d) => (question.id in d.answers ? d : { ...d, answers: { ...d.answers, [question.id]: selected } }));
    return gradeQuestion(question, selected);
  }, []);

  const openMetaTrader = useCallback(async () => {
    const r = await c.apps.openApp(draft.platform);
    setLaunch(r.ok ? r.value : 'failed');
  }, [c.apps, draft.platform]);

  const openStore = useCallback(async () => {
    const r = await c.apps.openStoreListing(draft.platform);
    if (!r.ok) setError(r.error);
  }, [c.apps, draft.platform]);

  const complete = useCallback(async () => {
    if (inFlight.current || saved) return;
    inFlight.current = true;
    setBusy(true);
    const r = await completeMtTask(c, session.task, draft);
    inFlight.current = false;
    setBusy(false);
    if (r.ok) {
      setSaved(r.value);
      const cleared = await c.mtTasks.clearDraft(session.task.id);
      if (!cleared.ok) logger.warn('Task draft not cleared', { kind: cleared.error.kind });
    } else setError(r.error);
  }, [c, draft, saved, session.task]);

  return useMemo(
    () => ({
      draft,
      blocked: blockReason(session.task, draft),
      saved,
      error,
      busy,
      launch,
      setPlatform: (platform: Platform) => setDraft((d) => ({ ...d, platform })),
      confirmDemo: (demoConfirmed: boolean) => setDraft((d) => ({ ...d, demoConfirmed })),
      setNote: (note: string) => setDraft((d) => ({ ...d, note })),
      toggleStep,
      answer,
      openMetaTrader,
      openStore,
      complete,
      dismissError: () => setError(null),
    }),
    [answer, busy, complete, draft, error, launch, openMetaTrader, openStore, saved, session.task, toggleStep],
  );
}
