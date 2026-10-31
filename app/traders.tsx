import { router } from 'expo-router';
import { Card, CardHeader, EmptyState, ListRow, Notice, Screen } from '../components/ui';
import { UserRound } from '../components/ui/icons';
import { useStrategyContent } from '../features/strategies';

/**
 * Famous traders (spec §15.2). Only pages a person has researched and
 * reviewed against reviewed sources ever reach this list (spec §15.1).
 */
export default function TradersScreen() {
  const traders = useStrategyContent().traders();
  return (
    <Screen testID="traders-screen">
      <Notice title="Checked by a person" tone="info">
        Every page here was researched and checked against its sources by a person. What the sources document is kept apart from later interpretations, and claims that could not be verified are marked as such.
      </Notice>
      {traders.length === 0 ? <EmptyState title="No trader pages yet" body="Trader pages appear once their sources have been reviewed." actionLabel="Back" onAction={() => router.back()} /> : null}
      {traders.length > 0 ? (
        <Card>
          <CardHeader icon={UserRound} title="Traders" />
          {traders.map((t) => (
            <ListRow key={t.id} icon={UserRound} testID={`trader-${t.id}`} title={t.name} subtitle={t.knownFor} onPress={() => router.push({ pathname: '/trader/[id]', params: { id: t.id } })} />
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}
