import { router } from 'expo-router';
import { useState } from 'react';
import { AppText, Button, Card, ChoiceChips, ErrorState, LoadingState, Notice, Screen } from '../../../components/ui';
import {
  EXPERIENCE_CHOICES,
  GOAL_CHOICES,
  MARKET_CHOICES,
  usePreferenceMatcher,
  usePrograms,
  useProfile,
  useUpdateLearningPreferences,
  type LearningPreferences,
} from '../../../features/learning';
import { errorText } from '../../../shared/errors';
import { canOpen } from '../../../shared/routeAccess';

/** Settings → What I want to learn: change the onboarding answers that decide what is suggested. */
export default function PreferencesScreen() {
  const profile = useProfile();
  if (profile.status === 'loading') return <LoadingState />;
  if (profile.status === 'error') return <ErrorState error={profile.error} onRetry={profile.reload} />;
  if (!profile.data) {
    return (
      <Screen testID="preferences-screen">
        <AppText>Finish setting up TradeLab first. Your answers from setup appear here.</AppText>
      </Screen>
    );
  }
  const { experience, markets, goals } = profile.data;
  return <PreferencesForm initial={{ experience, markets, goals }} />;
}

function PreferencesForm({ initial }: { readonly initial: LearningPreferences }) {
  const save = useUpdateLearningPreferences();
  const matcher = usePreferenceMatcher();
  const programs = usePrograms();
  const [draft, setDraft] = useState<LearningPreferences>(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ readonly tone: 'success' | 'warning'; readonly text: string } | null>(null);

  const update = (patch: Partial<LearningPreferences>) => {
    setMessage(null);
    setDraft((d) => ({ ...d, ...patch }));
  };
  const valid = draft.markets.length > 0 && draft.goals.length > 0;

  const onSave = async () => {
    setBusy(true);
    const r = await save(draft);
    setBusy(false);
    setMessage(r.ok ? { tone: 'success', text: 'Saved. Suggestions on Learn, Programs and Strategies now follow these choices.' } : { tone: 'warning', text: errorText(r.error) });
  };

  const suggested = programs.find((p) => p.id === matcher.suggestedProgramId);
  return (
    <Screen testID="preferences-screen">
      <AppText color="textSecondary">
        These are your answers from setup. They decide which programs, modules and strategies are marked as suggested for you. Your program, schedule and progress stay
        as they are.
      </AppText>
      <Card>
        <ChoiceChips label="Your experience" single testIDPrefix="pref-experience" options={EXPERIENCE_CHOICES} selected={[draft.experience]} onChange={(v) => v[0] && update({ experience: v[0] })} />
      </Card>
      <Card>
        <ChoiceChips label="Markets that interest you (choose one or more)" testIDPrefix="pref-market" options={MARKET_CHOICES} selected={draft.markets} onChange={(markets) => update({ markets })} />
      </Card>
      <Card>
        <ChoiceChips label="What you want to learn (choose one or more)" testIDPrefix="pref-goal" options={GOAL_CHOICES} selected={draft.goals} onChange={(goals) => update({ goals })} />
      </Card>
      {message ? (
        <Notice live tone={message.tone} title={message.tone === 'success' ? 'Preferences saved' : 'Not saved'} testID="preferences-message">
          {message.text}
        </Notice>
      ) : null}
      <Button label="Save my choices" onPress={onSave} busy={busy} disabled={!valid} disabledReason="Choose at least one market and one thing to learn." />
      {suggested ? (
        <Card testID="preferences-suggestion">
          <AppText variant="heading">Suggested program</AppText>
          <AppText>{`${suggested.title} covers the most of your saved choices.`}</AppText>
          {canOpen('/learn/programs') ? <Button label="See programs" variant="secondary" onPress={() => router.push('/learn/programs', { withAnchor: true })} /> : null}
        </Card>
      ) : null}
    </Screen>
  );
}
