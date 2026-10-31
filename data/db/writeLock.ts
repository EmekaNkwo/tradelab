/**
 * Serialises database writes within the app. Transactions share the main
 * connection, so without this a write issued during a transaction's `await`
 * would silently become part of it. Reads never wait.
 */
export interface WriteLock {
  run<T>(task: () => Promise<T>): Promise<T>;
}

export function createWriteLock(): WriteLock {
  let tail: Promise<unknown> = Promise.resolve();
  return {
    run<T>(task: () => Promise<T>): Promise<T> {
      const result = tail.then(task, task);
      tail = result.catch(() => undefined);
      return result;
    },
  };
}
