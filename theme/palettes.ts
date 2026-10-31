import { radii, spacing, typography, type ColorTokens, type Elevation, type Theme } from './tokens';

/** Spec tokens (brief §2). Adjusted values are noted; see docs/design-system.md for the contrast table. */
type SpecTokens = Omit<
  ColorTokens,
  | 'modeLearn'
  | 'modeReplay'
  | 'modePaper'
  | 'modeMetaTrader'
>;

const lightSpec: SpecTokens = {
  bg: '#F4F7F4',
  surface: '#FFFFFF',
  surfaceMuted: '#F1F5F2',
  brand: '#1F7A4D',
  brandStrong: '#145C39',
  brandTint: '#E3F2E9',
  onBrand: '#FFFFFF',
  // Spec #2E8B57 gives white text 4.25:1; darkened just enough for 4.5:1.
  heroStart: '#2A8452',
  heroEnd: '#145C39',
  heroSoftEnd: '#1F7A4D',
  onHero: '#FFFFFF',
  textPrimary: '#0F1A14',
  textSecondary: '#5D6B63',
  border: '#E3E9E5',
  gain: '#0E9F6E',
  loss: '#D64545',
  // Spec gain #0E9F6E is 3.39:1 and loss #D64545 4.38:1 on white: kept for fills/candles, text variants added.
  gainText: '#0A7A55',
  lossText: '#C53030',
  gainTint: '#E3F5EC',
  lossTint: '#FCE8E8',
  lossStrong: '#A52828',
  // Spec warning #C98A0B is 2.95:1 on white: kept as `warningFill`; `warning` is the text-safe variant.
  warning: '#8A5A00',
  warningFill: '#C98A0B',
  onWarningFill: '#0F1A14',
  warningTint: '#FFF4DC',
  info: '#2563EB',
  // #2563EB is 4.43:1 on its tint; the chip text is slightly darker.
  infoText: '#1F5BD8',
  infoTint: '#E6EEFD',
  simulatedBadge: '#5B4FCF',
  simulatedBadgeBg: '#ECEAFD',
  focus: '#2563EB',
};

const darkSpec: SpecTokens = {
  bg: '#0E1512',
  surface: '#16201B',
  surfaceMuted: '#1C2822',
  brand: '#3FAF76',
  brandStrong: '#2C8F5C',
  brandTint: '#1D3328',
  // White is 4.05:1 on dark brandStrong; dark text is ≥4.5:1 on both brand fills.
  onBrand: '#0E1512',
  heroStart: '#226B45',
  heroEnd: '#0F3D27',
  // Lighter variant end: dark brand #3FAF76 is too light for white text (2.8:1).
  heroSoftEnd: '#2C7D52',
  onHero: '#FFFFFF',
  textPrimary: '#EEF4F0',
  textSecondary: '#A3B2A9',
  border: '#25332B',
  gain: '#34D399',
  loss: '#F87171',
  gainText: '#34D399',
  lossText: '#F87171',
  gainTint: '#173A2B',
  lossTint: '#3D1F22',
  lossStrong: '#FCA5A5',
  warning: '#FBBF24',
  warningFill: '#FBBF24',
  onWarningFill: '#0E1512',
  warningTint: '#3A2E12',
  info: '#60A5FA',
  infoText: '#60A5FA',
  infoTint: '#1B2A44',
  simulatedBadge: '#B4ADFF',
  simulatedBadgeBg: '#2A2550',
  focus: '#60A5FA',
};

/** Spec tokens plus the mode accents. */
function withModes(spec: SpecTokens, modes: { readonly paper: string; readonly metaTrader: string }): ColorTokens {
  return {
    ...spec,
    modeLearn: spec.brand,
    modeReplay: spec.simulatedBadge,
    modePaper: modes.paper,
    modeMetaTrader: modes.metaTrader,
  };
}

const lightElevation: Elevation = {
  shadowColor: '#0F1A14',
  shadowOpacity: 0.06,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
  cardBorder: false,
};

const darkElevation: Elevation = {
  shadowColor: '#000000',
  shadowOpacity: 0,
  shadowRadius: 0,
  shadowOffset: { width: 0, height: 0 },
  elevation: 0,
  cardBorder: true,
};

/** Palettes carry no font: ThemeProvider adds the bundled family when the build has it (theme/fonts.ts). */
const fontFamily = undefined;

export const lightTheme: Theme = {
  scheme: 'light',
  spacing,
  radii,
  typography,
  elevation: lightElevation,
  fontFamily,
  colors: withModes(lightSpec, { paper: '#2C6E6A', metaTrader: '#7A5521' }),
};

export const darkTheme: Theme = {
  scheme: 'dark',
  spacing,
  radii,
  typography,
  elevation: darkElevation,
  fontFamily,
  colors: withModes(darkSpec, { paper: '#7CC6C0', metaTrader: '#E0B472' }),
};
