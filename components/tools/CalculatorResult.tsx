import { View } from 'react-native';
import type { CalculatorId, CalculatorLine } from '../../features/tools';
import { heroOverlay, useTheme } from '../../theme';
import { AppText } from '../ui/AppText';
import { Card } from '../ui/Card';
import { CardHeader } from '../ui/CardHeader';
import { HeroCard } from '../ui/HeroCard';
import { Icon } from '../ui/Icon';
import { ArrowDown, ArrowUp, Calculator, Info, Minus } from '../ui/icons';
import { ListRow } from '../ui/ListRow';
import { SplitNumber } from '../ui/SplitNumber';
import { spokenAmount } from '../ui/valueParts';
import { isProse, signedHeadline, type ResultView } from './calculatorView';

const ARROWS = { up: ArrowUp, down: ArrowDown, flat: Minus } as const;

/** Says plainly that the figure is arithmetic on the inputs, not an account balance or a trade result. */
export const CALCULATION_ONLY = 'Calculation only';

/** First in the hero, on its own line; at large text it wraps inside the pill instead of running off the card. */
function CalculationPill() {
  const { radii, spacing } = useTheme();
  return (
    <View testID="calculation-pill" style={{ alignSelf: 'flex-start', maxWidth: '100%', backgroundColor: heroOverlay, borderRadius: radii.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.xs }}>
      <AppText variant="caption" color="onHero" style={{ flexShrink: 1 }}>
        {CALCULATION_ONLY}
      </AppText>
    </View>
  );
}

/**
 * The calculator's answer (brief §5.7): a green hero with the lead figure split into integer and decimals, the
 * formula under it, then the other figures. A calculation from typed inputs, not simulated money,
 * so it carries "Calculation only" rather than a Simulated badge. Announced when it changes.
 */
export function CalculatorResult({ id, view, formula }: { readonly id: CalculatorId; readonly view: ResultView; readonly formula: string }) {
  const { colors, spacing } = useTheme();
  const main = view.main;
  const signed = main ? signedHeadline(id, main) : null;
  const calc = CALCULATION_ONLY.toLowerCase();
  return (
    <>
      <View accessibilityLiveRegion="polite" testID="calculator-hero">
        <HeroCard>
          <CalculationPill />
          {main ? (
            <View testID="calculator-result" style={{ gap: spacing.xs }}>
              <AppText variant="label" color="onHero">
                {main.label}
              </AppText>
              {signed ? (
                // A profit or loss: sign, arrow and words, in hero ink (no gain/loss colour on the hero).
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
                  <Icon icon={ARROWS[signed.direction]} size={28} literalColor={colors.onHero} />
                  <SplitNumber value={signed.text} accessibilityLabel={`${signed.spoken}, ${calc}`} color="onHero" testID="calculator-signed" />
                </View>
              ) : isProse(main.value) ? (
                <AppText variant="heading" color="onHero">
                  {main.value}
                </AppText>
              ) : (
                <SplitNumber value={main.value} accessibilityLabel={`${main.label}, ${spokenAmount(main.value)}, ${calc}`} color="onHero" />
              )}
            </View>
          ) : null}
          <AppText variant="caption" color="onHero">
            {formula}
          </AppText>
        </HeroCard>
      </View>
      {view.details.length > 0 ? (
        <Card style={{ gap: 0 }}>
          <CardHeader icon={Calculator} tone="neutral" title="Details" />
          {view.details.map((line) => (
            <ListRow key={line.label} testID="calculator-result" title={line.label} value={line.value} />
          ))}
        </Card>
      ) : null}
    </>
  );
}

/** The assumptions under the answer (brief §5.7): the formula when there is no hero, the result's notes, then the convention. */
export function CalculatorAssumptions({ notes, convention, formula }: { readonly notes: readonly CalculatorLine[]; readonly convention: string; readonly formula?: string }) {
  return (
    <Card testID="calculator-assumptions">
      <CardHeader icon={Info} tone="info" title="Assumptions" />
      {/* While the hero is replaced by an input error, the formula is shown here instead. */}
      {formula ? <AppText testID="calculator-formula">{`Formula: ${formula}`}</AppText> : null}
      {notes.map((line) => (
        <View key={line.label} testID="calculator-result">
          <AppText variant="label">{line.label}</AppText>
          <AppText color="textSecondary">{line.value}</AppText>
        </View>
      ))}
      <AppText variant="caption" color="textSecondary">
        {convention}
      </AppText>
    </Card>
  );
}
