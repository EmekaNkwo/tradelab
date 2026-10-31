import { View } from 'react-native';
import { heroOverlay, useTheme } from '../../theme';
import { AppText } from '../ui/AppText';
import { HeroCard } from '../ui/HeroCard';
import { IconWell } from '../ui/IconWell';
import type { Strategy } from '../../features/strategies';
import { CATEGORY_ICONS } from './StrategyCard';

interface StrategyHeroProps {
  readonly strategy: Strategy;
  /** Family · level · markets, from the content. */
  readonly caption: string;
  /** The content's own evidence level, already labelled ("Primary source"); null when the page cites none. */
  readonly sourceQuality: string | null;
}

/** The strategy page's hero (restyle brief §5.5): name, content facts and the source-quality badge, if any. */
export function StrategyHero({ strategy, caption, sourceQuality }: StrategyHeroProps) {
  const { radii, spacing } = useTheme();
  return (
    <HeroCard
      variant="light"
      testID="strategy-hero"
      pill={
        sourceQuality ? (
          <View testID="strategy-source-quality" accessible accessibilityLabel={`Source quality: ${sourceQuality}`} style={{ backgroundColor: heroOverlay, borderRadius: radii.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.xs }}>
            <AppText variant="caption" color="onHero" style={{ fontWeight: '600' }}>
              {sourceQuality}
            </AppText>
          </View>
        ) : undefined
      }
    >
      <IconWell icon={CATEGORY_ICONS[strategy.category]} tone="onHero" size={44} />
      <AppText variant="title" color="onHero">
        {strategy.title}
      </AppText>
      <AppText variant="caption" color="onHero">
        {caption}
      </AppText>
    </HeroCard>
  );
}
