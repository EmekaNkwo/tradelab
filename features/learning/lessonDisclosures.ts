import { useMemo } from 'react';
import type { Disclosure } from '../../domain/models/content';
import { useContainer } from '../app';
import { lessonDisclosures } from './disclosureRules';

export function useLessonDisclosures(lessonId: string | null): readonly Disclosure[] {
  const { content } = useContainer();
  return useMemo(() => (lessonId ? lessonDisclosures(content, lessonId) : []), [content, lessonId]);
}
