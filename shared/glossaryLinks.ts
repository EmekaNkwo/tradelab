/**
 * Inline glossary links in content text: `[[pip]]` or `[[pip|pips]]` (spec §9.2:
 * every difficult term is tappable). Parsing lives here so content checks and
 * screens agree on the syntax.
 */
export type TextSegment =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'term'; readonly id: string; readonly label: string };

const LINK = /\[\[([a-z0-9-]+)(?:\|([^\]]+))?\]\]/g;

export function parseGlossaryLinks(text: string): readonly TextSegment[] {
  const segments: TextSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(LINK)) {
    const index = match.index;
    if (index > last) segments.push({ kind: 'text', text: text.slice(last, index) });
    const id = match[1] as string;
    segments.push({ kind: 'term', id, label: match[2] ?? id.replace(/-/g, ' ') });
    last = index + match[0].length;
  }
  if (last < text.length) segments.push({ kind: 'text', text: text.slice(last) });
  return segments;
}

/** The text with links shown as plain words. */
export function plainText(text: string): string {
  return parseGlossaryLinks(text)
    .map((s) => (s.kind === 'text' ? s.text : s.label))
    .join('');
}
