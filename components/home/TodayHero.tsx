import { router } from 'expo-router';
import { View } from 'react-native';
import { classPosition, formatLocalDate, programPercent, useLearningActions, useModuleTitle, type LearningHome } from '../../features/learning';
import { canOpen } from '../../shared/routeAccess';
import { heroOverlay, useTheme } from '../../theme';
import { AppText } from '../ui/AppText';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { HeroCard } from '../ui/HeroCard';
import { Icon } from '../ui/Icon';
import { CircleCheck } from '../ui/icons';

/** Today's class as the Home hero (restyle brief §5.1). States that are not a class use a plain card. */
export function TodayHero({ home }: { readonly home: LearningHome }) {
  const actions = useLearningActions();
  const moduleTitle = useModuleTitle(home.todaysClass?.moduleId ?? home.nextClass?.moduleId ?? null);
  const e = home.enrolment;
  if (!e) {
    return (
      <Card>
        <AppText variant="heading">No active program</AppText>
        <AppText color="textSecondary">All your programs are finished or queued.</AppText>
      </Card>
    );
  }
  if (e.status === 'paused') {
    return (
      <Card>
        <AppText variant="heading">Program paused</AppText>
        <AppText color="textSecondary">Nothing is due while you are paused. Resuming rebuilds your schedule from today.</AppText>
        <Button label="Resume program" onPress={() => void actions.resume(e)} />
      </Card>
    );
  }
  const cls = home.todaysClass;
  if (cls) {
    const label = cls.status === 'in_progress' ? "Continue today's class" : "Start today's class";
    const position = classPosition(home.classes, cls);
    const meta = [position ? `Class ${position.number} of ${position.of}` : null, `about ${cls.minutes} minutes`].filter(Boolean).join(' · ');
    return (
      <HeroCard testID="today-hero">
        <AppText variant="caption" color="onHero">
          {cls.kind === 'checkpoint' ? 'Checkpoint class' : cls.kind === 'review' ? 'Review class' : "Today's class"}
        </AppText>
        <AppText variant="title" color="onHero">
          {moduleTitle ?? 'Review'}
        </AppText>
        <AppText color="onHero" tabular testID="today-meta">
          {meta}
        </AppText>
        {cls.date < home.today ? (
          <AppText variant="caption" color="onHero">{`Planned for ${formatLocalDate(cls.date)}`}</AppText>
        ) : null}
        <ProgramBar home={home} />
        {canOpen('/class/[id]') ? <Button label={label} variant="hero" onPress={() => router.push(`/class/${cls.id}`)} /> : null}
      </HeroCard>
    );
  }
  return <DoneHero home={home} moduleTitle={moduleTitle} onStartEarly={() => void actions.startEarly(e, home.today)} />;
}

interface DoneHeroProps {
  readonly home: LearningHome;
  readonly moduleTitle: string | null;
  readonly onStartEarly: () => void;
}

/** Today's class is done (or the whole program): a check, tomorrow's preview and the option to start early. */
function DoneHero({ home, moduleTitle, onStartEarly }: DoneHeroProps) {
  const { colors, spacing } = useTheme();
  const complete = home.classes.length > 0 && !home.nextClass;
  return (
    <HeroCard testID="today-hero">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Icon icon={CircleCheck} size={22} literalColor={colors.onHero} />
        <AppText variant="heading" color="onHero" style={{ flexShrink: 1 }}>
          {complete ? 'Program complete' : "Today's class is done"}
        </AppText>
      </View>
      {home.nextClass ? (
        <>
          <AppText color="onHero">{`Next class: ${formatLocalDate(home.nextClass.date)}${moduleTitle ? ` · ${moduleTitle}` : ''}`}</AppText>
          <ProgramBar home={home} />
          <Button label="Start the next class early" variant="hero" onPress={onStartEarly} />
        </>
      ) : (
        <AppText color="onHero">Every class in this program is done. Finishing a program does not mean you are ready for live trading.</AppText>
      )}
    </HeroCard>
  );
}

/** Program progress on the hero: a white bar on a darkened track, with the finish date. Read as one label. */
function ProgramBar({ home }: { readonly home: LearningHome }) {
  const { colors, radii, spacing } = useTheme();
  const percent = programPercent(home);
  const finish = home.finishDate ? `Finishes ${formatLocalDate(home.finishDate)}` : null;
  return (
    <View accessible accessibilityLabel={`Program progress, ${percent} percent${finish ? `. ${finish}` : ''}`} style={{ gap: spacing.xs }} testID="today-progress">
      <View style={{ height: 8, borderRadius: radii.pill, backgroundColor: heroOverlay, overflow: 'hidden' }}>
        <View style={{ width: `${percent}%`, height: '100%', borderRadius: radii.pill, backgroundColor: colors.onHero }} />
      </View>
      <AppText variant="caption" color="onHero" tabular>
        {`${percent}% of the program${finish ? ` · ${finish}` : ''}`}
      </AppText>
    </View>
  );
}
