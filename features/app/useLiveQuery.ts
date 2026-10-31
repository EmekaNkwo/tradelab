import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppError } from '../../shared/errors';
import type { Result } from '../../shared/result';
import { useContainer } from './container';

export type QueryState<T> =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly error: AppError }
  | { readonly status: 'success'; readonly data: T };

/**
 * Runs a repository query and re-runs it whenever one of `tables` changes,
 * so screens always render what is in the database.
 */
export function useLiveQuery<T>(
  query: () => Promise<Result<T, AppError>>,
  tables: readonly string[],
): QueryState<T> & { reload: () => void } {
  const { bus } = useContainer();
  const [state, setState] = useState<QueryState<T>>({ status: 'loading' });
  const queryRef = useRef(query);
  const runId = useRef(0);

  // Keep the latest query without re-subscribing; runs before the effect below.
  useEffect(() => {
    queryRef.current = query;
  });
  const tablesKey = tables.join(',');

  const reload = useCallback(() => {
    runId.current += 1;
    const current = runId.current;
    queryRef.current().then(
      (result) => {
        if (current !== runId.current) return;
        setState(result.ok ? { status: 'success', data: result.value } : { status: 'error', error: result.error });
      },
      (cause: unknown) => {
        if (current !== runId.current) return;
        setState({ status: 'error', error: { kind: 'StorageError', message: String(cause), cause } });
      },
    );
  }, []);

  useEffect(() => {
    reload();
    const unsubscribe = bus.subscribe(tablesKey.split(','), reload);
    return () => {
      runId.current += 1;
      unsubscribe();
    };
  }, [bus, reload, tablesKey]);

  return { ...state, reload };
}
