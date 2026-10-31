import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { heroOverlay, touchTarget, useTheme } from '../../theme';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { Check, ChevronDown } from './icons';

interface PeriodOption<T extends string> {
  readonly value: T;
  readonly label: string;
}

interface PeriodPickerProps<T extends string> {
  /** What is being chosen, e.g. "Period". Spoken with the pill and each option. */
  readonly label: string;
  readonly options: readonly PeriodOption<T>[];
  readonly value: T;
  readonly onChange: (value: T) => void;
  /**
   * `menu`: a "This week ▾" pill that opens the options under it. `chips`: a row of chips (e.g. months under a
   * chart). Selection is shown by fill and a tick, never colour alone.
   */
  readonly variant?: 'menu' | 'chips';
  /** For a pill on a dark hero card. */
  readonly onHero?: boolean;
  readonly testIDPrefix?: string;
}

export function PeriodPicker<T extends string>({ label, options, value, onChange, variant = 'menu', onHero = false, testIDPrefix }: PeriodPickerProps<T>) {
  const { colors, radii, spacing } = useTheme();
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  const chips = (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            testID={testIDPrefix ? `${testIDPrefix}-${o.value}` : undefined}
            accessibilityRole="radio"
            accessibilityLabel={o.label}
            accessibilityHint={label}
            accessibilityState={{ selected: on }}
            onPress={() => {
              onChange(o.value);
              setOpen(false);
            }}
            style={{
              minHeight: touchTarget,
              minWidth: touchTarget,
              paddingHorizontal: spacing.md,
              borderRadius: radii.pill,
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
              gap: spacing.xxs,
              backgroundColor: on ? colors.brand : colors.surfaceMuted,
            }}
          >
            {on ? <Icon icon={Check} size={14} literalColor={colors.onBrand} /> : null}
            <AppText variant="label" style={{ color: on ? colors.onBrand : colors.textPrimary }}>
              {o.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
  if (variant === 'chips') return chips;
  const fg = onHero ? colors.onHero : colors.textPrimary;
  return (
    <View style={{ gap: spacing.sm, alignItems: 'flex-start' }}>
      <Pressable
        testID={testIDPrefix ? `${testIDPrefix}-toggle` : undefined}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${current?.label ?? ''}`}
        accessibilityHint="Opens the choices"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((o) => !o)}
        style={{
          minHeight: touchTarget,
          minWidth: touchTarget,
          paddingHorizontal: spacing.md,
          borderRadius: radii.pill,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.xs,
          backgroundColor: onHero ? heroOverlay : colors.surfaceMuted,
        }}
      >
        <AppText variant="label" style={{ color: fg }}>
          {current?.label ?? label}
        </AppText>
        <Icon icon={ChevronDown} size={16} literalColor={fg} />
      </Pressable>
      {open ? chips : null}
    </View>
  );
}
