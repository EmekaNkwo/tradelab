import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { useTheme } from '../../theme';
import {
  AppText,
  AreaChart,
  BarActivityChart,
  Button,
  Card,
  CardHeader,
  CategoryBar,
  ChangeChip,
  EmptyState,
  ErrorState,
  HeroCard,
  InstrumentIcon,
  ListRow,
  Notice,
  PeriodPicker,
  PnLValue,
  QuickAction,
  SectionHeader,
  SegmentedControl,
  SimulatedBadge,
  SkeletonState,
  SplitNumber,
  StatTile,
  TextField,
} from '../ui';
import { IconWell } from '../ui/IconWell';
import { BookOpen, Calculator, ChartCandlestick, Ellipsis, Play, TrendingUp } from '../ui/icons';
import { minutes, percent, SAMPLE_TREND, SAMPLE_WEEK } from './gallerySamples';

const noop = () => undefined;

function Section({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  const { spacing } = useTheme();
  return (
    <View style={{ gap: spacing.sm }}>
      <AppText variant="caption" color="textSecondary">
        {title.toUpperCase()}
      </AppText>
      {children}
    </View>
  );
}

/** Every shared component once, in the surrounding theme. Sample values are made up and labelled so. */
export function GallerySections() {
  const { colors, spacing, scheme } = useTheme();
  const [period, setPeriod] = useState<'week' | 'month'>('week');
  const [field, setField] = useState('');
  return (
    <View style={{ gap: spacing.xl, padding: spacing.screen, backgroundColor: colors.bg }}>
      <AppText variant="title">{scheme === 'dark' ? 'Dark' : 'Light'}</AppText>
      <Notice title="Sample data">Every number in this gallery is made up, to show the components.</Notice>

      <Section title="Typography">
        <AppText variant="display" header>
          Display 32
        </AppText>
        <AppText variant="title">Title 22</AppText>
        <AppText variant="heading">Heading 17</AppText>
        <AppText>Body 15 regular</AppText>
        <AppText variant="caption" color="textSecondary">
          Caption 13 medium
        </AppText>
        <SplitNumber value="$10,430.25" accessibilityLabel="Sample balance, simulated, $10,430.25" />
      </Section>

      <Section title="Hero card">
        <HeroCard simulated="paper">
          <AppText variant="caption" color="onHero">
            Paper account (sample)
          </AppText>
          <SplitNumber value="$10,430.25" literalColor={colors.onHero} money accessibilityLabel="Sample equity, $10,430.25, up 4.3%" />
          <ChangeChip direction="up" value="4.3%" tone="result" onHero subject="Sample equity" />
        </HeroCard>
        <HeroCard variant="light">
          <AppText variant="heading" color="onHero">
            Lighter hero (Learn)
          </AppText>
          <PeriodPicker label="Period" value={period} onChange={setPeriod} onHero options={[{ value: 'week', label: 'This week' }, { value: 'month', label: 'This month' }]} />
        </HeroCard>
        <HeroCard>
          <AppText variant="heading" color="onHero">
            Study activity (sample)
          </AppText>
          <BarActivityChart title="Sample study minutes per day" points={SAMPLE_WEEK} format={minutes} onDark />
          <Button label="Hero action (sample)" variant="hero" onPress={noop} />
        </HeroCard>
      </Section>

      <Section title="Card header">
        <Card>
          <CardHeader icon={TrendingUp} title="Sample card with a Paper badge" badge="paper" />
        </Card>
      </Section>

      <Section title="Quick actions">
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <QuickAction icon={BookOpen} label="Class" onPress={noop} primary />
          <QuickAction icon={ChartCandlestick} label="Chart Lab" onPress={noop} />
          <QuickAction icon={Play} label="Replay" onPress={noop} />
          <QuickAction icon={Calculator} label="Calculator" onPress={noop} />
          <QuickAction icon={Ellipsis} label="More" onPress={noop} />
        </View>
      </Section>

      <Section title="Stat tiles and chips">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          <StatTile caption="Quiz accuracy" value="82%" change={{ direction: 'up', value: '4%', subject: 'vs last week' }} />
          <StatTile caption="Balance" value="$10,000.00" split money simulated="paper" />
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          <ChangeChip direction="up" value="1.7R" tone="result" />
          <ChangeChip direction="down" value="$12.40" tone="result" />
          <ChangeChip direction="flat" value="0%" />
          <ChangeChip direction="down" value="2 classes" />
          <SimulatedBadge />
          <SimulatedBadge kind="replay" detail="3 Mar 2024" />
          <SimulatedBadge kind="demo" />
        </View>
        <Card>
          <SimulatedBadge kind="replay" />
          <PnLValue direction="up" amount="$42.50" r="1.7R" subject="Sample result" />
        </Card>
      </Section>

      <Section title="Card, list rows, category bars">
        <Card>
          <SectionHeader title="Recent trades (sample)" onAction={noop} />
          <SimulatedBadge kind="paper" />
          <ListRow leading={<InstrumentIcon symbol="EUR/USD" />} title="Buy EUR/USD · 0.10 lots" subtitle="Sample · Paper" onPress={noop} trailing={<PnLValue direction="up" amount="$42.50" r="1.7R" />} trailingLabel="gain of $42.50" />
          <ListRow leading={<InstrumentIcon symbol="GBPJPY" />} title="Sell GBP/JPY" subtitle="Sample · Replay" trailing={<PnLValue direction="down" amount="$18.00" />} trailingLabel="loss of $18.00" />
          <ListRow leading={<InstrumentIcon symbol="XAUUSD" />} title="Gold" subtitle="Glyph, not a logo" />
          <ListRow leading={<InstrumentIcon symbol="US500" />} title="US 500 index" />
          <ListRow leading={<InstrumentIcon symbol="AAPL" />} title="A stock (letter avatar)" />
          <ListRow icon={TrendingUp} title="Settings-style row" subtitle="Icon well and chevron" onPress={noop} />
        </Card>
        <Card>
          <CategoryBar icon={BookOpen} label="Risk management" caption="Sample" percent={72} />
          <CategoryBar icon={ChartCandlestick} iconTone="info" label="Chart reading" percent={38} />
        </Card>
        <Card variant="tile">
          <AppText>Tile surface (inside cards)</AppText>
        </Card>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          {(['brand', 'gain', 'loss', 'warning', 'info', 'neutral', 'simulated'] as const).map((t) => (
            <IconWell key={t} icon={BookOpen} tone={t} size={40} />
          ))}
        </View>
      </Section>

      <Section title="Charts">
        <Card>
          <AreaChart title="Sample plan-follow rate by month" points={SAMPLE_TREND} format={percent} />
          <AreaChart title="Sample equity curve (neutral tone)" points={SAMPLE_TREND} format={percent} tone="neutral" />
          <PeriodPicker label="Month" variant="chips" value={period} onChange={setPeriod} options={[{ value: 'week', label: 'Jun' }, { value: 'month', label: 'May' }]} />
        </Card>
        <Card>
          <BarActivityChart title="Sample minutes per day" points={SAMPLE_WEEK} format={minutes} />
        </Card>
      </Section>

      <Section title="Controls">
        <Button label="Primary" onPress={noop} />
        <Button label="Secondary" variant="secondary" onPress={noop} />
        <Button label="Danger" variant="danger" onPress={noop} />
        <Button label="Disabled" disabled disabledReason="Shown when a button cannot be used yet." onPress={noop} />
        <SegmentedControl label="Period" value={period} onChange={setPeriod} options={[{ value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }]} />
        <PeriodPicker label="Period" value={period} onChange={setPeriod} options={[{ value: 'week', label: 'This week' }, { value: 'month', label: 'This month' }]} />
        <TextField label="Text field" value={field} onChangeText={setField} placeholder="Type here" />
      </Section>

      <Section title="States">
        <Notice title="Warning" tone="warning">
          A rule warning.
        </Notice>
        <Notice title="Saved" tone="success">
          A success notice.
        </Notice>
        <SkeletonState hero rows={2} />
        <EmptyState title="No trades yet" body="Place a paper trade to see it here." actionLabel="New order" onAction={noop} />
        <ErrorState error={{ kind: 'StorageError', message: 'Sample error' }} onRetry={noop} />
      </Section>
    </View>
  );
}
