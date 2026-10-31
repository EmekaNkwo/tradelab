import { View } from 'react-native';
import { useTheme } from '../../theme';
import { AppText } from '../ui/AppText';
import { Button } from '../ui/Button';
import { ChoiceChips } from '../ui/ChoiceChips';
import { SegmentedControl } from '../ui/SegmentedControl';

interface ScheduleFieldsProps {
  readonly timelineMode: 'weeks' | 'finishDate';
  readonly onTimelineMode: (mode: 'weeks' | 'finishDate') => void;
  readonly finishDateLabel: string;
  /** Moves the target finish date by a number of days (never before the minimum). */
  readonly onShiftFinishDate: (days: number) => void;
  readonly weeks: number | null;
  readonly weekOptions: readonly number[];
  readonly onWeeks: (weeks: number) => void;
  readonly studyDays: readonly number[];
  readonly dayLabels: readonly { readonly value: number; readonly label: string }[];
  readonly onStudyDays: (days: number[]) => void;
  readonly dailyMinutes: number;
  readonly minuteOptions: readonly number[];
  readonly onDailyMinutes: (minutes: number) => void;
  readonly classTime: string | null;
  readonly classTimeOptions: readonly string[];
  readonly onClassTime: (time: string | null) => void;
}

const NO_TIME = 'none';

/** Program length, study days, daily minutes, and class time (spec §6.2). */
export function ScheduleFields(props: ScheduleFieldsProps) {
  const { spacing } = useTheme();
  return (
    <View style={{ gap: spacing.lg }}>
      <View style={{ gap: spacing.sm }}>
        <AppText variant="label">Timeline</AppText>
        <SegmentedControl
          label="Timeline"
          hideLabel
          options={[
            { value: 'weeks', label: 'Length' },
            { value: 'finishDate', label: 'Finish date' },
          ]}
          value={props.timelineMode}
          onChange={props.onTimelineMode}
        />
        {props.timelineMode === 'weeks' ? (
          <ChoiceChips
            label="Program length"
            single
            options={props.weekOptions.map((w) => ({ value: w, label: `${w} weeks` }))}
            selected={props.weeks === null ? [] : [props.weeks]}
            onChange={(v) => v[0] !== undefined && props.onWeeks(v[0])}
          />
        ) : (
          <View style={{ gap: spacing.sm }}>
            <AppText testID="finish-date" accessibilityLiveRegion="polite">{`Finish by ${props.finishDateLabel}`}</AppText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
              <Button label="− 1 week" variant="secondary" onPress={() => props.onShiftFinishDate(-7)} />
              <Button label="− 1 day" variant="secondary" onPress={() => props.onShiftFinishDate(-1)} />
              <Button label="+ 1 day" variant="secondary" onPress={() => props.onShiftFinishDate(1)} />
              <Button label="+ 1 week" variant="secondary" onPress={() => props.onShiftFinishDate(7)} />
            </View>
          </View>
        )}
      </View>
      <View style={{ gap: spacing.sm }}>
        <AppText variant="label">Study days</AppText>
        <ChoiceChips label="Study days" hideLabel options={props.dayLabels} selected={props.studyDays} onChange={(d) => props.onStudyDays([...d].sort((a, b) => a - b))} />
      </View>
      <View style={{ gap: spacing.sm }}>
        <AppText variant="label">Minutes per day</AppText>
        <ChoiceChips
          label="Minutes per day"
          hideLabel
          single
          options={props.minuteOptions.map((m) => ({ value: m, label: `${m} min` }))}
          selected={[props.dailyMinutes]}
          onChange={(v) => v[0] !== undefined && props.onDailyMinutes(v[0])}
        />
      </View>
      <View style={{ gap: spacing.sm }}>
        <AppText variant="label">Class time</AppText>
        <ChoiceChips
          label="Class time"
          hideLabel
          single
          options={[...props.classTimeOptions.map((t) => ({ value: t, label: t })), { value: NO_TIME, label: 'No fixed time' }]}
          selected={[props.classTime ?? NO_TIME]}
          onChange={(v) => props.onClassTime(v[0] === NO_TIME || v[0] === undefined ? null : v[0])}
        />
      </View>
    </View>
  );
}
