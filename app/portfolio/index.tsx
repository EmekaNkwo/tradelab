import { router } from 'expo-router';
import { View } from 'react-native';
import { AppText, Card, CardHeader, CategoryBar, EmptyState, ErrorState, HeroCard, ListRow, LoadingState, MoneyText, Notice, Screen, spokenAmount, SplitNumber } from '../../components/ui';
import { BriefcaseBusiness, ChartColumn, ChartLine, Sparkles } from '../../components/ui/icons';
import { useTheme } from '../../theme';
import { formatPercent, formatUsd, usePortfolio } from '../../features/backtest';
import { MARKET_LABELS } from '../../shared/types';
import { canOpen } from '../../shared/routeAccess';

/** Portfolio across paper accounts (spec §18). */
export default function PortfolioScreen() {
  const { colors, spacing } = useTheme();
  const p = usePortfolio();
  return (
    <Screen testID="portfolio-screen">
      <AppText variant="title">Portfolio</AppText>
      <Notice title="Simulated" tone="info">Every figure adds up your paper accounts. Each account trades its own simulated chart, so this is practice in reading a portfolio, not a real one.</Notice>
      {p.status === 'loading' ? <LoadingState /> : null}
      {p.status === 'error' ? <ErrorState error={p.error} onRetry={p.reload} /> : null}
      {p.status === 'success' && p.data.accounts.length === 0 ? (
        <EmptyState
          title="No paper accounts yet"
          body="Open a paper account to see exposure, concentration and drawdown here."
          actionLabel={canOpen('/practice/paper') ? 'Paper trading' : undefined}
          onAction={() => router.push('/practice/paper')}
        />
      ) : null}
      {p.status === 'success' && p.data.accounts.length > 0 ? (
        <>
          <HeroCard simulated="paper" testID="portfolio-hero">
            <AppText variant="caption" color="onHero">
              Total equity across your paper accounts
            </AppText>
            <SplitNumber testID="portfolio-equity" value={formatUsd(p.data.totalEquity)} money literalColor={colors.onHero} accessibilityLabel={`Total equity, paper accounts, ${spokenAmount(formatUsd(p.data.totalEquity))}`} />
            <AppText color="onHero" tabular>
              {'Open exposure: '}
              <MoneyText color="onHero" testID="portfolio-exposure">
                {formatUsd(p.data.totalExposure)}
              </MoneyText>
              {p.data.exposureToEquity === null ? '' : ` (${p.data.exposureToEquity.toFixed(2)} × equity)`}
            </AppText>
            <AppText color="onHero" tabular>{`Largest drawdown in any account: ${p.data.worstDrawdown === null ? 'n/a' : formatPercent(p.data.worstDrawdown)}`}</AppText>
          </HeroCard>
          <AppText variant="caption" color="textSecondary">Exposure is the market value of open positions. Above 1 × equity means leverage: a small price move changes the account a lot.</AppText>
          <Card>
            <CardHeader icon={ChartColumn} title="By market" badge="paper" />
            {p.data.byMarket.map((m) => (
              <View key={m.market} style={{ gap: spacing.xxs }}>
                <CategoryBar testID="portfolio-market" label={MARKET_LABELS[m.market]} caption={`${m.positions} open`} percent={m.share * 100} value={`${(m.share * 100).toFixed(0)}% of exposure`} />
                <AppText variant="caption" color="textSecondary">
                  {'Exposure '}
                  <MoneyText variant="caption" color="textSecondary">
                    {formatUsd(m.exposure)}
                  </MoneyText>
                </AppText>
              </View>
            ))}
            <AppText testID="portfolio-concentration">
              {p.data.concentration === null ? 'Concentration: nothing open.' : `Concentration: ${(p.data.concentration * 100).toFixed(0)}% of open exposure is in one market.`}
            </AppText>
            {p.data.concentration !== null && p.data.concentration > 0.6 ? <AppText variant="caption" color="textSecondary">Most of the risk sits in one market, so one move affects most of the portfolio.</AppText> : null}
          </Card>
          <Card>
            <CardHeader icon={ChartLine} title="Correlation" />
            <AppText variant="caption" color="textSecondary">How closely the accounts’ revealed candle-to-candle returns moved together: near 1 together, near −1 opposite, near 0 unrelated. Simulated charts are generated separately, so expect values near 0.</AppText>
            {p.data.correlationNote ? <AppText testID="portfolio-correlation-note">{p.data.correlationNote}</AppText> : null}
            {p.data.correlations.map((c) => (
              <AppText key={`${c.a}-${c.b}`}>{`${c.a} and ${c.b}: ${c.value.toFixed(2)} (${c.candles} candles)`}</AppText>
            ))}
          </Card>
          <Card>
            <CardHeader icon={BriefcaseBusiness} title="Accounts" badge="paper" />
            {p.data.accounts.map((a) => (
              <ListRow
                key={a.id}
                testID="portfolio-account"
                title={a.name}
                subtitle={`${MARKET_LABELS[a.market]} · ${a.openPositions} open · max drawdown ${formatPercent(a.maxDrawdown)}`}
                value={formatUsd(a.equity)}
                valueIsMoney
              />
            ))}
          </Card>
        </>
      ) : null}
      <Card>
        <ListRow testID="open-sandbox" icon={Sparkles} title="Long-term investing sandbox" subtitle="An index-like basket against picking single companies, on simulated prices" onPress={() => router.push('/portfolio/sandbox')} />
      </Card>
    </Screen>
  );
}
