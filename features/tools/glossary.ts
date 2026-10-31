import { useMemo } from 'react';
import { pickLevelledText, type GlossaryEntry } from '../../domain/models/content';
import type { ExplanationLevel } from '../../shared/types';
import { useContainer } from '../app';
import { useSettings } from '../settings';

export interface GlossaryListItem {
  readonly id: string;
  readonly term: string;
  readonly summary: string;
}

/** Case-insensitive match on the term, its aliases, and the simple definition. */
export function searchGlossary(entries: readonly GlossaryEntry[], query: string): readonly GlossaryListItem[] {
  const q = query.trim().toLowerCase();
  const matches = q
    ? entries.filter((e) => [e.term, ...e.aliases, e.definition.simple].some((t) => t.toLowerCase().includes(q)))
    : entries;
  return matches.map((e) => ({ id: e.id, term: e.term, summary: e.definition.simple }));
}

export function useGlossarySearch(query: string): readonly GlossaryListItem[] {
  const { content } = useContainer();
  return useMemo(() => searchGlossary(content.glossary(), query), [content, query]);
}

export interface GlossaryTermView {
  readonly term: string;
  readonly aliases: readonly string[];
  readonly definition: string;
  /** The simple definition too, when the learner reads at a higher level. */
  readonly simpleDefinition: string | null;
  readonly example: string | null;
  readonly related: readonly { readonly id: string; readonly term: string }[];
}

export function glossaryTermView(entry: GlossaryEntry, related: readonly GlossaryEntry[], level: ExplanationLevel): GlossaryTermView {
  const definition = pickLevelledText(entry.definition, level);
  return {
    term: entry.term,
    aliases: entry.aliases,
    definition,
    simpleDefinition: definition === entry.definition.simple ? null : entry.definition.simple,
    example: entry.example ?? null,
    related: related.map((r) => ({ id: r.id, term: r.term })),
  };
}

/** One term at the learner's explanation level; null when the id is unknown. */
export function useGlossaryTerm(id: string): GlossaryTermView | null {
  const { content } = useContainer();
  const settings = useSettings();
  const level = settings.status === 'success' ? settings.data.explanationLevel : 'simple';
  return useMemo(() => {
    const entry = content.glossaryEntry(id);
    if (!entry) return null;
    const related = entry.related.flatMap((r) => content.glossaryEntry(r) ?? []);
    return glossaryTermView(entry, related, level);
  }, [content, id, level]);
}
