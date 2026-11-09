import { router, type Href } from 'expo-router';
import { View } from 'react-native';
import type { LearningHome } from '../../features/learning';
import { canOpen } from '../../shared/routeAccess';
import { useTheme } from '../../theme';
import { BookOpen, Calculator, ChartCandlestick, Ellipsis, Play, type LucideIcon } from '../ui/icons';
import { QuickAction } from '../ui/QuickAction';

type DueClass = Pick<NonNullable<LearningHome['todaysClass']>, 'id'>;

interface Action {
  readonly key: string;
  readonly label: string;
  readonly hint: string;
  readonly icon: LucideIcon;
  /** The route checked with canOpen. */
  readonly route: string;
  readonly href: Href;
  readonly primary?: boolean;
  /** Opens a screen inside another tab: that tab's first screen is kept underneath, so Back leads there. */
  readonly inOtherTab?: boolean;
}

/** The quick actions a learner can open right now: gated routes are left out, and Class only when a class is due. */
export function homeActions(todaysClass: DueClass | null, open: (route: string) => boolean = canOpen): readonly Action[] {
  const all: readonly (Action | null)[] = [
    todaysClass ? { key: 'class', label: 'Class', hint: "Opens today's class", icon: BookOpen, route: '/class/[id]', href: `/class/${todaysClass.id}` as Href, primary: true } : null,
    { key: 'chart-lab', label: 'Chart Lab', hint: 'Opens the practice chart', icon: ChartCandlestick, route: '/practice/chart-lab', href: '/practice/chart-lab', inOtherTab: true },
    { key: 'replay', label: 'Replay', hint: 'Opens replay practice', icon: Play, route: '/practice/replay', href: '/practice/replay', inOtherTab: true },
    { key: 'calculator', label: 'Calculator', hint: 'Opens the trading calculators', icon: Calculator, route: '/learn/calculators', href: '/learn/calculators', inOtherTab: true },
    { key: 'more', label: 'More', hint: 'Opens tools and settings', icon: Ellipsis, route: '/more', href: '/more' },
  ];
  return all.filter((a): a is Action => a !== null && open(a.route));
}

export function HomeQuickActions({ todaysClass }: { readonly todaysClass: DueClass | null }) {
  const { spacing } = useTheme();
  const actions = homeActions(todaysClass);
  if (actions.length === 0) return null;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: spacing.md }} testID="home-actions">
      {actions.map((a) => (
        <QuickAction key={a.key} testID={`home-action-${a.key}`} icon={a.icon} label={a.label} accessibilityHint={a.hint} primary={a.primary} onPress={() => (a.inOtherTab ? router.push(a.href, { withAnchor: true }) : router.push(a.href))} />
      ))}
    </View>
  );
}
