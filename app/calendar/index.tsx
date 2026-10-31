import { router } from 'expo-router';
import { AppText, Button, Card, CardHeader, ListRow, Notice, Screen } from '../../components/ui';
import { BookOpen, CalendarDays, Newspaper } from '../../components/ui/icons';
import { SAMPLE_EVENTS_NOTICE, useCalendar } from '../../features/calendar';
import { canOpen } from '../../shared/routeAccess';

/** Market calendar (spec §25): what each kind of event is, and a fictional sample week. */
export default function CalendarScreen() {
  const { types, week } = useCalendar();
  return (
    <Screen testID="calendar-screen">
      <AppText variant="title">Market calendar</AppText>
      <Notice title="Sample events" tone="warning">
        {SAMPLE_EVENTS_NOTICE}
      </Notice>
      <Card>
        <CardHeader icon={CalendarDays} tone="info" title="A sample week" />
        {week.map((row) => (
          <ListRow key={row.key} icon={CalendarDays} iconTone="info" testID={`sample-${row.sample.id}`} title={`${row.dayName} ${row.sample.time} UTC · ${row.sample.title}`} subtitle={`${row.sample.where} · ${row.eventTitle}`} onPress={() => router.push({ pathname: '/calendar/[id]', params: { id: row.eventTypeId } })} />
        ))}
      </Card>
      <Card>
        <CardHeader icon={BookOpen} title="Kinds of events" />
        {types.map((t) => (
          <ListRow key={t.id} icon={BookOpen} testID={`event-type-${t.id}`} title={t.title} subtitle={t.measures} onPress={() => router.push({ pathname: '/calendar/[id]', params: { id: t.id } })} />
        ))}
      </Card>
      {canOpen('/news') ? (
        <Card>
          <CardHeader icon={Newspaper} tone="info" title="Saw a headline?" />
          <AppText color="textSecondary">Type or paste it into News to Learning to turn it into study questions.</AppText>
          <Button label="Open News to Learning" variant="secondary" onPress={() => router.push('/news')} />
        </Card>
      ) : null}
    </Screen>
  );
}
