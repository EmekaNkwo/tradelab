import Constants from 'expo-constants';
import { DisclosureNotice } from '../../../components/lesson/DisclosureNotice';
import { AppText, Card, CardHeader, Screen } from '../../../components/ui';
import { Database, Info } from '../../../components/ui/icons';
import { useContentInfo, useDisclosures } from '../../../features/content';

export default function AboutScreen() {
  const general = useDisclosures('always');
  const leverage = useDisclosures('leverage');
  const futures = useDisclosures('futures');
  const penny = useDisclosures('penny_stocks');
  const finalModule = useDisclosures('final_module');
  const info = useContentInfo();
  const all = [...general, ...leverage, ...futures, ...penny, ...finalModule];

  return (
    <Screen testID="about-screen">
      <AppText variant="title">Risk warnings</AppText>
      {all.map((d) => (
        <DisclosureNotice key={d.id} disclosure={d} />
      ))}

      <Card>
        <CardHeader icon={Database} tone="neutral" title="Market data sources" />
        <AppText color="textSecondary">
          This version contains no market price data. When price data is added, each data set will be listed here with its source and
          licence. Simulated prices are always labelled “Simulated”.
        </AppText>
      </Card>

      <Card>
        <CardHeader icon={Info} tone="neutral" title="Version" />
        <AppText testID="app-version">App {Constants.expoConfig?.version ?? 'unknown'}</AppText>
        <AppText testID="content-version">
          Content {info.version} · {info.counts.glossary} glossary terms
        </AppText>
        <AppText variant="caption" color="textSecondary">
          TradeLab is for education only. It is not individual financial advice, and it never connects to a real broker account.
        </AppText>
      </Card>
    </Screen>
  );
}
