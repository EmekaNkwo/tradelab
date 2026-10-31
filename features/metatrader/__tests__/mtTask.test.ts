import { createTestHarness } from '../../../testing/harness';
import { blockReason, completeMtTask, stepText, type TaskDraft } from '../useMtTask';
import { buildLearnOverview } from '../../learning/learnOverview';

const draft = (over: Partial<TaskDraft> = {}): TaskDraft => ({
  platform: 'mt5',
  demoConfirmed: false,
  stepsDone: new Set(),
  answers: {},
  note: '',
  ...over,
});

describe('guided MetaTrader tasks', () => {
  it('every shipped task is reachable and lesson links resolve', async () => {
    const { container } = await createTestHarness();
    const tasks = container.content.mtTasks();
    expect(tasks.length).toBeGreaterThanOrEqual(5);
    const linked = container.content.modules().flatMap((m) => m.lessonIds).flatMap((id) => container.content.lesson(id)?.doItNow.mtTaskId ?? []);
    for (const id of linked) expect(container.content.mtTask(id)).not.toBeNull();
    // Order exercises always ask for the demo confirmation.
    expect(container.content.mtTask('mt-demo-trade-sl-tp')?.requiresDemo).toBe(true);
  });

  it('cannot be marked done without demo confirmation, every step, and every question', async () => {
    const { container } = await createTestHarness();
    const task = container.content.mtTask('mt-demo-trade-sl-tp')!;
    const allSteps = new Set(task.steps.map((_s, i) => i));
    const answers = Object.fromEntries(task.afterQuestions.map((q) => [q.id, q.correctOptionIds]));
    expect(blockReason(task, draft())).toBe('demo_not_confirmed');
    expect(blockReason(task, draft({ demoConfirmed: true }))).toBe('steps_not_done');
    expect(blockReason(task, draft({ demoConfirmed: true, stepsDone: allSteps }))).toBe('questions_not_answered');
    expect(blockReason(task, draft({ demoConfirmed: true, stepsDone: allSteps, answers }))).toBeNull();

    const refused = await completeMtTask(container, task, draft({ stepsDone: allSteps, answers }));
    expect(!refused.ok && refused.error.kind).toBe('ValidationError');
    const saved = await completeMtTask(container, task, draft({ demoConfirmed: true, stepsDone: allSteps, answers, note: ' ok ' }));
    expect(saved.ok && saved.value).toMatchObject({ taskId: task.id, score: 1, note: 'ok', demoConfirmedAt: '2026-10-29T10:00:00.000Z' });
  });

  it('tasks without orders need no demo confirmation and record it as null', async () => {
    const { container } = await createTestHarness();
    const task = container.content.mtTask('mt-add-pairs')!;
    expect(task.requiresDemo).toBe(false);
    const wrong = Object.fromEntries(task.afterQuestions.map((q) => [q.id, [q.options.find((o) => !q.correctOptionIds.includes(o.id))!.id]]));
    const saved = await completeMtTask(container, task, draft({ stepsDone: new Set(task.steps.map((_s, i) => i)), answers: wrong }));
    expect(saved.ok && saved.value).toMatchObject({ demoConfirmedAt: null, score: 0 });
  });

  it('uses the platform-specific wording when there is one', () => {
    expect(stepText({ text: 'generic', mt4: 'four' }, 'mt4')).toBe('four');
    expect(stepText({ text: 'generic', mt4: 'four' }, 'mt5')).toBe('generic');
  });
});

describe('Learn overview', () => {
  it('lists every program module with lesson and checkpoint completion', async () => {
    const { container } = await createTestHarness();
    const r = buildLearnOverview(container.content, 'practical-forex-trader', new Set(['forex-basics:fx-currency-pairs', 'forex-basics:checkpoint']), 'simple', true);
    if (!r.ok) throw new Error(r.error.message);
    expect(r.value.modules.map((m) => m.id)).toEqual(['forex-basics', 'forex-pips-lots-leverage', 'forex-orders', 'forex-charts', 'forex-levels', 'forex-indicators', 'forex-risk', 'forex-fundamentals', 'forex-rules-based-strategies', 'forex-my-plan', 'forex-backtest-plan', 'forex-forward-test', 'forex-scams-brokers']);
    const basics = r.value.modules[0]!;
    expect(basics.lessons.filter((l) => l.done).map((l) => l.id)).toEqual(['fx-currency-pairs']);
    expect(basics.checkpointPassed).toBe(true);
    expect(r.value.modules[1]!.checkpointPassed).toBe(false);
    expect(buildLearnOverview(container.content, 'nope', new Set(), 'simple', false).ok).toBe(false);
  });
});
