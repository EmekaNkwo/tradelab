import { router } from "expo-router";
import { AppText, Card, CardHeader, ListRow, Screen } from "../../components/ui";
import { ChartCandlestick, ChartColumn, Landmark } from "../../components/ui/icons";
import { isFeatureEnabled } from "../../shared/featureFlags";
import { canOpen } from "../../shared/routeAccess";

/** The Technical and Fundamental Analysis Labs and the market tools (spec §10–§12). */
export default function LabsScreen() {
  return (
    <Screen testID="labs-screen">
      <AppText color="textSecondary">
        Practice reading charts and businesses with simulated charts and
        fictional companies. Nothing here is a forecast or a recommendation.
      </AppText>
      <Card>
        <CardHeader icon={ChartCandlestick} title="Technical Analysis Lab" />
        <ListRow
          testID="labs-technical"
          title="Chart concepts"
          subtitle="Trends, levels, indicators and testing, beginner to advanced"
          onPress={() =>
            router.push({
              pathname: "/labs/concepts/[lab]",
              params: { lab: "technical" },
            })
          }
        />
      </Card>
      <Card>
        <CardHeader icon={Landmark} title="Fundamental Analysis Lab" />
        <ListRow
          testID="labs-fundamental"
          title="Fundamental concepts"
          subtitle="Company figures, valuation, macro data and supply and demand"
          onPress={() =>
            router.push({
              pathname: "/labs/concepts/[lab]",
              params: { lab: "fundamental" },
            })
          }
        />
        <ListRow
          testID="labs-companies"
          title="Company analysis"
          subtitle="Compare fictional companies side by side"
          onPress={() => router.push("/labs/companies")}
        />
        <ListRow
          testID="labs-red-flags"
          title="Penny Stock Red Flag Detector"
          subtitle="Spot the warning signs in fictional company profiles"
          onPress={() => router.push("/labs/red-flags")}
        />
        <ListRow
          testID="labs-scenarios"
          title="What could happen?"
          subtitle="Macro and commodity scenarios: actual, expected and priced in"
          onPress={() => router.push("/labs/scenarios")}
        />
      </Card>
      <Card>
        <CardHeader icon={ChartColumn} title="Markets" />
        <ListRow
          testID="labs-markets"
          title="Market comparison"
          subtitle="Forex, stocks, penny stocks, commodities and futures"
          onPress={() => router.push("/labs/markets")}
        />
        {isFeatureEnabled("futuresCalculator") && canOpen("/tools/calculator") ? (
          <ListRow
            testID="labs-futures-calculator"
            title="Futures contract calculator"
            subtitle="Ticks, P/L, notional value, leverage and margin calls"
            onPress={() =>
              router.push({
                pathname: "/tools/calculator",
                params: { calc: "futures_contract" },
              })
            }
          />
        ) : null}
      </Card>
    </Screen>
  );
}
