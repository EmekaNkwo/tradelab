import { router } from 'expo-router';
import { useState } from 'react';
import { AppText, Card, ListRow, RecordsNotice, Screen, SegmentedControl } from '../../components/ui';
import { useLabContent, useLabRecords } from '../../features/labs';

const pct = (n: number) => `${Math.round(n * 100)}%`;
const CATEGORIES = [
  { value: 'macro', label: 'Economy' },
  { value: 'commodity', label: 'Commodities' },
] as const;

/** "What could happen?" scenarios (spec §10.4, §12): actual vs expected vs priced in. */
export default function ScenariosScreen() {
  const content = useLabContent();
  const records = useLabRecords();
  const [category, setCategory] = useState<'macro' | 'commodity'>('macro');
  return (
    <Screen testID="scenarios-screen">
      <RecordsNotice queries={[records]} />
      <AppText color="textSecondary">
        Fictional situations to reason about. Choose every reaction that could plausibly follow. More than one can, and none of them is a forecast.
      </AppText>
      <SegmentedControl label="Kind of scenario" options={CATEGORIES} value={category} onChange={setCategory} />
      <Card>
        {content.scenarios(category).map((s) => {
          const r = records.status === 'success' ? records.data.get(s.id) : undefined;
          return (
            <ListRow
              key={s.id}
              testID={`scenario-${s.id}`}
              title={s.title}
              subtitle={r ? `Best ${pct(r.best)}, latest ${pct(r.latest)}` : 'Not tried yet'}
              onPress={() => router.push({ pathname: '/labs/scenario/[id]', params: { id: s.id } })}
            />
          );
        })}
      </Card>
    </Screen>
  );
}
