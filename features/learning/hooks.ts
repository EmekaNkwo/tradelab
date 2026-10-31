import { useCallback, useEffect, useMemo } from 'react';
import {
  buildClassSections,
  gradeQuestion,
  timelineStatus,
  type ClassSection,
  type LocalDate,
  type MissionList,
  type TimelineStatus,
} from '../../domain/learning';
import type { Lesson, Question } from '../../domain/models/content';
import type { DailyClass, Enrolment } from '../../domain/models/learning';
import { logger } from '../../shared/logger';
import { ok } from '../../shared/result';
import { useContainer, useLiveQuery } from '../app';
import { nextClass, programModules, todayIn, todaysClass, unitsInNoClass } from './plan';
import { programList, type ProgramListItem } from './programList';
import { dueQuestionIds, ensureTodaysMissions } from './useCases';

export const PROFILE_TABLES = ['user_profile'] as const;
const HOME_TABLES = ['program_enrolment', 'daily_class', 'unit_completion', 'review_queue', 'mission', 'settings'];

export function useProfile() {
  const { profile } = useContainer();
  return useLiveQuery(() => profile.get(), PROFILE_TABLES);
}

export interface LearningHome {
  readonly enrolment: Enrolment | null;
  readonly programTitle: string | null;
  readonly today: LocalDate;
  readonly classes: readonly DailyClass[];
  readonly todaysClass: DailyClass | null;
  readonly nextClass: DailyClass | null;
  readonly status: TimelineStatus;
  readonly completedUnits: number;
  readonly totalUnits: number;
  readonly finishDate: LocalDate | null;
  readonly dueReviews: number;
  readonly missions: MissionList | null;
  /** Lessons added to the program since the schedule was built (e.g. after a content update). */
  readonly newUnits: number;
}

/** Everything Home and the program screen show, re-read whenever learning data changes. */
export function useLearningHome() {
  const c = useContainer();
  const state = useLiveQuery(async () => {
    const [settings, enrolment] = await Promise.all([c.settings.get(), c.learning.currentEnrolment()]);
    if (!settings.ok) return settings;
    if (!enrolment.ok) return enrolment;
    const today = todayIn(c.clock, settings.value.timeZone);
    const e = enrolment.value;
    const [classes, completed, due, missions] = await Promise.all([
      e ? c.learning.classes(e.id) : Promise.resolve(ok([] as readonly DailyClass[])),
      e ? c.learning.completedUnitIds(e.id) : Promise.resolve(ok(new Set<string>() as ReadonlySet<string>)),
      dueQuestionIds(c, 50),
      c.missions.forDate(today),
    ]);
    if (!classes.ok) return classes;
    if (!completed.ok) return completed;
    const program = e ? c.content.program(e.programId) : null;
    const totalUnits = program
      ? program.moduleIds.reduce((n, id) => n + (c.content.module(id)?.lessonIds.length ?? 0) + 1, 0)
      : 0;
    const active = e?.status === 'active';
    return ok<LearningHome>({
      enrolment: e,
      programTitle: program?.title ?? null,
      today,
      classes: classes.value,
      todaysClass: active ? todaysClass(classes.value, today) : null,
      nextClass: active ? nextClass(classes.value, today) : null,
      // Nothing is overdue while paused (spec §6.2).
      status: e?.status === 'paused' ? { kind: 'on_track' } : timelineStatus(classes.value, today),
      completedUnits: completed.value.size,
      totalUnits,
      finishDate: classes.value.at(-1)?.date ?? null,
      dueReviews: due.ok ? due.value.length : 0,
      missions: missions.ok ? missions.value : null,
      newUnits: e && e.status !== 'completed' ? unitsInNoClass(programModules(c.content, e.programId), completed.value, classes.value).length : 0,
    });
  }, HOME_TABLES);

  // Create today's missions once the enrolment is known (idempotent per date).
  const enrolment = state.status === 'success' ? state.data.enrolment : null;
  const missionsMissing = state.status === 'success' && state.data.missions === null;
  useEffect(() => {
    if (!enrolment || !missionsMissing) return;
    ensureTodaysMissions(c, enrolment).then((r) => {
      if (!r.ok) logger.warn('Missions not created', { kind: r.error.kind });
    });
  }, [c, enrolment, missionsMissing]);

  return state;
}

export interface ClassSession {
  readonly cls: DailyClass;
  readonly sections: readonly ClassSection[];
  readonly lessons: readonly Lesson[];
  readonly questions: ReadonlyMap<string, Question>;
  readonly checkpointQuizId: string | null;
  readonly checkpointQuestions: readonly Question[];
  readonly explanationLevel: 'simple' | 'balanced' | 'advanced';
}

/** Loads a class and assembles its sections from content and the review queue. */
export function useClassSession(classId: string) {
  const c = useContainer();
  return useLiveQuery(async () => {
    const [cls, settings] = await Promise.all([c.learning.getClass(classId), c.settings.get()]);
    if (!cls.ok) return cls;
    if (!settings.ok) return settings;
    const lessons = cls.value.unitIds
      .map((u) => c.content.lesson(u.split(':')[1] ?? ''))
      .filter((l): l is Lesson => l !== null);
    const checkpointQuizId =
      cls.value.kind === 'checkpoint' && cls.value.moduleId ? (c.content.module(cls.value.moduleId)?.checkpointQuizId ?? null) : null;
    const warmLimit = cls.value.kind === 'review' ? 10 : 5;
    const due = cls.value.status === 'completed' ? ok([] as readonly string[]) : await dueQuestionIds(c, warmLimit);
    const dueIds = due.ok ? due.value : [];
    const sections = buildClassSections({
      plannedClass: cls.value,
      lessons,
      dueQuestionIds: dueIds,
      checkpointQuizIds: checkpointQuizId ? [checkpointQuizId] : [],
    });
    const checkpointQuestions = c.content.quiz(checkpointQuizId ?? '')?.questions ?? [];
    const questions = new Map(
      [...dueIds.map((id) => c.content.question(id)), ...lessons.flatMap((l) => l.quickCheck), ...checkpointQuestions]
        .filter((q): q is Question => q !== null)
        .map((q) => [q.id, q]),
    );
    return ok<ClassSession>({ cls: cls.value, sections, lessons, questions, checkpointQuizId, checkpointQuestions, explanationLevel: settings.value.explanationLevel });
    // Loaded once per class: the section list must stay fixed while the learner is in it.
    // Re-reading after saving would recompute the warm-up and shift every section index.
  }, []);
}

/** Grades one question for QuestionCard without exposing the answer key to components. */
export function useGrader(questions: ReadonlyMap<string, Question>) {
  return useCallback(
    (questionId: string, chosen: readonly string[]) => {
      const q = questions.get(questionId);
      return q ? gradeQuestion(q, chosen) : { questionId, correct: false, chosen, correctOptionIds: [], feedback: [] };
    },
    [questions],
  );
}

export function useNotes(classId: string) {
  const { learning } = useContainer();
  return useLiveQuery(() => learning.notes(classId), ['class_note']);
}

export function usePrograms() {
  const { content } = useContainer();
  return useMemo(() => content.programs(), [content]);
}

/** Every program and where the learner stands in it (spec §6.1). */
export function useProgramList() {
  const c = useContainer();
  return useLiveQuery(async () => {
    const all = await c.learning.enrolments();
    return all.ok ? ok<readonly ProgramListItem[]>(programList(c.content.programs(), all.value)) : all;
  }, ['program_enrolment']);
}

export function useModuleTitle(moduleId: string | null): string | null {
  const { content } = useContainer();
  return moduleId ? (content.module(moduleId)?.title ?? null) : null;
}

/** Module id → title, for messages that name modules. */
export function useModuleTitles(): (id: string) => string {
  const { content } = useContainer();
  return useCallback((id: string) => content.module(id)?.title ?? id, [content]);
}
