import { router } from 'expo-router';
import { useState } from 'react';
import { DRILL_INFO, SCENARIO_LABELS, type ScenarioKind } from '../../features/practice';
import { useBringReviewsForward, type PracticeStep } from '../../features/progress';
import { AppText, Button } from '../ui';
import { canOpen } from '../../shared/routeAccess';

const scenarioLabel = (s: string) => SCENARIO_LABELS[s as ScenarioKind] ?? s;
const drillLabel = (k: string) => DRILL_INFO[k as keyof typeof DRILL_INFO]?.title ?? k;

function stepLabel(step: PracticeStep, i: number): string {
  const n = `${i + 1}.`;
  switch (step.kind) {
    case 'review':
      return `${n} Review the ${step.questionIds.length} ${step.questionIds.length === 1 ? 'question' : 'questions'} you missed`;
    case 'lesson':
      return `${n} Reread "${step.title}"`;
    case 'lab':
      return `${n} Study "${step.title}" in the lab`;
    case 'drill':
      return `${n} Practise the ${drillLabel(step.drillKind)} drill`;
    case 'replay':
      return `${n} Replay a simulated ${scenarioLabel(step.scenario).toLowerCase()} chart`;
    case 'psych':
      return `${n} Work through situations in the Psychology Lab`;
  }
}

/** The screen a step opens; used to leave out steps whose feature is off. */
function stepRoute(step: PracticeStep): string {
  switch (step.kind) {
    case 'review':
      return '/review';
    case 'lesson':
      return '/lesson/[id]';
    case 'lab':
      return '/labs/concept/[id]';
    case 'drill':
      return '/practice/drill';
    case 'replay':
      return '/practice/replay';
    case 'psych':
      return '/journal/psychology';
  }
}

/** A recommendation's steps (spec §23): lesson → psychology lab, drill or lab → replay; missed questions go to the spaced review. */
export function PracticePath({ steps }: { readonly steps: readonly PracticeStep[] }) {
  const { bring, busy } = useBringReviewsForward();
  const [failed, setFailed] = useState(false);
  const open = async (step: PracticeStep) => {
    switch (step.kind) {
      case 'review': {
        const done = await bring(step.questionIds);
        setFailed(!done);
        if (done) router.push('/review');
        return;
      }
      case 'lesson':
        return router.push({ pathname: '/lesson/[id]', params: { id: step.lessonId } });
      case 'lab':
        return router.push({ pathname: '/labs/concept/[id]', params: { id: step.conceptId } });
      case 'drill':
        return router.push({ pathname: '/practice/drill', params: { kind: step.drillKind } });
      case 'replay':
        return router.push({ pathname: '/practice/replay', params: { scenario: step.scenario } });
      case 'psych':
        return router.push('/journal/psychology');
    }
  };
  const shown = steps.filter((s) => canOpen(stepRoute(s)));
  return (
    <>
      {shown.map((s, i) => (
        <Button key={`${s.kind}-${i}`} label={stepLabel(s, i)} variant="secondary" disabled={busy} onPress={() => void open(s)} />
      ))}
      {failed ? <AppText color="lossText">That did not work. Please try again.</AppText> : null}
    </>
  );
}
