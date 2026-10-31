import { Pressable, View } from 'react-native';
import { touchTarget, useTheme, type ColorTokens } from '../../theme';
import { AppText } from '../ui/AppText';
import { ChoiceLabel } from '../ui/ChoiceLabel';
import { Icon } from '../ui/Icon';
import { ArrowDownRight, ArrowUpRight } from '../ui/icons';

export type OrderSide = 'buy' | 'sell';

interface SideOption {
  readonly value: OrderSide;
  readonly label: string;
}

interface SideSelectorProps {
  readonly options: readonly SideOption[];
  readonly value: OrderSide;
  readonly onChange: (side: OrderSide) => void;
  readonly label?: string;
}

interface SideTone {
  readonly fill: keyof ColorTokens;
  readonly text: keyof ColorTokens;
  readonly edge: keyof ColorTokens;
}

/**
 * Buy is gain-tinted and Sell loss-tinted when chosen, always with the word (never colour alone). The side icons are
 * diagonal arrows, not the straight up/down arrows that P/L uses, so a side never reads as a result.
 */
export const SIDE_TONES: Readonly<Record<OrderSide, SideTone>> = {
  buy: { fill: 'gainTint', text: 'gainText', edge: 'gain' },
  sell: { fill: 'lossTint', text: 'lossText', edge: 'loss' },
};

/** The order ticket's Buy/Sell segments (restyle brief §5.4), with the same radio semantics as SegmentedControl. */
export function SideSelector({ options, value, onChange, label = 'Side' }: SideSelectorProps) {
  const { colors, radii, spacing } = useTheme();
  return (
    <ChoiceLabel label={label} hidden={false}>
      <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ flexDirection: 'row', padding: 4, gap: 4, backgroundColor: colors.surfaceMuted, borderRadius: radii.pill }}>
        {options.map((o) => {
          const selected = o.value === value;
          const tone = SIDE_TONES[o.value];
          const ink = selected ? colors[tone.text] : colors.textPrimary;
          return (
            <Pressable
              key={o.value}
              testID={`side-${o.value}`}
              accessibilityRole="radio"
              accessibilityLabel={o.label}
              accessibilityHint={label}
              accessibilityState={{ selected }}
              onPress={() => onChange(o.value)}
              style={{
                flex: 1,
                minHeight: touchTarget,
                flexDirection: 'row',
                gap: spacing.xs,
                alignItems: 'center',
                justifyContent: 'center',
                padding: spacing.sm,
                borderRadius: radii.pill,
                borderWidth: 1.5,
                borderColor: selected ? colors[tone.edge] : 'transparent',
                backgroundColor: selected ? colors[tone.fill] : 'transparent',
              }}
            >
              <Icon icon={o.value === 'buy' ? ArrowUpRight : ArrowDownRight} size={18} literalColor={ink} />
              <AppText variant="label" style={{ color: ink }}>
                {o.label}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    </ChoiceLabel>
  );
}
