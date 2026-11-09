import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { AppText, Button, Card, CardHeader, CategoryBar, ErrorState, ListRow, LoadingState, Notice, Screen } from '../../../components/ui';
import { Calculator, ChartCandlestick, Circle, CircleCheck, GraduationCap, Lightbulb, ShieldCheck, type LucideIcon } from '../../../components/ui/icons';
import { areaVerdicts, useProgressReview, type CalculationArea, type KnowledgeGap, type ObjectiveStatus, type ProgressReview } from '../../../features/review';
import { canOpen } from '../../../shared/routeAccess';

const pct = (n: number) => `${Math.round(n * 100)}%`;

const CHECKPOINT_TEXT: Readonly<Record<ObjectiveStatus['checkpoint'], string>> = {
  passed: 'checkpoint passed',
  attempted: 'checkpoint not passed yet',
  not_attempted: 'checkpoint not taken',
};

/** One area of the review: icon header, a plain-words verdict from its counts, then the detail. Never a "ready" badge. */
function Area({ id, title, icon, verdict, children, testID }: { readonly id: string; readonly title: string; readonly icon: LucideIcon; readonly verdict: string; readonly children: ReactNode; readonly testID?: string }) {
  return (
    <Card testID={testID ?? `review-area-${id}`}>
      <CardHeader icon={icon} tone="neutral" title={title} />
      <AppText variant="label" testID={`review-verdict-${id}`}>
        {verdict}
      </AppText>
      {children}
    </Card>
  );
}

function Objectives({ items, verdict }: { readonly items: readonly ObjectiveStatus[]; readonly verdict: string }) {
  return (
    <Area id="objectives" title="Learning objectives" icon={GraduationCap} verdict={verdict}>
      {items.map((o) => (
        <ListRow
          key={o.moduleId}
          testID={`review-objective-${o.moduleId}`}
          icon={o.checkpoint === 'passed' ? CircleCheck : Circle}
          iconTone={o.checkpoint === 'passed' ? 'brand' : 'neutral'}
          title={o.title}
          subtitle={`${CHECKPOINT_TEXT[o.checkpoint]}${o.bestScore === null ? '' : ` (best ${pct(o.bestScore)})`}${o.practicalDone === null ? '' : o.practicalDone ? ' · MetaTrader task done' : ' · MetaTrader task not done'}`}
        />
      ))}
    </Area>
  );
}

function Calculations({ items, verdict }: { readonly items: readonly CalculationArea[]; readonly verdict: string }) {
  return (
    <Area id="calculations" title="Calculation accuracy" icon={Calculator} verdict={verdict}>
      {items.map((c) =>
        c.accuracy === null ? (
          <ListRow key={c.id} testID={`review-calc-${c.id}`} title={c.label} subtitle="nothing answered yet" />
        ) : (
          <CategoryBar key={c.id} testID={`review-calc-${c.id}`} label={c.label} percent={c.accuracy * 100} value={`${c.correct} of ${c.answered} correct (${pct(c.accuracy)})`} />
        ),
      )}
    </Area>
  );
}

function Rules({ rules, verdict }: { readonly rules: ProgressReview['rules']; readonly verdict: string }) {
  return (
    // `review-rules` is on the card, so it exists with or without checked trades (flow 11 scrolls to it).
    <Area id="rules" testID="review-rules" title="Following your rules" icon={ShieldCheck} verdict={verdict}>
      {rules.checkedTrades === 0 ? (
        <AppText>No paper or hand-entered demo trades yet. Those are the trades checked against your rules.</AppText>
      ) : (
        <AppText testID="review-rules-detail" tabular>{`${rules.withStop} had a stop. ${rules.reviewed} were reviewed in the journal.`}</AppText>
      )}
    </Area>
  );
}

function Conditions({ items, verdict }: { readonly items: ProgressReview['conditions']; readonly verdict: string }) {
  return (
    <Area id="conditions" title="Market conditions practised" icon={ChartCandlestick} verdict={verdict}>
      {items.map((c) => (
        <ListRow
          key={c.id}
          testID={`review-condition-${c.id}`}
          icon={c.sessions === 0 ? Circle : CircleCheck}
          iconTone={c.sessions === 0 ? 'neutral' : 'brand'}
          title={c.label}
          value={c.sessions === 0 ? 'not yet' : `${c.sessions} ${c.sessions === 1 ? 'session' : 'sessions'}`}
        />
      ))}
    </Area>
  );
}

function Gaps({ gaps, verdict }: { readonly gaps: readonly KnowledgeGap[]; readonly verdict: string }) {
  return (
    <Area id="gaps" title="What to practise next" icon={Lightbulb} verdict={verdict}>
      {gaps.length === 0 ? <AppText>Nothing stands out. Keep practising across different market conditions.</AppText> : null}
      {gaps.map((g) => (
        <Card key={g.reason} variant="tile">
          <AppText>{g.reason}</AppText>
          {g.lessonIds[0] && canOpen('/lesson/[id]') ? (
            <Button
              label={g.kind === 'checkpoint' ? 'Start the module’s lessons again' : 'Revisit the lesson you missed'}
              variant="secondary"
              onPress={() => router.push({ pathname: '/lesson/[id]', params: { id: g.lessonIds[0] ?? '' } })}
            />
          ) : null}
          {g.drillKind && canOpen('/practice/drill') ? (
            <Button label="Practise the drill" variant="secondary" onPress={() => router.push({ pathname: '/practice/drill', params: { kind: g.drillKind ?? '' } }, { withAnchor: true })} />
          ) : null}
        </Card>
      ))}
    </Area>
  );
}

/**
 * Practice Progress Review (spec §28): a learning assessment from what the
 * learner did. It never uses profit and never says the learner is ready.
 */
export default function ProgressReviewScreen() {
  const state = useProgressReview();
  if (state.status === 'loading') return <LoadingState />;
  if (state.status === 'error') return <ErrorState error={state.error} onRetry={state.reload} />;
  const { programTitle, review } = state.data;
  const verdict = areaVerdicts(review);
  return (
    <Screen testID="progress-review-screen">
      <Notice title={`Practice Progress Review · ${programTitle}`} tone="info">
        A learning assessment of what you have studied and practised. Profit and loss are not part of it.
      </Notice>
      <Objectives items={review.objectives} verdict={verdict.objectives} />
      <Calculations items={review.calculations} verdict={verdict.calculations} />
      <Rules rules={review.rules} verdict={verdict.rules} />
      <Conditions items={review.conditions} verdict={verdict.conditions} />
      <Gaps gaps={review.gaps} verdict={verdict.gaps} />
      <Notice title="Remember" tone="warning">
        {review.reminder}
      </Notice>
    </Screen>
  );
}
