import { View } from 'react-native';
import type { ModuleOverview } from '../../features/learning';
import { useTheme } from '../../theme';
import { AppText } from '../ui/AppText';
import { Icon } from '../ui/Icon';
import { Circle, CircleCheck } from '../ui/icons';

/** A module's place on the timeline, in words: checkpoint passed, lessons under way, or not started. */
export function moduleStage(m: ModuleOverview): string {
  const done = m.lessons.filter((l) => l.done).length;
  if (m.checkpointPassed) return `Checkpoint passed · ${done} of ${m.lessons.length} lessons`;
  if (done > 0) return `In progress · ${done} of ${m.lessons.length} lessons`;
  return `Not started · ${m.lessons.length} ${m.lessons.length === 1 ? 'lesson' : 'lessons'}`;
}

/**
 * The program's modules in order as a vertical timeline (brief §5.8). Modules are never locked in TradeLab, so the
 * stages are "passed", "in progress" and "not started", each said in words beside its icon.
 */
export function ModuleTimeline({ modules }: { readonly modules: readonly ModuleOverview[] }) {
  const { colors, spacing } = useTheme();
  return (
    <View>
      {modules.map((m, i) => {
        const last = i === modules.length - 1;
        return (
          <View key={m.id} testID={`timeline-${m.id}`} accessible accessibilityLabel={`${i + 1}. ${m.title}. ${moduleStage(m)}`} style={{ flexDirection: 'row', gap: spacing.md }}>
            <View style={{ alignItems: 'center', width: 24 }}>
              <Icon icon={m.checkpointPassed ? CircleCheck : Circle} size={22} color={m.checkpointPassed ? 'brand' : 'textSecondary'} />
              {last ? null : <View style={{ flex: 1, width: 2, minHeight: spacing.md, backgroundColor: colors.border }} />}
            </View>
            <View style={{ flex: 1, paddingBottom: last ? 0 : spacing.md }}>
              <AppText variant="label">{`${i + 1}. ${m.title}`}</AppText>
              <AppText variant="caption" color="textSecondary" tabular>
                {moduleStage(m)}
              </AppText>
            </View>
          </View>
        );
      })}
    </View>
  );
}
