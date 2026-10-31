import { router } from 'expo-router';
import { AppText, Card, ErrorState, ListRow, LoadingState, Notice, Screen } from '../../../components/ui';
import { CircleCheck, MonitorSmartphone } from '../../../components/ui/icons';
import { useMtTaskList } from '../../../features/metatrader';

export default function MetaTraderTasksScreen() {
  const tasks = useMtTaskList();
  return (
    <Screen testID="mt-tasks-screen">
      <Notice title="Demo accounts only">
        <AppText>
          TradeLab opens MetaTrader but cannot see inside it. Each task guides you step by step, and you confirm when you have done it. Never deposit money or use a real account for these tasks.
        </AppText>
      </Notice>
      {tasks.status === 'loading' ? <LoadingState /> : null}
      {tasks.status === 'error' ? <ErrorState error={tasks.error} onRetry={tasks.reload} /> : null}
      {tasks.status === 'success' ? (
        <Card>
          {tasks.data.map((t) => (
            <ListRow
              key={t.id}
              testID={`mt-task-${t.id}`}
              icon={t.timesDone > 0 ? CircleCheck : MonitorSmartphone}
              iconTone={t.timesDone > 0 ? 'brand' : 'neutral'}
              title={`${t.timesDone > 0 ? '✓ ' : ''}${t.title}`}
              subtitle={t.timesDone > 0 ? `${t.summary} · done ${t.timesDone}×, confirmed by you` : t.summary}
              onPress={() => router.push({ pathname: '/mt-task/[id]', params: { id: t.id } })}
            />
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}
