import type { TextStyle } from 'react-native';
import type { Theme, TypographyVariant } from './tokens';

/** Tabular (fixed-width) digits so numbers line up and do not jiggle as they change (brief §2). */
export const tabularNums: TextStyle = { fontVariant: ['tabular-nums'] };

/** A typography variant with the bundled font family when this build has it (system font otherwise). */
export function textStyle(theme: Theme, variant: TypographyVariant): TextStyle {
  const base = theme.typography[variant];
  return theme.fontFamily ? { ...base, fontFamily: theme.fontFamily } : { ...base };
}
