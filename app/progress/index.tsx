import { router } from 'expo-router';
import { BadgeGrid } from '../../components/progress/BadgeGrid';
import { ModuleTimeline } from '../../components/progress/ModuleTimeline';
import { SkillRow } from '../../components/progress/SkillRow';
import { AppText, Button, Card, CardHeader, CategoryBar, ErrorState, ListRow, LoadingState, Notice, Screen } from '../../components/ui';
import { Award, BookOpen, ChartColumn, Circle, CircleCheck, GraduationCap, Layers, Lightbulb, NotebookPen, Target } from '../../components/ui/icons';
import { JOURNAL_SOURCE_LABELS } from '../../features/journal';
import { describeStatus, formatLocalDate, useLearnOverview, useLearningHome } from '../../features/learning';
import {
  awardDate,
  READINESS_DISCLAIMER,
  SKILL_LABELS,
  useProgressDashboard,
  XP_SOURCE_LABELS,
  type Dashboard,
  type LearningStats,
} from '../../features/progress';
import { PracticePath } from '../../components/progress/PracticePath';
import { canOpen } from '../../shared/routeAccess';

const pct = (n: number) => `${Math.round(n * 100)}%`;

function ProgramCard() {
  const home = useLearningHome();
  if (home.status !== 'success' || !home.data.enrolment) return null;
  const h = home.data;
  const day = h.classes.filter((c) => c.date <= h.today).length;
  const due = h.classes.filter((c) => c.date <= h.today && c.status !== 'completed').length;
  return (
    <Card>
      <CardHeader icon={GraduationCap} title={h.programTitle ?? 'Your program'} />
      <AppText testID="progress-program">{`Class ${Math.max(day, 1)} of ${h.classes.length} · ${describeStatus(h.status)}`}</AppText>
      <AppText color="textSecondary">{`${h.completedUnits} of ${h.totalUnits} lessons and checkpoints done${h.finishDate ? ` · finishes ${formatLocalDate(h.finishDate)}` : ''}`}</AppText>
      <AppText color="textSecondary">{`${due} ${due === 1 ? 'class' : 'classes'} due so far not yet done · ${h.dueReviews} spaced reviews due`}</AppText>
    </Card>
  );
}

function Skills({ d }: { readonly d: Dashboard }) {
  return (
    <Card>
      <CardHeader icon={Target} title="Skills" />
      <AppText variant="caption" color="textSecondary">
        From your answers, practice and re-tests. Time spent is never counted. A percentage appears once there are at least five pieces of evidence.
      </AppText>
      {d.mastery.map((m) => (
        <SkillRow key={m.skill} testID={`skill-${m.skill}`} mastery={m} onPress={() => router.push({ pathname: '/progress/skill/[id]', params: { id: m.skill } })} />
      ))}
    </Card>
  );
}

/** The program's modules in order, from the Learn overview; only for a program the learner is enrolled in. */
function ModulesCard() {
  const overview = useLearnOverview();
  if (overview.status !== 'success' || !overview.data.enrolled || overview.data.modules.length === 0) return null;
  return (
    <Card testID="progress-modules">
      <CardHeader icon={Layers} title="Modules" />
      <ModuleTimeline modules={overview.data.modules} />
    </Card>
  );
}

function Recommendations({ d }: { readonly d: Dashboard }) {
  return (
    <Card>
      <CardHeader icon={Lightbulb} tone="info" title="What to practise next" />
      {d.recommendations.length === 0 ? <AppText>Nothing stands out yet. Keep going with your classes; suggestions appear once your results show a weak spot.</AppText> : null}
      {d.recommendations.map((r) => (
        <Card key={r.skill} variant="tile">
          <AppText variant="label">{SKILL_LABELS[r.skill]}</AppText>
          <AppText testID={`recommendation-${r.skill}`}>{r.reason}</AppText>
          <PracticePath steps={r.steps} />
        </Card>
      ))}
    </Card>
  );
}

function LearningCard({ s, d }: { readonly s: LearningStats; readonly d: Dashboard }) {
  const j = s.journal;
  return (
    <Card>
      <CardHeader icon={BookOpen} title="Learning results" />
      <AppText>{`Lessons mastered: ${s.lessonsMastered} · Checkpoints passed: ${s.checkpoints.length}`}</AppText>
      {s.drills.map((x) => (
        <CategoryBar key={x.kind} label={x.title} percent={x.of === 0 ? 0 : (x.right / x.of) * 100} value={`${x.right} of ${x.of}`} caption={`${x.right} of your last ${x.of} right`} />
      ))}
      <AppText testID="progress-replays">
        {s.replays.finished === 0
          ? 'Replays: none finished yet'
          : `Replays: ${s.replays.finished} finished in ${s.replays.conditions} conditions${s.replays.averageProcess === null ? '' : ` · process ${pct(s.replays.averageProcess)} (stop set, risk in limit)`}`}
      </AppText>
      <AppText>{`Strategy pages completed: ${s.strategies.completed} of ${s.strategies.total}`}</AppText>
      <AppText>{`Backtests saved: ${s.backtests.saved} (${s.backtests.outOfSample} with an out-of-sample test)`}</AppText>
      <AppText testID="progress-journal">
        {j.checkedTrades === 0
          ? 'Journal: no rule-checked trades yet'
          : `Journal: ${j.reviewed} of ${j.checkedTrades} rule-checked trades reviewed · ${j.withoutBreaks} broke no rule · ${j.withStop} had a stop`}
      </AppText>
      {j.commonBreaks.length > 0 ? <AppText color="textSecondary">{`Most common rule breaks: ${j.commonBreaks.map((b) => `${b.rule} (${b.count})`).join(', ')}`}</AppText> : null}
      {s.recentLessons.length > 0 ? <AppText variant="label">Recent lessons</AppText> : null}
      {s.recentLessons.map((l) => (
        canOpen('/lesson/[id]') ? (
          <ListRow key={l.lessonId} title={l.title} subtitle={l.mastered ? 'Mastered' : 'Not mastered yet'} onPress={() => router.push({ pathname: '/lesson/[id]', params: { id: l.lessonId } })} />
        ) : (
          <AppText key={l.lessonId}>{`${l.title} · ${l.mastered ? 'Mastered' : 'Not mastered yet'}`}</AppText>
        )
      ))}
      <AppText color="textSecondary">{`This week: ${d.week.classes} classes, ${d.week.answers} answers, ${d.week.reviews} reviews, ${d.week.drills} drills, ${d.week.replays} replays`}</AppText>
    </Card>
  );
}

function AwardsCard({ d }: { readonly d: Dashboard }) {
  const earned = d.awards.badges.filter((b) => b.earned);
  return (
    <Card>
      <CardHeader icon={Award} title="XP, badges and milestones" />
      <AppText testID="progress-xp" variant="heading" tabular header={false}>{`${d.awards.xp} XP for understanding and discipline`}</AppText>
      {d.awards.lines
        .filter((l) => l.count > 0)
        .map((l) => (
          <AppText key={l.source} color="textSecondary" tabular>{`${XP_SOURCE_LABELS[l.source]}: ${l.count} · ${l.xp} XP`}</AppText>
        ))}
      {d.streak ? (
        <AppText testID="progress-streak" tabular>{`Study streak: ${d.streak.current} ${d.streak.current === 1 ? 'study day' : 'study days'}${d.streak.todayIsStudyDay && !d.streak.doneToday ? ' (today still counts once you finish its class)' : ''}`}</AppText>
      ) : null}
      <AppText variant="label" tabular>{`Badges: ${earned.length} of ${d.awards.badges.length}`}</AppText>
      <BadgeGrid badges={d.awards.badges.map((b) => ({ id: b.id, title: b.title, how: b.how, earned: b.earned, earnedOn: b.earnedAt ? awardDate(d, b.earnedAt) : null }))} />
      <AppText variant="label">Milestones</AppText>
      {d.awards.milestones.map((m) => (
        <ListRow
          key={m.id}
          icon={m.reached ? CircleCheck : Circle}
          iconTone={m.reached ? 'brand' : 'neutral'}
          title={m.title}
          subtitle={m.reached ? (m.reachedAt ? `Reached on ${awardDate(d, m.reachedAt)}` : 'Reached') : 'Not reached yet'}
        />
      ))}
      <AppText variant="caption" color="textSecondary" testID="awards-caption">
        {`XP and badges come from what you learned and how you ran your trades (stops, rules, reviews), never from their results, size or leverage. Awards about trades are one-off, so placing more trades never earns more XP. Once earned, an award stays earned. There are no leaderboards. ${READINESS_DISCLAIMER}`}
      </AppText>
    </Card>
  );
}

function SimulatedCard({ d }: { readonly d: Dashboard }) {
  return (
    <Card>
      <CardHeader icon={NotebookPen} tone="simulated" title="Simulated and demo trades" />
      <AppText variant="caption" color="textSecondary">
        Kept apart from your learning results and not used for any score, XP or badge. Results in money are in the Journal, by source.
      </AppText>
      {d.simulated.bySource.length === 0 ? <AppText>No trades in the journal yet.</AppText> : null}
      {d.simulated.bySource.map((s) => (
        <AppText key={s.source} testID={`simulated-${s.source}`}>{`${JOURNAL_SOURCE_LABELS[s.source]}: ${s.trades} ${s.trades === 1 ? 'trade' : 'trades'}`}</AppText>
      ))}
      {canOpen('/journal') ? <Button label="Open the journal" variant="secondary" onPress={() => router.push('/journal')} /> : null}
    </Card>
  );
}

/** Progress dashboard (spec §29): learning performance first, simulated results separate. */
export default function ProgressScreen() {
  const state = useProgressDashboard();
  if (state.status === 'loading') return <LoadingState />;
  if (state.status === 'error') return <ErrorState error={state.error} onRetry={state.reload} />;
  const d = state.data;
  const completed = d.challenges.filter((c) => c.completed).length;
  return (
    <Screen testID="progress-screen">
      <Notice title="Process over profit" tone="info">
        Progress here comes from what you understood and how well you followed your process. Profit and loss are never part of it.
      </Notice>
      <ProgramCard />
      <ModulesCard />
      <Recommendations d={d} />
      <Skills d={d} />
      {canOpen('/progress/challenges') ? (
        <Card>
          <CardHeader icon={ChartColumn} title="Challenges" />
          <AppText testID="progress-challenges">{`${completed} of ${d.challenges.length} completed`}</AppText>
          <Button label="See the challenges" variant="secondary" onPress={() => router.push('/progress/challenges')} />
        </Card>
      ) : null}
      <LearningCard s={d.learning} d={d} />
      <AwardsCard d={d} />
      <SimulatedCard d={d} />
    </Screen>
  );
}
