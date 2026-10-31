import type { ComponentProps } from 'react';
import { View } from 'react-native';
import { useTheme } from '../../theme';
import { AppText } from './AppText';
import { cardSurface } from './Card';
import { ChangeChip } from './ChangeChip';
import { SimulatedBadge, type SimulatedKind } from './SimulatedBadge';
import { CARD_MARKER, MONEY_MARKER, marker, useSimulatedKind, withSimulated } from './simulated';
import { SplitNumber } from './SplitNumber';

interface StatTileProps {
  readonly caption: string;
  /** Formatted value, e.g. "82%" or "$10,430.25". */
  readonly value: string;
  /** What a screen reader says for the figure; defaults to "caption, value". */
  readonly accessibilityLabel?: string;
  /** Integer large, decimals smaller (big stats only, not tables). */
  readonly split?: boolean;
  readonly change?: ComponentProps<typeof ChangeChip>;
  /** Labels a simulated figure on the same tile (brief §1). */
  readonly simulated?: SimulatedKind;
  /** `muted` (inside a card) or `card` (on the screen background). */
  readonly surface?: 'muted' | 'card';
  /** The value is (simulated) money: it must have a SimulatedBadge on this tile or its card. */
  readonly money?: boolean;
  readonly testID?: string;
}

/** Caption, a big tabular number, and an optional change chip. */
export function StatTile({ caption, value, accessibilityLabel, split = false, change, simulated, surface = 'muted', money = false, testID }: StatTileProps) {
  const theme = useTheme();
  const { spacing } = theme;
  const context = useSimulatedKind();
  // The figure's label names the caption, so the visible caption is hidden from screen readers (said once).
  const label = withSimulated(accessibilityLabel ?? `${caption}${simulated ? ', simulated' : ''}, ${value}`, context);
  return (
    <View {...marker(CARD_MARKER)} testID={testID} style={[cardSurface(theme, surface === 'muted' ? 'tile' : 'card'), { padding: spacing.md, gap: spacing.xs, flexGrow: 1, flexBasis: 140 }]}>
      <AppText variant="caption" color="textSecondary" accessibilityElementsHidden importantForAccessibility="no">
        {caption}
      </AppText>
      {split ? (
        <SplitNumber value={value} size="title" accessibilityLabel={label} money={money} />
      ) : (
        <AppText {...(money ? marker(MONEY_MARKER) : null)} variant="title" header={false} tabular accessible accessibilityLabel={label}>
          {value}
        </AppText>
      )}
      {change ? <ChangeChip {...change} /> : null}
      {simulated ? <SimulatedBadge kind={simulated} /> : null}
    </View>
  );
}
