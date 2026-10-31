import type { LearnOverview } from '../learnOverview';
import { finishText, modulePercent, moduleUnitsDone, programHeroView } from '../learnHero';

const lesson = (id: string, done: boolean) => ({ id, title: id, inOneLine: '', done });
const overview: LearnOverview = {
  programId: 'p',
  programTitle: 'Program',
  enrolled: true,
  modules: [
    { id: 'm1', title: 'M1', summary: '', practicalResult: '', lessons: [lesson('a', true), lesson('b', true)], checkpointPassed: true },
    { id: 'm2', title: 'M2', summary: '', practicalResult: '', lessons: [lesson('c', true), lesson('d', false), lesson('e', false)], checkpointPassed: false },
  ],
};

describe('Learn hero view-model', () => {
  it('counts lessons and checkpoints the way Home does', () => {
    expect(moduleUnitsDone(overview.modules[0]!)).toBe(3);
    expect(modulePercent(overview.modules[1]!)).toBe(33);
    expect(modulePercent({ ...overview.modules[0]!, lessons: [] })).toBe(0);
    const v = programHeroView(overview, null);
    expect(v).toMatchObject({ done: 4, total: 7, percent: 57, finish: null, caption: 'In your programs' });
    expect(v.spoken).toBe('Program progress, 4 of 7 lessons and checkpoints, 57 percent');
    expect(programHeroView({ ...overview, modules: [], enrolled: false }, null)).toMatchObject({ total: 0, percent: 0, caption: 'Browsing' });
  });

  it('shows a finish date only for the program under way and active', () => {
    const active = programHeroView(overview, { programId: 'p', status: 'active', finishDate: '2026-11-26', today: '2026-10-29' });
    expect(active).toMatchObject({ finish: expect.stringMatching(/^Finishes Thu,? 26 Nov 2026$/), caption: 'Your program' });
    expect(active.spoken).toMatch(/\. Finishes Thu,? 26 Nov 2026$/);
    expect(programHeroView(overview, { programId: 'p', status: 'paused', finishDate: '2026-11-26', today: '2026-10-29' })).toMatchObject({ finish: null, caption: 'Your program · paused' });
    expect(programHeroView(overview, { programId: 'other', status: 'active', finishDate: '2026-11-26', today: '2026-10-29' }).finish).toBeNull();
    expect(programHeroView(overview, { programId: 'p', status: 'active', finishDate: null, today: '2026-10-29' }).finish).toBeNull();
  });

  it('labels a finish date that has passed while work is left, and never moves it', () => {
    const late = programHeroView(overview, { programId: 'p', status: 'active', finishDate: '2026-10-22', today: '2026-10-29' });
    expect(late.finish).toMatch(/^Planned finish Thu,? 22 Oct 2026 · behind schedule$/);
    expect(late.spoken).toMatch(/\. Planned finish Thu,? 22 Oct 2026 · behind schedule$/);
    expect(finishText('2026-10-22', '2026-10-29', true)).toMatch(/^Finishes /);
    expect(finishText('2026-10-29', '2026-10-29', false)).toMatch(/^Finishes /);
  });
});
