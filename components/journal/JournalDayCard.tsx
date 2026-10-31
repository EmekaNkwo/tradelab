import { Pressable, StyleSheet, View } from 'react-native';
import { badgeKindOf, processChip, type JournalDay, type JournalEntry } from '../../features/journal';
import { baseSymbol } from '../../features/paper';
import { touchTarget, useTheme } from '../../theme';
import { AppText } from '../ui/AppText';
import { Card } from '../ui/Card';
import { Icon } from '../ui/Icon';
import { ChevronRight } from '../ui/icons';
import { InstrumentIcon } from '../ui/InstrumentIcon';
import { SimulatedBadge, SPOKEN_KIND } from '../ui/SimulatedBadge';
import { JournalResult, ProcessChipView, spokenChip, spokenResult } from './JournalBits';

interface JournalDayCardProps {
  readonly day: JournalDay<JournalEntry>;
  /** The second line of a row: source, process score, reviewed. */
  readonly subtitle: (e: JournalEntry) => string;
  readonly onOpen: (e: JournalEntry) => void;
}

/** One day of the journal: a card with the date and a row per trade (brief §5.6). */
export function JournalDayCard({ day, subtitle, onOpen }: JournalDayCardProps) {
  return (
    <Card testID={`journal-day-${day.date}`}>
      <AppText variant="label" color="textSecondary" tabular>
        {day.label}
      </AppText>
      {day.entries.map((e) => (
        <JournalRow key={e.id} entry={e} subtitle={subtitle(e)} onPress={() => onOpen(e)} />
      ))}
    </Card>
  );
}

interface JournalRowProps {
  readonly entry: JournalEntry;
  readonly subtitle: string;
  readonly onPress: () => void;
}

/**
 * Instrument, direction, source and process on the left; the result on the right, with its own source badge.
 * One focus stop; its label ends with the subtitle, so the visible " · reviewed" ending is also the spoken one.
 */
function JournalRow({ entry, subtitle, onPress }: JournalRowProps) {
  const { colors, radii, spacing } = useTheme();
  const title = `${entry.direction === 'buy' ? 'Long' : 'Short'} ${entry.instrument}`;
  const chip = processChip(entry);
  // The badge is inside this one focus stop, so say its kind when the subtitle doesn't already ("Imported from MT
  // statement" names no demo account). The label still ends with the subtitle.
  const kind = /simulated|demo/i.test(subtitle) ? null : SPOKEN_KIND[badgeKindOf(entry.source)];
  const label = [title, spokenResult(entry), chip ? spokenChip(chip) : null, kind, subtitle].filter(Boolean).join('. ');
  return (
    <Pressable
      testID="journal-row"
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.row, { gap: spacing.md, paddingVertical: spacing.md, borderRadius: radii.md, backgroundColor: pressed ? colors.surfaceMuted : 'transparent' }]}
    >
      <InstrumentIcon symbol={baseSymbol(entry.instrument)} size={40} />
      <View style={{ flex: 1, gap: spacing.xs }}>
        <AppText variant="label">{title}</AppText>
        <AppText variant="caption" color="textSecondary">
          {subtitle}
        </AppText>
        {/* Inside the row's one focus stop: the subtitle already names the source, and the label says the chip. */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
          <SimulatedBadge kind={badgeKindOf(entry.source)} />
          {chip ? <ProcessChipView chip={chip} /> : null}
        </View>
      </View>
      {/* Up to 40% of the row; the amount's text shrinks and wraps at " · " under large text instead of overflowing. */}
      <View style={[styles.result, { gap: spacing.xxs }]}>
        <JournalResult entry={entry} />
      </View>
      <Icon icon={ChevronRight} size={20} color="textSecondary" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', minHeight: touchTarget },
  result: { alignItems: 'flex-end', flexShrink: 1, maxWidth: '40%' },
});
