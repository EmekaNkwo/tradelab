import { router, type Href } from 'expo-router';
import { menuIcon } from '../../../components/more/moreIcons';
import { MORE_APP, MORE_RESEARCH, MORE_TOOLS, type MenuItem } from '../../../components/navigation/menus';
import { Card, ListRow, Screen, SectionHeader } from '../../../components/ui';
import { useStrategyContent } from '../../../features/strategies';
import { canOpen } from '../../../shared/routeAccess';
import { useTheme } from '../../../theme';

export default function MoreScreen() {
  // The Research Library opens only when it has something to show (spec §4: no empty screens).
  const hasSources = useStrategyContent().reviewedSources().length > 0;
  return (
    <Screen testID="more-screen">
      <Section title="Tools" items={MORE_TOOLS} />
      {hasSources && canOpen(MORE_RESEARCH.href) ? <Section title="Research" items={[MORE_RESEARCH]} /> : null}
      <Section title="App" items={MORE_APP} />
    </Screen>
  );
}

/** A grouped list card (brief §5.8): section title above, rows with icon wells and chevrons. */
function Section({ title, items }: { readonly title: string; readonly items: readonly MenuItem[] }) {
  const { spacing } = useTheme();
  const shown = items.filter((item) => canOpen(item.href));
  if (shown.length === 0) return null;
  return (
    <>
      <SectionHeader title={title} />
      <Card style={{ paddingVertical: spacing.xs, gap: 0 }}>
        {shown.map((item) => {
          const { icon, tone } = menuIcon(item.feature);
          return (
            <ListRow
              key={item.feature}
              testID={`more-${item.feature}`}
              icon={icon}
              iconTone={tone}
              title={item.title}
              subtitle={item.subtitle}
              onPress={() => router.push(item.href as Href)}
            />
          );
        })}
      </Card>
    </>
  );
}
