import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { ColorTokens } from '../../theme';
import { useTheme } from '../../theme';
import { Card } from '../ui/Card';
import { CardHeader } from '../ui/CardHeader';
import { ChartCandlestick, TriangleAlert, type LucideIcon } from '../ui/icons';
import type { WellTone } from '../ui/IconWell';
import { GlossaryText } from '../lesson/GlossaryText';

interface StrategySectionProps {
  readonly title: string;
  readonly children: ReactNode;
  /** `warning` (how it fails) and `modeReplay` (chart and replay practice) get an icon well in the title row. */
  readonly accent?: keyof ColorTokens;
  readonly testID?: string;
}

const ACCENT_WELLS: Partial<Record<keyof ColorTokens, { readonly icon: LucideIcon; readonly tone: WellTone }>> = {
  warning: { icon: TriangleAlert, tone: 'warning' },
  modeReplay: { icon: ChartCandlestick, tone: 'simulated' },
};

/** One section of a strategy page (spec §15.3) as a card with its title row (restyle brief §5.5). */
export function StrategySection({ title, children, accent, testID }: StrategySectionProps) {
  const well = accent ? ACCENT_WELLS[accent] : undefined;
  return (
    <View testID={testID}>
      <Card>
        <CardHeader title={title} icon={well?.icon} tone={well?.tone} />
        {children}
      </Card>
    </View>
  );
}

/** A bulleted list of content text with glossary links. */
export function Bullets({ items }: { readonly items: readonly string[] }) {
  const { spacing } = useTheme();
  return (
    <View style={{ gap: spacing.xs }}>
      {items.map((i) => (
        <GlossaryText key={i}>{`• ${i}`}</GlossaryText>
      ))}
    </View>
  );
}
