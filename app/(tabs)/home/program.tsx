import { router, Stack } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { PlanPreviewCard } from '../../../components/learning/PlanPreviewCard';
import { ScheduleFields } from '../../../components/learning/ScheduleFields';
import { AppText, Button, Card, CardHeader, ChoiceChips, ErrorState, ListRow, LoadingState, Notice, Screen } from '../../../components/ui';
import { Bell, BookOpen, ChartColumn, Clock } from '../../../components/ui/icons';
import {
  CATCH_UP_LABELS,
  describeStatus,
  describeSuggestion,
  describeWarning,
  formatLocalDate,
  scheduleFieldProps,
  useLearningActions,
  useLearningHome,
  useModuleTitles,
  type CatchUpOption,
  type LearningHome,
  type SchedulePlan,
  type ScheduleDraft,
  type ScheduleSettings,
} from '../../../features/learning';

export default function ProgramScreen() {
  const home = useLearningHome();
  return (
    <Screen testID="program-screen">
      <Stack.Screen options={{ title: 'Your program' }} />
      {home.status === 'loading' ? <LoadingState /> : null}
      {home.status === 'error' ? <ErrorState error={home.error} onRetry={home.reload} /> : null}
      {home.status === 'success' && home.data.enrolment ? <ProgramDetails home={home.data} /> : null}
      {home.status === 'success' && !home.data.enrolment ? <AppText>No active program.</AppText> : null}
    </Screen>
  );
}

function ProgramDetails({ home }: { readonly home: LearningHome }) {
  const e = home.enrolment!;
  const actions = useLearningActions();
  return (
    <>
      <AppText variant="title">{home.programTitle}</AppText>
      <AppText testID="program-status">{`${describeStatus(home.status)} · ${home.completedUnits} of ${home.totalUnits} done`}</AppText>
      {home.status.kind === 'behind' && e.status === 'active' ? <CatchUp home={home} /> : null}
      <EditSchedule home={home} />
      <Reminders home={home} />
      <Card>
        <CardHeader icon={Clock} tone="neutral" title={e.status === 'paused' ? 'Paused' : 'Need a break?'} />
        <AppText color="textSecondary">Pausing stops reminders and nothing becomes overdue. Resuming rebuilds the schedule from that day.</AppText>
        {e.status === 'paused' ? (
          <Button label="Resume program" onPress={() => void actions.resume(e)} />
        ) : (
          <Button label="Pause program" variant="secondary" onPress={() => void actions.pause(e)} />
        )}
      </Card>
      <ClassHistory home={home} />
    </>
  );
}

function CatchUp({ home }: { readonly home: LearningHome }) {
  const actions = useLearningActions();
  const e = home.enrolment!;
  const [options, setOptions] = useState<readonly CatchUpOption[] | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    actions.catchUpChoices(e).then((r) => live && setOptions(r.ok ? r.value : []));
    return () => {
      live = false;
    };
  }, [actions, e]);

  const apply = async (option: CatchUpOption) => {
    setBusy(true);
    await actions.reschedule(e, option.settings);
    setBusy(false);
  };

  return (
    <Notice title={describeStatus(home.status)} tone="warning">
      <AppText>Choose how to catch up. Each option is previewed; nothing changes until you choose.</AppText>
      {options === null ? <LoadingState /> : null}
      {options?.map((o) => (
        <Card key={o.choice}>
          <AppText variant="label">{CATCH_UP_LABELS[o.choice].title}</AppText>
          <AppText color="textSecondary">{CATCH_UP_LABELS[o.choice].body}</AppText>
          <AppText>
            {`${o.plan.totalClasses} classes left · ${o.settings.dailyMinutes} min each${o.plan.finishDate ? ` · finish ${formatLocalDate(o.plan.finishDate)}` : ''}`}
          </AppText>
          <Button label="Choose this" busy={busy} onPress={() => void apply(o)} />
        </Card>
      ))}
    </Notice>
  );
}

function toDraft(s: ScheduleSettings, classTime: string | null): ScheduleDraft {
  return {
    timeline: s.timeline.kind === 'open' ? { kind: 'weeks', weeks: 12 } : s.timeline,
    studyDays: s.studyDays,
    dailyMinutes: s.dailyMinutes,
    classTime,
  };
}

function EditSchedule({ home }: { readonly home: LearningHome }) {
  const e = home.enrolment!;
  const actions = useLearningActions();
  const moduleTitle = useModuleTitles();
  const [draft, setDraft] = useState<ScheduleDraft>(() => toDraft(e.settings, e.classTime));
  const [plan, setPlan] = useState<SchedulePlan | null>(null);
  const [saved, setSaved] = useState(false);
  const settings = useMemo<ScheduleSettings>(
    () => ({ startDate: home.today, timeline: draft.timeline, studyDays: draft.studyDays, dailyMinutes: draft.dailyMinutes }),
    [draft, home.today],
  );
  useEffect(() => {
    let live = true;
    actions.previewReschedule(e, settings).then((r) => live && setPlan(r.ok ? r.value.plan : null));
    return () => {
      live = false;
    };
  }, [actions, e, settings]);

  const update = (patch: Partial<ScheduleDraft>) => {
    setSaved(false);
    setDraft((d) => ({ ...d, ...patch }));
  };
  const fields = scheduleFieldProps(draft, update, home.today);
  const save = async () => {
    const r = await actions.reschedule(e, settings);
    if (draft.classTime !== e.classTime) await actions.updateClassTime(e, draft.classTime, e.remindersEnabled);
    setSaved(r.ok);
  };

  return (
    <Card>
      <CardHeader icon={BookOpen} title="Change your schedule" />
      <AppText color="textSecondary">Your finished work is kept. Upcoming classes are rebuilt from today.</AppText>
      <ScheduleFields {...fields} />
      {plan ? (
        <PlanPreviewCard
          totalClasses={plan.totalClasses}
          minutesPerClass={plan.minutesPerClass}
          finishLabel={plan.finishDate ? formatLocalDate(plan.finishDate) : null}
          warnings={plan.warnings.map((w) => describeWarning(w, moduleTitle))}
          suggestions={plan.suggestions.map((s) => ({
            label: describeSuggestion(s),
            onApply: () =>
              update(
                s.kind === 'dailyMinutes'
                  ? { dailyMinutes: s.value }
                  : s.kind === 'weeks'
                    ? { timeline: { kind: 'weeks', weeks: s.value } }
                    : { timeline: { kind: 'finishDate', date: s.value } },
              ),
          }))}
        />
      ) : null}
      <Button label="Save new schedule" onPress={() => void save()} disabled={draft.studyDays.length === 0} disabledReason="Pick at least one study day." />
      {saved ? (
        <Notice live title="Schedule updated" tone="success">
          <AppText>Your upcoming classes have been rebuilt.</AppText>
        </Notice>
      ) : null}
    </Card>
  );
}

function Reminders({ home }: { readonly home: LearningHome }) {
  const e = home.enrolment!;
  const actions = useLearningActions();
  const [message, setMessage] = useState<string | null>(null);
  const set = async (on: boolean) => {
    const r = await actions.updateClassTime(e, e.classTime, on);
    if (!r.ok) return setMessage('Could not save this setting.');
    setMessage(
      r.value.reminders === 'permission_denied'
        ? 'Notifications are turned off for TradeLab. Turn them on in Android settings to get class reminders.'
        : r.value.reminders === null
          ? 'Saved, but the reminder could not be scheduled on this phone.'
          : null,
    );
  };
  return (
    <Card>
      <CardHeader icon={Bell} title="Class reminder" />
      <AppText color="textSecondary">{e.classTime ? `Class time: ${e.classTime} on study days.` : 'No class time set. Choose one above to get reminders.'}</AppText>
      <ChoiceChips
        label="Class reminder"
        hideLabel
        single
        options={[
          { value: 'on', label: 'On' },
          { value: 'off', label: 'Off' },
        ]}
        selected={[e.remindersEnabled ? 'on' : 'off']}
        onChange={(v) => void set(v[0] === 'on')}
      />
      {message ? <AppText accessibilityLiveRegion="polite">{message}</AppText> : null}
    </Card>
  );
}

const STATUS_LABEL = { planned: 'Planned', in_progress: 'In progress', completed: 'Done', skipped: 'Skipped' } as const;
const KIND_LABEL = { lesson: 'Lesson', review: 'Review', checkpoint: 'Checkpoint' } as const;

function ClassHistory({ home }: { readonly home: LearningHome }) {
  const moduleTitle = useModuleTitles();
  return (
    <Card>
      <CardHeader icon={ChartColumn} title="All classes" />
      {home.classes.map((c) => (
        <ListRow
          key={c.id}
          testID={`class-row-${c.index}-${c.kind}`}
          title={`${formatLocalDate(c.date)} · ${KIND_LABEL[c.kind]}`}
          subtitle={`${c.moduleId ? moduleTitle(c.moduleId) : 'Spaced review'} · ${STATUS_LABEL[c.status]}${c.score !== null ? ` · ${Math.round(c.score * 100)}%` : ''}`}
          onPress={() => router.push(`/class/${c.id}`)}
        />
      ))}
    </Card>
  );
}
