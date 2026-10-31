import { useState } from 'react';
import { GlossaryText } from '../../../components/lesson/GlossaryText';
import { AppText, Button, Card, CardHeader, ErrorState, ListRow, Notice, Screen, SkeletonState } from '../../../components/ui';
import { BookOpen, CircleCheck } from '../../../components/ui/icons';
import { usePsychLab, type PsychLab, type PsychScenario } from '../../../features/journal';
import { plainText } from '../../../shared/glossaryLinks';
import { errorText } from '../../../shared/errors';

const QUALITY = { helpful: 'Helpful', mixed: 'Partly helpful', harmful: 'Harmful' } as const;

/** Trading Psychology Lab (spec §21). Practice for trading decisions; not a mental-health assessment. */
export default function PsychologyLabScreen() {
  const lab = usePsychLab();
  const [open, setOpen] = useState<string | null>(null);
  if (lab.status === 'loading') return <SkeletonState rows={3} />;
  if (lab.status === 'error') return <ErrorState error={lab.error} />;
  const scenario = lab.data.scenarios.find((s) => s.id === open);
  return (
    <Screen testID="psychology-screen">
      <Notice title="About this lab" tone="info">
        These are practice situations about trading decisions. They are not a mental-health assessment. If trading is causing you distress, step away and talk to someone you trust.
      </Notice>
      {scenario ? (
        <ScenarioView key={scenario.id} scenario={scenario} lab={lab.data} onBack={() => setOpen(null)} />
      ) : (
        <Card>
          <CardHeader icon={BookOpen} title="Practice situations" />
          {lab.data.scenarios.map((s) => {
            const tries = lab.data.attempts.filter((a) => a.scenarioId === s.id);
            return (
              <ListRow
                key={s.id}
                testID="psych-row"
                icon={tries.length === 0 ? BookOpen : CircleCheck}
                iconTone={tries.length === 0 ? 'neutral' : 'brand'}
                title={s.title}
                subtitle={tries.length === 0 ? 'Not tried yet' : `Tried ${tries.length} time${tries.length === 1 ? '' : 's'} · last answer ${QUALITY[tries[0]!.quality].toLowerCase()}`}
                onPress={() => setOpen(s.id)}
              />
            );
          })}
        </Card>
      )}
    </Screen>
  );
}

function ScenarioView({ scenario, lab, onBack }: { readonly scenario: PsychScenario; readonly lab: PsychLab; readonly onBack: () => void }) {
  const [chosen, setChosen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const choose = async (id: string) => {
    if (chosen) return;
    const r = await lab.answer(scenario, id);
    if (!r.ok) return setError(errorText(r.error));
    setChosen(id);
  };
  return (
    <Card>
      <AppText variant="heading">{scenario.title}</AppText>
      <GlossaryText>{scenario.situation}</GlossaryText>
      <AppText variant="heading">{scenario.question}</AppText>
      {scenario.responses.map((r) => (
        <Card key={r.id} variant="tile" accent={chosen ? (r.quality === 'helpful' ? 'brand' : r.quality === 'harmful' ? 'warning' : 'textSecondary') : undefined}>
          {chosen ? <GlossaryText>{`${r.id === chosen ? 'Your answer: ' : ''}${r.text}`}</GlossaryText> : <Button label={plainText(r.text)} variant="secondary" onPress={() => void choose(r.id)} />}
          {chosen ? (
            <>
              <AppText variant="label" color={r.quality === 'helpful' ? 'brand' : r.quality === 'harmful' ? 'warning' : 'textSecondary'} testID={`psych-quality-${r.id}`}>{QUALITY[r.quality]}</AppText>
              <GlossaryText>{r.explanation}</GlossaryText>
            </>
          ) : null}
        </Card>
      ))}
      {error ? <AppText color="lossText">{error}</AppText> : null}
      {chosen ? (
        <Notice live title="Takeaway" tone="success">
          {scenario.takeaway}
        </Notice>
      ) : null}
      <Button label="Back to all situations" variant="secondary" onPress={onBack} />
    </Card>
  );
}
