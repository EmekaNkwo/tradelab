import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Bullets, StrategySection } from '../../components/strategies/Section';
import { AppText, ChoiceChips, EmptyState, ListRow, Notice, Screen } from '../../components/ui';
import { SOURCE_QUALITY_LABELS, SOURCE_TYPE_LABELS, useStrategyContent, type Source } from '../../features/strategies';
import { canOpen } from '../../shared/routeAccess';

const QUALITIES = ['primary', 'strong_secondary', 'limited_or_disputed'] as const;

/**
 * Research Library (spec §26): the reviewed sources behind trader and
 * strategy pages, with what each supports, its limits, and where sources disagree.
 */
export default function ResearchScreen() {
  const { source: focus } = useLocalSearchParams<{ source?: string }>();
  const content = useStrategyContent();
  const all = content.reviewedSources();
  const [qualities, setQualities] = useState<readonly Source['quality'][]>([]);
  const [types, setTypes] = useState<readonly Source['type'][]>([]);
  const presentTypes = useMemo(() => [...new Set(all.map((s) => s.type))], [all]);
  const shown = all.filter((s) => (qualities.length === 0 || qualities.includes(s.quality)) && (types.length === 0 || types.includes(s.type)));
  const ordered = focus ? [...shown.filter((s) => s.id === focus), ...shown.filter((s) => s.id !== focus)] : shown;
  return (
    <Screen testID="research-screen">
      <Notice title="Reviewed sources only" tone="info">
        Every source here was checked by a person. Primary sources are preferred; secondary readings are labelled, and disagreements between sources are shown.
      </Notice>
      {all.length === 0 ? <EmptyState title="No reviewed sources yet" body="Sources appear here once a person has reviewed them." actionLabel="Back" onAction={() => router.back()} /> : null}
      {all.length > 0 ? (
        <>
          <ChoiceChips label="Source quality" options={QUALITIES.map((q) => ({ value: q, label: SOURCE_QUALITY_LABELS[q] }))} selected={qualities} onChange={setQualities} />
          {presentTypes.length > 1 ? <ChoiceChips label="Source type" options={presentTypes.map((t) => ({ value: t, label: SOURCE_TYPE_LABELS[t] }))} selected={types} onChange={setTypes} /> : null}
          {ordered.length === 0 ? <AppText color="textSecondary">No sources match these filters.</AppText> : null}
          {ordered.map((s) => (
            <SourceCard key={s.id} source={s} />
          ))}
        </>
      ) : null}
    </Screen>
  );
}

function SourceCard({ source: s }: { readonly source: Source }) {
  const content = useStrategyContent();
  const details = [s.author, s.publisher, s.publishedOn].filter(Boolean).join(' · ');
  // Only disagreements with another reviewed source are shown.
  const disagreements = s.disagreements.flatMap((d) => {
    const other = content.reviewedSource(d.sourceId);
    return other ? [{ ...d, title: other.title }] : [];
  });
  return (
    <View testID={`source-${s.id}`}>
      <StrategySection title={s.title}>
        <AppText variant="caption" color="textSecondary">{`${SOURCE_TYPE_LABELS[s.type]} · ${SOURCE_QUALITY_LABELS[s.quality]}${details ? ` · ${details}` : ''}`}</AppText>
        {s.url ? <AppText selectable color="textSecondary">{s.url}</AppText> : null}
        <AppText variant="label">What it supports</AppText>
        <Bullets items={s.claimsSupported} />
        <AppText variant="label">Limitations</AppText>
        <AppText>{s.limitations}</AppText>
        {disagreements.length > 0 ? (
          <View testID={`disagreements-${s.id}`}>
            <AppText variant="label">Where sources disagree</AppText>
            {disagreements.map((d) => (
              <AppText key={d.sourceId}>{`• With “${d.title}”: ${d.note}`}</AppText>
            ))}
          </View>
        ) : null}
        {s.relatedTraderIds.map((id) => {
          const t = content.trader(id);
          return t && canOpen('/trader/[id]') ? <ListRow key={id} title={`Trader page: ${t.name}`} onPress={() => router.push({ pathname: '/trader/[id]', params: { id } })} /> : null;
        })}
        {s.relatedStrategyIds.map((id) => {
          const st = content.strategy(id);
          return st && canOpen('/strategy/[id]') ? <ListRow key={id} title={`Strategy page: ${st.title}`} onPress={() => router.push({ pathname: '/strategy/[id]', params: { id } })} /> : null;
        })}
        <AppText variant="caption" color="textSecondary">{`Last verified ${s.lastVerifiedOn}${s.reviewedBy ? `, reviewed by ${s.reviewedBy}` : ''}`}</AppText>
      </StrategySection>
    </View>
  );
}
