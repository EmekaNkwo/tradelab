import type { Program } from '../../domain/models/content';
import type { Enrolment, EnrolmentStatus } from '../../domain/models/learning';

export type ProgramState = EnrolmentStatus | 'not_added';

export interface ProgramListItem {
  readonly program: Program;
  readonly state: ProgramState;
  /** The latest enrolment in this program, if any. */
  readonly enrolment: Enrolment | null;
  /** 1-based place in the queue, for queued programs. */
  readonly queuePlace: number | null;
}

const ORDER: Readonly<Record<ProgramState, number>> = { active: 0, paused: 0, queued: 1, not_added: 2, completed: 3 };

/** Every program with where the learner stands in it: under way first, then the queue in order, then the rest. */
export function programList(programs: readonly Program[], enrolments: readonly Enrolment[]): readonly ProgramListItem[] {
  const latest = new Map<string, Enrolment>();
  for (const e of [...enrolments].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) latest.set(e.programId, e);
  const queue = enrolments.filter((e) => e.status === 'queued').sort((a, b) => a.queuePosition - b.queuePosition || a.createdAt.localeCompare(b.createdAt));
  const items = programs.map((program): ProgramListItem => {
    const enrolment = latest.get(program.id) ?? null;
    const place = enrolment?.status === 'queued' ? queue.findIndex((q) => q.id === enrolment.id) + 1 : 0;
    return { program, enrolment, state: enrolment?.status ?? 'not_added', queuePlace: place > 0 ? place : null };
  });
  return [...items].sort((a, b) => ORDER[a.state] - ORDER[b.state] || (a.queuePlace ?? 0) - (b.queuePlace ?? 0));
}
