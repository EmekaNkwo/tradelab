import { createTestHarness } from '../../../testing/harness';
import { reviewInput } from '..';

describe('review input from bundled content', () => {
  it('maps every program module, its MetaTrader tasks, lessons and questions', async () => {
    const h = await createTestHarness();
    const program = h.container.content.program('practical-forex-trader')!;
    const input = reviewInput(h.container.content, program, { quizAttempts: [], drillAttempts: [], completedTaskIds: new Set(), practisedKinds: [], journal: [] });
    expect(input.modules.map((m) => m.id)).toEqual(program.moduleIds);
    expect(input.moduleTasks['forex-forward-test']).toEqual(expect.arrayContaining(['mt-demo-trade-sl-tp', 'mt-export-statement']));
    expect(input.lessonModule['fx-position-sizing']).toBe('forex-risk');
    expect(input.questions.get('fxb-cp-1')?.correctOptionIds).toEqual(['a']);
    // Every lesson quick check is markable.
    const lesson = h.container.content.lesson('fx-position-sizing')!;
    for (const q of lesson.quickCheck) expect(input.questions.has(q.id)).toBe(true);
    h.db.close();
  });
});
