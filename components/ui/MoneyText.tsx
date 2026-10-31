import type { TextProps } from 'react-native';
import type { ColorTokens, TypographyVariant } from '../../theme';
import { AppText } from './AppText';
import { MONEY_MARKER, marker, useSimulatedKind, withSimulated } from './simulated';
import { spokenAmount } from './valueParts';

interface MoneyTextProps extends Pick<TextProps, 'testID' | 'style' | 'numberOfLines'> {
  /** The formatted amount, e.g. "10,430.25 USD" or "−12.40 USD". */
  readonly children: string;
  readonly variant?: TypographyVariant;
  readonly color?: keyof ColorTokens;
  /** What a screen reader says; defaults to the amount with any minus sign in words. */
  readonly accessibilityLabel?: string;
}

/**
 * A plain (simulated) money amount in running text or a row. Marked as money, so testing/simulatedFigures.ts checks
 * it sits in a card with a SimulatedBadge; tabular digits; a minus sign is spoken as "minus". Can be nested in an
 * AppText to mark one amount inside a sentence.
 */
export function MoneyText({ children, variant, color, accessibilityLabel, testID, style, numberOfLines }: MoneyTextProps) {
  const simulated = useSimulatedKind();
  return (
    <AppText
      {...marker(MONEY_MARKER)}
      testID={testID}
      variant={variant}
      color={color}
      style={style}
      numberOfLines={numberOfLines}
      tabular
      accessibilityLabel={withSimulated(accessibilityLabel ?? spokenAmount(children), simulated)}
    >
      {children}
    </AppText>
  );
}
