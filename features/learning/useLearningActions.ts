import { useMemo } from 'react';
import type { LocalDate, ScheduleSettings } from '../../domain/learning';
import type { Enrolment } from '../../domain/models/learning';
import { toUtcIso } from '../../shared/time';
import { useContainer } from '../app';
import { previewProgram } from './plan';
import {
  addProgram,
  catchUpChoices,
  markMission,
  pauseProgram,
  previewReschedule,
  rescheduleProgram,
  resumeProgram,
  startQueuedProgram,
  updateClassTime,
} from './useCases';

/** Learning commands bound to the app container. */
export function useLearningActions() {
  const c = useContainer();
  return useMemo(
    () => ({
      preview: (programId: string, settings: ScheduleSettings) => previewProgram(c.content, programId, settings),
      reschedule: (enrolment: Enrolment, settings: ScheduleSettings) => rescheduleProgram(c, enrolment, settings),
      previewReschedule: (enrolment: Enrolment, settings: ScheduleSettings) => previewReschedule(c, enrolment, settings),
      catchUpChoices: (enrolment: Enrolment) => catchUpChoices(c, enrolment),
      pause: (enrolment: Enrolment) => pauseProgram(c, enrolment),
      resume: (enrolment: Enrolment) => resumeProgram(c, enrolment),
      addProgram: (programId: string) => addProgram(c, programId),
      startQueued: (enrolment: Enrolment) => startQueuedProgram(c, enrolment),
      updateClassTime: (enrolment: Enrolment, classTime: string | null, reminders: boolean) => updateClassTime(c, enrolment, classTime, reminders),
      markMission: (kind: string) => markMission(c, kind),
      addNote: (classId: string, body: string) => c.learning.addNote(classId, body, toUtcIso(c.clock.now())),
      openMetaTraderListing: (app: 'mt4' | 'mt5') => c.apps.openStoreListing(app),
      /** "Start the next class early" (getting ahead): moves it to today. */
      startEarly: (enrolment: Enrolment, today: LocalDate) =>
        rescheduleProgram(c, enrolment, { ...enrolment.settings, extraDates: [...(enrolment.settings.extraDates ?? []), today] }, { allowAnotherToday: true }),
    }),
    [c],
  );
}
