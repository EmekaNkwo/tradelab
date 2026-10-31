import { View } from 'react-native';
import { useCitedStatistics, type CitedStatistic, type Disclosure } from '../../features/content';
import { plainText } from '../../shared/glossaryLinks';
import { useTheme } from '../../theme';
import { AppText } from '../ui/AppText';
import { Notice } from '../ui/Notice';

interface DisclosureNoticeProps {
  readonly disclosure: Disclosure;
}

/** Shows `[[term|label]]` links as plain words, for places where a link would pull the learner away (e.g. onboarding). */
export function stripGlossaryLinks(text: string): string {
  return plainText(text);
}

function citation({ statistic: s, source }: CitedStatistic): string {
  const by = source.author ?? source.publisher;
  return `Source: ${source.title}${by ? `, ${by}` : ''} · ${s.provider}, ${s.jurisdiction} · published ${s.publishedOn}, checked ${s.verifiedOn} · covers ${s.productsCovered}`;
}

/** A risk disclosure. Each statistic is shown with its source, jurisdiction or provider, date and products (spec §3). */
export function DisclosureNotice({ disclosure }: DisclosureNoticeProps) {
  const statistics = useCitedStatistics(disclosure);
  const { spacing } = useTheme();
  return (
    <Notice title={disclosure.title} tone="warning">
      {disclosure.body.map((p) => (
        <AppText key={p}>{stripGlossaryLinks(p)}</AppText>
      ))}
      {statistics.map((cited) => (
        <View key={cited.statistic.id} testID={`disclosure-stat-${cited.statistic.id}`} style={{ gap: spacing.xs }}>
          <AppText variant="label">{stripGlossaryLinks(cited.statistic.statement)}</AppText>
          <AppText variant="caption" color="textSecondary">
            {citation(cited)}
          </AppText>
        </View>
      ))}
    </Notice>
  );
}
