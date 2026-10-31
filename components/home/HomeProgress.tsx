import { router, useIsFocused } from 'expo-router';
import { View } from 'react-native';
import { COMPARED_WITH, SKILL_LABELS, useHomeProgress, weekTiles, type Dashboard } from '../../features/progress';
import { canOpen } from '../../shared/routeAccess';
import { useTheme } from '../../theme';
import { AppText } from '../ui/AppText';
import { Card } from '../ui/Card';
import { Target } from '../ui/icons';
import { ListRow } from '../ui/ListRow';
import { SectionHeader } from '../ui/SectionHeader';
import { SkeletonState } from '../ui/StateViews';
import { StatTile } from '../ui/StatTile';
import { directionOf } from '../ui/valueParts';

/** How many weak skills Home lists; the rest are on Progress. */
export const FOCUS_LIMIT = 2;

/**
 * "This week" tiles and "Focus next" (restyle brief §5.1), from the progress records. Shown only when the
 * progress dashboard is on. Loading shows a skeleton; a failed read hides the section (Progress shows the error).
 */
export function HomeProgress() {
  // Rebuilt only while Home is focused; writes made elsewhere refresh it once on return.
  const progress = useHomeProgress(useIsFocused());
  if (progress.status === 'loading') return <SkeletonState rows={2} testID="home-progress-loading" />;
  if (progress.status === 'error') return null;
  return (
    <>
      <WeekTiles d={progress.data} />
      <FocusNext d={progress.data} />
    </>
  );
}

function WeekTiles({ d }: { readonly d: Dashboard }) {
  const { spacing } = useTheme();
  return (
    <View style={{ gap: spacing.md }} testID="home-week">
      <SectionHeader title="This week" onAction={() => router.push('/progress')} actionLabel="Progress" actionAccessibilityLabel="Open your progress" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        {weekTiles(d.weekCompare).map((t) => (
          <StatTile
            key={t.key}
            testID={`home-week-${t.key}`}
            surface="card"
            caption={t.caption}
            value={t.value}
            accessibilityLabel={t.spoken}
            change={t.change ? { direction: directionOf(t.change.delta), value: t.change.text, subject: t.change.subject, tone: 'neutral' } : undefined}
          />
        ))}
      </View>
      <AppText variant="caption" color="textSecondary">
        {`This week so far (since Monday) ${COMPARED_WITH}, counted from your classes, answers, checked trades and replays.`}
      </AppText>
    </View>
  );
}

function FocusNext({ d }: { readonly d: Dashboard }) {
  const shown = d.recommendations.slice(0, FOCUS_LIMIT);
  if (shown.length === 0) return null;
  const linkable = canOpen('/progress/skill/[id]');
  return (
    <Card testID="home-focus">
      <AppText variant="heading">Focus next</AppText>
      {shown.map((r) => (
        <ListRow
          key={r.skill}
          testID={`home-focus-${r.skill}`}
          icon={Target}
          iconTone="warning"
          title={SKILL_LABELS[r.skill]}
          subtitle={r.reason}
          onPress={linkable ? () => router.push({ pathname: '/progress/skill/[id]', params: { id: r.skill } }) : undefined}
        />
      ))}
    </Card>
  );
}
