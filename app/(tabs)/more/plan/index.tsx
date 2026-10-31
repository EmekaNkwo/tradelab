import { router } from 'expo-router';
import { useState } from 'react';
import { AppText, Button, Card, CardHeader, EmptyState, ErrorState, LoadingState, Notice, Screen } from '../../../../components/ui';
import { GitBranch } from '../../../../components/ui/icons';
import { changedFields, PLAN_FIELD_LABELS, SESSIONS, useApplyPlanLimits, usePlanVersions, type PlanVersion, type TradingPlan } from '../../../../features/plan';
import { useSettings } from '../../../../features/settings';
import { deviceTimeZone, formatInTimeZone } from '../../../../shared/time';
import { errorText } from '../../../../shared/errors';

const sessionName = (id: string) => SESSIONS.find((s) => s.id === id)?.city ?? id;

function PlanPage({ plan }: { readonly plan: TradingPlan }) {
  const rows: readonly [keyof TradingPlan, string][] = [
    ['instruments', plan.instruments.join(', ')],
    ['sessions', plan.sessions.map(sessionName).join(', ')],
    ['timeframes', plan.timeframes.join(', ')],
    ['entryRules', plan.entryRules],
    ['exitRules', plan.exitRules],
    ['stopRules', plan.stopRules],
    ['targetRules', plan.targetRules || 'Not set'],
    ['riskPerTradePercent', `${plan.riskPerTradePercent}%`],
    ['dailyLossPercent', `${plan.dailyLossPercent}%`],
    ['maxTradesPerDay', String(plan.maxTradesPerDay)],
    ['stopTradingWhen', plan.stopTradingWhen],
    ['notes', plan.notes || 'None'],
  ];
  return (
    <Card>
      {rows.map(([field, value]) => (
        <AppText key={field} testID={`plan-${field}`}>
          <AppText variant="label">{PLAN_FIELD_LABELS[field]}: </AppText>
          {value}
        </AppText>
      ))}
    </Card>
  );
}

function History({ versions }: { readonly versions: readonly PlanVersion[] }) {
  const settings = useSettings();
  const zone = settings.status === 'success' ? settings.data.timeZone : deviceTimeZone();
  return (
    <Card>
      <CardHeader icon={GitBranch} tone="neutral" title="Version history" />
      {versions.map((v, k) => {
        const older = versions[k + 1];
        const changed = older ? changedFields(older.plan, v.plan).map((f) => PLAN_FIELD_LABELS[f]) : [];
        return (
          <AppText key={v.version} testID={`plan-version-${v.version}`}>
            Version {v.version} · {formatInTimeZone(v.createdAt, zone)} · {older ? (changed.length > 0 ? `changed: ${changed.join(', ')}` : 'no changes') : 'first version'}
          </AppText>
        );
      })}
    </Card>
  );
}

/** The learner's one-page trading plan (spec §20), with every saved version. */
export default function TradingPlanScreen() {
  const versions = usePlanVersions();
  const applyLimits = useApplyPlanLimits();
  const [message, setMessage] = useState<string | null>(null);
  if (versions.status === 'loading') return <LoadingState />;
  if (versions.status === 'error') return <ErrorState error={versions.error} onRetry={versions.reload} />;
  const latest = versions.data[0];
  if (!latest) {
    return (
      <Screen testID="plan-screen">
        <EmptyState
          title="No trading plan yet"
          body="A plan says what you trade, when, how you enter and exit, and how much you risk. Writing it down lets you check each trade against it."
          actionLabel="Write my plan"
          onAction={() => router.push('/more/plan/edit')}
        />
      </Screen>
    );
  }
  const copy = async () => {
    const r = await applyLimits(latest.plan);
    setMessage(r.ok ? 'Your risk rules now use the plan’s risk per trade and daily loss limit.' : errorText(r.error));
  };
  return (
    <Screen testID="plan-screen">
      <Notice title={`My trading plan · version ${latest.version}`} tone="info">
        Your own plan for demo and paper practice. The numbers are yours; the app only checks they are in range. It is not advice.
      </Notice>
      <PlanPage plan={latest.plan} />
      <Button label="Change my plan" onPress={() => router.push('/more/plan/edit')} />
      <Button label="Use these limits in my risk rules" variant="secondary" onPress={() => void copy()} />
      {message ? (
        <AppText accessibilityLiveRegion="polite" testID="plan-message">
          {message}
        </AppText>
      ) : null}
      <History versions={versions.data} />
    </Screen>
  );
}
