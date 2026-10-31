import { View } from 'react-native';
import { useTheme } from '../../theme';
import { AppText } from '../ui/AppText';
import { cardSurface } from '../ui/Card';
import { IconWell } from '../ui/IconWell';
import { ChartCandlestick } from '../ui/icons';
import { InstrumentIcon } from '../ui/InstrumentIcon';
import { SimulatedBadge, type SimulatedKind } from '../ui/SimulatedBadge';

interface ChartHeaderProps {
  /** What is charted: an instrument symbol, a scenario name or a data set label. */
  readonly title: string;
  /** Only a real instrument symbol gets a flag pair or glyph; generated scenarios get a chart well instead. */
  readonly symbol?: string;
  /** Shown after the title as " · H1" in the brand colour, in the same text so the line reads as one. */
  readonly timeframe?: string;
  /** The Simulated/Replay badge; left out for real prices with no simulated money on them. */
  readonly badge?: SimulatedKind;
  /** Extra badge text, e.g. a real replay's date: "Replay · 2024-03-04". */
  readonly badgeDetail?: string;
  /** A neutral pill for charts that are not simulated, e.g. "Your data · historical". */
  readonly note?: string;
  readonly testID?: string;
}

/** The real-data pill text: the learner's own import, or historical prices from a provider. */
export function realDataNote(origin: 'user_import' | 'historical'): string {
  return origin === 'user_import' ? 'Your data · imported' : 'Your data · historical';
}

/**
 * The instrument chip above a chart (restyle brief §5.4): icon, "title · timeframe", and the badge. Chrome only: it
 * sits outside PriceChart and reads nothing from it, so a replacement chart keeps it.
 */
export function ChartHeader({ title, symbol, timeframe, badge, badgeDetail, note, testID }: ChartHeaderProps) {
  const theme = useTheme();
  const { colors, spacing, radii } = theme;
  return (
    <View
      testID={testID}
      style={[cardSurface(theme), { borderRadius: radii.pill, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm, paddingLeft: spacing.sm, paddingRight: spacing.lg, flexWrap: 'wrap' }]}
    >
      {symbol ? <InstrumentIcon symbol={symbol} size={40} testID={testID ? `${testID}-instrument` : undefined} /> : <IconWell icon={ChartCandlestick} tone="brand" shape="circle" size={40} />}
      <AppText variant="heading" style={{ flexShrink: 1, flexGrow: 1, minWidth: 120 }}>
        {title}
        {timeframe ? (
          <AppText variant="heading" color="brand" tabular>
            {` · ${timeframe}`}
          </AppText>
        ) : null}
      </AppText>
      {badge ? <SimulatedBadge kind={badge} detail={badgeDetail} /> : null}
      {note ? (
        <View testID={testID ? `${testID}-note` : undefined} style={{ backgroundColor: colors.surfaceMuted, borderRadius: radii.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.xs }}>
          <AppText variant="caption" color="textSecondary" style={{ fontWeight: '600' }}>
            {note}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}
