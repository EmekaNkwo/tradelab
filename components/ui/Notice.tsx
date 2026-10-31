import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useTheme } from '../../theme';
import { AppText } from './AppText';

interface NoticeProps {
  readonly title: string;
  readonly children: ReactNode;
  readonly tone?: 'info' | 'warning' | 'success';
  /**
   * Announce it when it appears or changes: for results of something the learner just did (saved, imported,
   * restored, an action that failed). Static disclosures and warnings leave it off so they don't speak on mount.
   */
  readonly live?: boolean;
  readonly testID?: string;
}

/** Inline notice for disclosures, warnings, and operation results. Plain text children are wrapped in AppText. */
export function Notice({ title, children, tone = 'info', live = false, testID }: NoticeProps) {
  const { colors, radii, spacing } = useTheme();
  // Success (saved, restored) is brand, not the profit colour; info is the tip blue.
  const accent = tone === 'warning' ? colors.warning : tone === 'success' ? colors.brand : colors.infoText;
  const fill = tone === 'warning' ? colors.warningTint : tone === 'success' ? colors.brandTint : colors.infoTint;
  return (
    <View
      testID={testID}
      accessibilityRole={tone === 'warning' ? 'alert' : 'summary'}
      accessibilityLiveRegion={live ? 'polite' : undefined}
      style={{
        backgroundColor: fill,
        borderLeftColor: accent,
        borderLeftWidth: 4,
        borderRadius: radii.tile,
        padding: spacing.md,
        gap: spacing.xs,
      }}
    >
      <AppText variant="label" style={{ color: accent }}>
        {title}
      </AppText>
      {typeof children === 'string' || typeof children === 'number' ? <AppText>{children}</AppText> : children}
    </View>
  );
}
