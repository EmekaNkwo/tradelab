import { useMemo } from 'react';
import { View } from 'react-native';
import { SESSION_COLORS, SessionsDial } from '../../../components/tools/SessionsDial';
import { AppText, Card, CardHeader, ListRow, Notice, Screen } from '../../../components/ui';
import { Clock, GitBranch } from '../../../components/ui/icons';
import { dayAndTime, SESSIONS, sessionsDialView, useSessionsClock, type SessionId } from '../../../features/plan';
import { useTheme } from '../../../theme';

const cityOf = (id: string) => SESSIONS.find((s) => s.id === id)?.city ?? id;

/** The session's colour dot, matching its ring on the dial. Decoration: the row says the city in words. */
function SessionDot({ id }: { readonly id: SessionId }) {
  const { colors, radii } = useTheme();
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: 40, alignItems: 'center' }}>
      <View style={{ width: 14, height: 14, borderRadius: radii.pill, backgroundColor: colors[SESSION_COLORS[id]] }} />
    </View>
  );
}

/**
 * Market sessions clock (spec §20). Times are shown in the learner's time
 * zone; the session hours are a common convention, not official hours.
 */
export default function SessionsScreen() {
  const { clock, nowMs, timeZone } = useSessionsClock();
  const zone = timeZone;
  const dial = useMemo(() => sessionsDialView(clock, nowMs, zone), [clock, nowMs, zone]);
  return (
    <Screen testID="sessions-screen">
      <Notice title="Approximate hours" tone="info">
        {`Forex trades around the clock on weekdays. These sessions use 08:00–17:00 in each city, which is a common rule of thumb, not official hours. Times are in your time zone (${zone}). Daylight saving changes them during the year.`}
      </Notice>
      <Card>
        <CardHeader icon={Clock} tone="info" title="Session clock" />
        <AppText testID="sessions-now" variant="label" tabular>{`Now: ${dayAndTime(nowMs, zone)}`}</AppText>
        <SessionsDial view={dial} testID="sessions-dial" />
      </Card>
      {clock.weekend ? (
        <Notice title="Weekend: the forex market is closed" tone="warning">
          In this app the week closes on Friday at 17:00 New York time and opens again on Sunday at 17:00 New York time. Prices can open far from where they closed.
        </Notice>
      ) : null}
      <Card style={{ gap: 0 }}>
        {clock.statuses.map((s) => (
          <ListRow
            key={s.session.id}
            testID={`session-${s.session.id}`}
            leading={<SessionDot id={s.session.id} />}
            title={s.session.city}
            subtitle={`${s.open ? `Open until ${dayAndTime(s.window.closeMs, zone)}` : `Opens ${dayAndTime(s.window.openMs, zone)}`} · Home currencies: ${s.session.currencies.join(', ')}`}
            value={s.open ? 'Open' : 'Closed'}
          />
        ))}
      </Card>
      <Card>
        <CardHeader icon={GitBranch} tone="neutral" title="Overlaps" />
        <AppText color="textSecondary">When two sessions are open together, pairs with both currencies are often more active.</AppText>
        {clock.overlaps.map((o) => (
          <AppText key={o.sessions.join('-')} testID={`overlap-${o.sessions.join('-')}`} tabular>
            {`${cityOf(o.sessions[0])} and ${cityOf(o.sessions[1])}: ${dayAndTime(o.window.openMs, zone)} to ${dayAndTime(o.window.closeMs, zone)}${o.window.openMs <= nowMs ? ' (now)' : ''}`}
          </AppText>
        ))}
      </Card>
    </Screen>
  );
}
