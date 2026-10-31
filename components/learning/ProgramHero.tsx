import { View } from 'react-native';
import type { ProgramHeroView } from '../../features/learning';
import { heroOverlay, useTheme } from '../../theme';
import { AppText } from '../ui/AppText';
import { HeroCard } from '../ui/HeroCard';

interface ProgramHeroProps {
  readonly title: string;
  readonly view: ProgramHeroView;
  readonly note: string;
}

/** The program on the lighter hero gradient (brief §5.2): progress through it and, for the one under way, the finish date. */
export function ProgramHero({ title, view, note }: ProgramHeroProps) {
  const { colors, radii, spacing } = useTheme();
  return (
    <HeroCard variant="light" testID="learn-hero">
      <AppText variant="caption" color="onHero">
        {view.caption}
      </AppText>
      <AppText variant="title" color="onHero">
        {title}
      </AppText>
      <View accessible accessibilityLabel={view.spoken} style={{ gap: spacing.xs }} testID="learn-hero-progress">
        <View style={{ height: 8, borderRadius: radii.pill, backgroundColor: heroOverlay, overflow: 'hidden' }}>
          <View style={{ width: `${view.percent}%`, height: '100%', borderRadius: radii.pill, backgroundColor: colors.onHero }} />
        </View>
        <AppText variant="caption" color="onHero" tabular>
          {`${view.done} of ${view.total} lessons and checkpoints · ${view.percent}%${view.finish ? ` · ${view.finish}` : ''}`}
        </AppText>
      </View>
      <AppText color="onHero">{note}</AppText>
    </HeroCard>
  );
}
