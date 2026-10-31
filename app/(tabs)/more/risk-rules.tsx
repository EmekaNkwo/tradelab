import { useState } from 'react';
import { AppText, Button, Card, ErrorState, LoadingState, Notice, Screen, SegmentedControl, TextField } from '../../../components/ui';
import { EXAMPLE_RISK_RULES, invalidRuleFields, RISK_RULE_LIMITS, type RiskRules } from '../../../features/paper';
import { useSettings, useUpdateSettings } from '../../../features/settings';
import { isTypedNumber } from '../../../shared/decimal';
import { errorText } from '../../../shared/errors';

type NumericRule = keyof typeof RISK_RULE_LIMITS;

const LABELS: Readonly<Record<NumericRule, string>> = {
  maxRiskPerTradePercent: 'Largest risk per trade (% of equity)',
  maxDailyLossPercent: 'Stop for the day after losing (% of the day’s start)',
  maxOpenPositions: 'Most open positions at once',
  maxMarginUsePercent: 'Most margin in use (% of equity)',
  reviewAfterLosses: 'Pause and review after this many losses in a row',
};

/** NaN for anything but a plainly typed number (Number() would accept "0x5"), so the range check rejects it. */
const toRuleNumber = (t: string) => {
  const v = t.trim().replace(',', '.');
  return isTypedNumber(v) ? Number(v) : Number.NaN;
};

const YES_NO = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
] as const;

/** The learner's own risk rules (spec §19). Defaults are learning examples, not recommendations. */
export default function RiskRulesScreen() {
  const settings = useSettings();
  // Kept here: the editor remounts when saved rules change, and the message must survive that.
  const [message, setMessage] = useState<string | null>(null);
  if (settings.status === 'loading') return <LoadingState />;
  if (settings.status === 'error') return <ErrorState error={settings.error} onRetry={settings.reload} />;
  return <Editor key={JSON.stringify(settings.data.riskRules)} rules={settings.data.riskRules} message={message} onMessage={setMessage} />;
}

interface EditorProps {
  readonly rules: RiskRules;
  readonly message: string | null;
  readonly onMessage: (message: string) => void;
}

function Editor({ rules, message, onMessage: setMessage }: EditorProps) {
  const update = useUpdateSettings();
  const [draft, setDraft] = useState<Record<NumericRule, string>>(
    () => Object.fromEntries((Object.keys(LABELS) as NumericRule[]).map((k) => [k, String(rules[k])])) as Record<NumericRule, string>,
  );
  const [requireStop, setRequireStop] = useState(rules.requireStop);

  const save = async (next: RiskRules) => {
    const bad = invalidRuleFields(next);
    if (bad.length > 0) {
      setMessage(bad.map((k) => `${LABELS[k]} must be between ${RISK_RULE_LIMITS[k].min} and ${RISK_RULE_LIMITS[k].max}.`).join(' '));
      return;
    }
    const r = await update({ riskRules: next });
    setMessage(r.ok ? 'Rules saved. New paper orders are checked against them.' : errorText(r.error));
  };
  const fromDraft = (): RiskRules => ({
    ...(Object.fromEntries((Object.keys(LABELS) as NumericRule[]).map((k) => [k, toRuleNumber(draft[k])])) as Record<NumericRule, number>),
    requireStop,
  });

  return (
    <Screen testID="risk-rules-screen">
      <Notice title="These are your rules" tone="info">
        The starting values are learning examples, not advice and not right for everyone. Pick limits you could keep through a long losing streak. The app never suggests a bigger size to win back a loss.
      </Notice>
      <Card>
        {(Object.keys(LABELS) as NumericRule[]).map((k) => (
          <TextField
            key={k}
            label={LABELS[k]}
            value={draft[k]}
            onChangeText={(t) => setDraft((d) => ({ ...d, [k]: t }))}
            keyboardType="decimal-pad"
            hint={`Between ${RISK_RULE_LIMITS[k].min} and ${RISK_RULE_LIMITS[k].max}. Example: ${EXAMPLE_RISK_RULES[k]}`}
            testID={`rule-${k}`}
          />
        ))}
        <SegmentedControl label="Every trade needs a stop loss" options={YES_NO} value={requireStop ? 'yes' : 'no'} onChange={(v) => setRequireStop(v === 'yes')} />
        <Button label="Save my rules" onPress={() => void save(fromDraft())} />
        <Button label="Go back to the examples" variant="secondary" onPress={() => void save(EXAMPLE_RISK_RULES)} />
      </Card>
      {message ? (
        <AppText accessibilityLiveRegion="polite" testID="risk-rules-message">
          {message}
        </AppText>
      ) : null}
    </Screen>
  );
}
