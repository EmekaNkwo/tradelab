import { useState } from 'react';
import { AppText, Button, Card, CardHeader, ChoiceChips, ErrorState, LoadingState, Notice, Screen, SegmentedControl, TextField } from '../../../components/ui';
import { ChartLine, Sparkles } from '../../../components/ui/icons';
import { CONSENT_LABELS } from '../../../features/coach';
import { SECRET_LABELS, useSecretsStatus, useServiceActions, type SecretName } from '../../../features/services';
import { useSettings, type AppSettings } from '../../../features/settings';
import { errorText, type AppError } from '../../../shared/errors';
import { isFeatureEnabled } from '../../../shared/featureFlags';
import { canOpen } from '../../../shared/routeAccess';

const COACH_MODES = [
  { value: 'off', label: 'Off' },
  { value: 'curated', label: 'Offline' },
  { value: 'cloud', label: 'Cloud' },
] as const;

const MODELS = [
  { value: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 (lower cost)' },
  { value: 'claude-opus-5-5', label: 'Claude Opus 5.5' },
] as const;

type Consent = AppSettings['integrations']['coachConsent'];

/**
 * Optional online services and the coach (spec §24.3, §30, §34). Everything
 * here is off until turned on; keys live only in the phone's secure storage
 * and can be deleted at any time.
 */
export default function ServicesScreen() {
  const settings = useSettings();
  const secrets = useSecretsStatus();
  const actions = useServiceActions();
  const [error, setError] = useState<{ readonly field: string; readonly error: AppError } | null>(null);
  if (settings.status === 'loading' || secrets.status === 'loading') return <LoadingState />;
  if (settings.status === 'error') return <ErrorState error={settings.error} onRetry={settings.reload} />;
  if (secrets.status === 'error') return <ErrorState error={secrets.error} onRetry={secrets.reload} />;
  const i = settings.data.integrations;
  /** Runs an action and shows its error by the field; returns whether it worked. */
  const run = async (field: string, action: () => Promise<{ ok: boolean; error?: AppError }>): Promise<boolean> => {
    const r = await action();
    setError(r.ok || !r.error ? null : { field, error: r.error });
    return r.ok;
  };
  const errorFor = (field: string) => (error?.field === field ? <AppText color="lossText" testID={`services-error-${field}`}>{errorText(error.error)}</AppText> : null);

  return (
    <Screen testID="services-screen">
      <Notice title="Everything works offline">
        These services are optional and off until you turn them on. They need the internet and your own account with each provider. Your journal, notes and progress stay on this phone unless you choose to share them here.
      </Notice>
      {!secrets.data.available ? (
        <Notice title="No secure storage on this device" tone="warning">
          Keys can only be kept in a phone’s secure storage, which this device does not offer. Online services stay off here.
        </Notice>
      ) : null}

      {canOpen('/data') ? (
        <Card>
          <CardHeader icon={ChartLine} tone="info" title="Price data: Twelve Data" />
          <AppText color="textSecondary">Fetch past candles for forex, stocks and commodities with your own Twelve Data key. The data is historical, not live, and is labelled with its source wherever it is used. Your plan’s terms apply; the app keeps the data only on this phone and never includes it in backups.</AppText>
          <Notice title="Check your Twelve Data plan" tone="warning">
            <AppText testID="td-plan-notice">Your Twelve Data plan must allow its data to be shown, stored and processed in a personal app like this one. Plans differ, and some do not allow display. Checking this in Twelve Data’s pricing and terms is your responsibility.</AppText>
          </Notice>
          <KeyEditor name="twelvedata_api_key" saved={secrets.data.saved.twelvedata_api_key} available={secrets.data.available} onSave={(v) => run('twelvedata_api_key', () => actions.save('twelvedata_api_key', v))} onDelete={() => run('twelvedata_api_key', () => actions.remove('twelvedata_api_key'))} />
          {errorFor('twelvedata_api_key')}
          <SegmentedControl
            label="Use Twelve Data (needs the internet)"
            options={[{ value: 'off', label: 'Off' }, { value: 'on', label: 'On' }]}
            value={i.marketProvider ? 'on' : 'off'}
            onChange={(v) => run('marketProvider', () => actions.update({ marketProvider: v === 'on' }))}
          />
          {errorFor('marketProvider')}
        </Card>
      ) : null}

      {canOpen('/coach') ? (
        <Card>
          <CardHeader icon={Sparkles} tone="info" title="Coach" />
          <AppText color="textSecondary">Offline uses the app’s own lessons and works without the internet. Cloud sends your question to Anthropic with your own key; if it fails, the offline answer is shown instead. Every cloud answer is labelled “AI suggestion”. Cloud requests are billed to your Anthropic account. Calculations, grades, rule checks and results always come from the app, never from the coach.</AppText>
          <SegmentedControl label="Coach" hideLabel options={COACH_MODES} value={i.coach} onChange={(coach) => run('coach', () => actions.update({ coach }))} />
          {errorFor('coach')}
          <KeyEditor name="anthropic_api_key" saved={secrets.data.saved.anthropic_api_key} available={secrets.data.available} onSave={(v) => run('anthropic_api_key', () => actions.save('anthropic_api_key', v))} onDelete={() => run('anthropic_api_key', () => actions.remove('anthropic_api_key'))} />
          {errorFor('anthropic_api_key')}
          {i.coach === 'cloud' ? (
            <>
              <Notice title="What is sent to Anthropic" tone="warning">
                When you ask the cloud coach, your question and the details needed to answer it are sent to Anthropic over the internet and handled under Anthropic’s terms for your account. Journal entries, strategy rules and backtest reports are sent only if you allow each one below. Your API key is never sent anywhere else.
              </Notice>
              <SegmentedControl label="Cloud model" options={MODELS} value={i.cloudModel} onChange={(cloudModel) => run('cloudModel', () => actions.update({ cloudModel }))} />
              <ChoiceChips
                label="You allow the cloud coach to receive"
                options={(Object.keys(CONSENT_LABELS) as (keyof Consent)[]).map((k) => ({ value: k, label: CONSENT_LABELS[k] }))}
                selected={(Object.keys(i.coachConsent) as (keyof Consent)[]).filter((k) => i.coachConsent[k])}
                onChange={(v) => run('consent', () => actions.update({ coachConsent: { journal: v.includes('journal'), strategies: v.includes('strategies'), backtests: v.includes('backtests') } }))}
              />
              {errorFor('consent')}
            </>
        ) : null}
        {!isFeatureEnabled('onDeviceCoach') ? <AppText variant="caption" color="textSecondary">An on-device coach model is not part of this version of the app.</AppText> : null}
      </Card>
      ) : null}
    </Screen>
  );
}

function KeyEditor({ name, saved, available, onSave, onDelete }: { readonly name: SecretName; readonly saved: boolean; readonly available: boolean; readonly onSave: (v: string) => Promise<boolean>; readonly onDelete: () => Promise<boolean> }) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const act = async (f: () => Promise<unknown>) => {
    setBusy(true);
    await f();
    setBusy(false);
  };
  if (saved) {
    return (
      <>
        <AppText testID={`key-saved-${name}`}>{`${SECRET_LABELS[name]}: saved in this phone’s secure storage.`}</AppText>
        <Button label={`Delete ${SECRET_LABELS[name]}`} variant="danger" busy={busy} onPress={() => act(onDelete)} accessibilityHint="Removes the key and turns off the service that uses it" />
      </>
    );
  }
  return (
    <>
      <TextField label={SECRET_LABELS[name]} value={value} onChangeText={setValue} secret testID={`key-input-${name}`} hint="Stored only in this phone’s secure storage. Never in backups or logs." />
      <Button
        label="Save key"
        variant="secondary"
        disabled={!available || value.trim() === ''}
        disabledReason={available ? 'Paste the key first.' : 'Secure storage is not available on this device.'}
        busy={busy}
        onPress={() =>
          act(async () => {
            // A failed save keeps the pasted key so the learner can try again.
            if (await onSave(value)) setValue('');
          })
        }
      />
    </>
  );
}
