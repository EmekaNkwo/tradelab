import { router, Stack, useLocalSearchParams } from 'expo-router';
import { GlossaryText } from '../../components/lesson/GlossaryText';
import { StrategySection } from '../../components/strategies/Section';
import { AppText, EmptyState, ListRow, Screen } from '../../components/ui';
import { useStrategyContent, type Source, type Trader } from '../../features/strategies';
import { MARKET_LABELS } from '../../shared/types';
import { canOpen } from '../../shared/routeAccess';

/** A famous-trader page (spec §15.2): documented, interpreted, and unverified kept apart, each with its sources. */
export default function TraderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const trader = useStrategyContent().trader(id ?? '');
  if (!trader) {
    return (
      <Screen>
        <EmptyState title="Trader page not found" body="It may have been removed in a content update." actionLabel="Back" onAction={() => router.back()} />
      </Screen>
    );
  }
  return <TraderView trader={trader} />;
}

function TraderView({ trader }: { readonly trader: Trader }) {
  const content = useStrategyContent();
  const cite = (ids: readonly string[]) =>
    ids
      .map((id) => content.reviewedSource(id))
      .filter((s): s is Source => s !== null)
      .map((s) => s.title)
      .join('; ');
  const strategies = trader.strategyIds.map((id) => content.strategy(id)).filter((s) => s !== null);
  return (
    <Screen testID="trader-screen">
      <Stack.Screen options={{ title: trader.name }} />
      <AppText variant="title">{trader.name}</AppText>
      <AppText variant="caption" color="textSecondary">{`${trader.knownFor} · ${trader.markets.map((m) => MARKET_LABELS[m]).join(', ')}`}</AppText>
      <GlossaryText>{trader.summary}</GlossaryText>
      <StrategySection title="What the sources document" testID="trader-documented">
        {trader.documented.map((d) => (
          <GlossaryText key={d.text}>{`• ${d.text} (Sources: ${cite(d.sourceIds)})`}</GlossaryText>
        ))}
      </StrategySection>
      {trader.interpretations.length > 0 ? (
        <StrategySection title="Later interpretations" testID="trader-interpretations">
          <AppText variant="caption" color="textSecondary">These are other people’s readings of the method, not the trader’s own rules.</AppText>
          {trader.interpretations.map((d) => (
            <GlossaryText key={d.text}>{`• ${d.text} (Sources: ${cite(d.sourceIds)})`}</GlossaryText>
          ))}
        </StrategySection>
      ) : null}
      {trader.unverified.length > 0 ? (
        <StrategySection title="Could not be verified" accent="warning" testID="trader-unverified">
          {trader.unverified.map((u) => (
            <GlossaryText key={u}>{`• ${u}`}</GlossaryText>
          ))}
        </StrategySection>
      ) : null}
      {strategies.length > 0 ? (
        <StrategySection title="Strategy pages">
          {strategies.map((s) => (
            <ListRow key={s.id} testID={`trader-strategy-${s.id}`} title={s.title} onPress={() => router.push({ pathname: '/strategy/[id]', params: { id: s.id } })} />
          ))}
        </StrategySection>
      ) : null}
      <StrategySection title="Sources">
        {trader.sourceIds.map((id) => {
          const s = content.reviewedSource(id);
          if (!s) return null;
          // The sources stay listed when the Research Library is off; only the link goes.
          return canOpen('/research') ? (
            <ListRow key={id} testID={`trader-source-${id}`} title={s.title} subtitle={s.author ?? s.publisher ?? undefined} onPress={() => router.push({ pathname: '/research', params: { source: id } })} />
          ) : (
            <AppText key={id} testID={`trader-source-${id}`}>{`• ${s.title}${s.author ?? s.publisher ? `, ${s.author ?? s.publisher}` : ''}`}</AppText>
          );
        })}
      </StrategySection>
      <AppText variant="caption" color="textSecondary">Education only. A trader’s past results do not show what anyone else would achieve.</AppText>
    </Screen>
  );
}
