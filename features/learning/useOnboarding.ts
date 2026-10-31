import { useCallback, useMemo, useState } from 'react';
import { buildUnits, gradeQuestion, gradeQuiz, type Answers, type QuizResult, type ScheduleSettings, type Weekday } from '../../domain/learning';
import type { ExperienceLevel, LearningGoal, MetaTraderVersion } from '../../domain/models/learner';
import type { AppError } from '../../shared/errors';
import { deviceTimeZone } from '../../shared/time';
import type { ExplanationLevel, MarketKind } from '../../shared/types';
import { useContainer } from '../app';
import { previewProgram, programModules, todayIn } from './plan';
import { scheduleFieldProps, type TimelineChoice } from './scheduleEditor';
import { completeOnboarding, type PlacementAttempt } from './useCases';

/** Onboarding steps in spec §5 order. */
export const ONBOARDING_STEPS = ['risk', 'experience', 'markets', 'goals', 'level', 'metatrader', 'program', 'placement'] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];


export interface OnboardingDraft {
  readonly riskAcknowledged: boolean;
  readonly experience: ExperienceLevel | null;
  readonly markets: readonly MarketKind[];
  readonly goals: readonly LearningGoal[];
  readonly explanationLevel: ExplanationLevel;
  readonly metaTraderVersion: MetaTraderVersion | 'none';
  readonly metaTraderInstalled: boolean;
  readonly programId: string | null;
  readonly timeline: TimelineChoice;
  readonly studyDays: readonly Weekday[];
  readonly dailyMinutes: number;
  readonly classTime: string | null;
  readonly remindersEnabled: boolean;
  readonly placementPassedModuleIds: readonly string[];
  /** The latest graded placement attempt per module. */
  readonly placementAttempts: Readonly<Record<string, PlacementAttempt>>;
}

const INITIAL: OnboardingDraft = {
  riskAcknowledged: false,
  experience: null,
  markets: [],
  goals: [],
  explanationLevel: 'simple',
  metaTraderVersion: 'mt5',
  metaTraderInstalled: false,
  programId: null,
  timeline: { kind: 'weeks', weeks: 12 },
  studyDays: [1, 2, 3, 4, 5],
  dailyMinutes: 15,
  classTime: '19:00',
  remindersEnabled: true,
  placementPassedModuleIds: [],
  placementAttempts: {},
};

/** Whether the learner may move past a step; nothing is pre-chosen for them where a choice is required. */
export function canContinue(step: OnboardingStep, d: OnboardingDraft): boolean {
  switch (step) {
    case 'risk':
      return d.riskAcknowledged;
    case 'experience':
      return d.experience !== null;
    case 'markets':
      return d.markets.length > 0;
    case 'goals':
      return d.goals.length > 0;
    case 'program':
      return d.programId !== null && d.studyDays.length > 0;
    default:
      return true;
  }
}

export function useOnboarding() {
  const c = useContainer();
  const timeZone = useMemo(() => deviceTimeZone(), []);
  const today = useMemo(() => todayIn(c.clock, timeZone), [c.clock, timeZone]);
  const [stepIndex, setStepIndex] = useState(0);
  const [draft, setDraft] = useState<OnboardingDraft>(() => ({ ...INITIAL, programId: c.content.programs()[0]?.id ?? null }));
  const [error, setError] = useState<AppError | null>(null);
  const [busy, setBusy] = useState(false);

  const step = ONBOARDING_STEPS[stepIndex] ?? 'risk';
  const update = useCallback((patch: Partial<OnboardingDraft>) => setDraft((d) => ({ ...d, ...patch })), []);

  const settings: ScheduleSettings = useMemo(
    () => ({ startDate: today, timeline: draft.timeline, studyDays: draft.studyDays, dailyMinutes: draft.dailyMinutes }),
    [draft.dailyMinutes, draft.studyDays, draft.timeline, today],
  );
  // The preview reflects modules skipped by placement, so it shows exactly what will be scheduled.
  const preview = useMemo(() => {
    if (!draft.programId || draft.studyDays.length === 0) return null;
    const skipped = new Set(draft.placementPassedModuleIds);
    const modules = programModules(c.content, draft.programId).filter((m) => !skipped.has(m.id));
    const remaining = new Set(buildUnits(modules).map((u) => u.id));
    return previewProgram(c.content, draft.programId, settings, remaining);
  }, [c.content, draft.placementPassedModuleIds, draft.programId, draft.studyDays.length, settings]);

  const placementModules = useMemo(() => {
    const program = draft.programId ? c.content.program(draft.programId) : null;
    return (program?.moduleIds ?? []).flatMap((id) => {
      const m = c.content.module(id);
      const quiz = m ? c.content.quiz(m.checkpointQuizId) : null;
      return m && quiz ? [{ id: m.id, title: m.title, quiz }] : [];
    });
  }, [c.content, draft.programId]);

  /** Grades a placement checkpoint; passing (80%+) skips that module's classes. */
  const gradePlacement = useCallback(
    (moduleId: string, answers: Answers): QuizResult | null => {
      const quiz = placementModules.find((m) => m.id === moduleId)?.quiz;
      if (!quiz) return null;
      const result = gradeQuiz(quiz, answers);
      setDraft((d) => ({
        ...d,
        placementPassedModuleIds: result.passed
          ? [...new Set([...d.placementPassedModuleIds, moduleId])]
          : d.placementPassedModuleIds.filter((id) => id !== moduleId),
        placementAttempts: { ...d.placementAttempts, [moduleId]: { quizId: quiz.id, answers, score: result.score, passed: result.passed } },
      }));
      return result;
    },
    [placementModules],
  );

  const gradePlacementQuestion = useCallback(
    (moduleId: string, questionId: string, chosen: readonly string[]) => {
      const q = placementModules.find((m) => m.id === moduleId)?.quiz.questions.find((x) => x.id === questionId);
      return q ? gradeQuestion(q, chosen) : null;
    },
    [placementModules],
  );

  const finish = useCallback(async () => {
    if (!draft.experience || !draft.programId) return null;
    setBusy(true);
    setError(null);
    const result = await completeOnboarding(c, {
      riskAcknowledged: draft.riskAcknowledged,
      experience: draft.experience,
      markets: draft.markets,
      goals: draft.goals,
      explanationLevel: draft.explanationLevel,
      metaTrader: draft.metaTraderVersion === 'none' ? null : { version: draft.metaTraderVersion, installed: draft.metaTraderInstalled },
      timeZone,
      programId: draft.programId,
      settings,
      classTime: draft.classTime,
      remindersEnabled: draft.remindersEnabled && draft.classTime !== null,
      placementPassedModuleIds: draft.placementPassedModuleIds,
      placementAttempts: Object.values(draft.placementAttempts),
    });
    setBusy(false);
    if (!result.ok) setError(result.error);
    return result;
  }, [c, draft, settings, timeZone]);

  return {
    step,
    stepIndex,
    stepCount: ONBOARDING_STEPS.length,
    draft,
    update,
    canContinue: canContinue(step, draft),
    next: () => setStepIndex((i) => Math.min(i + 1, ONBOARDING_STEPS.length - 1)),
    back: () => setStepIndex((i) => Math.max(i - 1, 0)),
    today,
    scheduleFields: scheduleFieldProps(draft, update, today),
    preview,
    placementModules,
    gradePlacement,
    gradePlacementQuestion,
    finish,
    busy,
    error,
  };
}
