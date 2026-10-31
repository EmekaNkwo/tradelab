/**
 * Design tokens (spec §31, restyle brief §2). A calm green "learning lab" look: no casino colours, no flashing.
 * Brand green is never the profit colour: results use `gain`/`loss` (fills, candles) and `gainText`/`lossText`
 * (text), always with a sign and an arrow. Every colour and size in the UI comes from here.
 */
export const spacing = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, screen: 20, xl: 24, xxl: 32 } as const;

/** hero 24 · card 20 · tile 16 · pill 999 (chips, circular buttons). sm/md stay for small controls. */
export const radii = { sm: 6, md: 12, lg: 16, tile: 16, card: 20, hero: 24, pill: 999 } as const;

/**
 * Base sizes; React Native scales them with the system font size (dynamic type). `label` is kept for the many
 * existing callers (row titles, buttons); `caption` is 13 medium per the brief.
 */
export const typography = {
  display: { fontSize: 32, lineHeight: 40, fontWeight: '700' },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '600' },
  heading: { fontSize: 17, lineHeight: 24, fontWeight: '600' },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400' },
  /** Lesson reading text (brief §5.2: large text on the reading card). */
  reading: { fontSize: 17, lineHeight: 27, fontWeight: '400' },
  label: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '500' },
} as const;

export type TypographyVariant = keyof typeof typography;

/** Minimum touch target (spec §31: 44×44). */
export const touchTarget = 44;

/** Soft, low shadow for light-mode cards; dark mode uses a hairline border instead (brief §2). */
export interface Elevation {
  readonly shadowColor: string;
  readonly shadowOpacity: number;
  readonly shadowRadius: number;
  readonly shadowOffset: { readonly width: number; readonly height: number };
  /** Android elevation. */
  readonly elevation: number;
  /** Whether cards draw a border (dark) rather than relying on the shadow (light). */
  readonly cardBorder: boolean;
}

export interface ColorTokens {
  // ── Spec tokens (brief §2) ───────────────────────────────────────────────────────────────
  readonly bg: string;
  readonly surface: string;
  /** Tiles, inputs, icon wells, pressed rows. */
  readonly surfaceMuted: string;
  /** Primary buttons, active tab, links, selected chips. Never used for candles or P/L. */
  readonly brand: string;
  readonly brandStrong: string;
  readonly brandTint: string;
  /** Text and icons drawn on a `brand`/`brandStrong` fill. */
  readonly onBrand: string;
  /** Hero card diagonal gradient stops; `onHero` text meets 4.5:1 on both. */
  readonly heroStart: string;
  readonly heroEnd: string;
  /** End stop of the lighter hero variant (Learn's program card); starts at `heroStart`. */
  readonly heroSoftEnd: string;
  readonly onHero: string;
  readonly textPrimary: string;
  readonly textSecondary: string;
  readonly border: string;
  /** Result fills and candles (non-text, ≥3:1). */
  readonly gain: string;
  readonly loss: string;
  /** Result text: ≥4.5:1 on bg, surfaces and its tint chip. */
  readonly gainText: string;
  readonly lossText: string;
  readonly gainTint: string;
  readonly lossTint: string;
  /** Pressed fill of a danger button (text stays `onBrand`). */
  readonly lossStrong: string;
  /** Warning text (rule warnings, cool-down). Text-safe; the brief's hex is `warningFill`. */
  readonly warning: string;
  readonly warningFill: string;
  /** Dark ink for text on a `warningFill` background (the fill is too light for 3:1 on white as an indicator). */
  readonly onWarningFill: string;
  readonly warningTint: string;
  /** Tips, AI suggestion badge. `infoText` is the text-safe variant for use on `infoTint`. */
  readonly info: string;
  readonly infoText: string;
  readonly infoTint: string;
  /** "Simulated" / "Paper" / "Replay" / "Demo (MT)" pill: text on its background. */
  readonly simulatedBadge: string;
  readonly simulatedBadgeBg: string;
  readonly focus: string;

  /** Mode accents so learning, replay, paper trading and MetaTrader tasks look distinct (text-safe). */
  readonly modeLearn: string;
  readonly modeReplay: string;
  readonly modePaper: string;
  readonly modeMetaTrader: string;
}

export interface Theme {
  readonly scheme: 'light' | 'dark';
  readonly colors: ColorTokens;
  readonly spacing: typeof spacing;
  readonly radii: typeof radii;
  readonly typography: typeof typography;
  readonly elevation: Elevation;
  /** The bundled font family, or undefined (system font) when it is not embedded in this build. */
  readonly fontFamily: string | undefined;
}

/**
 * Fill for pills and chips sitting on a hero gradient: black at this opacity over the gradient. Darkening (not
 * lightening) keeps white text above 4.5:1 on both stops (tested in contrast.test.ts).
 */
export const HERO_OVERLAY_OPACITY = 0.2;
export const heroOverlay = `rgba(0, 0, 0, ${HERO_OVERLAY_OPACITY})`;

/**
 * The hero card's decorative shapes are black at this opacity: darkening can only raise white text's contrast, so
 * text over a shape stays ≥4.5:1 (white shapes at 5–7% dropped it to ~4:1).
 */
export const HERO_SHAPE_OPACITY = 0.08;

/** Unselected activity bars on a hero: white at this opacity is ≥3:1 on every hero stop (WCAG 1.4.11). */
export const HERO_BAR_OPACITY = 0.75;
export const heroBarColor = `rgba(255, 255, 255, ${HERO_BAR_OPACITY})`;
