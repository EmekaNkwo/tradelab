import { createTestHarness } from '../../../testing/harness';
import { orderedOptions, questionView } from '..';

describe('answer option order', () => {
  const q = { id: 'demo-q', prompt: 'p', correctOptionIds: ['a'], options: ['a', 'b', 'c', 'd'].map((id) => ({ id, text: id })) };

  it('is a stable permutation per question', () => {
    const once = orderedOptions(q).map((o) => o.id);
    expect(orderedOptions(q).map((o) => o.id)).toEqual(once);
    expect([...once].sort()).toEqual(['a', 'b', 'c', 'd']);
    expect(questionView(q)).toMatchObject({ id: 'demo-q', multiple: false });
    expect(questionView({ ...q, correctOptionIds: ['a', 'b'] }).multiple).toBe(true);
  });

  it('means no checkpoint can be passed by always picking the first option shown, or the longest one', async () => {
    const h = await createTestHarness();
    const content = h.container.content;
    for (const program of content.programs()) {
      for (const moduleId of program.moduleIds) {
        const quiz = content.quiz(content.module(moduleId)!.checkpointQuizId)!;
        const pick = (choose: (opts: readonly { id: string; text: string }[]) => string) =>
          quiz.questions.filter((x) => x.correctOptionIds.length === 1 && x.correctOptionIds[0] === choose(orderedOptions(x))).length / quiz.questions.length;
        const first = pick((opts) => opts[0]!.id);
        const longest = pick((opts) => [...opts].sort((a, b) => b.text.length - a.text.length)[0]!.id);
        expect({ quiz: quiz.id, first: first < quiz.passMark, longest: longest < quiz.passMark }).toEqual({ quiz: quiz.id, first: true, longest: true });
      }
    }
    h.db.close();
  });
});
