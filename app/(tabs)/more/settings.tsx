import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { AppText, Card, CardHeader, ErrorState, ListRow, LoadingState, Screen, SegmentedControl } from '../../../components/ui';
import { Award, BellRing, BookOpen, ClipboardCheck, Globe, GraduationCap, SunMoon } from '../../../components/ui/icons';
import { useSettings, useUpdateSettings } from '../../../features/settings';
import type { AppError } from '../../../shared/errors';
import type { AppSettings, LearningReminderSettings } from '../../../features/settings';
import type { ExplanationLevel, ThemePreference } from '../../../shared/types';

const THEME_OPTIONS: readonly { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

const LEVEL_OPTIONS: readonly { value: ExplanationLevel; label: string }[] = [
  { value: 'simple', label: 'Simple' },
  { value: 'balanced', label: 'Balanced' },
  { value: 'advanced', label: 'Advanced' },
];

const CHECKLIST_OPTIONS = [
  { value: 'on', label: 'On' },
  { value: 'off', label: 'Off' },
] as const;

const REMINDER_TOGGLES: readonly { readonly key: keyof LearningReminderSettings; readonly label: string }[] = [
  { key: 'weakReview', label: 'Review reminder on rest days, when earlier answers are due' },
  { key: 'weeklySummary', label: 'Weekly summary on Sundays' },
  { key: 'backup', label: 'Backup check on Saturdays' },
];

type SettingsPatch = Partial<Pick<AppSettings, 'theme' | 'explanationLevel' | 'preTradeChecklist' | 'streaks' | 'reminders'>>;

export default function SettingsScreen() {
  const settings = useSettings();
  const update = useUpdateSettings();
  /** The control whose change failed to save, so the error shows right next to it. */
  const [saveError, setSaveError] = useState<{ readonly field: string; readonly error: AppError } | null>(null);
  const [saving, setSaving] = useState(false);

  if (settings.status === 'loading') return <LoadingState />;
  if (settings.status === 'error') return <ErrorState error={settings.error} onRetry={settings.reload} />;

  const save = async (field: string, patch: SettingsPatch) => {
    setSaving(true);
    const result = await update(patch);
    setSaving(false);
    setSaveError(result.ok ? null : { field, error: result.error });
  };
  const errorFor = (field: string) => (saveError?.field === field ? <ErrorState error={saveError.error} /> : null);

  return (
    <Screen testID="settings-screen">
      <Card>
        <CardHeader icon={SunMoon} tone="brand" title="Appearance" />
        <SegmentedControl label="Theme" options={THEME_OPTIONS} value={settings.data.theme} onChange={(theme) => save('theme', { theme })} disabled={saving} />
        {errorFor('theme')}
      </Card>
      <Card>
        <ListRow
          testID="settings-preferences"
          icon={GraduationCap}
          title="What I want to learn"
          subtitle="Change your experience, markets and goals. Your progress is kept."
          onPress={() => router.push('/more/preferences')}
        />
      </Card>
      <Card>
        <CardHeader icon={BookOpen} tone="brand" title="Explanations" />
        <SegmentedControl
          label="Explanation level"
          hideLabel
          options={LEVEL_OPTIONS}
          value={settings.data.explanationLevel}
          onChange={(explanationLevel) => save('explanationLevel', { explanationLevel })}
          disabled={saving}
        />
        {errorFor('explanationLevel')}
        <AppText variant="caption" color="textSecondary">
          Changes how lessons are explained. Your progress is not affected.
        </AppText>
      </Card>
      <Card>
        <CardHeader icon={Globe} tone="info" title="Time zone" />
        <AppText testID="time-zone">{settings.data.timeZone}</AppText>
        <AppText variant="caption" color="textSecondary">
          Class dates and times use this time zone. It is taken from your phone when you set up your program.
        </AppText>
      </Card>
      <Card>
        <CardHeader icon={ClipboardCheck} tone="brand" title="Paper trading" />
        <SegmentedControl
          label="Ask the pre-trade checklist before each paper order"
          options={CHECKLIST_OPTIONS}
          value={settings.data.preTradeChecklist ? 'on' : 'off'}
          onChange={(v) => save('preTradeChecklist', { preTradeChecklist: v === 'on' })}
          disabled={saving}
        />
        {errorFor('preTradeChecklist')}
        <AppText variant="caption" color="textSecondary">
          Pre-trade checklist before each paper order: in your plan, stop set, risk within your limit, news, and how you feel.
        </AppText>
      </Card>
      <Card>
        <CardHeader icon={Award} tone="brand" title="Progress" />
        <SegmentedControl
          label="Show my study streak"
          options={CHECKLIST_OPTIONS}
          value={settings.data.streaks ? 'on' : 'off'}
          onChange={(v) => save('streaks', { streaks: v === 'on' })}
          disabled={saving}
        />
        {errorFor('streaks')}
        <AppText variant="caption" color="textSecondary">
          Counts your study days in a row with a class done. Rest days never break it.
        </AppText>
      </Card>
      <Card>
        <CardHeader icon={BellRing} tone="info" title="Learning reminders" />
        <AppText variant="caption" color="textSecondary">
          Off unless you turn them on. They come an hour or two after your class time, never at the same moment as another reminder, and only
          while class reminders are on (Home → Timeline and settings). TradeLab never sends reminders to trade or to watch prices.
        </AppText>
        {REMINDER_TOGGLES.map((t) => (
          <View key={t.key} testID={`reminder-${t.key}`}>
            <SegmentedControl
              label={t.label}
              options={CHECKLIST_OPTIONS}
              value={settings.data.reminders[t.key] ? 'on' : 'off'}
              onChange={(v) => save(`reminders.${t.key}`, { reminders: { ...settings.data.reminders, [t.key]: v === 'on' } })}
              disabled={saving}
            />
            {errorFor(`reminders.${t.key}`)}
          </View>
        ))}
      </Card>
    </Screen>
  );
}
