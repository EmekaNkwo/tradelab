import { View } from 'react-native';
import type { DueSignal, Greeting } from '../../features/learning';
import { useTheme } from '../../theme';
import { AppText } from '../ui/AppText';
import { Icon } from '../ui/Icon';
import { IconWell } from '../ui/IconWell';
import { Bell, FlaskConical, UserRound } from '../ui/icons';

interface HomeHeaderProps {
  /** Null until the learner's time zone is known, so the greeting is never for the wrong time of day. */
  readonly greeting: Greeting | null;
  /** The learner's name, when the profile has one. TradeLab profiles have no name today, so this is usually null. */
  readonly name?: string | null;
  /** Null until the learning home has loaded: the bell then shows no dot rather than a guess. */
  readonly due: DueSignal | null;
}

/** First letters of up to two words: "Ada Obi" → "AO". */
export function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}

export const BELL_SIZE = 44;

/**
 * Home header (restyle brief §5.1): app mark and "TradeLab · Learning lab", a reminders bell whose dot shows only
 * when a class or review is really due, and an avatar (initials with a name, otherwise a neutral icon). The
 * greeting follows on its own line, with the name only if there is one.
 */
export function HomeHeader({ greeting, name = null, due }: HomeHeaderProps) {
  const { colors, radii, spacing } = useTheme();
  const initials = name ? initialsOf(name) : '';
  return (
    <View style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <IconWell icon={FlaskConical} size={40} shape="circle" />
        <View style={{ flex: 1 }}>
          <AppText variant="label" color="textPrimary">
            TradeLab
          </AppText>
          <AppText variant="caption" color="textSecondary">
            Learning lab
          </AppText>
        </View>
        <View
          testID="home-bell"
          accessible
          accessibilityLabel={due?.label ?? 'Reminders'}
          style={{ width: BELL_SIZE, height: BELL_SIZE, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface }}
        >
          <Icon icon={Bell} size={22} color="textPrimary" />
          {due?.due ? (
            <View
              testID="home-bell-dot"
              style={{ position: 'absolute', top: 10, right: 11, width: 9, height: 9, borderRadius: radii.pill, backgroundColor: colors.warning, borderWidth: 1.5, borderColor: colors.surface }}
            />
          ) : null}
        </View>
        <View
          testID="home-avatar"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{ width: BELL_SIZE, height: BELL_SIZE, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brandTint }}
        >
          {initials ? (
            <AppText variant="label" color="brand">
              {initials}
            </AppText>
          ) : (
            <Icon icon={UserRound} size={22} color="brand" />
          )}
        </View>
      </View>
      {greeting ? (
        <AppText variant="title" testID="home-greeting">
          {name ? `${greeting}, ${name}` : greeting}
        </AppText>
      ) : (
        // Holds the greeting's line while the time zone loads, so the content below does not jump.
        <AppText variant="title" testID="home-greeting-placeholder" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {' '}
        </AppText>
      )}
    </View>
  );
}
