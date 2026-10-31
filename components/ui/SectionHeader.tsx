import { Pressable, View } from 'react-native';
import { touchTarget, useTheme } from '../../theme';
import { AppText } from './AppText';

interface SectionHeaderProps {
  readonly title: string;
  /** Visible action text; defaults to "See all". */
  readonly actionLabel?: string;
  readonly onAction?: () => void;
  /** Spoken action label, e.g. "See all trades". Defaults to "<actionLabel> <title>". */
  readonly actionAccessibilityLabel?: string;
  readonly testID?: string;
}

/** A section title with an optional "See all →" link on the right. */
export function SectionHeader({ title, actionLabel = 'See all', onAction, actionAccessibilityLabel, testID }: SectionHeaderProps) {
  const { spacing } = useTheme();
  return (
    <View testID={testID} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, flexWrap: 'wrap' }}>
      <AppText variant="heading" style={{ flexShrink: 1 }}>
        {title}
      </AppText>
      {onAction ? (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={actionAccessibilityLabel ?? `${actionLabel}, ${title}`}
          onPress={onAction}
          hitSlop={8}
          style={{ minHeight: touchTarget, minWidth: touchTarget, justifyContent: 'center' }}
        >
          <AppText variant="label" color="brand">{`${actionLabel} →`}</AppText>
        </Pressable>
      ) : null}
    </View>
  );
}
