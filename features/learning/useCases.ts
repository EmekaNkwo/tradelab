import {
  addDays,
  anchorTimeline,
  buildMissions,
  buildUnits,
  catchUpOptions,
  diffDays,
  dueItems,
  encodeReviewAnswer,
  isGenuinelyDue,
  localDateIn,
  newReviewItem,
  recordReview,
  type Answers,
  type CatchUpOption,
  type LocalDate,
  type MissionActivity,
  type QuizResult,
  type ReviewItem,
  type SchedulePlan,
  type ScheduleSettings,
} from '../../domain/learning';
import type { ExperienceLevel, LearningGoal, MetaTraderVersion, UserProfile } from '../../domain/models/learner';
import type { DailyClass, Enrolment, QuizAttempt } from '../../domain/models/learning';
import type { AppError } from '../../shared/errors';
import { validationError } from '../../shared/errors';
import { createId } from '../../shared/ids';
import { logger } from '../../shared/logger';
import { err, ok, type Result } from '../../shared/result';
import { isValidTimeZone, toUtcIso, type UtcIso } from '../../shared/time';
import type { ExplanationLevel, MarketKind } from '../../shared/types';
import type { ReminderPlan, ReminderSyncOptions, ReminderSyncOutcome } from '../../data';
import type { Container } from '../app';
import { previewProgram, programModules, todayIn, todaysClass, unscheduledUnits } from './plan';
import { classReminderPlan, reminderPlans } from './reminderPlans';

type Deps = Pick<Container, 'clock' | 'content' | 'learning' | 'profile' | 'settings' | 'missions' | 'reminders'>;

const nowOf = (deps: Pick<Container, 'clock'>): UtcIso => toUtcIso(deps.clock.now());

/** Weekly reminders on study days at class time, or null when the learner turned them off. */
export const reminderPlanFor = classReminderPlan;

type ReminderDeps = Pick<Container, 'reminders' | 'settings' | 'learning' | 'clock'>;

/** The learner just asked for reminders, so the permission prompt may show. */
export const USER_ACTION: ReminderSyncOptions = { prompt: true };
/** A resync the learner did not ask for: never prompts. */
export const BACKGROUND: ReminderSyncOptions = { prompt: false };

/** Review items worth a reminder: due now, or missed before and still in box 1 or 2. */
export function reviewsWaiting(items: readonly ReviewItem[], today: LocalDate): number {
  return items.filter((i) => i.dueDate <= today || (i.lapses > 0 && i.box <= 2)).length;
}

/** Schedules every learning reminder for `enrolment` (spec §29); extra reminders need the class reminder on. */
async function syncReminders(deps: ReminderDeps, enrolment: Enrolment | null, options: ReminderSyncOptions): Promise<ReminderSyncOutcome | null> {
  const [settings, items] = await Promise.all([deps.settings.get(), deps.learning.reviewItems()]);
  const today = settings.ok ? todayIn(deps.clock, settings.value.timeZone) : null;
  const plans = settings.ok
    ? reminderPlans({ enrolment, reminders: settings.value.reminders, reviewsWaiting: items.ok && today ? reviewsWaiting(items.value, today) : 0 })
    : [classReminderPlan(enrolment)].filter((p): p is ReminderPlan => p !== null);
  const synced = await deps.reminders.sync(plans, options);
  // Reminders are optional; failing to schedule one never blocks learning.
  if (!synced.ok) logger.warn('Reminders could not be scheduled', { kind: synced.error.kind });
  return synced.ok ? synced.value : null;
}

/**
 * Re-schedules reminders from the current enrolment, e.g. after a settings
 * change, a backup or at start-up. `prompt` is true only for a learner action
 * about reminders; background resyncs never show the permission prompt.
 */
export async function resyncReminders(deps: ReminderDeps, options: ReminderSyncOptions): Promise<ReminderSyncOutcome | null> {
  const enrolment = await deps.learning.currentEnrolment();
  if (!enrolment.ok) {
    logger.warn('Reminders not resynced', { kind: enrolment.error.kind });
    return null;
  }
  return syncReminders(deps, enrolment.value, options);
}

export interface OnboardingInput {
  readonly riskAcknowledged: boolean;
  readonly experience: ExperienceLevel;
  readonly markets: readonly MarketKind[];
  readonly goals: readonly LearningGoal[];
  readonly explanationLevel: ExplanationLevel;
  readonly metaTrader: { readonly version: MetaTraderVersion; readonly installed: boolean } | null;
  readonly timeZone: string;
  readonly programId: string;
  readonly settings: ScheduleSettings;
  readonly classTime: string | null;
  readonly remindersEnabled: boolean;
  /** Modules whose checkpoint the learner passed in the placement quiz. */
  readonly placementPassedModuleIds: readonly string[];
  /** Every placement checkpoint the learner answered, passed or not; saved as `placement` attempts (evidence for progress). */
  readonly placementAttempts?: readonly PlacementAttempt[];
}

export interface PlacementAttempt {
  readonly quizId: string;
  readonly answers: Answers;
  readonly score: number;
  readonly passed: boolean;
}

/** Saves the profile and enrols in the first program (spec §5). */
export async function completeOnboarding(deps: Deps, input: OnboardingInput): Promise<Result<Enrolment, AppError>> {
  if (!input.riskAcknowledged) return err(validationError('The simulation-only agreement must be accepted first'));
  if (!isValidTimeZone(input.timeZone)) return err(validationError(`Unknown time zone "${input.timeZone}"`));
  const now = nowOf(deps);
  const existing = await deps.profile.get();
  if (!existing.ok) return existing;
  const profile: UserProfile = {
    id: existing.value?.id ?? createId('usr', deps.clock.now().getTime()),
    experience: input.experience,
    markets: input.markets,
    goals: input.goals,
    explanationLevel: input.explanationLevel,
    metaTrader: input.metaTrader,
    timeZone: input.timeZone,
    riskAcknowledgedAt: now,
    createdAt: existing.value?.createdAt ?? now,
    updatedAt: now,
  };
  const saved = await deps.profile.save(profile);
  if (!saved.ok) return saved;
  const settings = await deps.settings.update({ explanationLevel: input.explanationLevel, timeZone: input.timeZone }, now);
  if (!settings.ok) return settings;
  const enrolled = await enrolInProgram(deps, input);
  if (!enrolled.ok) return enrolled;
  const placement = (input.placementAttempts ?? []).map((p) => ({ kind: 'placement' as const, refId: p.quizId, answers: p.answers, score: p.score, passed: p.passed }));
  const recorded = await deps.learning.recordAttempts(placement, now);
  // The enrolment already skips the passed modules; losing the record only loses progress evidence.
  if (!recorded.ok) logger.warn('Placement answers not saved', { kind: recorded.error.kind });
  return enrolled;
}

export type EnrolInput = Pick<OnboardingInput, 'programId' | 'settings' | 'classTime' | 'remindersEnabled' | 'placementPassedModuleIds'>;

export async function enrolInProgram(deps: Deps, input: EnrolInput): Promise<Result<Enrolment, AppError>> {
  const modules = programModules(deps.content, input.programId);
  if (modules.length === 0) return err(validationError(`Unknown program "${input.programId}"`));
  const placed = new Set(buildUnits(modules.filter((m) => input.placementPassedModuleIds.includes(m.id))).map((u) => u.id));
  const remaining = new Set(buildUnits(modules).map((u) => u.id).filter((id) => !placed.has(id)));
  const plan = previewProgram(deps.content, input.programId, input.settings, remaining);
  const enrolment = await deps.learning.enrol(
    { programId: input.programId, settings: input.settings, classTime: input.classTime, remindersEnabled: input.remindersEnabled, plan: plan.classes, completedUnitIds: [...placed] },
    nowOf(deps),
  );
  if (enrolment.ok && enrolment.value.status === 'active') await syncReminders(deps, enrolment.value, USER_ACTION);
  return enrolment;
}

/**
 * Schedule settings for a program added after onboarding: the learner's
 * current study days and class length, from today, over the program's
 * suggested length. The learner can change them once it starts.
 */
export function settingsForNewProgram(defaultWeeks: number, current: Enrolment | null, today: LocalDate): ScheduleSettings {
  return {
    startDate: today,
    timeline: { kind: 'weeks', weeks: defaultWeeks },
    studyDays: current?.settings.studyDays ?? [1, 2, 3, 4, 5],
    dailyMinutes: current?.settings.dailyMinutes ?? 15,
  };
}

/** Adds a program: it starts now when nothing is under way, otherwise it joins the queue (spec §6.1). */
export async function addProgram(deps: Deps, programId: string): Promise<Result<Enrolment, AppError>> {
  const program = deps.content.program(programId);
  if (!program) return err(validationError(`Unknown program "${programId}"`));
  const [current, all] = await Promise.all([deps.learning.currentEnrolment(), deps.learning.enrolments()]);
  if (!current.ok) return current;
  if (!all.ok) return all;
  if (all.value.some((e) => e.programId === programId && e.status !== 'completed')) return err(validationError('This program is already in your list'));
  const today = todayIn(deps.clock, await learnerTimeZone(deps));
  return enrolInProgram(deps, {
    programId,
    settings: settingsForNewProgram(program.defaultWeeks, current.value, today),
    classTime: current.value?.classTime ?? null,
    remindersEnabled: current.value?.remindersEnabled ?? false,
    placementPassedModuleIds: [],
  });
}

/**
 * Starts a queued program now (one active at a time, spec §6.1). The program
 * under way goes back to the queue with its progress kept. A program that ran
 * before has its finish date pushed back by the time it waited, as a pause
 * does; a new one starts today.
 */
export async function startQueuedProgram(deps: Deps, enrolment: Enrolment): Promise<Result<Enrolment, AppError>> {
  if (enrolment.status !== 'queued') return err(validationError('Only a queued program can be started'));
  const timeZone = await learnerTimeZone(deps);
  const today = todayIn(deps.clock, timeZone);
  const history = await deps.learning.classes(enrolment.id);
  if (!history.ok) return history;
  const ranBefore = history.value.length > 0;
  const settings = ranBefore ? enrolment.settings : { ...enrolment.settings, startDate: today };
  const waited = ranBefore ? Math.max(0, diffDays(localDateIn(new Date(enrolment.updatedAt), timeZone), today)) : 0;
  const preview = await previewReschedule(deps, { ...enrolment, settings }, settings, { shiftFinishByDays: waited });
  if (!preview.ok) return preview;
  const started = await deps.learning.activateEnrolment(enrolment.id, preview.value.plan.classes, preview.value.settings, nowOf(deps));
  if (started.ok) await syncReminders(deps, started.value, USER_ACTION);
  return started;
}

/** The plan a reschedule would produce: from today, for the work not yet done or under way. */
export interface RescheduleOptions {
  /** Allow a class today even if today's class is already done ("start the next class early"). */
  readonly allowAnotherToday?: boolean;
  /** Days to push the finish date back, e.g. the length of a pause. */
  readonly shiftFinishByDays?: number;
}

/**
 * The plan a reschedule would produce: from today (or tomorrow, if today's
 * class is already done), for the work not yet done or under way. A length in
 * weeks is counted from when the program began, so the finish date does not
 * silently move (spec §6.2).
 */
export async function previewReschedule(
  deps: Deps,
  enrolment: Enrolment,
  settings: ScheduleSettings,
  options: RescheduleOptions = {},
): Promise<Result<{ readonly settings: ScheduleSettings; readonly plan: SchedulePlan }, AppError>> {
  const [classes, completed] = await Promise.all([deps.learning.classes(enrolment.id), deps.learning.completedUnitIds(enrolment.id)]);
  if (!classes.ok) return classes;
  if (!completed.ok) return completed;
  const today = todayIn(deps.clock, await learnerTimeZone(deps));
  const doneToday = classes.value.some((c) => c.status === 'completed' && c.date === today);
  const earliest = options.allowAnotherToday || !doneToday ? today : addDays(today, 1);
  const programStart = classes.value.reduce<LocalDate>((min, c) => (c.date < min ? c.date : min), enrolment.settings.startDate);
  const anchored = anchorTimeline(settings, programStart);
  const shift = options.shiftFinishByDays ?? 0;
  const timeline = anchored.timeline.kind === 'finishDate' && shift > 0 ? { kind: 'finishDate' as const, date: addDays(anchored.timeline.date, shift) } : anchored.timeline;
  const next: ScheduleSettings = {
    ...anchored,
    timeline,
    startDate: settings.startDate > earliest ? settings.startDate : earliest,
    extraDates: (settings.extraDates ?? []).filter((d) => (options.allowAnotherToday ? d >= today : d >= earliest)),
  };
  const remaining = unscheduledUnits(programModules(deps.content, enrolment.programId), completed.value, classes.value);
  return ok({ settings: next, plan: previewProgram(deps.content, enrolment.programId, next, remaining) });
}

/** Rebuilds the schedule with new settings; completed work and classes under way are kept (spec §6.2). */
export async function rescheduleProgram(
  deps: Deps,
  enrolment: Enrolment,
  settings: ScheduleSettings,
  options: RescheduleOptions = {},
): Promise<Result<void, AppError>> {
  const preview = await previewReschedule(deps, enrolment, settings, options);
  if (!preview.ok) return preview;
  const { settings: next, plan } = preview.value;
  const replaced = await deps.learning.replacePlannedClasses(enrolment.id, plan.classes, next, nowOf(deps));
  if (replaced.ok) await syncReminders(deps, { ...enrolment, settings: next }, USER_ACTION);
  return replaced;
}

/**
 * After a content update adds modules to the learner's program (Phase 8 added
 * forex module 9), the planned classes are rebuilt so the new work is
 * scheduled. Completed work and classes under way are kept, and the settings
 * are unchanged. Paused and queued programs pick the new work up when they
 * resume or start, because both rebuild their plan. Returns true when the
 * schedule was rebuilt.
 */
export async function scheduleNewContent(deps: Deps): Promise<Result<boolean, AppError>> {
  const current = await deps.learning.currentEnrolment();
  if (!current.ok) return current;
  const enrolment = current.value;
  if (!enrolment || enrolment.status !== 'active') return ok(false);
  const [classes, completed] = await Promise.all([deps.learning.classes(enrolment.id), deps.learning.completedUnitIds(enrolment.id)]);
  if (!classes.ok) return classes;
  if (!completed.ok) return completed;
  const scheduled = new Set(classes.value.flatMap((c) => c.unitIds));
  const unscheduled = buildUnits(programModules(deps.content, enrolment.programId)).some((u) => !scheduled.has(u.id) && !completed.value.has(u.id));
  if (!unscheduled) return ok(false);
  const rebuilt = await rescheduleProgram(deps, enrolment, enrolment.settings);
  return rebuilt.ok ? ok(true) : rebuilt;
}

/** Catch-up previews for a learner who is behind (spec §6.2). */
export async function catchUpChoices(deps: Deps, enrolment: Enrolment): Promise<Result<readonly CatchUpOption[], AppError>> {
  const completed = await deps.learning.completedUnitIds(enrolment.id);
  if (!completed.ok) return completed;
  const today = todayIn(deps.clock, await learnerTimeZone(deps));
  return ok(catchUpOptions(programModules(deps.content, enrolment.programId), enrolment.settings, completed.value, today));
}

export async function pauseProgram(deps: Deps, enrolment: Enrolment): Promise<Result<Enrolment, AppError>> {
  const paused = await deps.learning.updateEnrolment(enrolment.id, { status: 'paused' }, nowOf(deps));
  if (paused.ok) await syncReminders(deps, null, BACKGROUND);
  return paused;
}

/**
 * Resuming rebuilds the remaining classes from today and pushes the finish
 * date back by the length of the pause, so paused days never count as missed.
 * If the rebuild fails the program stays paused.
 */
export async function resumeProgram(deps: Deps, enrolment: Enrolment): Promise<Result<Enrolment, AppError>> {
  const timeZone = await learnerTimeZone(deps);
  const pausedDays = Math.max(0, diffDays(localDateIn(new Date(enrolment.updatedAt), timeZone), todayIn(deps.clock, timeZone)));
  const resumed = await deps.learning.updateEnrolment(enrolment.id, { status: 'active' }, nowOf(deps));
  if (!resumed.ok) return resumed;
  const rebuilt = await rescheduleProgram(deps, resumed.value, resumed.value.settings, { shiftFinishByDays: pausedDays });
  if (rebuilt.ok) return deps.learning.currentEnrolment().then((e) => (e.ok && e.value ? ok(e.value) : resumed));
  const rolledBack = await deps.learning.updateEnrolment(enrolment.id, { status: 'paused' }, nowOf(deps));
  if (!rolledBack.ok) logger.error('Resume failed and the program could not be paused again', { kind: rolledBack.error.kind });
  return rebuilt;
}

export async function updateClassTime(
  deps: Deps,
  enrolment: Enrolment,
  classTime: string | null,
  remindersEnabled: boolean,
): Promise<Result<{ readonly enrolment: Enrolment; readonly reminders: ReminderSyncOutcome | null }, AppError>> {
  const updated = await deps.learning.updateEnrolment(enrolment.id, { classTime, remindersEnabled }, nowOf(deps));
  if (!updated.ok) return updated;
  return ok({ enrolment: updated.value, reminders: await syncReminders(deps, updated.value, USER_ACTION) });
}

async function learnerTimeZone(deps: Pick<Container, 'settings'>): Promise<string> {
  const s = await deps.settings.get();
  return s.ok ? s.value.timeZone : 'UTC';
}

export interface LessonCheckResult {
  readonly lessonId: string;
  /** First-attempt answers, used for the score and spaced repetition. */
  readonly firstAttempt: Answers;
  readonly firstResult: QuizResult;
  /** True once every question was answered correctly (after "Let me try again"). */
  readonly mastered: boolean;
}

export interface ClassResults {
  readonly warmup: readonly { readonly questionId: string; readonly correct: boolean }[];
  readonly lessonChecks: readonly LessonCheckResult[];
  readonly checkpoint: { readonly quizId: string; readonly answers: Answers; readonly result: QuizResult } | null;
}

export interface ClassOutcome {
  readonly finished: boolean;
  readonly score: number | null;
  readonly unitsCompleted: readonly string[];
}

interface ReviewedAnswer {
  readonly questionId: string;
  readonly correct: boolean;
}

/** New queue items for answered questions; a question seen for the first time counts as reviewed today. */
function reviewUpdates(existing: readonly ReviewItem[], answers: readonly ReviewedAnswer[], today: LocalDate): ReviewItem[] {
  const byId = new Map(existing.map((i) => [i.conceptId, i]));
  return answers.map((a) => recordReview(byId.get(a.questionId) ?? { ...newReviewItem(a.questionId, today), dueDate: today }, a.correct, today));
}

/** A `review` attempt for spaced re-tests, marking the ones that were not genuinely due (spec §23). */
function reviewAttempt(existing: readonly ReviewItem[], answers: readonly ReviewedAnswer[], refId: string, today: LocalDate): Omit<QuizAttempt, 'id' | 'createdAt'> {
  const byId = new Map(existing.map((i) => [i.conceptId, i]));
  const correct = answers.filter((a) => a.correct).length;
  return {
    kind: 'review',
    refId,
    answers: Object.fromEntries(
      answers.map((a) => {
        const item = byId.get(a.questionId);
        return [a.questionId, encodeReviewAnswer(a.correct, item ? isGenuinelyDue(item, today) : false)];
      }),
    ),
    score: answers.length === 0 ? 0 : correct / answers.length,
    passed: correct === answers.length,
  };
}

/**
 * Saves a class's results in one transaction. Lesson units complete only when
 * the quick check is mastered; a checkpoint unit only when it is passed
 * (spec §6.2: progress unlocks by demonstrated understanding).
 */
export async function finishClass(deps: Deps, cls: DailyClass, results: ClassResults): Promise<Result<ClassOutcome, AppError>> {
  const fresh = await deps.learning.getClass(cls.id);
  if (!fresh.ok) return fresh;
  // Already saved (double tap or a stale screen): report it without recording anything again.
  if (fresh.value.status === 'completed') return ok({ finished: true, score: fresh.value.score, unitsCompleted: [] });
  const today = todayIn(deps.clock, await learnerTimeZone(deps));
  const existing = await deps.learning.reviewItems();
  if (!existing.ok) return existing;

  const lessonUnit = (lessonId: string) => cls.unitIds.find((u) => u === `${cls.moduleId}:${lessonId}`);
  const masteredUnits = results.lessonChecks.filter((l) => l.mastered).flatMap((l) => lessonUnit(l.lessonId) ?? []);
  const checkpointPassed = results.checkpoint?.result.passed ?? false;
  const checkpointUnits = checkpointPassed ? cls.unitIds.filter((u) => u.endsWith(':checkpoint')) : [];
  // A lesson class finishes only when every lesson it covers was mastered, so no unit is left unscheduled.
  const allMastered = results.lessonChecks.every((l) => l.mastered);
  const finished = cls.kind === 'checkpoint' ? checkpointPassed : allMastered;

  const answered = [
    ...results.warmup,
    ...results.lessonChecks.flatMap((l) => l.firstResult.results.map((r) => ({ questionId: r.questionId, correct: r.correct }))),
    ...(results.checkpoint?.result.results.map((r) => ({ questionId: r.questionId, correct: r.correct })) ?? []),
  ];
  const scores = [
    ...results.lessonChecks.map((l) => l.firstResult.score),
    ...(results.checkpoint ? [results.checkpoint.result.score] : []),
    ...(results.warmup.length > 0 ? [results.warmup.filter((w) => w.correct).length / results.warmup.length] : []),
  ];
  const score = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null;

  const saved = await deps.learning.completeClass(
    {
      classId: cls.id,
      score,
      finished,
      completedUnitIds: [...masteredUnits, ...checkpointUnits],
      lessonResults: results.lessonChecks.map((l) => ({ lessonId: l.lessonId, score: l.firstResult.score, completed: l.mastered })),
      attempts: [
        ...results.lessonChecks.map((l) => ({
          kind: 'lesson_check' as const,
          refId: l.lessonId,
          answers: l.firstAttempt,
          score: l.firstResult.score,
          passed: l.mastered,
        })),
        ...(results.checkpoint
          ? [{ kind: 'checkpoint' as const, refId: results.checkpoint.quizId, answers: results.checkpoint.answers, score: results.checkpoint.result.score, passed: results.checkpoint.result.passed }]
          : []),
        // Warm-ups are spaced re-tests too, so retention sees them.
        ...(results.warmup.length > 0 ? [reviewAttempt(existing.value, results.warmup, `warmup-${cls.id}`, today)] : []),
      ],
      reviewItems: reviewUpdates(existing.value, answered, today),
    },
    nowOf(deps),
  );
  if (!saved.ok) return saved;
  if (finished) await recordMission(deps, today, 'complete_class', 1);
  if (results.warmup.length > 0) await recordMission(deps, today, 'review_concepts', results.warmup.length);
  // Lapses and due items change which learning reminders apply; this never prompts for permission.
  await resyncReminders(deps, BACKGROUND);
  return ok({ finished, score, unitsCompleted: [...masteredUnits, ...checkpointUnits] });
}

/** A standalone spaced-repetition review (a mission activity). */
export async function finishReview(deps: Deps, answers: readonly { questionId: string; correct: boolean }[]): Promise<Result<void, AppError>> {
  if (answers.length === 0) return ok(undefined);
  const today = todayIn(deps.clock, await learnerTimeZone(deps));
  const existing = await deps.learning.reviewItems();
  if (!existing.ok) return existing;
  const saved = await deps.learning.recordReviewSession(reviewAttempt(existing.value, answers, `review-${today}`, today), reviewUpdates(existing.value, answers, today), nowOf(deps));
  if (!saved.ok) return saved;
  await recordMission(deps, today, 'review_concepts', answers.length);
  await resyncReminders(deps, BACKGROUND);
  return saved;
}

export async function dueQuestionIds(deps: Deps, limit: number): Promise<Result<readonly string[], AppError>> {
  const items = await deps.learning.reviewItems();
  if (!items.ok) return items;
  const today = todayIn(deps.clock, await learnerTimeZone(deps));
  // Only questions that still exist in the current content.
  return ok(dueItems(items.value, today, Number.MAX_SAFE_INTEGER).filter((i) => deps.content.question(i.conceptId)).slice(0, limit).map((i) => i.conceptId));
}

async function recordMission(deps: Pick<Container, 'missions'>, date: LocalDate, kind: string, amount: number) {
  const r = await deps.missions.addProgress(date, kind, amount);
  if (!r.ok) logger.warn('Mission progress not saved', { kind });
}

export async function markMission(deps: Deps, kind: string): Promise<Result<void, AppError>> {
  const today = todayIn(deps.clock, await learnerTimeZone(deps));
  return deps.missions.addProgress(today, kind, 1);
}

/** Creates today's mission list once, from activities that exist today (spec §7.3). */
export async function ensureTodaysMissions(deps: Deps, enrolment: Enrolment): Promise<Result<void, AppError>> {
  const today = todayIn(deps.clock, await learnerTimeZone(deps));
  const existing = await deps.missions.forDate(today);
  if (!existing.ok || existing.value !== null) return existing.ok ? ok(undefined) : existing;
  const [classes, due] = await Promise.all([deps.learning.classes(enrolment.id), dueQuestionIds(deps, 5)]);
  if (!classes.ok) return classes;
  const cls = enrolment.status === 'active' ? todaysClass(classes.value, today) : null;
  const lessons = (cls?.unitIds ?? []).map((u) => deps.content.lesson(u.split(':')[1] ?? '')).filter((l) => l !== null);
  const dueCount = due.ok ? due.value.length : 0;
  const activities: MissionActivity[] = [
    ...(cls ? [{ kind: 'complete_class', title: "Complete today's class", minutes: cls.minutes, target: 1, priority: 0 }] : []),
    ...(dueCount > 0 ? [{ kind: 'review_concepts', title: `Review ${dueCount} earlier concept${dueCount === 1 ? '' : 's'}`, minutes: 5, target: dueCount, priority: 1 }] : []),
    ...(lessons.some((l) => l.homework) ? [{ kind: 'homework', title: "Do today's homework", minutes: 10, target: 1, priority: 2 }] : []),
    ...(cls ? [{ kind: 'class_note', title: 'Write one note about what you learned', minutes: 3, target: 1, priority: 3 }] : []),
  ];
  if (activities.length === 0) return ok(undefined);
  const focus = (cls?.moduleId && deps.content.module(cls.moduleId)?.title) || deps.content.program(enrolment.programId)?.title || 'Review';
  return deps.missions.saveIfAbsent(today, buildMissions(focus, enrolment.settings.dailyMinutes + 15, activities));
}
