import { router, Stack, useLocalSearchParams } from 'expo-router';
import { AppText, Card, CardHeader, EmptyState, Notice, Screen } from '../../components/ui';
import { CalendarDays } from '../../components/ui/icons';
import { DAY_NAMES, SAMPLE_EVENTS_NOTICE, useCalendarEvent } from '../../features/calendar';
import { MARKET_LABELS } from '../../shared/types';
import { StudyLinks } from '../../components/calendar/StudyLinks';

/** One kind of calendar event: what it measures, why it matters, how surprises are read, and its limits. */
export default function CalendarEventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useCalendarEvent(id ?? null);
  if (!t) return <Screen><EmptyState title="Event type not found" body="It may have been removed in a content update." actionLabel="Back" onAction={() => router.back()} /></Screen>;
  return (
    <Screen testID="calendar-event-screen">
      <Stack.Screen options={{ title: t.title }} />
      <AppText variant="title">{t.title}</AppText>
      <Section title="What it measures" body={t.measures} />
      <Section title="Why it matters" body={t.whyItMatters} />
      <Section title="Markets it can affect" body={t.affectedMarkets.map((m) => MARKET_LABELS[m]).join(', ')} />
      <Section title="Expectations" body={t.expectations} />
      <Section title="Surprises" body={t.surprises} />
      <Notice title="What it cannot tell you">{t.limits}</Notice>
      <StudyLinks glossaryIds={t.glossaryIds} lessonIds={t.lessonIds} scenarioIds={t.scenarioIds} />
      {t.samples.length > 0 ? (
        <Card>
          <CardHeader icon={CalendarDays} tone="info" title="Sample events" />
          <AppText variant="caption" color="textSecondary">{SAMPLE_EVENTS_NOTICE}</AppText>
          {t.samples.map((s) => (
            <AppText key={s.id} testID={`sample-${s.id}`}>{`${DAY_NAMES[s.day - 1] ?? ''} ${s.time} UTC · ${s.title} (${s.where}): ${s.details}`}</AppText>
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}

function Section({ title, body }: { readonly title: string; readonly body: string }) {
  return (
    <Card>
      <AppText variant="heading">{title}</AppText>
      <AppText>{body}</AppText>
    </Card>
  );
}
