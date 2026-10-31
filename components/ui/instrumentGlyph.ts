/** Which original, licence-free glyph an instrument gets: flag pair, commodity or index glyph, or a letter. */

export const FLAG_CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD', 'CNH', 'CNY'] as const;
export type FlagCurrency = (typeof FLAG_CURRENCIES)[number];

/** Currencies recognised in a pair: the drawn flags plus common others (drawn as a letter circle). */
const KNOWN_CURRENCIES: readonly string[] = [
  ...FLAG_CURRENCIES,
  'SEK', 'NOK', 'DKK', 'PLN', 'HUF', 'CZK', 'TRY', 'ZAR', 'MXN', 'SGD', 'HKD', 'NGN', 'INR', 'KRW', 'BRL', 'ILS', 'THB',
];

export type InstrumentGlyph =
  | { readonly kind: 'pair'; readonly base: string; readonly quote: string }
  | { readonly kind: 'gold' }
  | { readonly kind: 'silver' }
  | { readonly kind: 'oil' }
  | { readonly kind: 'index' }
  | { readonly kind: 'letter'; readonly letter: string };

/** Only unmistakable commodity symbols: bare tickers such as "CL" or "OIL" may be stocks. */
const OIL = ['WTI', 'BRENT', 'USOIL', 'UKOIL', 'XTI', 'XBR', 'XTIUSD', 'XBRUSD', 'WTIUSD', 'BRENTUSD'];
const INDEX = /^(US|GER|DE|UK|JP|FRA|EU|AUS|HK)\d{2,4}$|^(SPX|NDX|NAS100|DJI|DAX|FTSE|NIKKEI|SP500|US500|USTEC)$/;
const METAL = /^(XAU|XAG)(USD|EUR|GBP|AUD|JPY|CHF)?$/;

/** Removes broker suffixes: "EURUSD.r", "EURUSD.pro", "EURUSD-ECN", "EURUSDm" → "EURUSD". */
export function stripBrokerSuffix(symbol: string): string {
  const s = symbol.trim().replace(/([.\-_#][A-Za-z0-9]+)+$/, '');
  // A bare tail only from a known set, and only on an otherwise all-uppercase symbol, so "Eurusd" is left whole.
  const tail = /^([A-Z0-9/]*[A-Z0-9])(m|r|c|x|pro)$/.exec(s);
  return tail ? tail[1]! : s;
}

const isKnown = (code: string | undefined): code is string => code !== undefined && KNOWN_CURRENCIES.includes(code);

export function instrumentGlyph(symbol: string): InstrumentGlyph {
  const s = stripBrokerSuffix(symbol).toUpperCase();
  const compact = s.replace(/[^A-Z0-9]/g, '');
  const metal = METAL.exec(compact);
  if (metal) return { kind: metal[1] === 'XAU' ? 'gold' : 'silver' };
  if (OIL.includes(compact)) return { kind: 'oil' };
  if (INDEX.test(compact)) return { kind: 'index' };
  const [base, quote] = s.includes('/') ? s.split('/') : compact.length === 6 ? [compact.slice(0, 3), compact.slice(3)] : [];
  // A pair only when both halves are currencies we know; "ABCDEF" is a ticker, not a pair.
  if (isKnown(base) && isKnown(quote)) return { kind: 'pair', base, quote };
  return { kind: 'letter', letter: compact.charAt(0) || '?' };
}

export function isFlagCurrency(code: string): code is FlagCurrency {
  return (FLAG_CURRENCIES as readonly string[]).includes(code);
}
