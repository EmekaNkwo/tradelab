import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { CalculatorAssumptions, CalculatorResult } from '../../../components/tools/CalculatorResult';
import { fieldUnit, resultView } from '../../../components/tools/calculatorView';
import { AppText, Card, CardHeader, ChoiceChips, Notice, Screen, SegmentedControl, TextField } from '../../../components/ui';
import { Calculator } from '../../../components/ui/icons';
import { availableCalculators, calculator, defaultValues, describeInputError, visibleFields, type CalculatorDefinition, type CalculatorId, type CalculatorValues } from '../../../features/tools';

const SIDE_OPTIONS = [
  { value: 'buy', label: 'Buy' },
  { value: 'sell', label: 'Sell' },
] as const;

const conventionFor = (id: CalculatorId) =>
  id === 'option_payoff'
    ? 'Every options contract has its own specification, including how many units it covers and how it is exercised and settled. The example values are fictional.'
    : id === 'futures_contract'
    ? 'Every futures contract has its own tick size, tick value and margin, and margin can change. Use the exact contract’s specification from its exchange; the example values are fictional.'
    : "Calculators use the common convention of 100,000 units per lot. Check your broker's contract specification, because sizes, margin rules, and rounding can differ.";

export default function CalculatorsScreen() {
  const { calc } = useLocalSearchParams<{ calc?: string }>();
  const [selected, setSelected] = useState<CalculatorId>(() => calculator(calc ?? '')?.id ?? 'pip_value');
  const calculators = availableCalculators();
  const def = calculators.find((c) => c.id === selected) ?? (calculators[0] as CalculatorDefinition);
  return (
    <Screen testID="calculators-screen">
      <ChoiceChips
        label="Calculator"
        single
        options={calculators.map((c) => ({ value: c.id, label: c.title }))}
        selected={[selected]}
        onChange={(v) => setSelected(v[0] ?? selected)}
      />
      {/* Keyed so each calculator starts from its own example values. */}
      <CalculatorForm key={def.id} def={def} />
    </Screen>
  );
}

function CalculatorForm({ def }: { readonly def: CalculatorDefinition }) {
  const [values, setValues] = useState<CalculatorValues>(() => defaultValues(def));
  const result = useMemo(() => def.compute(values), [def, values]);
  const set = (name: string) => (text: string) => setValues((v) => ({ ...v, [name]: text }));
  const view = result.ok ? resultView(def.id, result.value) : null;
  return (
    <>
      <Card>
        <CardHeader icon={Calculator} title={def.title} />
        {visibleFields(def, values).map((f) =>
          f.kind === 'side' ? (
            <SegmentedControl key={f.name} label={f.label} options={SIDE_OPTIONS} value={values[f.name] === 'sell' ? 'sell' : 'buy'} onChange={set(f.name)} />
          ) : f.kind === 'choice' && f.choices ? (
            <SegmentedControl key={f.name} label={f.label} options={f.choices} value={values[f.name] ?? f.defaultValue} onChange={set(f.name)} />
          ) : (
            <View key={f.name}>
              <TextField
                label={f.label}
                value={values[f.name] ?? ''}
                onChangeText={set(f.name)}
                keyboardType={f.kind === 'number' ? 'decimal-pad' : f.kind === 'signed' ? 'numbers-and-punctuation' : 'default'}
                autoCapitalize={f.kind === 'number' || f.kind === 'signed' ? 'none' : 'characters'}
                testID={`field-${f.name}`}
                hint={f.help}
                suffix={fieldUnit(f, values)}
                size="large"
              />
              {/* Screen readers already hear the help in the field's hint, so this copy is hidden from them. */}
              {f.help ? (
                <AppText variant="caption" color="textSecondary" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                  {f.help}
                </AppText>
              ) : null}
            </View>
          ),
        )}
      </Card>
      {view ? (
        <CalculatorResult id={def.id} view={view} formula={def.formula} />
      ) : (
        <Notice live title="Check the inputs" tone="warning">
          <AppText testID="calculator-error">{result.ok ? '' : describeInputError(def, result.error)}</AppText>
        </Notice>
      )}
      <CalculatorAssumptions notes={view?.notes ?? []} convention={conventionFor(def.id)} formula={view ? undefined : def.formula} />
    </>
  );
}
