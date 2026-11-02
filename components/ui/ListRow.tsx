import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { touchTarget, useTheme } from '../../theme';
import { plainText } from '../../shared/glossaryLinks';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { IconWell, type WellTone } from './IconWell';
import { ChevronRight, type LucideIcon } from './icons';
import { MONEY_MARKER, marker } from './simulated';
import { spokenAmount } from './valueParts';

interface ListRowBase {
  readonly title: string;
  readonly subtitle?: string;
  /** Tappable rows get a chevron and the button role; rows without it are plain information. */
  readonly onPress?: () => void;
  readonly testID?: string;
  /** Icon well on the left. */
  readonly icon?: LucideIcon;
  readonly iconTone?: WellTone;
  /** Custom leading element instead of an icon well (e.g. an InstrumentIcon). */
  readonly leading?: ReactNode;
  /** Right-hand value text, e.g. "82%". */
  readonly value?: string;
  /** The value is (simulated) money: marked for testing/simulatedFigures.ts, its minus sign spoken in words. */
  readonly valueIsMoney?: boolean;
  /** Status the icon shows (e.g. "Done" for a tick icon), spoken after the title; the icon itself is hidden. */
  readonly status?: string;
}

/**
 * A trailing element (ChangeChip, PnLValue, SimulatedBadge) is inside the row's single focus stop, so its own
 * label is never reached: the row must say it. `trailingLabel` is therefore required whenever `trailing` is set.
 */
type TrailingProps =
  | { readonly trailing?: undefined; readonly trailingLabel?: undefined }
  | {
      /** Right-hand element under or instead of the value. */
      readonly trailing: ReactNode;
      /** What a screen reader hears for it, appended to the row label, e.g. "Paper, gain of $42.50". */
      readonly trailingLabel: string;
    };

type ListRowProps = ListRowBase & TrailingProps;

/** Spoken label: title, subtitle, value, trailing — joined with full stops. */
export function rowLabel(parts: readonly (string | undefined)[]): string {
  return parts.filter((p): p is string => typeof p === 'string' && p.length > 0).join('. ');
}

/** Rows show plain text: `[[term]]` markup from content is never shown raw. */
export function ListRow({ title: rawTitle, subtitle: rawSubtitle, onPress, testID, icon, iconTone, leading, value, valueIsMoney = false, status, trailing, trailingLabel }: ListRowProps) {
  const title = plainText(rawTitle);
  const subtitle = rawSubtitle === undefined ? undefined : plainText(rawSubtitle);
  const { colors, spacing, radii } = useTheme();
  const label = rowLabel([title, status, subtitle, value && valueIsMoney ? spokenAmount(value) : value, trailingLabel]);
  const content = (
    <>
      {leading ?? (icon ? <IconWell icon={icon} tone={iconTone} size={40} /> : null)}
      <View style={styles.text}>
        <AppText variant="label">{title}</AppText>
        {subtitle ? (
          <AppText variant="caption" color="textSecondary">
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {value || trailing ? (
        <View style={[styles.trailing, { gap: spacing.xxs }]}>
          {value ? (
            <AppText {...(valueIsMoney ? marker(MONEY_MARKER) : null)} variant="label" tabular>
              {value}
            </AppText>
          ) : null}
          {trailing}
        </View>
      ) : null}
      {onPress ? <Icon icon={ChevronRight} size={20} color="textSecondary" /> : null}
    </>
  );
  const rowStyle = { paddingVertical: spacing.md, gap: spacing.md };
  if (!onPress) {
    return (
      <View testID={testID} accessible accessibilityLabel={label} style={[styles.row, rowStyle]}>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.row, rowStyle, { borderRadius: radii.md, backgroundColor: pressed ? colors.surfaceMuted : 'transparent' }]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', minHeight: touchTarget },
  text: { flex: 1 },
  trailing: { alignItems: 'flex-end', flexShrink: 1, maxWidth: '45%' },
});
