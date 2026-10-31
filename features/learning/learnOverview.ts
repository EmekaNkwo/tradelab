import { pickLevelledText, type Lesson } from '../../domain/models/content';
import type { ContentRepository } from '../../data';
import { notFound, type AppError } from '../../shared/errors';
import { err, ok, type Result } from '../../shared/result';
import type { ExplanationLevel } from '../../shared/types';
import { useContainer, useLiveQuery } from '../app';

export interface LessonListItem {
  readonly id: string;
  readonly title: string;
  readonly inOneLine: string;
  readonly done: boolean;
}

export interface ModuleOverview {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly practicalResult: string;
  readonly lessons: readonly LessonListItem[];
  readonly checkpointPassed: boolean;
}

export interface LearnOverview {
  readonly programId: string;
  readonly programTitle: string;
  readonly enrolled: boolean;
  readonly modules: readonly ModuleOverview[];
}

/** The program's modules and lessons with what the learner has completed (units are `moduleId:lessonId`). */
export function buildLearnOverview(
  content: ContentRepository,
  programId: string,
  completedUnitIds: ReadonlySet<string>,
  level: ExplanationLevel,
  enrolled: boolean,
): Result<LearnOverview, AppError> {
  const program = content.program(programId);
  if (!program) return err(notFound(`program ${programId}`));
  const modules = program.moduleIds.flatMap((id) => content.module(id) ?? []).map((m) => ({
    id: m.id,
    title: m.title,
    summary: m.summary,
    practicalResult: m.practicalResult,
    lessons: m.lessonIds
      .flatMap((id) => content.lesson(id) ?? [])
      .map((l: Lesson) => ({ id: l.id, title: l.title, inOneLine: pickLevelledText(l.inOneLine, level), done: completedUnitIds.has(`${m.id}:${l.id}`) })),
    checkpointPassed: completedUnitIds.has(`${m.id}:checkpoint`),
  }));
  return ok({ programId: program.id, programTitle: program.title, enrolled, modules });
}

/** Learn tab: the enrolled program (or the first one before enrolling). */
/**
 * The lessons of one program with the learner's progress in it. Without a
 * program id it shows the program under way (or the first one).
 */
export function useLearnOverview(programId: string | null = null) {
  const c = useContainer();
  return useLiveQuery(async () => {
    const [settings, current, all] = await Promise.all([c.settings.get(), c.learning.currentEnrolment(), c.learning.enrolments()]);
    if (!settings.ok) return settings;
    if (!current.ok) return current;
    if (!all.ok) return all;
    const id = programId ?? current.value?.programId ?? c.content.programs()[0]?.id;
    if (!id || !c.content.program(id)) return err(notFound('no programs'));
    // Progress belongs to the program's latest enrolment, under way or not.
    const e = current.value?.programId === id ? current.value : ([...all.value].filter((x) => x.programId === id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null);
    const completed = e ? await c.learning.completedUnitIds(e.id) : ok(new Set<string>() as ReadonlySet<string>);
    if (!completed.ok) return completed;
    return buildLearnOverview(c.content, id, completed.value, settings.value.explanationLevel, e !== null);
  }, ['program_enrolment', 'unit_completion', 'settings', `program:${programId ?? 'current'}`]);
}

export interface LessonView {
  readonly lesson: Lesson;
  readonly moduleTitle: string;
  readonly explanationLevel: ExplanationLevel;
}

/** One lesson for reading outside a class (revision). Progress still comes only from classes. */
export function useLessonView(id: string) {
  const c = useContainer();
  return useLiveQuery(async () => {
    const lesson = c.content.lesson(id);
    if (!lesson) return err(notFound(`lesson ${id}`));
    const settings = await c.settings.get();
    if (!settings.ok) return settings;
    return ok<LessonView>({ lesson, moduleTitle: c.content.module(lesson.moduleId)?.title ?? '', explanationLevel: settings.value.explanationLevel });
  }, ['settings']);
}
