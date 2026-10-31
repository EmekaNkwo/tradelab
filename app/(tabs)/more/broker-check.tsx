import { router } from 'expo-router';
import { useState } from 'react';
import { AppText, Button, Card, ChoiceChips, Notice, Screen } from '../../../components/ui';
import { BROKER_CHECK_REMINDER, BROKER_CHECK_STEPS } from '../../../features/plan';
import { useStrategyContent } from '../../../features/strategies';
import { canOpen } from '../../../shared/routeAccess';

const BROKER_LESSON = 'fx-broker-check';

/** A step list for checking a broker on its regulator's own register (spec §20). Nothing is saved. */
export default function BrokerCheckScreen() {
  const [done, setDone] = useState<string[]>([]);
  const missing = BROKER_CHECK_STEPS.length - done.length;
  const hasLesson = useStrategyContent().lessonTitle(BROKER_LESSON) !== null;
  return (
    <Screen testID="broker-check-screen">
      <Notice title="Check before you send anything" tone="warning">
        Never send money or identity documents to a firm before checking it. Examples of regulators include the FCA, ASIC and CySEC; each country has its own.
      </Notice>
      <Card>
        <ChoiceChips label="Steps I have done" options={BROKER_CHECK_STEPS.map((s) => ({ value: s.id, label: s.text }))} selected={done} onChange={setDone} />
        <AppText accessibilityLiveRegion="polite" testID="broker-check-status">
          {missing === 0 ? 'Every step is done. Keep a note of what you found.' : `${missing} ${missing === 1 ? 'step' : 'steps'} not done. Do not deposit or share documents until you can tick them all.`}
        </AppText>
      </Card>
      <AppText color="textSecondary">{BROKER_CHECK_REMINDER}</AppText>
      {hasLesson && canOpen('/lesson/[id]') ? (
        <Button label="Read the lesson on checking a broker" variant="secondary" onPress={() => router.push({ pathname: '/lesson/[id]', params: { id: BROKER_LESSON } })} />
      ) : null}
    </Screen>
  );
}
