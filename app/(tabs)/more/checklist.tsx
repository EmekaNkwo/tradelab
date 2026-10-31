import { useState } from 'react';
import { PreTradeChecklist } from '../../../components/plan/PreTradeChecklist';
import { AppText, Button, Card, Notice, Screen, SegmentedControl } from '../../../components/ui';
import { evaluateChecklist, useOpenMetaTrader, type ChecklistAnswers, type MetaTraderChoice, type OpenOutcome } from '../../../features/plan';

const APPS = [
  { value: 'mt5', label: 'MetaTrader 5' },
  { value: 'mt4', label: 'MetaTrader 4' },
] as const;

const OUTCOME_TEXT: Readonly<Record<Exclude<OpenOutcome, 'opened'>, string>> = {
  not_installed: 'MetaTrader is not installed on this phone.',
  unsupported: 'This phone cannot open MetaTrader from here. Open it yourself.',
  failed: 'MetaTrader could not be opened. Open it yourself.',
};

/**
 * Pre-trade checklist before a demo trade in MetaTrader (spec §20). The app
 * only opens MetaTrader; it never places trades or sees the account.
 */
export default function ChecklistScreen() {
  const { open, openStore } = useOpenMetaTrader();
  const [answers, setAnswers] = useState<ChecklistAnswers>({});
  const [app, setApp] = useState<MetaTraderChoice>('mt5');
  const [outcome, setOutcome] = useState<OpenOutcome | null>(null);
  const done = evaluateChecklist(answers).complete;
  return (
    <Screen testID="checklist-screen">
      <Notice title="For demo practice" tone="info">
        Use this before a trade on your MetaTrader demo account. The answers are not saved and nothing is sent anywhere.
      </Notice>
      <Card>
        <PreTradeChecklist answers={answers} onAnswer={(id, a) => setAnswers((x) => ({ ...x, [id]: a }))} />
      </Card>
      <Card>
        <SegmentedControl label="App" options={APPS} value={app} onChange={setApp} />
        <Button
          label="Open MetaTrader"
          disabled={!done}
          disabledReason="Answer every question first."
          onPress={() => void open(app).then(setOutcome)}
        />
        {outcome && outcome !== 'opened' ? (
          <AppText accessibilityLiveRegion="polite" testID="checklist-open-outcome">
            {OUTCOME_TEXT[outcome]}
          </AppText>
        ) : null}
        {outcome === 'not_installed' ? <Button label="Get MetaTrader from the store" variant="secondary" onPress={() => void openStore(app).then((ok) => { if (!ok) setOutcome('failed'); })} /> : null}
      </Card>
      <Button label="Start again" variant="secondary" onPress={() => { setAnswers({}); setOutcome(null); }} />
    </Screen>
  );
}
