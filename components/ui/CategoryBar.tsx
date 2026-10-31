import { View } from 'react-native';
import { useTheme, type ColorTokens } from '../../theme';
import { AppText } from './AppText';
import { IconWell, type WellTone } from './IconWell';
import type { LucideIcon } from './icons';
import { clampPercent } from './valueParts';

interface CategoryBarProps {
  readonly label: string;
  /** Share of the bar to fill, 0–100 (clamped). */
  readonly percent: number;
  /** Right-hand value text; defaults to the rounded percent. */
  readonly value?: string;
  /** Extra line under the label, e.g. "12 questions". */
  readonly caption?: string;
  readonly icon?: LucideIcon;
  readonly iconTone?: WellTone;
  /** Bar fill: brand by default; a semantic colour for result breakdowns. */
  readonly fill?: keyof ColorTokens;
  readonly testID?: string;
}

/** Icon well, label, value, and a rounded progress bar: skill mastery, results by pair, rule breaks by type. */
export function CategoryBar({ label, percent, value, caption, icon, iconTone, fill = 'brand', testID }: CategoryBarProps) {
  const { colors, radii, spacing } = useTheme();
  const p = clampPercent(percent);
  const shown = value ?? `${Math.round(p)}%`;
  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={[label, caption].filter(Boolean).join(', ')}
      // The value is spoken once, from `text` (the shown value, whatever its unit); `now` drives the bar.
      accessibilityValue={{ min: 0, max: 100, now: Math.round(p), text: shown }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm }}
    >
      {icon ? <IconWell icon={icon} tone={iconTone} size={40} /> : null}
      <View style={{ flex: 1, gap: spacing.xs }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm, flexWrap: 'wrap' }}>
          <View style={{ flexShrink: 1 }}>
            <AppText variant="label">{label}</AppText>
            {caption ? (
              <AppText variant="caption" color="textSecondary">
                {caption}
              </AppText>
            ) : null}
          </View>
          <AppText variant="label" tabular>
            {shown}
          </AppText>
        </View>
        <View style={{ height: 8, borderRadius: radii.pill, backgroundColor: colors.surfaceMuted, overflow: 'hidden' }}>
          <View testID={testID ? `${testID}-fill` : undefined} style={{ width: `${p}%`, height: '100%', borderRadius: radii.pill, backgroundColor: colors[fill] }} />
        </View>
      </View>
    </View>
  );
}
