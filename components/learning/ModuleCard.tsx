import { router } from 'expo-router';
import { View } from 'react-native';
import { modulePercent, type ModuleOverview } from '../../features/learning';
import { useTheme } from '../../theme';
import { AppText } from '../ui/AppText';
import { Card } from '../ui/Card';
import { Icon } from '../ui/Icon';
import { IconWell } from '../ui/IconWell';
import { BookOpen, CircleCheck, GraduationCap } from '../ui/icons';
import { ListRow } from '../ui/ListRow';

/**
 * One module (brief §5.2): icon well, title, a progress bar of lessons ticked, "Checkpoint passed" in words with
 * a calm check, and its lessons. Modules are never locked in TradeLab (any lesson can be read again), so there is
 * no lock state to show.
 */
export function ModuleCard({ module, number }: { readonly module: ModuleOverview; readonly number: number }) {
  const { colors, radii, spacing } = useTheme();
  const done = module.lessons.filter((l) => l.done).length;
  const percent = modulePercent(module);
  const complete = module.checkpointPassed && done === module.lessons.length;
  return (
    <Card testID={`module-${module.id}`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <IconWell icon={complete ? CircleCheck : GraduationCap} size={44} />
        <View style={{ flex: 1, gap: spacing.xxs }}>
          <AppText variant="heading">{`${number}. ${module.title}`}</AppText>
          <AppText variant="caption" color="textSecondary" tabular testID={`module-progress-${module.id}`}>
            {`${done} of ${module.lessons.length} lessons · checkpoint ${module.checkpointPassed ? 'passed' : 'not passed yet'}`}
          </AppText>
        </View>
      </View>
      {/* The caption above says the same in words, so the bar is decoration for screen readers. */}
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ height: 8, borderRadius: radii.pill, backgroundColor: colors.surfaceMuted, overflow: 'hidden' }}
        testID={`module-bar-${module.id}`}
      >
        <View style={{ width: `${percent}%`, height: '100%', borderRadius: radii.pill, backgroundColor: colors.brand }} />
      </View>
      {module.checkpointPassed ? (
        // The caption above already says "checkpoint passed" to screen readers, so this line is said once, there.
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}
          testID={`module-checkpoint-${module.id}`}
        >
          <Icon icon={CircleCheck} size={18} color="brand" />
          <AppText variant="label" color="brand">
            Checkpoint passed
          </AppText>
        </View>
      ) : null}
      <View style={{ gap: spacing.xxs }}>
        {module.lessons.map((l) => (
          <ListRow
            key={l.id}
            testID={`lesson-${l.id}`}
            icon={l.done ? CircleCheck : BookOpen}
            iconTone={l.done ? 'brand' : 'neutral'}
            title={l.title}
            status={l.done ? 'Done' : undefined}
            subtitle={l.inOneLine}
            onPress={() => router.push({ pathname: '/lesson/[id]', params: { id: l.id } })}
          />
        ))}
      </View>
      <AppText variant="caption" color="textSecondary">{`Practical result: ${module.practicalResult}`}</AppText>
    </Card>
  );
}
