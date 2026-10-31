import { router } from 'expo-router';
import { useState } from 'react';
import { AppText, Button, Card, CardHeader, ChoiceChips, ErrorState, InstrumentIcon, ListRow, LoadingState, Notice, Screen, TextField } from '../../../../components/ui';
import { ChartCandlestick, Plus } from '../../../../components/ui/icons';
import {
  baseSymbol,
  DEFAULT_PAPER_BALANCE,
  moneyText,
  PAPER_BALANCES,
  PAPER_LABEL,
  PAPER_TIMEFRAMES,
  PRACTICE_INSTRUMENTS,
  practiceInstrument,
  useCreatePaperAccount,
  usePaperAccounts,
  type Timeframe,
} from '../../../../features/paper';
import { SCENARIO_LABELS, type ScenarioKind } from '../../../../features/practice';
import { errorText } from '../../../../shared/errors';
import { MARKET_LABELS } from '../../../../shared/types';


export default function PaperAccountsScreen() {
  const accounts = usePaperAccounts();
  const create = useCreatePaperAccount();
  const [name, setName] = useState('');
  const [instrumentId, setInstrumentId] = useState(PRACTICE_INSTRUMENTS[0]!.id);
  const [kind, setKind] = useState<ScenarioKind>('range');
  const [timeframe, setTimeframe] = useState<Timeframe>('H1');
  const [balance, setBalance] = useState(DEFAULT_PAPER_BALANCE);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const instrument = practiceInstrument(instrumentId);

  const start = async () => {
    if (saving) return;
    setSaving(true);
    const r = await create({ name: name.trim() || `${instrument?.name ?? 'Practice'} account`, instrumentId, scenarioKind: kind, timeframe, balance });
    setSaving(false);
    if (!r.ok) return setError(errorText(r.error));
    setError(null);
    setName('');
    router.push({ pathname: '/practice/paper/[id]', params: { id: r.value.id } });
  };

  return (
    <Screen testID="paper-accounts-screen">
      <Notice title={PAPER_LABEL} tone="info">
        Simulated money on simulated charts. Each market uses example terms so you can feel how its mechanics differ; they are not any broker&apos;s real terms.
      </Notice>
      <Card testID="paper-accounts">
        <CardHeader icon={ChartCandlestick} title="Your practice accounts" badge="paper" />
        {accounts.status === 'loading' ? <LoadingState /> : null}
        {accounts.status === 'error' ? <ErrorState error={accounts.error} onRetry={accounts.reload} /> : null}
        {accounts.status === 'success' && accounts.data.length === 0 ? <AppText color="textSecondary">No accounts yet. Start one below.</AppText> : null}
        {accounts.status === 'success'
          ? accounts.data.map((a) => (
              <ListRow
                key={a.id}
                testID="paper-account-row"
                leading={<InstrumentIcon symbol={baseSymbol(practiceInstrument(a.instrumentId)?.symbol ?? a.instrumentId)} size={40} />}
                title={a.name}
                subtitle={`${practiceInstrument(a.instrumentId)?.symbol ?? a.instrumentId} · ${a.state.history.length} trades`}
                value={moneyText(a.state.balance)}
                valueIsMoney
                onPress={() => router.push({ pathname: '/practice/paper/[id]', params: { id: a.id } })}
              />
            ))
          : null}
      </Card>
      <Card>
        <CardHeader icon={Plus} title="Start a new account" />
        <TextField label="Name (optional)" value={name} onChangeText={setName} maxLength={40} testID="paper-name" />
        <ChoiceChips
          label="Market"
          single
          options={PRACTICE_INSTRUMENTS.map((i) => ({ value: i.id, label: `${MARKET_LABELS[i.market]}: ${i.symbol}` }))}
          selected={[instrumentId]}
          onChange={(v) => v[0] && setInstrumentId(v[0])}
        />
        {instrument ? <AppText color="textSecondary">{instrument.notes[0]}</AppText> : null}
        <ChoiceChips label="Scenario" single options={(Object.keys(SCENARIO_LABELS) as ScenarioKind[]).map((k) => ({ value: k, label: SCENARIO_LABELS[k] }))} selected={[kind]} onChange={(v) => v[0] && setKind(v[0])} />
        <ChoiceChips label="Timeframe" single options={PAPER_TIMEFRAMES.map((t) => ({ value: t, label: t }))} selected={[timeframe]} onChange={(v) => v[0] && setTimeframe(v[0])} />
        <ChoiceChips label="Starting balance (USD)" single options={PAPER_BALANCES.map((b) => ({ value: b, label: b }))} selected={[balance]} onChange={(v) => v[0] && setBalance(v[0])} />
        {error ? <AppText color="lossText">{error}</AppText> : null}
        <Button label="Start paper trading" onPress={start} busy={saving} />
      </Card>
    </Screen>
  );
}
