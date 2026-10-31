import type { CalendarEventType } from '../models/calendar';
import type { GlossaryEntry } from '../models/content';
import { MARKET_LABELS, type MarketKind } from '../../shared/types';

/**
 * News to Learning (spec §25). The learner types or pastes a headline; fixed
 * templates turn it into the five study questions, detect glossary terms and
 * link the matching calendar explainer, lessons and fictional scenarios.
 * Nothing is fetched and nothing is invented: the app cannot check the
 * headline and never says what will happen next.
 */

export const MAX_HEADLINE_LENGTH = 300;
export const MIN_HEADLINE_LENGTH = 8;

export interface StudyQuestion {
  readonly id: 'measure' | 'rates' | 'assets' | 'expected' | 'reaction';
  readonly question: string;
  /** How to think about it, from the matched explainer or a general template. */
  readonly guide: string;
}

export interface HeadlineStudy {
  readonly headline: string;
  readonly eventTypes: readonly CalendarEventType[];
  readonly glossaryIds: readonly string[];
  readonly lessonIds: readonly string[];
  readonly scenarioIds: readonly string[];
  readonly markets: readonly MarketKind[];
  /** Numbers in the headline, e.g. "3.2%", worth comparing with what was expected. */
  readonly numbers: readonly string[];
  readonly questions: readonly StudyQuestion[];
}

export type HeadlineCheck = { readonly ok: true; readonly headline: string } | { readonly ok: false; readonly reason: string };

/** Cleans the pasted text: one line, trimmed, of a sensible length. */
export function checkHeadline(raw: string): HeadlineCheck {
  const headline = raw.replace(/\s+/g, ' ').trim();
  if (headline.length < MIN_HEADLINE_LENGTH) return { ok: false, reason: 'Type or paste a headline of at least a few words.' };
  if (headline.length > MAX_HEADLINE_LENGTH) return { ok: false, reason: `Use the headline only (up to ${MAX_HEADLINE_LENGTH} characters), not the whole article.` };
  return { ok: true, headline };
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const containsPhrase = (text: string, phrase: string) => new RegExp(`(^|[^a-z0-9])${escape(phrase.toLowerCase())}([^a-z0-9]|$)`).test(text);

/** Event types whose keywords appear in the headline, the most matches first. */
export function matchEventTypes(headline: string, types: readonly CalendarEventType[]): readonly CalendarEventType[] {
  const text = headline.toLowerCase();
  return types
    .map((t) => ({ t, hits: t.keywords.filter((k) => containsPhrase(text, k)).length }))
    .filter((x) => x.hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .map((x) => x.t);
}

/** Glossary terms (or their aliases) named in the headline. Short aliases must match case exactly (CPI, EPS). */
export function detectGlossaryTerms(headline: string, glossary: readonly GlossaryEntry[]): readonly string[] {
  const lower = headline.toLowerCase();
  return glossary
    .filter((g) =>
      [g.term, ...g.aliases].some((name) => {
        const n = name.trim();
        if (n.length < 2) return false;
        if (n.length <= 4 && n === n.toUpperCase()) return new RegExp(`(^|[^A-Za-z0-9])${escape(n)}([^A-Za-z0-9]|$)`).test(headline);
        return containsPhrase(lower, n);
      }),
    )
    .map((g) => g.id);
}

const NUMBER = /[-+−]?\d+(?:[.,]\d+)?\s?(?:%|bp|bps|basis points|million|billion|k)?/gi;

const unique = <T,>(items: readonly T[]) => [...new Set(items)];

function questionsFor(types: readonly CalendarEventType[], markets: readonly MarketKind[], numbers: readonly string[]): readonly StudyQuestion[] {
  const main = types[0];
  const marketText = markets.length > 0 ? markets.map((m) => MARKET_LABELS[m]).join(', ') : 'Think about currencies, stocks, commodities and futures in turn';
  return [
    {
      id: 'measure',
      question: 'What does it measure, or what happened?',
      guide: main ? main.measures : 'Name the number, decision or event behind the headline. If it is an opinion or a forecast rather than a reported fact, say so.',
    },
    {
      id: 'rates',
      question: 'What could it mean for interest-rate expectations?',
      guide: main
        ? `${main.whyItMatters} Ask whether this could change what traders expect the central bank to do next, and say how sure anyone could be.`
        : 'Ask whether this could change what traders expect central banks to do with interest rates. Many headlines have no clear link to rates at all, which is a fine answer.',
    },
    { id: 'assets', question: 'Which assets might it affect, and how directly?', guide: markets.length > 0 ? `Markets this kind of news usually touches: ${marketText}. Rank them from most to least directly affected.` : `${marketText}, and say which are touched directly and which only indirectly.` },
    {
      id: 'expected',
      question: 'What was expected before it came out?',
      guide: `${main ? main.expectations : 'Find out what forecasters and traders expected beforehand.'}${numbers.length > 0 ? ` Compare ${numbers.slice(0, 3).join(', ')} with the forecast and the previous figure: the surprise is actual minus expected.` : ''}`,
    },
    {
      id: 'reaction',
      question: 'Why might the market reaction differ from the "obvious" one?',
      guide: main ? `${main.surprises} ${main.limits}` : 'It may already be priced in, other parts of the news may point the other way, traders may be positioned for it, or bigger news may take over. No reaction is certain.',
    },
  ];
}

export function studyHeadline(headline: string, types: readonly CalendarEventType[], glossary: readonly GlossaryEntry[]): HeadlineStudy {
  const matched = matchEventTypes(headline, types);
  const glossaryIds = unique([...detectGlossaryTerms(headline, glossary), ...matched.flatMap((t) => t.glossaryIds)]).slice(0, 12);
  const markets = unique(matched.flatMap((t) => t.affectedMarkets));
  const numbers = unique((headline.match(NUMBER) ?? []).map((n) => n.trim()).filter((n) => /\d/.test(n) && !/^(19|20)\d{2}$/.test(n)));
  return {
    headline,
    eventTypes: matched,
    glossaryIds,
    lessonIds: unique(matched.flatMap((t) => t.lessonIds)),
    scenarioIds: unique(matched.flatMap((t) => t.scenarioIds)),
    markets,
    numbers,
    questions: questionsFor(matched, markets, numbers),
  };
}
