import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { AppText, Card, CardHeader, EmptyState, ErrorState, IconWell, LoadingState, Screen } from '../../../components/ui';
import { CircleCheck, Lightbulb, ListChecks, Target } from '../../../components/ui/icons';
import { useTheme } from '../../../theme';
import { PracticePath } from '../../../components/progress/PracticePath';
import { evidenceSummary, isSkillId, MASTERY_LEVEL_LABELS, MASTERY_LEVEL_NOTES, MASTERY_WEIGHTS, showsScore, SKILL_LABELS, skillOf, useProgressDashboard } from '../../../features/progress';

const pct = (n: number | null) => (n === null ? 'no evidence yet' : `${Math.round(n * 100)}%`);

const COMPONENTS: readonly { readonly key: keyof typeof MASTERY_WEIGHTS; readonly label: string; readonly what: string }[] = [
  { key: 'correctness', label: 'Correctness', what: 'Your latest answer to each question on this skill, given first time or a day or more after the last try.' },
  { key: 'application', label: 'Application', what: 'Drills, lab cases, strategy exercises, replay process and rule-checked trades (hand-entered trades count half).' },
  { key: 'retention', label: 'Retention', what: 'Spaced re-tests that were due, at most one per question a day.' },
  { key: 'breadth', label: 'Breadth', what: 'Doing well in different modules, drills, conditions and cases.' },
  { key: 'reasoning', label: 'Reasoning', what: 'Rule-checked trades with a real written reason and journal review.' },
];

/** One skill's mastery (spec §23): the score, what it is made of, and the evidence behind it. */
export default function SkillScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { colors, radii, spacing } = useTheme();
  const state = useProgressDashboard();
  if (state.status === 'loading') return <LoadingState />;
  if (state.status === 'error') return <ErrorState error={state.error} onRetry={state.reload} />;
  const m = isSkillId(id) ? skillOf(state.data, id) : null;
  if (!m) return <EmptyState title="Skill not found" body="This skill does not exist." />;
  const rec = state.data.recommendations.find((r) => r.skill === m.skill);
  return (
    <Screen testID="skill-screen">
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <IconWell icon={m.level === 'secure' ? CircleCheck : Target} tone={m.level === 'secure' ? 'brand' : 'neutral'} />
          <View style={{ flex: 1 }}>
            <AppText variant="title">{SKILL_LABELS[m.skill]}</AppText>
            <AppText testID="skill-level" variant="label" tabular>{`${MASTERY_LEVEL_LABELS[m.level]}${showsScore(m) ? ` · ${pct(m.score)}` : ''}`}</AppText>
          </View>
        </View>
        {showsScore(m) && m.score !== null ? (
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ height: 8, borderRadius: radii.pill, backgroundColor: colors.surfaceMuted, overflow: 'hidden' }}>
            <View style={{ width: `${Math.round(m.score * 100)}%`, height: '100%', borderRadius: radii.pill, backgroundColor: colors.brand }} />
          </View>
        ) : null}
        <AppText testID="skill-level-note">{MASTERY_LEVEL_NOTES[m.level]}</AppText>
        <AppText color="textSecondary" testID="skill-evidence">
          {evidenceSummary(m.evidence)}
        </AppText>
      </Card>
      <Card>
        <CardHeader icon={ListChecks} tone="neutral" title="How this is worked out" />
        {COMPONENTS.map((c) => (
          <AppText key={c.key} testID={`skill-component-${c.key}`}>
            {`${c.label} (weight ${Math.round(MASTERY_WEIGHTS[c.key] * 100)}%): ${showsScore(m) ? pct(m.components[c.key]) : m.components[c.key] === null ? 'no evidence yet' : 'too early to show'}. ${c.what}`}
          </AppText>
        ))}
        <AppText variant="caption" color="textSecondary">
          Parts with no evidence are left out and the others reweighted. Breadth and reasoning alone give no score. Time spent never counts. “Secure” needs at least 80%, 10 different questions or items and two kinds of evidence.
        </AppText>
      </Card>
      {rec ? (
        <Card>
          <CardHeader icon={Lightbulb} tone="info" title="What to practise next" />
          <AppText>{rec.reason}</AppText>
          <PracticePath steps={rec.steps} />
        </Card>
      ) : null}
    </Screen>
  );
}
