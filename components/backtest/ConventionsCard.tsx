import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { touchTarget, useTheme } from '../../theme';
import { AppText } from '../ui/AppText';
import { Card } from '../ui/Card';
import { Icon } from '../ui/Icon';
import { IconWell } from '../ui/IconWell';
import { ChevronDown, ChevronUp, ListChecks } from '../ui/icons';
import { conventionsGist } from './conventionsGist';

interface ConventionsCardProps {
  readonly conventions: readonly string[];
  /** The engine, hash and warm-up line, shown with the conventions. */
  readonly footnote: string;
}

/**
 * The run's own conventions (fills, costs, data, survivorship). Open by default, because every report lists them
 * (spec §16.3); folding it still leaves one line with the fill rule, costs and survivorship.
 */
export function ConventionsCard({ conventions, footnote }: ConventionsCardProps) {
  const { spacing } = useTheme();
  const [open, setOpen] = useState(true);
  const gist = conventionsGist(conventions);
  return (
    <Card testID="conventions-card">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Conventions used"
        accessibilityHint={open ? 'Hides the conventions' : `Shows the ${conventions.length} conventions this run used`}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((v) => !v)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: touchTarget }}
      >
        <IconWell icon={ListChecks} tone="neutral" size={40} />
        <View style={{ flex: 1 }}>
          <AppText variant="heading" header={false}>Conventions used</AppText>
          <AppText variant="caption" color="textSecondary">{`${conventions.length} assumptions behind these figures`}</AppText>
        </View>
        <Icon icon={open ? ChevronUp : ChevronDown} size={22} color="textSecondary" />
      </Pressable>
      {open ? (
        <View style={{ gap: spacing.xs }} testID="conventions-list">
          {conventions.map((c) => (
            <AppText key={c} variant="caption" color="textSecondary">{`• ${c}`}</AppText>
          ))}
          <AppText variant="caption" color="textSecondary">
            {footnote}
          </AppText>
        </View>
      ) : (
        <AppText variant="caption" color="textSecondary" testID="conventions-gist">
          {gist}
        </AppText>
      )}
    </Card>
  );
}
