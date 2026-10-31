import { createTestHarness } from '../../../testing/harness';
import { checkHeadline, detectGlossaryTerms, studyHeadline } from '../../../domain/news/headline';

let content: Awaited<ReturnType<typeof createTestHarness>>['container']['content'];
beforeAll(async () => {
  const h = await createTestHarness();
  content = h.container.content;
  h.db.close();
});
const study = (h: string) => studyHeadline(h, content.calendarEvents(), content.glossary());

describe('News to Learning (spec §25)', () => {
  it('cleans the headline and refuses empty or article-length text', () => {
    expect(checkHeadline('  Inflation   rises \n again ')).toEqual({ ok: true, headline: 'Inflation rises again' });
    expect(checkHeadline('hi').ok).toBe(false);
    expect(checkHeadline('word '.repeat(80)).ok).toBe(false);
  });

  it('always asks the five §25 questions, in order', () => {
    expect(study('Something happened somewhere today').questions.map((q) => q.id)).toEqual(['measure', 'rates', 'assets', 'expected', 'reaction']);
  });

  it('matches an inflation headline to its explainer, markets, lessons and numbers, without predicting', () => {
    const s = study('Westmark inflation rises to 3.2% in March, above forecasts');
    expect(s.eventTypes.map((t) => t.id)).toContain('ce-inflation');
    expect(s.markets.length).toBeGreaterThan(0);
    expect(s.numbers).toContain('3.2%');
    expect(s.lessonIds.every((id) => content.lesson(id) !== null)).toBe(true);
    const all = s.questions.map((q) => `${q.question} ${q.guide}`).join(' ');
    expect(all).not.toMatch(/\bwill (rise|fall|go up|go down)\b|\bbuy\b|\bsell now\b/i);
  });

  it('falls back to general questions when nothing matches, and ignores years', () => {
    const s = study('A quiet afternoon in the year 2024 for everyone');
    expect(s.eventTypes).toHaveLength(0);
    expect(s.numbers).toEqual([]);
    expect(s.questions[0]?.guide).toMatch(/Name the number, decision or event/);
  });

  it('only matches short uppercase aliases when the case matches', () => {
    const cpi = content.glossary().filter((g) => g.aliases.includes('CPI'));
    if (cpi.length === 0) return;
    expect(detectGlossaryTerms('CPI comes in hot', cpi)).toHaveLength(1);
    expect(detectGlossaryTerms('a cpi like word', cpi)).toHaveLength(0);
  });
});
