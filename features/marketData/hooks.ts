import { useCallback, useEffect, useRef, useState } from 'react';
import type { DatasetSummary, StoredDataset } from '../../domain/models/marketData';
import type { Timeframe } from '../../domain/models/markets';
import type { ProviderFetchOutcome } from '../../data';
import { validationError, type AppError } from '../../shared/errors';
import { logger } from '../../shared/logger';
import type { MarketKind } from '../../shared/types';
import { useContainer, useLiveQuery, type QueryState } from '../app';
import { pickAndCheckCsv, saveImport, type ImportDetails, type PickedFile } from './importDataset';

const DATASET_TABLES = ['imported_dataset', 'provider_dataset'];

export function useDatasets() {
  const c = useContainer();
  return useLiveQuery(() => c.marketData.list(), DATASET_TABLES);
}

/** One stored data set with its candles, re-checked on load. */
export function useDataset(id: string | null): QueryState<StoredDataset | null> & { reload: () => void } {
  const c = useContainer();
  const query = useLiveQuery(async () => (id ? c.marketData.get(id) : { ok: true as const, value: null }), DATASET_TABLES);
  const { reload } = query;
  // The live query keeps its subscription across renders, so a new id must ask again.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    reload();
  }, [id, reload]);
  // Until the new id has loaded, never hand back the previous id's data.
  if (query.status === 'success' && query.data && query.data.id !== id) return { status: 'loading', reload };
  return query;
}

export type ImportState =
  | { readonly status: 'idle' }
  | { readonly status: 'picking' }
  | { readonly status: 'checked'; readonly file: PickedFile }
  | { readonly status: 'saving'; readonly file: PickedFile }
  | { readonly status: 'saved'; readonly dataset: DatasetSummary }
  | { readonly status: 'error'; readonly error: AppError; readonly file: PickedFile | null };

/** Pick a CSV file, see its data-quality report, then save it with its details. */
export function useCsvImport() {
  const c = useContainer();
  const [state, setState] = useState<ImportState>({ status: 'idle' });
  const busy = useRef(false);
  const pick = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setState({ status: 'picking' });
    const picked = await pickAndCheckCsv(c);
    busy.current = false;
    if (!picked.ok) return setState({ status: 'error', error: picked.error, file: null });
    setState(picked.value ? { status: 'checked', file: picked.value } : { status: 'idle' });
  }, [c]);
  const save = useCallback(
    async (file: PickedFile, details: ImportDetails) => {
      if (busy.current) return;
      busy.current = true;
      setState({ status: 'saving', file });
      const saved = await saveImport(c, file, details);
      busy.current = false;
      if (!saved.ok) logger.warn('Import not saved', { kind: saved.error.kind });
      setState(saved.ok ? { status: 'saved', dataset: saved.value } : { status: 'error', error: saved.error, file });
    },
    [c],
  );
  return { state, pick, save, reset: () => setState({ status: 'idle' }) };
}

export interface ProviderForm {
  readonly symbol: string;
  readonly name: string;
  readonly market: MarketKind;
  readonly timeframe: Timeframe;
  readonly candles: number;
}

export type FetchState =
  | { readonly status: 'idle' }
  | { readonly status: 'fetching' }
  | { readonly status: 'done'; readonly outcome: ProviderFetchOutcome }
  | { readonly status: 'error'; readonly error: AppError };

/** Fetch historical candles from the optional provider, with Cancel. Refused while the provider is switched off. */
export function useProviderFetch() {
  const c = useContainer();
  const [state, setState] = useState<FetchState>({ status: 'idle' });
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const start = useCallback(
    async (form: ProviderForm, refresh = false) => {
      if (controller.current) return;
      // Claimed before the first await, so a second press cannot start a second request.
      const ac = new AbortController();
      controller.current = ac;
      setState({ status: 'fetching' });
      const settings = await c.settings.get();
      if (controller.current !== ac) return;
      if (!settings.ok || !settings.value.integrations.marketProvider) {
        controller.current = null;
        return setState({ status: 'error', error: settings.ok ? validationError(`Turn on ${c.providerData.providerName} in Settings → Data and AI services first`) : settings.error });
      }
      const r = await c.providerData.getSeries({ ...form, signal: ac.signal, refresh });
      // Cancelled (and perhaps restarted) meanwhile: this result belongs to nobody.
      if (controller.current !== ac) return;
      controller.current = null;
      setState(r.ok ? { status: 'done', outcome: r.value } : { status: 'error', error: r.error });
    },
    [c],
  );
  const cancel = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    setState({ status: 'idle' });
  }, []);
  return { state, start, cancel };
}

export function useDeleteDataset(): (id: string) => Promise<AppError | null> {
  const c = useContainer();
  return useCallback(
    async (id) => {
      const r = await c.marketData.delete(id);
      return r.ok ? null : r.error;
    },
    [c],
  );
}
