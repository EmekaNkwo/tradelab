import { Pressable, View } from 'react-native';
import { evidenceSummary, MASTERY_LEVEL_LABELS, showsScore, SKILL_LABELS, type Dashboard } from '../../features/progress';
import { touchTarget, useTheme } from '../../theme';
import { AppText } from '../ui/AppText';
import { Icon } from '../ui/Icon';
import { IconWell } from '../ui/IconWell';
import { ChevronRight, CircleCheck, Target } from '../ui/icons';
import { rowLabel } from '../ui/ListRow';

type SkillMastery = Dashboard['mastery'][number];

/** The skill's score as a 0–100 percent, or null while it is too early to show one. */
export function skillPercent(m: SkillMastery): number | null {
  return showsScore(m) && m.score !== null ? Math.round(m.score * 100) : null;
}

/** "Risk management: Developing (40%)": the level in words, the percent only once there is enough evidence. */
export function skillTitle(m: SkillMastery): string {
  const p = skillPercent(m);
  return `${SKILL_LABELS[m.skill]}: ${MASTERY_LEVEL_LABELS[m.level]}${p === null ? '' : ` (${p}%)`}`;
}

interface SkillRowProps {
  readonly mastery: SkillMastery;
  readonly onPress: () => void;
  readonly testID?: string;
}

/**
 * One skill as a CategoryBar-style row (brief §5.8): icon well, skill and level, evidence, and a bar of the score.
 * No bar until a percentage may be shown, so an empty track never reads as 0%. Tappable, with one spoken label.
 */
export function SkillRow({ mastery: m, onPress, testID }: SkillRowProps) {
  const { colors, radii, spacing } = useTheme();
  const p = skillPercent(m);
  const title = skillTitle(m);
  const evidence = evidenceSummary(m.evidence);
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={rowLabel([title, evidence])}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        paddingVertical: spacing.sm,
        minHeight: touchTarget,
        borderRadius: radii.md,
        backgroundColor: pressed ? colors.surfaceMuted : 'transparent',
      })}
    >
      <IconWell icon={m.level === 'secure' ? CircleCheck : Target} tone={m.level === 'secure' ? 'brand' : 'neutral'} size={40} />
      <View style={{ flex: 1, gap: spacing.xs }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm, flexWrap: 'wrap' }}>
          <AppText variant="label" style={{ flexShrink: 1 }}>
            {SKILL_LABELS[m.skill]}
          </AppText>
          <AppText variant="label" tabular color={p === null ? 'textSecondary' : 'textPrimary'}>
            {p === null ? MASTERY_LEVEL_LABELS[m.level] : `${MASTERY_LEVEL_LABELS[m.level]} · ${p}%`}
          </AppText>
        </View>
        {p === null ? null : (
          <View style={{ height: 8, borderRadius: radii.pill, backgroundColor: colors.surfaceMuted, overflow: 'hidden' }}>
            <View testID={testID ? `${testID}-fill` : undefined} style={{ width: `${p}%`, height: '100%', borderRadius: radii.pill, backgroundColor: colors.brand }} />
          </View>
        )}
        <AppText variant="caption" color="textSecondary">
          {evidence}
        </AppText>
      </View>
      <Icon icon={ChevronRight} size={20} color="textSecondary" />
    </Pressable>
  );
}
