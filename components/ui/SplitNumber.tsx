import { Text } from 'react-native';
import { tabularNums, textStyle, useTheme, type ColorTokens } from '../../theme';
import { MONEY_MARKER, marker, useSimulatedKind, withSimulated } from './simulated';
import { splitDecimal } from './valueParts';

interface SplitNumberProps {
  /** The formatted number, e.g. "$10,430.25". */
  readonly value: string;
  /** One label for the whole figure, e.g. "Equity, simulated, $10,430.25, up 4.3%". */
  readonly accessibilityLabel: string;
  readonly size?: 'display' | 'title';
  readonly color?: keyof ColorTokens;
  readonly literalColor?: string;
  /** The figure is (simulated) money: it must sit in a card with a SimulatedBadge (testing/simulatedFigures.ts). */
  readonly money?: boolean;
  readonly testID?: string;
}

/**
 * Hero balances and big stats: the integer large, the decimals smaller and in a lighter weight (brief §2; no opacity, so contrast holds on heroes). Nested Text, so
 * the figure wraps like running text under large dynamic type instead of being cut off; read as one label.
 */
export function SplitNumber({ value, accessibilityLabel, size = 'display', color = 'textPrimary', literalColor, money = false, testID }: SplitNumberProps) {
  const theme = useTheme();
  const simulated = useSimulatedKind();
  const { integer, decimals, suffix } = splitDecimal(value);
  const base = textStyle(theme, size);
  const small = textStyle(theme, size === 'display' ? 'heading' : 'label');
  const fg = literalColor ?? theme.colors[color];
  return (
    <Text
      {...(money ? marker(MONEY_MARKER) : null)}
      testID={testID}
      accessible
      accessibilityLabel={withSimulated(accessibilityLabel, simulated)}
      maxFontSizeMultiplier={2}
      style={[base, tabularNums, { color: fg }]}
    >
      {integer}
      {decimals || suffix ? <Text style={[small, tabularNums, { color: fg, fontWeight: '500' }]}>{`${decimals}${suffix}`}</Text> : null}
    </Text>
  );
}
