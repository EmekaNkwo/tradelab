import { ActivityIndicator, StyleSheet, View } from 'react-native';
import type { AppError } from '../../shared/errors';
import { describeError } from '../../shared/errors';
import { useTheme } from '../../theme';
import { AppText } from './AppText';
import { Button } from './Button';
import { IconWell } from './IconWell';
import { CircleAlert, Inbox, type LucideIcon } from './icons';

/** Every screen has loading, empty, error, and success states (spec §31). */

export function LoadingState({ label = 'Loading…' }: { readonly label?: string }) {
  const { colors, spacing } = useTheme();
  return (
    <View style={[styles.center, { padding: spacing.xl, gap: spacing.md }]} accessibilityLiveRegion="polite">
      <ActivityIndicator color={colors.brand} accessibilityLabel={label} />
      <AppText color="textSecondary">{label}</AppText>
    </View>
  );
}

interface SkeletonProps {
  /** Rows of placeholder blocks shaped like the content that is loading. */
  readonly rows?: number;
  /** Show a hero-sized block first (screens that open with a hero card). */
  readonly hero?: boolean;
  readonly label?: string;
  readonly testID?: string;
}

/**
 * A static skeleton matching a card-list layout. No shimmer: nothing on screen moves on its own (calm, and
 * reduce-motion safe). One spoken label for the whole block.
 */
export function SkeletonState({ rows = 3, hero = false, label = 'Loading…', testID = 'skeleton' }: SkeletonProps) {
  const { colors, radii, spacing } = useTheme();
  const block = { backgroundColor: colors.surfaceMuted };
  return (
    <View testID={testID} accessible accessibilityRole="progressbar" accessibilityLabel={label} accessibilityLiveRegion="polite" style={{ gap: spacing.md }}>
      {hero ? <View style={[block, { height: 160, borderRadius: radii.hero }]} /> : null}
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <View style={[block, { width: 40, height: 40, borderRadius: radii.md }]} />
          <View style={{ flex: 1, gap: spacing.xs }}>
            <View style={[block, { height: 14, width: '70%', borderRadius: radii.pill }]} />
            <View style={[block, { height: 12, width: '45%', borderRadius: radii.pill }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

interface EmptyStateProps {
  readonly title: string;
  readonly body: string;
  readonly actionLabel?: string;
  readonly onAction?: () => void;
  readonly icon?: LucideIcon;
}

/** Icon well, a title, one line, and an optional action. */
export function EmptyState({ title, body, actionLabel, onAction, icon = Inbox }: EmptyStateProps) {
  const { spacing } = useTheme();
  return (
    <View style={[styles.center, { padding: spacing.xl, gap: spacing.md }]}>
      <IconWell icon={icon} tone="brand" shape="circle" />
      <AppText variant="heading" style={styles.centerText}>
        {title}
      </AppText>
      <AppText color="textSecondary" style={styles.centerText}>
        {body}
      </AppText>
      {actionLabel && onAction ? <Button label={actionLabel} onPress={onAction} variant="secondary" /> : null}
    </View>
  );
}

interface ErrorStateProps {
  readonly error: AppError;
  readonly onRetry?: () => void;
}

export function ErrorState({ error, onRetry }: ErrorStateProps) {
  const { spacing } = useTheme();
  const view = describeError(error);
  return (
    <View style={[styles.center, { padding: spacing.xl, gap: spacing.md }]} accessibilityRole="alert" accessibilityLiveRegion="assertive">
      <IconWell icon={CircleAlert} tone="loss" shape="circle" />
      <AppText variant="heading" color="lossText" style={styles.centerText}>
        {view.title}
      </AppText>
      <AppText style={styles.centerText}>{view.body}</AppText>
      <AppText color="textSecondary" style={styles.centerText}>
        {view.recovery}
      </AppText>
      {onRetry ? <Button label="Try again" onPress={onRetry} variant="secondary" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  centerText: { textAlign: 'center' },
});
