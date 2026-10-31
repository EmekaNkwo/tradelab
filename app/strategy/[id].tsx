import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { PickExercise, type VerdictLabels } from '../../components/labs/PickExercise';
import { QuestionSequence } from '../../components/learning/QuestionSequence';
import { GlossaryText } from '../../components/lesson/GlossaryText';
import { Bullets, StrategySection } from '../../components/strategies/Section';
import { StrategyHero } from '../../components/strategies/StrategyHero';
import { AppText, Button, EmptyState, ListRow, Notice, RecordsNotice, Screen } from '../../components/ui';
import { useLabExercise } from '../../features/labs';
import { orderedOptions, questionView, useGrader } from '../../features/learning';
import { labLinkFor } from '../../features/backtest';
import { presetToParams } from '../../features/practice';
import {
  ANALYSIS_LABELS,
  CATEGORY_LABELS,
  exerciseOptions,
  FAMILY_LABELS,
  HORIZON_LABELS,
  LEVEL_NAMES,
  SOURCE_QUALITY_LABELS,
  STRATEGY_PASS_MARK,
  STYLE_LABELS,
  useKnowledgeCheck,
  useSavedStrategies,
  useStrategyActions,
  useStrategyContent,
  useStrategyProgress,
  type Strategy,
} from '../../features/strategies';
import { MARKET_LABELS } from '../../shared/types';
import { useTheme } from '../../theme';
import { canOpen } from '../../shared/routeAccess';

const LABELS: VerdictLabels = {
  found: 'Right to pick, and you did',
  missed: 'You should have picked this',
  wrongly_picked: 'Not right here',
  rightly_left: 'Rightly left out',
};

const pct = (n: number) => `${Math.round(n * 100)}%`;

/** A strategy page in the standard template (spec §15.3). Only the sections the content has are shown. */
export default function StrategyScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const strategy = useStrategyContent().strategy(id ?? '');
  if (!strategy) {
    return (
      <Screen>
        <EmptyState title="Strategy not found" body="It may have been removed in a content update." actionLabel="Back" onAction={() => router.back()} />
      </Screen>
    );
  }
  return <StrategyView key={strategy.id} strategy={strategy} />;
}

function StrategyView({ strategy: s }: { readonly strategy: Strategy }) {
  const content = useStrategyContent();
  const [more, setMore] = useState(false);
  const deeper = s.simple.balanced ?? s.simple.advanced ?? null;
  // A lesson can be withheld by a content update; only lessons that exist are linked.
  const lessons = s.lessonIds.flatMap((id) => {
    const title = content.lessonTitle(id);
    return title ? [{ id, title }] : [];
  });
  return (
    <Screen testID="strategy-screen">
      <Stack.Screen options={{ title: CATEGORY_LABELS[s.category] }} />
      <StrategyHero
        strategy={s}
        caption={[FAMILY_LABELS[s.family], LEVEL_NAMES[s.level], s.markets.map((m) => MARKET_LABELS[m]).join(', ')].join(' · ')}
        sourceQuality={s.evidence ? SOURCE_QUALITY_LABELS[s.evidence.level] : null}
      />
      <SaveButtons strategyId={s.id} />

      <StrategySection title="Overview" testID="section-overview">
        <GlossaryText>{`Objective: ${s.overview.objective}`}</GlossaryText>
        <GlossaryText>{`Holding period: ${s.overview.holdingPeriod} (${HORIZON_LABELS[s.horizon]})`}</GlossaryText>
        <GlossaryText>{`Context: ${s.overview.context}`}</GlossaryText>
        <AppText color="textSecondary">{`${STYLE_LABELS[s.style]} · ${ANALYSIS_LABELS[s.analysis]} analysis`}</AppText>
      </StrategySection>

      <StrategySection title="Evidence and attribution" testID="section-evidence">
        {s.traderIds.length === 0 ? (
          <AppText>No trader is named here. This page describes a family of ideas that many people use, as a simplified educational version.</AppText>
        ) : (
          s.traderIds.map((t) => {
            const trader = content.trader(t);
            if (!trader) return null;
            // Attribution stays visible even when trader pages are off; only the link goes.
            return canOpen('/trader/[id]') ? (
              <ListRow key={t} testID={`strategy-trader-${t}`} title={trader.name} subtitle={trader.knownFor} onPress={() => router.push({ pathname: '/trader/[id]', params: { id: t } })} />
            ) : (
              <AppText key={t} testID={`strategy-trader-${t}`}>{`${trader.name}: ${trader.knownFor}`}</AppText>
            );
          })
        )}
        {s.evidence ? (
          <>
            <AppText variant="label">{SOURCE_QUALITY_LABELS[s.evidence.level]}</AppText>
            <GlossaryText>{s.evidence.summary}</GlossaryText>
            <SourceList ids={s.evidence.sourceIds} />
          </>
        ) : (
          <AppText color="textSecondary">No sources are cited for how well this works, so the page makes no claim that it does.</AppText>
        )}
      </StrategySection>

      <StrategySection title="In simple terms" testID="section-simple">
        <GlossaryText>{s.simple.simple}</GlossaryText>
        {deeper ? (
          more ? <GlossaryText>{deeper}</GlossaryText> : <Button label="Explain in more depth" variant="secondary" onPress={() => setMore(true)} />
        ) : null}
      </StrategySection>

      <StrategySection title="Why it might work" testID="section-reasoning">
        <AppText variant="caption" color="textSecondary">This is the reasoning behind the idea, not evidence that it works.</AppText>
        <GlossaryText>{s.reasoning}</GlossaryText>
      </StrategySection>

      {s.rules ? (
        <StrategySection title="Rules" testID="section-rules">
          <Notice title={s.rules.label} tone="info">
            <AppText>Rules like these are a starting point to test, not a system to follow.</AppText>
          </Notice>
          <Bullets items={s.rules.rules.map((r, i) => `${i + 1}. ${r}`)} />
        </StrategySection>
      ) : null}

      {s.demo && canOpen('/practice/chart-lab') ? (
        <StrategySection title="See it on a chart" accent="modeReplay" testID="section-demo">
          <GlossaryText>{s.demo.lookFor}</GlossaryText>
          <Button label="Open in Chart Lab" variant="secondary" onPress={() => s.demo && router.push({ pathname: '/practice/chart-lab', params: presetToParams(s.demo) })} />
          <AppText variant="caption" color="textSecondary">Charts are simulated. Each one is different, so the pattern may be clear, faint or missing.</AppText>
        </StrategySection>
      ) : null}

      {s.replay && canOpen('/practice/replay') ? (
        <StrategySection title="Practise it in Replay" accent="modeReplay" testID="section-replay">
          <GlossaryText>{s.replay.instructions}</GlossaryText>
          <Button label="Open Replay" variant="secondary" onPress={() => s.replay && router.push({ pathname: '/practice/replay', params: { scenario: s.replay.scenario } })} />
          <AppText variant="caption" color="textSecondary">Replay uses simulated prices and shows only candles that have closed.</AppText>
        </StrategySection>
      ) : null}

      {s.exercise ? <GuidedExercise strategy={s} /> : null}

      <LabSection strategy={s} />

      <StrategySection title="How it fails" accent="warning" testID="section-failure">
        <Bullets items={s.failureAnalysis} />
      </StrategySection>

      <StrategySection title="Limitations" testID="section-limitations">
        <Bullets items={s.limitations} />
      </StrategySection>

      <KnowledgeCheckSection strategy={s} />
      <CompletionSection strategy={s} />

      {lessons.length > 0 && canOpen('/lesson/[id]') ? (
        <StrategySection title="Related lessons">
          {lessons.map((l) => (
            <ListRow key={l.id} testID={`strategy-lesson-${l.id}`} title={l.title} onPress={() => router.push({ pathname: '/lesson/[id]', params: { id: l.id } })} />
          ))}
        </StrategySection>
      ) : null}
      <AppText variant="caption" color="textSecondary">Education only, not financial advice. Past results, real or simulated, do not guarantee future results.</AppText>
    </Screen>
  );
}

function SaveButtons({ strategyId }: { readonly strategyId: string }) {
  const { spacing } = useTheme();
  const saved = useSavedStrategies();
  const actions = useStrategyActions();
  const [error, setError] = useState<string | null>(null);
  if (saved.status === 'error') return <RecordsNotice queries={[saved]} />;
  if (saved.status !== 'success') return null;
  const bookmarked = saved.data.bookmarks.has(strategyId);
  const studying = saved.data.inStudy.has(strategyId);
  const run = async (task: Promise<{ ok: boolean }>) => {
    const r = await task;
    setError(r.ok ? null : 'That could not be saved. Try again.');
  };
  return (
    <View style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
        <Button
          label={bookmarked ? 'Remove bookmark' : 'Bookmark'}
          variant="secondary"
          onPress={() => void run(bookmarked ? actions.remove(strategyId, 'bookmark') : actions.add(strategyId, 'bookmark'))}
        />
        <Button
          label={studying ? 'Remove from study list' : 'Add to study list'}
          variant="secondary"
          onPress={() => void run(studying ? actions.remove(strategyId, 'study') : actions.add(strategyId, 'study'))}
        />
      </View>
      {error ? <AppText color="lossText">{error}</AppText> : null}
    </View>
  );
}

function SourceList({ ids }: { readonly ids: readonly string[] }) {
  const content = useStrategyContent();
  return (
    <>
      {ids.map((id) => {
        const src = content.reviewedSource(id);
        return src ? <AppText key={id} color="textSecondary">{`${src.title}${src.author ? `, ${src.author}` : ''}`}</AppText> : null;
      })}
    </>
  );
}

function GuidedExercise({ strategy }: { readonly strategy: Strategy }) {
  const exercise = strategy.exercise;
  const options = useMemo(() => exerciseOptions(strategy), [strategy]);
  const shown = useMemo(() => (exercise ? orderedOptions({ id: `${strategy.id}-exercise`, options: exercise.options }) : []), [strategy, exercise]);
  const state = useLabExercise('strategy_exercise', strategy.id, options);
  if (!exercise) return null;
  return (
    <View testID="section-exercise" style={{ gap: 8 }}>
      <StrategySection title="Guided exercise">
        <AppText variant="caption" color="textSecondary">A fictional situation for practice.</AppText>
        <GlossaryText>{exercise.situation}</GlossaryText>
      </StrategySection>
      <PickExercise question={exercise.prompt} options={shown} exercise={state} labels={LABELS} checkLabel="Check my answer" />
    </View>
  );
}

function KnowledgeCheckSection({ strategy }: { readonly strategy: Strategy }) {
  const check = useKnowledgeCheck(strategy);
  const questions = useMemo(() => new Map(strategy.knowledgeCheck.map((q) => [q.id, q])), [strategy]);
  const grade = useGrader(questions);
  const [attempt, setAttempt] = useState(0);
  return (
    <StrategySection title="Knowledge check" testID="section-check">
      {check.result ? (
        <>
          <Notice live title={check.result.passed ? 'Knowledge check passed' : 'Not passed yet'} tone={check.result.passed ? 'success' : 'warning'}>
            <AppText>{`You scored ${pct(check.result.score)}. You need ${pct(STRATEGY_PASS_MARK)} to pass.`}</AppText>
          </Notice>
          {check.error ? <Notice live title="Not saved" tone="warning">Your score was marked but could not be saved, so it will not count yet.</Notice> : null}
          <Button
            label="Take the check again"
            variant="secondary"
            onPress={() => {
              check.restart();
              setAttempt((a) => a + 1);
            }}
          />
        </>
      ) : (
        <>
          <AppText color="textSecondary">{`${strategy.knowledgeCheck.length} questions, one try each. Pass with ${pct(STRATEGY_PASS_MARK)} or more.`}</AppText>
          <QuestionSequence
            key={attempt}
            questions={strategy.knowledgeCheck.map(questionView)}
            grade={grade}
            allowRetry={false}
            onFirstAttempt={(id, chosen) => check.answer(id, chosen)}
            onMastered={() => undefined}
            onDone={() => void check.finish()}
            doneMessage="Saving your result…"
          />
        </>
      )}
    </StrategySection>
  );
}

function CompletionSection({ strategy }: { readonly strategy: Strategy }) {
  const progress = useStrategyProgress();
  const completion = progress.status === 'success' ? progress.data.get(strategy.id) : undefined;
  if (progress.status === 'error') return <RecordsNotice queries={[progress]} />;
  if (!completion) return null;
  return (
    <StrategySection title="Completion" testID="section-completion">
      {completion.criteria.map((c) => (
        <AppText key={c.id} color={c.met ? 'brand' : 'textPrimary'}>
          {`${c.met ? '✓' : '○'} ${c.label}${c.best !== null ? ` (best ${pct(c.best)})` : ''}`}
        </AppText>
      ))}
      <AppText variant="label">{completion.complete ? 'Completed' : 'Not completed yet'}</AppText>
      <AppText variant="caption" color="textSecondary">Completing a page shows understanding, not that the strategy will make money.</AppText>
    </StrategySection>
  );
}

/** Phase 9 tools for this page: a backtest of the builder version, or the sandbox / portfolio. Not shown when none applies. */
function LabSection({ strategy }: { readonly strategy: Strategy }) {
  const link = labLinkFor(strategy);
  if (!link) return null;
  if (link.kind === 'template') {
    if (!canOpen('/backtest/builder')) return null;
    return (
      <StrategySection title="Backtest" testID="section-backtest">
        <AppText>Test these rules on simulated data in the Backtesting Lab. It opens your own copy of the rules; this page does not change.</AppText>
        {link.simplifications > 0 ? <AppText variant="caption" color="textSecondary">{`The builder version simplifies ${link.simplifications} of the rules above; the differences are listed before you save.`}</AppText> : null}
        <Button label="Run this as a backtest" variant="secondary" onPress={() => router.push({ pathname: '/backtest/builder', params: { template: link.templateId } })} />
        <AppText variant="caption" color="textSecondary">Results come from simulated data and are not real performance.</AppText>
      </StrategySection>
    );
  }
  if (!canOpen('/portfolio')) return null;
  return link.kind === 'sandbox' ? (
    <StrategySection title="Try it in the sandbox" testID="section-backtest">
      <AppText>Compare an equal-weight basket with picking single companies over many simulated years.</AppText>
      <Button label="Open the investing sandbox" variant="secondary" onPress={() => router.push('/portfolio/sandbox')} />
    </StrategySection>
  ) : (
    <StrategySection title="Check your exposure" testID="section-backtest">
      <AppText>See how your paper accounts add up: exposure by market, concentration and drawdown.</AppText>
      <Button label="Open the portfolio" variant="secondary" onPress={() => router.push('/portfolio')} />
    </StrategySection>
  );
}
