/**
 * Resumable work (ADR 0006). A step generator does a bounded chunk of work
 * between `yield`s and returns its result at the end; it has no side effects
 * outside its own locals, so running it in one go or with pauses between
 * steps gives the same result. `drainSteps` runs one to the end without
 * pausing; the feature-layer runner pauses between steps instead.
 */
export type Steps<T> = Generator<void, T, void>;

export function drainSteps<T>(steps: Steps<T>): T {
  let next = steps.next();
  while (!next.done) next = steps.next();
  return next.value;
}
