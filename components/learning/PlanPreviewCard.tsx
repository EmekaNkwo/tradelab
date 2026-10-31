import { View } from 'react-native';
import { useTheme } from '../../theme';
import { AppText } from '../ui/AppText';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { CardHeader } from '../ui/CardHeader';
import { Clock } from '../ui/icons';
import { Notice } from '../ui/Notice';

interface PlanPreviewCardProps {
  readonly totalClasses: number;
  readonly minutesPerClass: number;
  readonly finishLabel: string | null;
  readonly warnings: readonly string[];
  readonly suggestions: readonly { readonly label: string; readonly onApply: () => void }[];
}

/** Schedule preview shown before the learner confirms (spec §6.2). The learner decides; nothing changes automatically. */
export function PlanPreviewCard({ totalClasses, minutesPerClass, finishLabel, warnings, suggestions }: PlanPreviewCardProps) {
  const { spacing } = useTheme();
  return (
    <Card>
      <CardHeader icon={Clock} title="Your plan" />
      <View style={{ gap: spacing.xs }} testID="plan-preview">
        <AppText>{`${totalClasses} classes · about ${minutesPerClass} minutes each`}</AppText>
        <AppText>{finishLabel ? `Finishes ${finishLabel}` : 'No classes to schedule'}</AppText>
      </View>
      {warnings.length > 0 ? (
        <Notice title="Check this plan" tone="warning">
          {warnings.map((w) => (
            <AppText key={w}>{w}</AppText>
          ))}
        </Notice>
      ) : null}
      {suggestions.length > 0 ? (
        <View style={{ gap: spacing.sm }}>
          <AppText variant="label">Nearest realistic options</AppText>
          {suggestions.map((s) => (
            <Button key={s.label} label={s.label} variant="secondary" onPress={s.onApply} />
          ))}
        </View>
      ) : null}
    </Card>
  );
}
