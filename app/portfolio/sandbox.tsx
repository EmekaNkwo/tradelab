import { useState } from 'react';
import { LineChart } from '../../components/backtest/LineChart';
import { Stepper } from '../../components/backtest/Stepper';
import { AppText, Card, CardHeader, MoneyText, Notice, Screen, TextField } from '../../components/ui';
import { CircleAlert, Target } from '../../components/ui/icons';
import { formatUsd, SANDBOX_LIMITS, useInvestingSandbox } from '../../features/backtest';
import { errorText } from '../../shared/errors';

/** Long-term investing sandbox (spec §18): an equal-weight basket against single-company picks, on made-up prices. */
export default function SandboxScreen() {
  const { input, setInput, result } = useInvestingSandbox();
  const [seedText, setSeedText] = useState(String(input.seed));
  const onSeed = (t: string) => {
    setSeedText(t);
    if (/^\d{1,9}$/.test(t.trim())) setInput({ ...input, seed: Number(t.trim()) });
  };
  return (
    <Screen testID="sandbox-screen">
      <AppText variant="title">Investing sandbox</AppText>
      <Notice title="Simulated prices" tone="info">These companies and their prices are made up by a random model. Nothing here is real history, a forecast, or a return you could expect.</Notice>
      <Card>
        <Stepper label="Companies" value={input.companies} step={1} min={SANDBOX_LIMITS.companies.min} max={SANDBOX_LIMITS.companies.max} onChange={(companies) => setInput({ ...input, companies })} testID="sandbox-companies" />
        <Stepper label="Years" value={input.years} step={1} min={SANDBOX_LIMITS.years.min} max={SANDBOX_LIMITS.years.max} onChange={(years) => setInput({ ...input, years })} />
        <Stepper label="Starting amount (USD)" value={input.startAmount} step={1000} min={1000} max={1_000_000} onChange={(startAmount) => setInput({ ...input, startAmount })} format={(v) => v.toLocaleString('en-US')} />
        <TextField label="Seed" value={seedText} onChangeText={onSeed} keyboardType="numbers-and-punctuation" hint="Change it to see another made-up market." error={/^\d{1,9}$/.test(seedText.trim()) ? null : 'Use a whole number'} testID="sandbox-seed" />
      </Card>
      {!result.ok ? <Notice live title="Check the settings" tone="warning">{errorText(result.error)}</Notice> : null}
      {result.ok ? (
        <>
          <Card>
            <CardHeader title="Simulated result" badge="simulated" />
            <LineChart title="Equal-weight basket" values={result.value.basket} summary={`${formatUsd(input.startAmount)} became ${formatUsd(result.value.basketFinal)} in this simulation`} testID="sandbox-basket" />
          </Card>
          <Card>
            <CardHeader icon={Target} title="If you had picked one company instead" badge="simulated" />
            <AppText testID="sandbox-beat">{`${result.value.beatBasket} of ${input.companies} single companies ended above the basket; ${input.companies - result.value.beatBasket} ended below it.`}</AppText>
            <AppText>
              {'Best single pick: '}
              <MoneyText testID="sandbox-best">{formatUsd(result.value.bestSingle)}</MoneyText>
            </AppText>
            <AppText>
              {'Typical (median) single pick: '}
              <MoneyText testID="sandbox-median">{formatUsd(result.value.medianSingle)}</MoneyText>
            </AppText>
            <AppText>
              {'Worst single pick: '}
              <MoneyText testID="sandbox-worst">{formatUsd(result.value.worstSingle)}</MoneyText>
            </AppText>
            <AppText variant="caption" color="textSecondary">The basket always ends at the average of the companies. A single pick can do far better or far worse, and you do not know in advance which one it will be: that spread is what diversification removes.</AppText>
          </Card>
          <Card>
            <CardHeader icon={CircleAlert} tone="info" title="Assumptions" />
            {result.value.assumptions.map((a) => (
              <AppText key={a} variant="caption" color="textSecondary">{`• ${a}`}</AppText>
            ))}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}
