import { Pressable, View } from 'react-native';
import type { Strategy } from '../../features/strategies';
import { touchTarget, useTheme, type ColorTokens } from '../../theme';
import { AppText } from '../ui/AppText';
import { cardSurface } from '../ui/Card';
import { Icon } from '../ui/Icon';
import { IconWell } from '../ui/IconWell';
import { ChartCandlestick, ChevronRight, Landmark, Target, type LucideIcon } from '../ui/icons';
import { pressScale } from '../ui/pressFeedback';
import { useReduceMotion } from '../ui/useReduceMotion';

export const CATEGORY_ICONS: Readonly<Record<Strategy['category'], LucideIcon>> = {
  trading: ChartCandlestick,
  investing: Landmark,
  risk_principle: Target,
};

export type ChipTone = 'brand' | 'neutral' | 'done';

export interface StrategyChip {
  readonly label: string;
  readonly tone: ChipTone;
}

const CHIP_COLORS: Readonly<Record<ChipTone, { readonly bg: keyof ColorTokens; readonly fg: keyof ColorTokens }>> = {
  brand: { bg: 'brandTint', fg: 'brand' },
  neutral: { bg: 'surfaceMuted', fg: 'textSecondary' },
  done: { bg: 'brandTint', fg: 'textPrimary' },
};

interface StrategyCardProps {
  readonly strategy: Strategy;
  /** Family and holding period, as the library has always shown them. */
  readonly subtitle: string;
  /** Names of reviewed trader pages from the content; empty for generic pages (nothing is attributed from memory). */
  readonly traders: readonly string[];
  readonly chips: readonly StrategyChip[];
  readonly onPress: () => void;
  readonly testID?: string;
}

/** A small text chip: always words, never colour alone. */
export function Chip({ label, tone }: StrategyChip) {
  const { colors, radii, spacing } = useTheme();
  const c = CHIP_COLORS[tone];
  return (
    <View style={{ backgroundColor: colors[c.bg], borderRadius: radii.pill, paddingHorizontal: spacing.sm, paddingVertical: spacing.xxs }}>
      <AppText variant="caption" style={{ color: colors[c.fg] }}>
        {tone === 'done' ? `✓ ${label}` : label}
      </AppText>
    </View>
  );
}

/** A library card (restyle brief §5.5): icon well, name, trader when the content names one, and content chips. */
export function StrategyCard({ strategy, subtitle, traders, chips, onPress, testID }: StrategyCardProps) {
  const theme = useTheme();
  const { colors, spacing } = theme;
  const reduceMotion = useReduceMotion();
  const label = [strategy.title, subtitle, traders.length > 0 ? `Trader: ${traders.join(', ')}` : '', ...chips.map((c) => c.label)].filter(Boolean).join('. ');
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [cardSurface(theme), { padding: spacing.lg, minHeight: touchTarget, flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start', transform: [{ scale: pressScale(pressed, reduceMotion) }] }]}
    >
      <IconWell icon={CATEGORY_ICONS[strategy.category]} tone="brand" size={44} />
      <View style={{ flex: 1, gap: spacing.xs }}>
        <AppText variant="label">{strategy.title}</AppText>
        <AppText variant="caption" color="textSecondary">
          {subtitle}
        </AppText>
        {traders.length > 0 ? (
          <AppText variant="caption" color="textPrimary">
            {traders.join(', ')}
          </AppText>
        ) : null}
        {chips.length > 0 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
            {chips.map((c) => (
              <Chip key={c.label} {...c} />
            ))}
          </View>
        ) : null}
      </View>
      <Icon icon={ChevronRight} size={20} literalColor={colors.textSecondary} />
    </Pressable>
  );
}
