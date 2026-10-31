import { router, Stack } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { View, type ScrollViewInstance } from 'react-native';
import { OnboardingRestore } from '../components/backup/OnboardingRestore';
import { DisclosureNotice } from '../components/lesson/DisclosureNotice';
import { PlanPreviewCard } from '../components/learning/PlanPreviewCard';
import { QuestionCard } from '../components/learning/QuestionCard';
import { ScheduleFields } from '../components/learning/ScheduleFields';
import { AppText, Button, Card, ChoiceChips, ErrorState, Notice, Screen, SegmentedControl } from '../components/ui';
import { useDisclosures } from '../features/content';
import { describeSuggestion, describeWarning, formatLocalDate, useLearningActions, useModuleTitles, useOnboarding, usePrograms, questionView } from '../features/learning';
import { useTheme } from '../theme';

const EXPERIENCE = [
  { value: 'complete_beginner', label: 'Complete beginner' },
  { value: 'know_basic_terms', label: 'I know basic terms' },
  { value: 'used_simulated_trading', label: 'I have used simulated trading' },
  { value: 'have_traded', label: 'I have traded before' },
  { value: 'quant_research', label: 'Interested in quantitative research' },
] as const;

const MARKETS = [
  { value: 'forex', label: 'Forex' },
  { value: 'stocks', label: 'Ordinary stocks' },
  { value: 'penny_stocks', label: 'Penny stocks' },
  { value: 'commodities', label: 'Commodities' },
  { value: 'futures', label: 'Futures' },
] as const;

const GOALS = [
  { value: 'understand_markets', label: 'Understand markets' },
  { value: 'technical_analysis', label: 'Technical analysis' },
  { value: 'fundamental_analysis', label: 'Fundamental analysis' },
  { value: 'famous_traders', label: 'Study famous traders' },
  { value: 'develop_strategies', label: 'Develop strategies' },
  { value: 'risk_management', label: 'Risk management' },
  { value: 'chart_practice', label: 'Chart practice' },
  { value: 'quant_backtesting', label: 'Quantitative backtesting' },
  { value: 'long_term_investing', label: 'Long-term investing' },
] as const;

const LEVELS = [
  { value: 'simple', label: 'Simple' },
  { value: 'balanced', label: 'Balanced' },
  { value: 'advanced', label: 'Advanced' },
] as const;

export default function OnboardingScreen() {
  const o = useOnboarding();
  const { spacing } = useTheme();
  const isLast = o.stepIndex === o.stepCount - 1;
  const scroll = useRef<ScrollViewInstance>(null);
  // Each step replaces the content, so start it at the top (otherwise step 8 opened with its heading off-screen).
  useEffect(() => {
    scroll.current?.scrollTo({ x: 0, y: 0, animated: false });
  }, [o.stepIndex]);

  const onFinish = async () => {
    const r = await o.finish();
    if (r?.ok) router.replace('/home');
  };

  return (
    <Screen ref={scroll} testID="onboarding-screen">
      <Stack.Screen options={{ title: 'Welcome to TradeLab' }} />
      <StepProgress index={o.stepIndex} count={o.stepCount} />
      <StepBody o={o} />
      {o.error ? <ErrorState error={o.error} onRetry={onFinish} /> : null}
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        {o.stepIndex > 0 ? (
          <View style={{ flex: 1 }}>
            <Button label="Back" variant="secondary" onPress={o.back} />
          </View>
        ) : null}
        <View style={{ flex: 2 }}>
          {isLast ? (
            <Button label="Start learning" onPress={onFinish} busy={o.busy} disabled={!o.canContinue} disabledReason="Answer this step to continue." />
          ) : (
            <Button label="Continue" onPress={o.next} disabled={!o.canContinue} disabledReason="Answer this step to continue." />
          )}
        </View>
      </View>
    </Screen>
  );
}

type Onboarding = ReturnType<typeof useOnboarding>;

/** "Step 3 of 8" with a segmented bar; the caption says it in words, so the bar is hidden from screen readers. */
function StepProgress({ index, count }: { readonly index: number; readonly count: number }) {
  const { colors, radii, spacing } = useTheme();
  return (
    <View style={{ gap: spacing.xs }}>
      <AppText variant="caption" color="textSecondary">{`Step ${index + 1} of ${count}`}</AppText>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ flexDirection: 'row', gap: spacing.xs }}>
        {Array.from({ length: count }, (_, k) => (
          <View key={k} style={{ flex: 1, height: 6, borderRadius: radii.pill, backgroundColor: k <= index ? colors.brand : colors.border }} />
        ))}
      </View>
    </View>
  );
}

function StepBody({ o }: { readonly o: Onboarding }) {
  switch (o.step) {
    case 'risk':
      return <RiskStep o={o} />;
    case 'experience':
      return (
        <Question title="What is your experience?">
          <ChoiceChips label="Experience" hideLabel single options={EXPERIENCE} selected={o.draft.experience ? [o.draft.experience] : []} onChange={(v) => o.update({ experience: v[0] ?? null })} />
        </Question>
      );
    case 'markets':
      return (
        <Question title="Which markets interest you?" hint="Choose one or more.">
          <ChoiceChips label="Markets" hideLabel options={MARKETS} selected={o.draft.markets} onChange={(markets) => o.update({ markets })} />
        </Question>
      );
    case 'goals':
      return (
        <Question title="What do you want to learn?" hint="Choose one or more.">
          <ChoiceChips label="Goals" hideLabel options={GOALS} selected={o.draft.goals} onChange={(goals) => o.update({ goals })} />
        </Question>
      );
    case 'level':
      return (
        <Question title="How should we explain things?" hint="You can change this at any time without losing work.">
          <SegmentedControl label="Explanation level" hideLabel options={LEVELS} value={o.draft.explanationLevel} onChange={(explanationLevel) => o.update({ explanationLevel })} />
        </Question>
      );
    case 'metatrader':
      return <MetaTraderStep o={o} />;
    case 'program':
      return <ProgramStep o={o} />;
    case 'placement':
      return <PlacementStep o={o} />;
  }
}

function Question({ title, hint, children }: { readonly title: string; readonly hint?: string; readonly children: ReactNode }) {
  return (
    <Card>
      <AppText variant="title">{title}</AppText>
      {hint ? <AppText color="textSecondary">{hint}</AppText> : null}
      {children}
    </Card>
  );
}

function RiskStep({ o }: { readonly o: Onboarding }) {
  const disclosures = useDisclosures('first_launch');
  return (
    <>
      <AppText variant="display" header>
        Simulation and demo only
      </AppText>
      {disclosures.map((d) => (
        <DisclosureNotice key={d.id} disclosure={d} />
      ))}
      <ChoiceChips
        label="Agreement"
        options={[{ value: 'agree', label: 'I understand: TradeLab is for learning with simulations and demo accounts only' }]}
        selected={o.draft.riskAcknowledged ? ['agree'] : []}
        onChange={(v) => o.update({ riskAcknowledged: v.includes('agree') })}
      />
      <OnboardingRestore />
    </>
  );
}

function MetaTraderStep({ o }: { readonly o: Onboarding }) {
  const actions = useLearningActions();
  const version = o.draft.metaTraderVersion;
  return (
    <Question title="MetaTrader" hint="Forex practice uses a free MetaTrader demo account. You can set this up later.">
      <SegmentedControl
        label="MetaTrader version"
        hideLabel
        options={[
          { value: 'mt5', label: 'MT5' },
          { value: 'mt4', label: 'MT4' },
          { value: 'none', label: 'Not yet' },
        ]}
        value={version}
        onChange={(metaTraderVersion) => o.update({ metaTraderVersion })}
      />
      {version !== 'none' ? (
        <>
          <ChoiceChips
            label="Is MetaTrader installed?"
            single
            options={[
              { value: 'yes', label: 'Installed' },
              { value: 'no', label: 'Not installed' },
            ]}
            selected={[o.draft.metaTraderInstalled ? 'yes' : 'no']}
            onChange={(v) => o.update({ metaTraderInstalled: v[0] === 'yes' })}
          />
          {!o.draft.metaTraderInstalled ? (
            <Button label={`Get ${version.toUpperCase()} on Google Play`} variant="secondary" onPress={() => actions.openMetaTraderListing(version)} />
          ) : null}
        </>
      ) : null}
    </Question>
  );
}

function ProgramStep({ o }: { readonly o: Onboarding }) {
  const programs = usePrograms();
  const moduleTitle = useModuleTitles();
  const plan = o.preview;
  const selected = programs.find((p) => p.id === o.draft.programId);
  return (
    <>
      <Question title="Choose your program">
        <ChoiceChips label="Program" hideLabel single options={programs.map((p) => ({ value: p.id, label: p.title }))} selected={o.draft.programId ? [o.draft.programId] : []} onChange={(v) => o.update({ programId: v[0] ?? null })} />
        {selected ? <AppText color="textSecondary">{selected.summary}</AppText> : null}
      </Question>
      <Card>
        <AppText variant="heading">Set your timeline</AppText>
        <ScheduleFields {...o.scheduleFields} />
        <ChoiceChips
          label="Class reminder"
          single
          options={[
            { value: 'on', label: 'Remind me at class time' },
            { value: 'off', label: 'No reminder' },
          ]}
          selected={[o.draft.remindersEnabled && o.draft.classTime ? 'on' : 'off']}
          onChange={(v) => o.update({ remindersEnabled: v[0] === 'on' })}
        />
      </Card>
      {plan ? (
        <PlanPreviewCard
          totalClasses={plan.totalClasses}
          minutesPerClass={plan.minutesPerClass}
          finishLabel={plan.finishDate ? formatLocalDate(plan.finishDate) : null}
          warnings={plan.warnings.map((w) => describeWarning(w, moduleTitle))}
          suggestions={plan.suggestions.map((s) => ({
            label: describeSuggestion(s),
            onApply: () =>
              o.update(
                s.kind === 'dailyMinutes'
                  ? { dailyMinutes: s.value }
                  : s.kind === 'weeks'
                    ? { timeline: { kind: 'weeks', weeks: s.value } }
                    : { timeline: { kind: 'finishDate', date: s.value } },
              ),
          }))}
        />
      ) : null}
    </>
  );
}

function PlacementStep({ o }: { readonly o: Onboarding }) {
  const [active, setActive] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, readonly string[]>>({});
  const [pending, setPending] = useState<readonly string[]>([]);
  const [result, setResult] = useState<{ moduleId: string; passed: boolean; score: number } | null>(null);
  const module = o.placementModules.find((m) => m.id === active);

  if (module) {
    const next = module.quiz.questions.find((q) => !(q.id in answers));
    if (!next) {
      return (
        <Card>
          <AppText>Checking your answers…</AppText>
        </Card>
      );
    }
    return (
      <QuestionCard
        key={next.id}
        question={questionView(next)}
        allowRetry={false}
        grade={(chosen) => o.gradePlacementQuestion(module.id, next.id, chosen) ?? { correct: false, feedback: [] }}
        onFirstAttempt={(chosen) => setPending(chosen)}
        continueLabel={module.quiz.questions.filter((q) => !(q.id in answers)).length === 1 ? 'Finish' : 'Next question'}
        onMastered={() => {
          const all = { ...answers, [next.id]: pending };
          setAnswers(all);
          if (module.quiz.questions.every((q) => q.id in all)) {
            const r = o.gradePlacement(module.id, all);
            setResult(r ? { moduleId: module.id, passed: r.passed, score: r.score } : null);
            setActive(null);
            setAnswers({});
          }
        }}
      />
    );
  }

  return (
    <>
      <Question title="Already know some of this?" hint="Optional. Pass a module's checkpoint (80% or more) to skip its classes. You can skip this step.">
        {o.placementModules.map((m) => (
          <Button
            key={m.id}
            label={o.draft.placementPassedModuleIds.includes(m.id) ? `✓ ${m.title}: passed` : `Test out of ${m.title}`}
            variant="secondary"
            onPress={() => {
              setResult(null);
              setActive(m.id);
            }}
          />
        ))}
      </Question>
      {result ? (
        <Notice live title={result.passed ? 'Module skipped' : 'Not skipped'} tone={result.passed ? 'success' : 'info'}>
          <AppText>
            {result.passed
              ? `You scored ${Math.round(result.score * 100)}%. Its classes are removed from your plan.`
              : `You scored ${Math.round(result.score * 100)}%. You will take this module's classes; that is a good thing.`}
          </AppText>
        </Notice>
      ) : null}
      {o.preview ? <AppText color="textSecondary">{`Your plan: ${o.preview.totalClasses} classes.`}</AppText> : null}
    </>
  );
}
