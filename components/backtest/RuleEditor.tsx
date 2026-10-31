import { useState } from 'react';
import { View } from 'react-native';
import {
  CONDITION_OPS,
  DEFINITION_LIMITS as L,
  describeCondition,
  INDICATOR_KINDS,
  INDICATOR_LABELS,
  PERIOD_KINDS,
  withIndicator,
  type Condition,
  type ConditionGroup,
  type IndicatorKind,
  type Operand,
} from '../../features/backtest';
import { useTheme } from '../../theme';
import { AppText, Button, Card, ChoiceChips, SegmentedControl } from '../ui';
import { Stepper } from './Stepper';

const OP_LABELS: Readonly<Record<Condition['op'], string>> = { above: 'is above', below: 'is below', crosses_above: 'crosses above', crosses_below: 'crosses below' };
const KIND_OPTIONS = INDICATOR_KINDS.map((k) => ({ value: k as IndicatorKind | 'number', label: INDICATOR_LABELS[k].replace(/^the /, '') }));

interface OperandEditorProps {
  readonly label: string;
  readonly operand: Operand;
  readonly allowNumber: boolean;
  readonly onChange: (o: Operand) => void;
  readonly testID: string;
}

function OperandEditor({ label, operand, allowNumber, onChange, testID }: OperandEditorProps) {
  const { spacing } = useTheme();
  const options = allowNumber ? [...KIND_OPTIONS, { value: 'number' as const, label: 'a number' }] : KIND_OPTIONS;
  const selected = operand.kind === 'number' ? 'number' : operand.indicator;
  return (
    <View style={{ gap: spacing.xs }} testID={testID}>
      <ChoiceChips label={label} single options={options} selected={[selected]} onChange={(v) => v[0] && onChange(withIndicator(operand, v[0]))} />
      {operand.kind === 'number' ? (
        <Stepper label="Value" value={operand.value} step={operand.value >= 10 ? 5 : 0.5} min={-1_000_000} max={1_000_000} onChange={(value) => onChange({ kind: 'number', value })} testID={`${testID}-value`} />
      ) : (
        <>
          {PERIOD_KINDS.has(operand.indicator) ? (
            <Stepper label="Period" value={operand.period ?? 20} step={operand.period !== null && operand.period >= 30 ? 5 : 1} min={L.period.min} max={L.period.max} onChange={(period) => onChange({ ...operand, period })} testID={`${testID}-period`} />
          ) : null}
          <Stepper label="Candles ago" value={operand.ago} step={1} min={L.ago.min} max={L.ago.max} onChange={(ago) => onChange({ ...operand, ago })} testID={`${testID}-ago`} />
          <Stepper label="Multiplied by" value={operand.times} step={0.1} min={L.times.min} max={L.times.max} onChange={(times) => onChange({ ...operand, times })} format={(v) => `× ${v}`} testID={`${testID}-times`} />
        </>
      )}
    </View>
  );
}

interface ConditionEditorProps {
  readonly condition: Condition;
  readonly onChange: (c: Condition) => void;
  readonly onRemove: () => void;
  readonly testID: string;
}

/** One rule block. Collapsed it reads as a sentence; tap Edit to change its parts. */
export function ConditionEditor({ condition, onChange, onRemove, testID }: ConditionEditorProps) {
  const [open, setOpen] = useState(false);
  const { spacing } = useTheme();
  return (
    <Card>
      <AppText testID={`${testID}-text`}>{describeCondition(condition)}</AppText>
      <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
        <Button label={open ? 'Done' : 'Edit'} variant="secondary" expanded={open} onPress={() => setOpen(!open)} accessibilityHint="Change this rule" />
        <Button label="Remove" variant="secondary" onPress={onRemove} accessibilityHint="Delete this rule" />
      </View>
      {open ? (
        <View style={{ gap: spacing.md }}>
          <OperandEditor label="Value" operand={condition.left} allowNumber={false} onChange={(o) => o.kind === 'indicator' && onChange({ ...condition, left: o })} testID={`${testID}-left`} />
          <ChoiceChips label="Compared how" single options={CONDITION_OPS.map((op) => ({ value: op, label: OP_LABELS[op] }))} selected={[condition.op]} onChange={(v) => v[0] && onChange({ ...condition, op: v[0] })} />
          <OperandEditor label="With" operand={condition.right} allowNumber onChange={(right) => onChange({ ...condition, right })} testID={`${testID}-right`} />
        </View>
      ) : null}
    </Card>
  );
}

interface GroupEditorProps {
  readonly title: string;
  readonly group: ConditionGroup | null;
  readonly onJoin: (join: ConditionGroup['join']) => void;
  readonly onCondition: (index: number, c: Condition) => void;
  readonly onRemove: (index: number) => void;
  readonly onAdd: () => void;
  readonly testID: string;
}

export function GroupEditor({ title, group, onJoin, onCondition, onRemove, onAdd, testID }: GroupEditorProps) {
  const { spacing } = useTheme();
  const conditions = group?.conditions ?? [];
  return (
    <View style={{ gap: spacing.sm }} testID={testID}>
      <AppText variant="heading">{title}</AppText>
      {conditions.length > 1 && group ? (
        <SegmentedControl label="Combine rules with" options={[{ value: 'all', label: 'AND (all)' }, { value: 'any', label: 'OR (any)' }]} value={group.join} onChange={onJoin} />
      ) : null}
      {conditions.length === 0 ? <AppText color="textSecondary">No rules yet.</AppText> : null}
      {conditions.map((c, i) => (
        <ConditionEditor key={i} condition={c} onChange={(next) => onCondition(i, next)} onRemove={() => onRemove(i)} testID={`${testID}-${i}`} />
      ))}
      {conditions.length < L.conditionsPerGroup.max ? <Button label="Add a rule" variant="secondary" onPress={onAdd} /> : null}
    </View>
  );
}
