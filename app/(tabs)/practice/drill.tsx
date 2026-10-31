import { useLocalSearchParams } from 'expo-router';
import { ChartHeader } from '../../../components/chart/ChartHeader';
import { PriceChart } from '../../../components/chart/PriceChart';
import { SimulatedNotice } from '../../../components/practice/SimulatedNotice';
import { AppText, Button, Card, EmptyState, Notice, Screen } from '../../../components/ui';
import { DRILL_INFO, DRILL_KINDS, useDrill, type DrillKind } from '../../../features/practice';

export default function DrillScreen() {
  const { kind } = useLocalSearchParams<{ kind?: string }>();
  const valid = DRILL_KINDS.find((k) => k === kind);
  if (!valid) {
    return (
      <Screen>
        <EmptyState title="Drill not found" body="Go back to Practice and choose a drill." />
      </Screen>
    );
  }
  return <DrillRunner key={valid} kind={valid} />;
}

function DrillRunner({ kind }: { readonly kind: DrillKind }) {
  const d = useDrill(kind);
  return (
    <Screen testID="drill-screen">
      <ChartHeader title={DRILL_INFO[kind].title} badge="simulated" testID="drill-header" />
      <SimulatedNotice />
      {/* Keyed so the chart starts at the latest candle for each new drill. */}
      <PriceChart key={d.question.seed} candles={d.candles} followLatest testID="drill-chart" />
      <Card>
        <AppText variant="heading">{d.question.prompt}</AppText>
        {d.question.options.map((o) => (
          <Button
            key={o.id}
            label={`${d.chosen === o.id ? '✓ ' : ''}${o.text}`}
            variant={d.chosen === o.id ? 'primary' : 'secondary'}
            onPress={() => void d.answer(o.id)}
            disabled={d.chosen !== null}
          />
        ))}
        {d.chosen === null ? <AppText color="textSecondary">Commit to an answer first. What happens next is shown after.</AppText> : null}
      </Card>
      {d.result ? (
        <Notice
          live
          title={d.result.correct ? 'Good call' : d.result.neutral ? 'A reasonable choice' : 'Worth another look'}
          tone={d.result.correct ? 'success' : d.result.neutral ? 'info' : 'warning'}
        >
          {d.result.feedback.map((line) => (
            <AppText key={line}>{line}</AppText>
          ))}
        </Notice>
      ) : null}
      {d.saveError ? <AppText color="lossText">Your answer could not be saved, but the feedback above still applies.</AppText> : null}
      {d.chosen ? <Button label="Another one" onPress={d.another} /> : null}
    </Screen>
  );
}
