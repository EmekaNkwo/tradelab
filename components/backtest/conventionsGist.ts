/** The first sentence of a convention: "Survivorship bias: not applicable here, because …" stays whole up to its full stop. */
function firstSentence(text: string): string {
  const end = text.search(/\.(\s|$)/);
  return end === -1 ? text : text.slice(0, end + 1);
}

/** The fill rule is kept whole (its first sentence is about closed candles; the second says where it fills). */
const GIST_PATTERNS: readonly { readonly match: RegExp; readonly whole: boolean }[] = [
  { match: /next candle.s open/i, whole: true },
  { match: /^Commission/i, whole: false },
  { match: /^Survivorship bias/i, whole: false },
];

/**
 * One line shown while the conventions card is folded (spec §16.3: every report lists its conventions): the run's
 * own fill rule, costs and survivorship lines, first sentence each. Only lines the run actually has are used.
 */
export function conventionsGist(conventions: readonly string[]): string {
  return GIST_PATTERNS.flatMap((p) => {
    const found = conventions.find((c) => p.match.test(c));
    if (!found) return [];
    return [p.whole ? found : firstSentence(found)];
  }).join(' ');
}
