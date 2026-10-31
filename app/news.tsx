import { router } from 'expo-router';
import { useState } from 'react';
import { StudyLinks } from '../components/calendar/StudyLinks';
import { AppText, Button, Card, CardHeader, ListRow, Notice, Screen, TextField } from '../components/ui';
import { CalendarDays, FlaskConical, Newspaper } from '../components/ui/icons';
import { MAX_HEADLINE_LENGTH, useHeadlineStudy } from '../features/calendar';
import { MARKET_LABELS } from '../shared/types';
import { canOpen } from '../shared/routeAccess';

/**
 * News to Learning (spec §25): the learner's own headline becomes five study
 * questions. The app fetches no news and never says what a headline means for
 * prices; it only links what the learner typed to lessons and terms.
 */
export default function NewsScreen() {
  const [text, setText] = useState('');
  const { state, study, clear, fictionalScenarios } = useHeadlineStudy();
  return (
    <Screen testID="news-screen">
      <AppText variant="title">News to Learning</AppText>
      <AppText color="textSecondary">Type or paste a headline you read. The app turns it into questions to think through and links the lessons and terms it mentions. It does not fetch news, check the headline, or say what will happen to prices.</AppText>
      <Card>
        <TextField label="Headline" value={text} onChangeText={setText} multiline maxLength={MAX_HEADLINE_LENGTH} testID="headline-input" hint="Stays on this phone. Nothing is sent anywhere." />
        <Button label="Make study questions" onPress={() => study(text)} disabled={text.trim() === ''} disabledReason="Type or paste a headline first." />
        {state.status !== 'empty' ? <Button label="Clear" variant="secondary" onPress={() => { setText(''); clear(); }} /> : null}
        {state.status === 'invalid' ? <AppText color="lossText" testID="headline-error">{state.reason}</AppText> : null}
      </Card>
      {state.status === 'studied' ? (
        <>
          <Card>
            <CardHeader icon={Newspaper} tone="info" title="Your headline" />
            <AppText testID="studied-headline">{`“${state.study.headline}”`}</AppText>
            <AppText variant="caption" color="textSecondary">
              {state.study.eventTypes.length > 0 ? `Looks like: ${state.study.eventTypes.map((t) => t.title).join(', ')}.` : 'It does not match a calendar event the app explains, so the questions are general.'}
              {state.study.markets.length > 0 ? ` Markets such news can touch: ${state.study.markets.map((m) => MARKET_LABELS[m]).join(', ')}.` : ''}
              {state.study.numbers.length > 0 ? ` Numbers to compare with what was expected: ${state.study.numbers.join(', ')}.` : ''}
            </AppText>
          </Card>
          {state.study.questions.map((q, i) => (
            <Card key={q.id}>
              <AppText variant="heading" testID={`question-${q.id}`}>{`${i + 1}. ${q.question}`}</AppText>
              <AppText color="textSecondary">{q.guide}</AppText>
            </Card>
          ))}
          <StudyLinks glossaryIds={state.study.glossaryIds} lessonIds={state.study.lessonIds} scenarioIds={state.study.scenarioIds} />
          {state.study.eventTypes.filter(() => canOpen('/calendar/[id]')).map((t) => (
            <ListRow key={t.id} icon={CalendarDays} iconTone="info" title={`About: ${t.title}`} subtitle="What it measures and how surprises are read" onPress={() => router.push({ pathname: '/calendar/[id]', params: { id: t.id } })} />
          ))}
        </>
      ) : canOpen('/labs/scenario/[id]') ? (
        <Card>
          <CardHeader icon={FlaskConical} tone="simulated" title="No headline? Practise with a fictional one" />
          <Notice title="Fictional scenarios">These are made-up situations from the app’s own practice set, not news.</Notice>
          {fictionalScenarios.slice(0, 6).map((s) => (
            <ListRow key={s.id} icon={FlaskConical} iconTone="simulated" testID={`fictional-${s.id}`} title={s.title} onPress={() => router.push({ pathname: '/labs/scenario/[id]', params: { id: s.id } })} />
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}
