import { View } from 'react-native';
import { useTheme } from '../../theme';
import { AppText } from './AppText';
import { IconWell, type WellTone } from './IconWell';
import type { LucideIcon } from './icons';
import { SimulatedBadge, type SimulatedKind } from './SimulatedBadge';

interface CardHeaderProps {
  readonly title: string;
  readonly icon?: LucideIcon;
  readonly tone?: WellTone;
  /** A SimulatedBadge on the right: the card shows simulated money (brief §1). */
  readonly badge?: SimulatedKind;
  readonly testID?: string;
}

/** A card's heading row: icon well, heading text, and an optional Simulated/Paper/Replay badge on the right. */
export function CardHeader({ title, icon, tone = 'brand', badge, testID }: CardHeaderProps) {
  const { spacing } = useTheme();
  return (
    <View testID={testID} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, flexWrap: 'wrap' }}>
      {icon ? <IconWell icon={icon} tone={tone} size={40} /> : null}
      <AppText variant="heading" style={{ flex: 1, minWidth: 120 }}>
        {title}
      </AppText>
      {badge ? <SimulatedBadge kind={badge} /> : null}
    </View>
  );
}
