import { progressReview, type ProgressReview } from '../../domain/review';
import { notFound, type AppError } from '../../shared/errors';
import { err, ok, type Result } from '../../shared/result';
import { useContainer, useLiveQuery, type Container, type QueryState } from '../app';
import { reviewInput } from './reviewInput';

/** How many recent replays and journal entries the review reads. */
export const REVIEW_REPLAY_LIMIT = 1000;
export const REVIEW_JOURNAL_LIMIT = 2000;

const REVIEW_TABLES = ['quiz_attempt', 'drill_attempt', 'replay_attempt', 'paper_account', 'mt_task_completion', 'journal_entry', 'program_enrolment'];

export interface ProgressReviewView {
  readonly programTitle: string;
  readonly review: ProgressReview;
}

async function loadReview(c: Container): Promise<Result<ProgressReviewView, AppError>> {
  const enrolment = await c.learning.currentEnrolment();
  if (!enrolment.ok) return enrolment;
  const program = enrolment.value ? c.content.program(enrolment.value.programId) : (c.content.programs()[0] ?? null);
  if (!program) return err(notFound('No course found to review'));
  const [quizzes, drills, replays, papers, tasks, journal] = await Promise.all([
    c.learning.quizAttempts(),
    c.practice.drillAttempts(),
    c.practice.replayAttempts(REVIEW_REPLAY_LIMIT),
    c.paper.list(),
    c.mtTasks.completions(),
    c.journal.list({ limit: REVIEW_JOURNAL_LIMIT }),
  ]);
  if (!quizzes.ok) return quizzes;
  if (!drills.ok) return drills;
  if (!replays.ok) return replays;
  if (!papers.ok) return papers;
  if (!tasks.ok) return tasks;
  if (!journal.ok) return journal;
  const input = reviewInput(c.content, program, {
    quizAttempts: quizzes.value,
    drillAttempts: drills.value,
    completedTaskIds: new Set(tasks.value.map((t) => t.taskId)),
    // A replay is saved when it is finished; a paper account counts once it has a closed trade, not when it is opened.
    practisedKinds: [...replays.value.map((r) => r.scenarioKind), ...papers.value.filter((p) => p.state.history.length > 0).map((p) => p.scenarioKind)],
    journal: journal.value,
  });
  return ok({ programTitle: program.title, review: progressReview(input) });
}

/** The Practice Progress Review (spec §28) for the learner's current course, kept live. */
export function useProgressReview(): QueryState<ProgressReviewView> & { reload: () => void } {
  const c = useContainer();
  return useLiveQuery(() => loadReview(c), REVIEW_TABLES);
}
