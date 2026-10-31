import { useCallback, useMemo, useState } from 'react';
import type { CalendarEventType, SampleCalendarEvent } from '../../domain/models/calendar';
import type { MarketScenario } from '../../domain/models/labs';
import { checkHeadline, studyHeadline, type HeadlineStudy } from '../../domain/news/headline';
import { useContainer } from '../app';

/**
 * The market calendar and News to Learning (spec §25). The app has no
 * calendar or news provider, so the calendar shows clearly labelled
 * fictional sample events and News to Learning works only on a headline
 * the learner types or pastes. Neither ever presents anything as current.
 */

export const SAMPLE_EVENTS_NOTICE =
  'Sample events only. These are fictional events in a made-up week, to show what a market calendar looks like and how to prepare. No real dates, places or figures are used, and the app does not connect to a calendar provider.';

export const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

export interface SampleRow {
  readonly key: string;
  readonly eventTypeId: string;
  readonly eventTitle: string;
  readonly sample: SampleCalendarEvent;
  readonly dayName: string;
}

/** Every sample event in the fictional week, by day then time. */
export function sampleWeek(types: readonly CalendarEventType[]): readonly SampleRow[] {
  return types
    .flatMap((t) => t.samples.map((s) => ({ key: `${t.id}:${s.id}`, eventTypeId: t.id, eventTitle: t.title, sample: s, dayName: DAY_NAMES[s.day - 1] as string })))
    .sort((a, b) => a.sample.day - b.sample.day || a.sample.time.localeCompare(b.sample.time) || a.key.localeCompare(b.key));
}

export function useCalendar() {
  const { content } = useContainer();
  return useMemo(() => ({ types: content.calendarEvents(), week: sampleWeek(content.calendarEvents()) }), [content]);
}

export function useCalendarEvent(id: string | null): CalendarEventType | null {
  const { content } = useContainer();
  return id ? content.calendarEvent(id) : null;
}

export type HeadlineState = { readonly status: 'empty' } | { readonly status: 'invalid'; readonly reason: string } | { readonly status: 'studied'; readonly study: HeadlineStudy };

/** Turns a typed headline into study questions. With no headline, the fictional scenarios are offered instead. */
export function useHeadlineStudy() {
  const { content } = useContainer();
  const [state, setState] = useState<HeadlineState>({ status: 'empty' });
  const study = useCallback(
    (text: string) => {
      const checked = checkHeadline(text);
      setState(checked.ok ? { status: 'studied', study: studyHeadline(checked.headline, content.calendarEvents(), content.glossary()) } : { status: 'invalid', reason: checked.reason });
    },
    [content],
  );
  const fictionalScenarios: readonly MarketScenario[] = useMemo(() => content.marketScenarios(), [content]);
  return { state, study, clear: () => setState({ status: 'empty' }), fictionalScenarios };
}

export interface StudyLink {
  readonly kind: 'glossary' | 'lesson' | 'scenario';
  readonly id: string;
  readonly title: string;
}

/** Resolves glossary, lesson and scenario ids to titles, dropping any the content no longer has. */
export function studyLinks(
  content: { glossaryEntry(id: string): { readonly term: string } | null; lesson(id: string): { readonly title: string } | null; marketScenario(id: string): { readonly title: string } | null },
  glossaryIds: readonly string[],
  lessonIds: readonly string[],
  scenarioIds: readonly string[],
): readonly StudyLink[] {
  const pick = <T>(kind: StudyLink['kind'], ids: readonly string[], find: (id: string) => T | null, title: (t: T) => string) =>
    ids.flatMap((id) => {
      const found = find(id);
      return found ? [{ kind, id, title: title(found) }] : [];
    });
  return [
    ...pick('glossary', glossaryIds, (id) => content.glossaryEntry(id), (g) => g.term),
    ...pick('lesson', lessonIds, (id) => content.lesson(id), (l) => l.title),
    ...pick('scenario', scenarioIds, (id) => content.marketScenario(id), (s) => s.title),
  ];
}

export function useStudyLinks(glossaryIds: readonly string[], lessonIds: readonly string[], scenarioIds: readonly string[]): readonly StudyLink[] {
  const { content } = useContainer();
  return useMemo(() => studyLinks(content, glossaryIds, lessonIds, scenarioIds), [content, glossaryIds, lessonIds, scenarioIds]);
}
