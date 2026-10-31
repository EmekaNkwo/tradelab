import { router } from 'expo-router';
import { AppText, Card, ListRow, RecordsNotice, Screen } from '../../components/ui';
import { useLabContent, useLabRecords } from '../../features/labs';

const pct = (n: number) => `${Math.round(n * 100)}%`;

/** Penny Stock Red Flag Detector (spec §10.3): pick a fictional profile to examine. */
export default function RedFlagsScreen() {
  const content = useLabContent();
  const records = useLabRecords();
  const record = (id: string) => (records.status === 'success' ? (records.data.get(id) ?? null) : null);
  return (
    <Screen testID="red-flags-screen">
      <RecordsNotice queries={[records]} />
      <AppText color="textSecondary">
        Each case is a fictional company. Find the warning signs, then see what to check before doing anything. Often the best decision with a penny stock is to stay out.
      </AppText>
      <Card>
        {content.redFlagCases().map((c) => {
          const r = record(c.id);
          return (
            <ListRow
              key={c.id}
              testID={`red-flag-case-${c.id}`}
              title={c.title}
              subtitle={r ? `${c.company} · best ${pct(r.best)}, latest ${pct(r.latest)}` : `${c.company} · not tried yet`}
              onPress={() => router.push({ pathname: '/labs/red-flag/[id]', params: { id: c.id } })}
            />
          );
        })}
      </Card>
    </Screen>
  );
}
