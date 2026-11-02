import { darkTheme, lightTheme } from '../palettes';
import type { ColorTokens } from '../tokens';

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const TEXT_TOKENS: (keyof ColorTokens)[] = [
  'textPrimary',
  'textSecondary',
  'brand',
  'gainText',
  'lossText',
  'warning',
  'modeLearn',
  'modeReplay',
  'modePaper',
  'modeMetaTrader',
];

describe.each([
  ['light', lightTheme],
  ['dark', darkTheme],
])('%s theme', (_name, theme) => {
  it.each(TEXT_TOKENS)('%s meets WCAG AA (4.5:1) on background and surfaces', (token) => {
    for (const bg of [theme.colors.bg, theme.colors.surface, theme.colors.surfaceMuted]) {
      expect(contrast(theme.colors[token], bg)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('warning text is readable on the warning surface', () => {
    expect(contrast(theme.colors.warning, theme.colors.warningTint)).toBeGreaterThanOrEqual(4.5);
  });

  it('inverse text is readable on primary buttons', () => {
    expect(contrast(theme.colors.onBrand, theme.colors.brand)).toBeGreaterThanOrEqual(4.5);
  });

  it('body and muted text are readable inside warning notices', () => {
    expect(contrast(theme.colors.textPrimary, theme.colors.warningTint)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(theme.colors.textSecondary, theme.colors.warningTint)).toBeGreaterThanOrEqual(4.5);
  });

  it('candles, chart lines and the focus ring meet 3:1 against the chart surface (WCAG 1.4.11)', () => {
    for (const token of ['gain', 'loss', 'brand', 'textPrimary', 'focus', 'modeReplay', 'textSecondary'] as const) {
      expect(contrast(theme.colors[token], theme.colors.surface)).toBeGreaterThanOrEqual(3);
    }
  });
});

/** Restyle tokens (brief §2): every text/background pair the shared components draw. */
describe.each([
  ['light', lightTheme],
  ['dark', darkTheme],
])('%s theme, restyle pairs', (_name, theme) => {
  const c = theme.colors;
  const surfaces = [c.bg, c.surface, c.surfaceMuted];
  const AA = 4.5;
  const LARGE_OR_NON_TEXT = 3;

  it.each(['textPrimary', 'textSecondary', 'brand', 'gainText', 'lossText', 'warning', 'info', 'simulatedBadge'] as const)(
    '%s text meets 4.5:1 on bg, surface and surfaceMuted',
    (token) => {
      for (const bg of surfaces) expect(contrast(c[token], bg)).toBeGreaterThanOrEqual(AA);
    },
  );

  it('the hero button ink (heroEnd) meets 4.5:1 on its white pill', () => {
    expect(contrast(c.heroEnd, c.onHero)).toBeGreaterThanOrEqual(AA);
  });

  it('the active tab: brand icon meets 3:1 on its brand-tint pill, labels meet 4.5:1 on the tab bar', () => {
    expect(contrast(c.brand, c.brandTint)).toBeGreaterThanOrEqual(LARGE_OR_NON_TEXT);
    expect(contrast(c.brand, c.surface)).toBeGreaterThanOrEqual(AA);
    expect(contrast(c.textSecondary, c.surface)).toBeGreaterThanOrEqual(AA);
  });

  it('the Home bell dot (warning) meets 3:1 on the bell surface', () => {
    expect(contrast(c.warning, c.surface)).toBeGreaterThanOrEqual(LARGE_OR_NON_TEXT);
  });

  it('white (onHero) text meets 4.5:1 on both hero gradient stops', () => {
    expect(contrast(c.onHero, c.heroStart)).toBeGreaterThanOrEqual(AA);
    expect(contrast(c.onHero, c.heroEnd)).toBeGreaterThanOrEqual(AA);
    expect(contrast(c.onHero, c.heroSoftEnd)).toBeGreaterThanOrEqual(AA);
  });

  it('text on brand fills (buttons, selected chips, pressed) meets 4.5:1', () => {
    expect(contrast(c.onBrand, c.brand)).toBeGreaterThanOrEqual(AA);
    expect(contrast(c.onBrand, c.brandStrong)).toBeGreaterThanOrEqual(AA);
  });

  it('text on danger fills (rest and pressed) meets 4.5:1', () => {
    expect(contrast(c.onBrand, c.lossText)).toBeGreaterThanOrEqual(AA);
    expect(contrast(c.onBrand, c.lossStrong)).toBeGreaterThanOrEqual(AA);
  });

  it('gain and loss text meet 4.5:1 on their tinted chips', () => {
    expect(contrast(c.gainText, c.gainTint)).toBeGreaterThanOrEqual(AA);
    expect(contrast(c.lossText, c.lossTint)).toBeGreaterThanOrEqual(AA);
  });

  it('simulated badge text meets 4.5:1 on its pill', () => {
    expect(contrast(c.simulatedBadge, c.simulatedBadgeBg)).toBeGreaterThanOrEqual(AA);
  });

  it('notice body and secondary text meet 4.5:1 on every notice tint', () => {
    for (const tint of [c.warningTint, c.infoTint, c.brandTint, c.gainTint, c.lossTint, c.simulatedBadgeBg]) {
      expect(contrast(c.textPrimary, tint)).toBeGreaterThanOrEqual(AA);
      expect(contrast(c.textSecondary, tint)).toBeGreaterThanOrEqual(AA);
    }
  });

  it('warning and info chip text meet 4.5:1 on their tints', () => {
    expect(contrast(c.warning, c.warningTint)).toBeGreaterThanOrEqual(AA);
    expect(contrast(c.infoText, c.infoTint)).toBeGreaterThanOrEqual(AA);
  });

  it('brand text and secondary text meet 4.5:1 on brand tint (icon wells, neutral chips)', () => {
    expect(contrast(c.brand, c.brandTint)).toBeGreaterThanOrEqual(AA);
    expect(contrast(c.textSecondary, c.brandTint)).toBeGreaterThanOrEqual(AA);
    expect(contrast(c.textPrimary, c.brandTint)).toBeGreaterThanOrEqual(AA);
  });

  it('gain/loss fills (candles, bars), brand and secondary icons meet 3:1 against cards (WCAG 1.4.11)', () => {
    for (const token of ['gain', 'loss', 'brand', 'textSecondary'] as const) {
      for (const bg of surfaces) expect(contrast(c[token], bg)).toBeGreaterThanOrEqual(LARGE_OR_NON_TEXT);
    }
  });

  it('the warning fill is only a background for its dark ink (≥4.5:1); warning icons and strokes use `warning` (≥3:1)', () => {
    expect(contrast(c.onWarningFill, c.warningFill)).toBeGreaterThanOrEqual(AA);
    for (const bg of surfaces) expect(contrast(c.warning, bg)).toBeGreaterThanOrEqual(LARGE_OR_NON_TEXT);
  });

  it('stage 4 pairs: process chips, quiz pills, glossary links on worked-example tiles, module and rule bars', () => {
    // Process chips: brand on brandTint (followed), warning on warningTint (rules broken).
    expect(contrast(c.brand, c.brandTint)).toBeGreaterThanOrEqual(AA);
    expect(contrast(c.warning, c.warningTint)).toBeGreaterThanOrEqual(AA);
    // Quiz pills: primary text on a surface pill, onBrand text on the selected brand pill.
    expect(contrast(c.textPrimary, c.surface)).toBeGreaterThanOrEqual(AA);
    expect(contrast(c.onBrand, c.brand)).toBeGreaterThanOrEqual(AA);
    // Glossary links (brand) inside a worked example on surfaceMuted.
    expect(contrast(c.brand, c.surfaceMuted)).toBeGreaterThanOrEqual(AA);
    // Bar fills (brand: modules and sources; warning: rule breaks) against their surfaceMuted track.
    expect(contrast(c.brand, c.surfaceMuted)).toBeGreaterThanOrEqual(LARGE_OR_NON_TEXT);
    expect(contrast(c.warning, c.surfaceMuted)).toBeGreaterThanOrEqual(LARGE_OR_NON_TEXT);
  });

  it('stage 5a pairs: order sides, chart tools and replay controls, library chips, chart tiles', () => {
    // Order ticket: the chosen Buy is gainText on gainTint, Sell lossText on lossTint; their edges are the fills.
    expect(contrast(c.gainText, c.gainTint)).toBeGreaterThanOrEqual(AA);
    expect(contrast(c.lossText, c.lossTint)).toBeGreaterThanOrEqual(AA);
    expect(contrast(c.textPrimary, c.surfaceMuted)).toBeGreaterThanOrEqual(AA);
    for (const edge of [c.gain, c.loss]) expect(contrast(edge, c.surfaceMuted)).toBeGreaterThanOrEqual(LARGE_OR_NON_TEXT);
    // Tool and replay buttons: brand icon on surfaceMuted, onBrand icon on the selected/primary brand circle.
    expect(contrast(c.brand, c.surfaceMuted)).toBeGreaterThanOrEqual(LARGE_OR_NON_TEXT);
    expect(contrast(c.onBrand, c.brand)).toBeGreaterThanOrEqual(LARGE_OR_NON_TEXT);
    // Library chips: brand on brandTint (level), textSecondary on surfaceMuted (markets), textPrimary on brandTint.
    expect(contrast(c.brand, c.brandTint)).toBeGreaterThanOrEqual(AA);
    expect(contrast(c.textSecondary, c.surfaceMuted)).toBeGreaterThanOrEqual(AA);
    expect(contrast(c.textPrimary, c.brandTint)).toBeGreaterThanOrEqual(AA);
    // Equity line (textPrimary) and drawdown line (loss) on the muted chart tile.
    expect(contrast(c.textPrimary, c.surfaceMuted)).toBeGreaterThanOrEqual(LARGE_OR_NON_TEXT);
    expect(contrast(c.loss, c.surfaceMuted)).toBeGreaterThanOrEqual(LARGE_OR_NON_TEXT);
    // Chart header: the timeframe in brand on the surface chip.
    expect(contrast(c.brand, c.surface)).toBeGreaterThanOrEqual(AA);
  });

  it('every colour token is six-digit hex, so an alpha suffix (Card accent outline) is valid', () => {
    for (const [name, value] of Object.entries(c)) {
      expect(`${name}=${value}`).toMatch(/=#[0-9A-F]{6}$/i);
    }
  });

  it('the legacy alias names are gone', () => {
    for (const k of ['background', 'surfaceRaised', 'text', 'textMuted', 'textInverse', 'primary', 'primaryPressed', 'positive', 'negative', 'danger', 'warningSurface']) {
      expect(c).not.toHaveProperty(k);
    }
  });

  it('brand green is not the profit colour', () => {
    expect(c.brand).not.toBe(c.gain);
    expect(c.brand).not.toBe(c.gainText);
  });
});

describe.each([
  ['light', lightTheme],
  ['dark', darkTheme],
])('%s theme, pills on the hero gradient', (_name, theme) => {
  /** `over` blended onto `under` with black at the overlay opacity. */
  const darken = (hex: string, opacity: number) =>
    `#${[1, 3, 5]
      .map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * (1 - opacity)))
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('')}`;

  /** `#FFFFFF` at `opacity` over `under`. */
  const lighten = (hex: string, opacity: number) =>
    `#${[1, 3, 5]
      .map((i) => Math.round(255 * opacity + parseInt(hex.slice(i, i + 2), 16) * (1 - opacity)))
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('')}`;
  const stops = [theme.colors.heroStart, theme.colors.heroEnd, theme.colors.heroSoftEnd];

  it('white text over the decorative shapes (both overlapping, the worst case) meets 4.5:1', () => {
    const { HERO_SHAPE_OPACITY } = jest.requireActual<typeof import('../tokens')>('../tokens');
    const both = 1 - (1 - HERO_SHAPE_OPACITY) ** 2;
    for (const stop of stops) {
      expect(contrast(theme.colors.onHero, darken(stop, HERO_SHAPE_OPACITY))).toBeGreaterThanOrEqual(4.5);
      expect(contrast(theme.colors.onHero, darken(stop, both))).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('unselected activity bars on a hero meet 3:1 against every stop, and under the shapes', () => {
    const { HERO_BAR_OPACITY, HERO_SHAPE_OPACITY } = jest.requireActual<typeof import('../tokens')>('../tokens');
    for (const stop of [...stops, ...stops.map((s) => darken(s, HERO_SHAPE_OPACITY))]) {
      expect(contrast(lighten(stop, HERO_BAR_OPACITY), stop)).toBeGreaterThanOrEqual(3);
    }
  });

  it('white text on the hero overlay pill meets 4.5:1 on both stops', () => {
    const { HERO_OVERLAY_OPACITY } = jest.requireActual<typeof import('../tokens')>('../tokens');
    for (const stop of [theme.colors.heroStart, theme.colors.heroEnd, theme.colors.heroSoftEnd]) {
      expect(contrast(theme.colors.onHero, darken(stop, HERO_OVERLAY_OPACITY))).toBeGreaterThanOrEqual(4.5);
    }
  });
});
