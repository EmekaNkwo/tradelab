import { Redirect, router, useIsFocused } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { HomeHeader } from '../../../components/home/HomeHeader';
import { HomeProgress } from '../../../components/home/HomeProgress';
import { HomeQuickActions } from '../../../components/home/HomeQuickActions';
import { TodayHero } from '../../../components/home/TodayHero';
import { AppText, Button, Card, ErrorState, Icon, IconWell, LoadingState, Notice, Screen, SkeletonState, type WellTone } from '../../../components/ui';
import { BookOpen, Check, Circle, DatabaseBackup, Sparkles, Target, type LucideIcon } from '../../../components/ui/icons';
import { describeStatus, dueSignal, formatLocalDate, useGreeting, useLearningActions, useLearningHome, useProfile, type LearningHome } from '../../../features/learning';
import { useSettings } from '../../../features/settings';
import { canOpen } from '../../../shared/routeAccess';
import { DEFAULT_TIME_ZONE, formatInTimeZone } from '../../../shared/time';
import { useTheme } from '../../../theme';

export default function HomeScreen() {
  const profile = useProfile();
  if (profile.status === 'loading') return <LoadingState />;
  if (profile.status === 'error') {
    return (
      <Screen>
        <ErrorState error={profile.error} onRetry={profile.reload} />
      </Screen>
    );
  }
  if (profile.data === null) return <Redirect href="/onboarding" />;
  return <LearningHomeScreen />;
}

function LearningHomeScreen() {
  const home = useLearningHome();
  const settings = useSettings();
  const greeting = useGreeting(settings.status === 'success' ? settings.data.timeZone : DEFAULT_TIME_ZONE, useIsFocused());
  const loaded = home.status === 'success' ? home.data : null;
  return (
    <Screen testID="home-screen" topInset>
      {/* TradeLab profiles hold no name, so the greeting has none and the avatar shows a neutral icon. */}
      <HomeHeader greeting={settings.status === 'success' ? greeting : null} due={loaded ? dueSignal(loaded) : null} />
      {home.status === 'loading' ? <SkeletonState hero rows={2} /> : null}
      {home.status === 'error' ? <ErrorState error={home.error} onRetry={home.reload} /> : null}
      {loaded ? (
        <>
          <TodayHero home={loaded} />
          <HomeQuickActions todaysClass={loaded.todaysClass && canOpen('/class/[id]') ? loaded.todaysClass : null} />
          {canOpen('/progress') ? <HomeProgress /> : null}
          <MissionsCard home={loaded} />
          <ProgramCard home={loaded} />
          {canOpen('/progress') ? <ProgressLinkCard /> : null}
        </>
      ) : null}
      <BackupCard />
    </Screen>
  );
}

function MissionsCard({ home }: { readonly home: LearningHome }) {
  const { spacing } = useTheme();
  const list = home.missions;
  if (!list || list.missions.length === 0) return null;
  const done = list.missions.filter((m) => m.progress >= m.target).length;
  return (
    <Card>
      <CardTitle icon={Target} title={"Today's missions"} />
      <AppText color="textSecondary">{`Focus: ${list.focus} · about ${list.totalMinutes} minutes`}</AppText>
      <View style={{ gap: spacing.sm }} accessibilityRole="list">
        {list.missions.map((m, i) => {
          const met = m.progress >= m.target;
          return (
            <View key={m.kind} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <Icon icon={met ? Check : Circle} size={18} color={met ? 'brand' : 'textSecondary'} />
              <AppText style={{ flexShrink: 1 }} tabular>{`${i + 1}. ${m.title}${m.target > 1 ? ` (${m.progress}/${m.target})` : ''} ${met ? '✓' : ''}`}</AppText>
            </View>
          );
        })}
      </View>
      <AppText variant="label">{`Completion: ${done} of ${list.missions.length}`}</AppText>
      {home.dueReviews > 0 && canOpen('/review') ? <Button label="Review earlier concepts" variant="secondary" onPress={() => router.push('/review')} /> : null}
    </Card>
  );
}

function ProgramCard({ home }: { readonly home: LearningHome }) {
  const actions = useLearningActions();
  const [adding, setAdding] = useState(false);
  const [addFailed, setAddFailed] = useState(false);
  if (!home.enrolment) return null;
  const enrolment = home.enrolment;
  const behind = home.status.kind === 'behind';
  const addNewLessons = async () => {
    setAdding(true);
    const r = await actions.reschedule(enrolment, enrolment.settings);
    setAdding(false);
    setAddFailed(!r.ok);
  };
  return (
    <Card>
      <CardTitle icon={BookOpen} title={home.programTitle ?? 'Your program'} />
      <AppText testID="program-status">{describeStatus(home.status)}</AppText>
      <AppText color="textSecondary">{`${home.completedUnits} of ${home.totalUnits} lessons and checkpoints done${home.finishDate ? ` · finishes ${formatLocalDate(home.finishDate)}` : ''}`}</AppText>
      {behind ? (
        <Notice title="You are behind" tone="warning">
          <AppText>Choose how to catch up. Nothing is piled onto one day.</AppText>
        </Notice>
      ) : null}
      {home.newUnits > 0 && enrolment.status === 'active' ? (
        <Notice title="New lessons were added">
          <AppText>{`${home.newUnits} new lessons or checkpoints are part of your program now. Add them to your schedule; your finish date may move.`}</AppText>
          <Button label="Add them to my schedule" onPress={() => void addNewLessons()} disabled={adding} />
          {addFailed ? <AppText color="lossText">That did not work. Please try again.</AppText> : null}
        </Notice>
      ) : null}
      {canOpen('/home/program') ? (
        <Button label={behind ? 'Catch up' : 'Timeline and settings'} variant={behind ? 'primary' : 'secondary'} onPress={() => router.push('/home/program')} />
      ) : null}
    </Card>
  );
}

function ProgressLinkCard() {
  return (
    <Card>
      <CardTitle icon={Sparkles} title="Your progress" />
      <AppText color="textSecondary">Skills from your real answers and practice, what to practise next, challenges and badges.</AppText>
      <Button label="See your progress" variant="secondary" onPress={() => router.push('/progress')} />
    </Card>
  );
}

function BackupCard() {
  const settings = useSettings();
  return (
    <Card>
      <CardTitle icon={DatabaseBackup} tone="neutral" title="Your data stays on this phone" />
      {settings.status === 'loading' ? <LoadingState /> : null}
      {settings.status === 'error' ? <ErrorState error={settings.error} onRetry={settings.reload} /> : null}
      {settings.status === 'success' ? (
        <AppText color="textSecondary" testID="last-backup">
          {settings.data.lastBackupAt ? `Last backup: ${formatInTimeZone(settings.data.lastBackupAt, settings.data.timeZone)}` : 'You have not made a backup yet.'}
        </AppText>
      ) : null}
      {canOpen('/more/backup') ? <Button label="Back up or restore" variant="secondary" onPress={() => router.push('/more/backup')} /> : null}
    </Card>
  );
}

/** A card heading with its icon well. */
function CardTitle({ icon, title, tone = 'brand' }: { readonly icon: LucideIcon; readonly title: string; readonly tone?: WellTone }) {
  const { spacing } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
      <IconWell icon={icon} tone={tone} size={40} />
      <AppText variant="heading" style={{ flex: 1 }}>
        {title}
      </AppText>
    </View>
  );
}
