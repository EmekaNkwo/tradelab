import { useTheme, type ColorTokens } from '../../theme';
import type { LucideIcon } from './icons';

interface IconProps {
  readonly icon: LucideIcon;
  readonly size?: number;
  /** A colour token, or a literal colour (e.g. white on a hero). */
  readonly color?: keyof ColorTokens;
  readonly literalColor?: string;
  readonly fill?: string;
  /** The house stroke is 1.75; a heavier stroke marks a selected state (the active tab). */
  readonly strokeWidth?: number;
  readonly testID?: string;
}

export const ICON_STROKE = 1.75;

/** An outline icon at the house stroke (1.75). Icons are decoration: the text next to them carries meaning. */
export function Icon({ icon: Glyph, size = 22, color = 'textPrimary', literalColor, fill, strokeWidth = ICON_STROKE, testID }: IconProps) {
  const { colors } = useTheme();
  return (
    <Glyph
      testID={testID}
      size={size}
      strokeWidth={strokeWidth}
      color={literalColor ?? colors[color]}
      fill={fill ?? 'none'}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}
