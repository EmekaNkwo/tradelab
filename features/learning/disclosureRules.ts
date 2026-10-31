import type { ContentRepository } from '../../data';
import type { Disclosure, DisclosureTrigger } from '../../domain/models/content';

/** Markets whose lessons carry their own risk disclosure (spec §3, §10.3, §10.5). */
const MARKET_TRIGGERS: Readonly<Partial<Record<string, DisclosureTrigger>>> = { futures: 'futures', penny_stocks: 'penny_stocks' };

/**
 * The risk disclosures shown with a lesson: those for a module about one of
 * these markets. Modules that only mention them alongside others (such as
 * technical analysis across several markets) do not repeat the warning.
 */
export function lessonDisclosures(content: Pick<ContentRepository, 'lesson' | 'module' | 'disclosuresFor'>, lessonId: string): readonly Disclosure[] {
  const lesson = content.lesson(lessonId);
  const markets = lesson ? (content.module(lesson.moduleId)?.markets ?? []) : [];
  const only = markets.length === 1 ? markets[0] : undefined;
  const trigger = only ? MARKET_TRIGGERS[only] : undefined;
  return trigger ? content.disclosuresFor(trigger) : [];
}
