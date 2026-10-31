import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useTheme } from '../../theme';
import { AppText } from './AppText';

interface ChoiceLabelProps {
  readonly label: string;
  /** Screen readers still get the label from the group and each option's hint. */
  readonly hidden: boolean;
  readonly children: ReactNode;
}

/** The visible name above a group of choices, in the same style and spacing as TextField's label. */
export function ChoiceLabel({ label, hidden, children }: ChoiceLabelProps) {
  const { spacing } = useTheme();
  if (hidden) return <>{children}</>;
  return (
    <View style={{ gap: spacing.xs }}>
      <AppText variant="label">{label}</AppText>
      {children}
    </View>
  );
}
