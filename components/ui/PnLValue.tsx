import { View } from 'react-native';
import { useTheme, type TypographyVariant } from '../../theme';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { ArrowDown, ArrowUp, Minus } from './icons';
import { MONEY_MARKER, marker, useSimulatedKind, withSimulated } from './simulated';
import { signedText, spokenChange, unsigned, type Direction } from './valueParts';

interface PnLValueProps {
  readonly direction: Direction;
  /** Unsigned money text, e.g. "$42.50". */
  readonly amount: string;
  /** Optional R multiple, unsigned, e.g. "1.7R": shown as "+$42.50 · +1.7R". */
  readonly r?: string;
  /** Said before the value, e.g. "Simulated result". */
  readonly subject?: string;
  readonly variant?: TypographyVariant;
  readonly testID?: string;
}

const ARROWS = { up: ArrowUp, down: ArrowDown, flat: Minus } as const;

/**
 * A profit/loss figure in the result colours, always with an arrow and a sign. Not a chip: for rows and tables.
 * Always simulated money in TradeLab, so it must sit in a card with a SimulatedBadge.
 */
export function PnLValue({ direction, amount, r, subject, variant = 'label', testID }: PnLValueProps) {
  const { colors, spacing } = useTheme();
  const simulated = useSimulatedKind();
  const color = direction === 'up' ? 'gainText' : direction === 'down' ? 'lossText' : 'textSecondary';
  const text = r ? `${signedText(direction, amount)} · ${signedText(direction, r)}` : signedText(direction, amount);
  // The direction is already said in words, so the R multiple is spoken unsigned ("1.7 R").
  const spoken = withSimulated(spokenChange(subject, direction, amount, 'result') + (r ? `, ${unsigned(r).replace(/R$/, ' R')}` : ''), simulated);
  return (
    <View {...marker(MONEY_MARKER)} testID={testID} accessible accessibilityLabel={spoken} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xxs, flexShrink: 1 }}>
      <Icon icon={ARROWS[direction]} size={16} literalColor={colors[color]} />
      <AppText variant={variant} color={color} tabular style={{ flexShrink: 1 }}>
        {text}
      </AppText>
    </View>
  );
}
