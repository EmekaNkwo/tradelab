import { getLoadedFonts } from 'expo-font';

/**
 * Plus Jakarta Sans (SIL Open Font License 1.1, via @expo-google-fonts/plus-jakarta-sans) is embedded at build
 * time by the expo-font config plugin in app.json, so it works offline with no runtime loading. On Android the
 * plugin registers one family, `PlusJakartaSans`, with 400/500/600/700 faces chosen by `fontWeight`; on iOS the
 * family name comes from the font file ("Plus Jakarta Sans").
 *
 * Fallback: when the font is not embedded (Expo Go, Jest, a build without the plugin) no family is set and the
 * system font is used, so text never disappears or waits for a font to load.
 */
export const FONT_FAMILY_CANDIDATES: readonly string[] = ['PlusJakartaSans', 'Plus Jakarta Sans'];

/** The first candidate family that is available natively, or undefined to use the system font. */
export function resolveFontFamily(loaded: () => readonly string[] = safeLoadedFonts): string | undefined {
  const available = loaded();
  return FONT_FAMILY_CANDIDATES.find((family) => available.includes(family));
}

function safeLoadedFonts(): readonly string[] {
  try {
    return getLoadedFonts();
  } catch {
    // No native font module (e.g. an unusual test runtime): the system font is the safe answer.
    return [];
  }
}
