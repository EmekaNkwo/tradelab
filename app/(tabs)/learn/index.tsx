import { router } from 'expo-router';
import { useState } from 'react';
import { ModuleCard } from '../../../components/learning/ModuleCard';
import { ProgramHero } from '../../../components/learning/ProgramHero';
import { Card, ChoiceChips, ErrorState, ListRow, Screen, SectionHeader, SkeletonState } from '../../../components/ui';
import { BookOpen, Calculator, FlaskConical, GraduationCap, MonitorSmartphone } from '../../../components/ui/icons';
import { describeMatch, programHeroView, useLearnOverview, useLearningHome, usePreferenceMatcher, usePrograms, type CurrentProgram } from '../../../features/learning';
import { canOpen } from '../../../shared/routeAccess';

export default function LearnScreen() {
  const programs = usePrograms();
  const [programId, setProgramId] = useState<string | null>(null);
  const overview = useLearnOverview(programId);
  const home = useLearningHome();
  const matcher = usePreferenceMatcher();
  const matchText = (moduleId: string) => {
    const m = matcher.forModuleId(moduleId);
    return m ? describeMatch(m) : null;
  };
  const e = home.status === 'success' ? home.data.enrolment : null;
  const current: CurrentProgram | null = e && home.status === 'success' ? { programId: e.programId, status: e.status, finishDate: home.data.finishDate, today: home.data.today } : null;
  return (
    <Screen testID="learn-screen">
      {programs.length > 1 ? (
        <ChoiceChips
          label="Browse a program"
          single
          options={programs.map((p) => ({ value: p.id, label: p.title }))}
          selected={programId ? [programId] : overview.status === 'success' ? [overview.data.programId] : []}
          onChange={(v) => setProgramId(v[0] ?? null)}
        />
      ) : null}
      {overview.status === 'loading' ? <SkeletonState hero rows={2} /> : null}
      {overview.status === 'error' ? <ErrorState error={overview.error} onRetry={overview.reload} /> : null}
      {overview.status === 'success' ? (
        <>
          <ProgramHero
            title={overview.data.programTitle}
            view={programHeroView(overview.data, current)}
            note={
              overview.data.enrolled
                ? 'Lessons are ticked when you pass their quiz in a daily class. You can read any lesson again here.'
                : 'You can browse the lessons here. Add this program under Programs to get daily classes for it.'
            }
          />
          <SectionHeader title="Modules" />
          {overview.data.modules.map((m, i) => (
            <ModuleCard key={m.id} module={m} number={i + 1} match={matchText(m.id)} />
          ))}
        </>
      ) : null}
      <Card>
        <SectionHeader title="Tools" />
        {canOpen('/learn/programs') ? (
          <ListRow testID="learn-programs" icon={GraduationCap} title="Programs" subtitle="Add a program, or start the next one in your queue" onPress={() => router.push('/learn/programs')} />
        ) : null}
        {canOpen('/labs') ? (
          <ListRow testID="learn-labs" icon={FlaskConical} title="Analysis labs" subtitle="Technical and fundamental analysis, market comparison" onPress={() => router.push('/labs')} />
        ) : null}
        <ListRow testID="learn-glossary" icon={BookOpen} title="Glossary" subtitle="Every term, explained at your level" onPress={() => router.push('/learn/glossary')} />
        <ListRow testID="learn-calculators" icon={Calculator} title="Calculators" subtitle="Pip value, position size, margin, risk, futures contracts and options at expiry" onPress={() => router.push('/learn/calculators')} />
        <ListRow testID="learn-metatrader" icon={MonitorSmartphone} title="MetaTrader practice" subtitle="Guided tasks on a demo account" onPress={() => router.push('/learn/metatrader')} />
      </Card>
    </Screen>
  );
}
