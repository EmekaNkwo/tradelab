import { View } from 'react-native';
import { useTheme, type TypographyVariant } from '../../theme';
import { AppText } from '../ui/AppText';
import { Icon } from '../ui/Icon';
import { ArrowDown, ArrowUp, Minus } from '../ui/icons';
import { spokenDirection, unsigned, type Direction } from '../ui/valueParts';

interface RValueProps {
  readonly direction: Direction;
  /** Signed text, e.g. "+0.123R" (signedR). */
  readonly text: string;
  /** Said before the value, e.g. "Average result, backtest". */
  readonly subject: string;
  readonly variant?: TypographyVariant;
  readonly testID?: string;
}

const ARROWS = { up: ArrowUp, down: ArrowDown, flat: Minus } as const;

/**
 * An average result in R: sign, arrow and the result colours, like PnLValue, but not money (no money marker).
 * Spoken as "Average result, backtest, gain of 0.123 R".
 */
export function RValue({ direction, text, subject, variant = 'label', testID }: RValueProps) {
  const { colors, spacing } = useTheme();
  const color = direction === 'up' ? 'gainText' : direction === 'down' ? 'lossText' : 'textSecondary';
  const spoken = `${subject}, ${spokenDirection(direction, 'result')} ${unsigned(text).replace(/R$/, ' R')}`;
  return (
    <View testID={testID} accessible accessibilityLabel={spoken} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xxs, flexShrink: 1 }}>
      <Icon icon={ARROWS[direction]} size={variant === 'title' ? 20 : 16} literalColor={colors[color]} />
      <AppText variant={variant} header={false} color={color} tabular style={{ flexShrink: 1 }}>
        {text}
      </AppText>
    </View>
  );
}
