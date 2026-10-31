import { router } from 'expo-router';
import { Card, CardHeader, ListRow } from '../ui';
import { BookOpen, FlaskConical, GraduationCap, Lightbulb } from '../ui/icons';
import { useStudyLinks } from '../../features/calendar';
import { canOpen } from '../../shared/routeAccess';

interface StudyLinksProps {
  readonly glossaryIds: readonly string[];
  readonly lessonIds: readonly string[];
  readonly scenarioIds: readonly string[];
}

/** Where each study link opens. Exported for the route test. */
export const LINK_ROUTES = { glossary: '/glossary/[id]', lesson: '/lesson/[id]', scenario: '/labs/scenario/[id]' } as const;

/** Glossary terms, lessons and fictional scenarios to study next. Unknown ids are left out. */
export function StudyLinks({ glossaryIds, lessonIds, scenarioIds }: StudyLinksProps) {
  const links = useStudyLinks(glossaryIds, lessonIds, scenarioIds).filter((l) => canOpen(LINK_ROUTES[l.kind]));
  if (links.length === 0) return null;
  return (
    <Card>
      <CardHeader icon={Lightbulb} tone="info" title="Study next" />
      {links.map((l) => (
        <ListRow
          key={`${l.kind}-${l.id}`}
          testID={`study-${l.kind}-${l.id}`}
          icon={l.kind === 'glossary' ? BookOpen : l.kind === 'lesson' ? GraduationCap : FlaskConical}
          iconTone={l.kind === 'scenario' ? 'simulated' : 'brand'}
          title={l.title}
          subtitle={l.kind === 'glossary' ? 'Glossary' : l.kind === 'lesson' ? 'Lesson' : 'Practice scenario (fictional)'}
          onPress={() =>
            router.push(
              l.kind === 'glossary' ? { pathname: '/glossary/[id]', params: { id: l.id } } : l.kind === 'lesson' ? { pathname: '/lesson/[id]', params: { id: l.id } } : { pathname: '/labs/scenario/[id]', params: { id: l.id } },
            )
          }
        />
      ))}
    </Card>
  );
}
