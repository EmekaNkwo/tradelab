import { Text, type TextProps } from 'react-native';
import { tabularNums, textStyle, useTheme, type ColorTokens, type TypographyVariant } from '../../theme';

interface AppTextProps extends TextProps {
  readonly variant?: TypographyVariant;
  readonly color?: keyof ColorTokens;
  /** Fixed-width digits: use for every number (prices, balances, percentages, counts). */
  readonly tabular?: boolean;
  /**
   * Announce as a heading. Defaults to true for `title` and `heading`, false for everything else, including
   * `display` (big figures use it); pass `header` for a display-size screen title.
   */
  readonly header?: boolean;
}

/** All text goes through here so sizes, the bundled font, colours, and dynamic type stay consistent. */
export function AppText({ variant = 'body', color = 'textPrimary', tabular = false, header, style, ...rest }: AppTextProps) {
  const theme = useTheme();
  const isHeading = header ?? (variant === 'title' || variant === 'heading');
  return (
    <Text
      accessibilityRole={isHeading ? 'header' : undefined}
      maxFontSizeMultiplier={2}
      style={[textStyle(theme, variant), { color: theme.colors[color] }, tabular ? tabularNums : null, style]}
      {...rest}
    />
  );
}
