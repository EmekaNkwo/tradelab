import type { MarketKind } from '../../shared/types';

/**
 * Market calendar explainers (spec §25). An event type explains what is
 * measured, why it matters, which markets it touches, how expectations work
 * and how a surprise may be read, without implying a direction. Real dated
 * events come only from a configured provider; the app has none, so each
 * type carries fictional sample events, always labelled as samples.
 */
export type CalendarEventKind = 'central_bank_meeting' | 'rate_decision' | 'inflation' | 'jobs' | 'earnings' | 'inventory' | 'futures_expiry' | 'holiday';
export const CALENDAR_EVENT_KINDS: readonly CalendarEventKind[] = ['central_bank_meeting', 'rate_decision', 'inflation', 'jobs', 'earnings', 'inventory', 'futures_expiry', 'holiday'];

export interface SampleCalendarEvent {
  readonly id: string;
  readonly title: string;
  /** Day of the fictional sample week, 1 (Monday) to 7. Samples never carry real dates. */
  readonly day: number;
  /** HH:MM in `timeZone`. */
  readonly time: string;
  readonly timeZone: 'UTC';
  /** Always a fictional place or company, e.g. "Westmark (fictional)". */
  readonly where: string;
  readonly details: string;
}

export interface CalendarEventType {
  readonly id: string;
  readonly kind: CalendarEventKind;
  readonly title: string;
  readonly measures: string;
  readonly whyItMatters: string;
  readonly affectedMarkets: readonly MarketKind[];
  readonly expectations: string;
  readonly surprises: string;
  /** What the event cannot tell you, e.g. that no direction is predictable. */
  readonly limits: string;
  /** Lowercase words and phrases that point to this event type in a headline (News to Learning). */
  readonly keywords: readonly string[];
  readonly glossaryIds: readonly string[];
  readonly lessonIds: readonly string[];
  /** Fictional "What could happen?" scenarios to practise with. */
  readonly scenarioIds: readonly string[];
  readonly samples: readonly SampleCalendarEvent[];
}
