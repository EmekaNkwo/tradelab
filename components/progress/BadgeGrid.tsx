import { View } from 'react-native';
import { useTheme } from '../../theme';
import { AppText } from '../ui/AppText';
import { Icon } from '../ui/Icon';
import { CircleCheck, Lock } from '../ui/icons';

export interface BadgeTile {
  readonly id: string;
  readonly title: string;
  readonly how: string;
  readonly earned: boolean;
  /** "Earned on 3 Nov 2026", or null when not earned (or earned before dates were kept). */
  readonly earnedOn: string | null;
}

/** What a badge tile says, in words (colour is never the only signal). */
export function badgeStatus(b: BadgeTile): string {
  if (!b.earned) return 'Not earned yet';
  return b.earnedOn ? `Earned on ${b.earnedOn}` : 'Earned';
}

/**
 * A grid of badges (brief §5.8). Earned: brand tint, check icon and "Earned". Not earned: muted, lock icon and
 * "Not earned yet". Each tile is one spoken element: title, status and how to earn it.
 */
export function BadgeGrid({ badges }: { readonly badges: readonly BadgeTile[] }) {
  const { colors, radii, spacing } = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
      {badges.map((b) => {
        const status = badgeStatus(b);
        return (
          <View
            key={b.id}
            testID={`badge-${b.id}`}
            accessible
            accessibilityLabel={`${b.title}. ${status}. ${b.how}`}
            style={{
              flexGrow: 1,
              flexBasis: '45%',
              minWidth: 140,
              padding: spacing.md,
              gap: spacing.xs,
              borderRadius: radii.tile,
              backgroundColor: b.earned ? colors.brandTint : colors.surfaceMuted,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
              <Icon icon={b.earned ? CircleCheck : Lock} size={20} color={b.earned ? 'brand' : 'textSecondary'} />
              <AppText variant="caption" color={b.earned ? 'brand' : 'textSecondary'}>
                {status}
              </AppText>
            </View>
            <AppText variant="label">{b.title}</AppText>
            <AppText variant="caption" color="textSecondary">
              {b.how}
            </AppText>
          </View>
        );
      })}
    </View>
  );
}
