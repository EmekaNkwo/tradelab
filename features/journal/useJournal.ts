import { useCallback, useMemo, useRef, useState } from 'react';
import { parseMtStatement, processScore, summariesBy, type JournalSummary, type ProcessResult, type SummaryPeriod } from '../../domain/journal';
import type { JournalEntry, JournalSource, PsychAttempt } from '../../domain/models/journal';
import type { PsychScenario } from '../../domain/models/content';
import type { AddManyResult, JournalNotesPatch } from '../../data';
import type { AppError } from '../../shared/errors';
import { ok, type Result } from '../../shared/result';
import { toUtcIso } from '../../shared/time';
import { useContainer, useLiveQuery, type QueryState } from '../app';
import { useRiskRules } from '../paper';
import { importedToInput, importPreview, manualToInput, reviewFromForm, type ImportPreviewRow, type ManualTradeForm, type ReviewForm } from './journalForms';

/** Rows shown in the journal list; the screen says when there are more. */
export const JOURNAL_LIST_LIMIT = 200;

export function useJournalList(source: JournalSource | null): QueryState<readonly JournalEntry[]> & { reload: () => void } {
  const c = useContainer();
  // The source is part of the key so the list reloads when the filter changes.
  return useLiveQuery(() => c.journal.list(source ? { source, limit: JOURNAL_LIST_LIMIT } : { limit: JOURNAL_LIST_LIMIT }), ['journal_entry', `filter:${source ?? 'all'}`]);
}

/** Most entries the summaries read; older ones are left out, and the screen says so. */
export const SUMMARY_ENTRY_LIMIT = 2000;
export function useJournalSummaries(period: SummaryPeriod): QueryState<readonly JournalSummary[]> & { readonly truncated: boolean } {
  const c = useContainer();
  const all = useLiveQuery(() => c.journal.list({ limit: SUMMARY_ENTRY_LIMIT }), ['journal_entry']);
  const truncated = all.status === 'success' && all.data.length >= SUMMARY_ENTRY_LIMIT;
  const state = useMemo<QueryState<readonly JournalSummary[]>>(() => (all.status === 'success' ? { status: 'success', data: summariesBy(all.data, period) } : all), [all, period]);
  return { ...state, truncated };
}

export interface JournalEntryScreen {
  readonly entry: JournalEntry;
  readonly process: ProcessResult;
  saveReview(form: ReviewForm): Promise<Result<void, AppError>>;
  saveNotes(patch: JournalNotesPatch): Promise<Result<void, AppError>>;
  attachScreenshot(): Promise<Result<void, AppError>>;
  removeScreenshot(): Promise<Result<void, AppError>>;
  remove(): Promise<Result<void, AppError>>;
}

export function useJournalEntry(id: string): QueryState<JournalEntryScreen> {
  const c = useContainer();
  const rules = useRiskRules();
  const query = useLiveQuery(() => c.journal.get(id), ['journal_entry']);
  if (query.status !== 'success') return query;
  const entry = query.data;
  const now = () => toUtcIso(c.clock.now());
  return {
    status: 'success',
    data: {
      entry,
      process: processScore(entry, rules.maxRiskPerTradePercent),
      async saveReview(form) {
        const review = reviewFromForm(form, now());
        if (!review.ok) return review;
        return c.journal.saveReview(entry.id, review.value, processScore({ ...entry, review: review.value }, rules.maxRiskPerTradePercent).score, now());
      },
      // The entry reason is one of the process checks, so the stored score is refreshed with the notes.
      saveNotes: (patch) => c.journal.updateNotes(entry.id, patch, now(), processScore({ ...entry, ...patch }, rules.maxRiskPerTradePercent).score),
      async attachScreenshot() {
        const picked = await c.journalFiles.pickScreenshot();
        if (!picked.ok || picked.value === null) return picked.ok ? ok(undefined) : picked;
        // Save first, then remove the old file: a failed save must not lose the screenshot the entry points to.
        const saved = await c.journal.updateNotes(entry.id, { screenshotUri: picked.value }, now());
        const stale = saved.ok ? entry.screenshotUri : picked.value;
        if (stale) await c.journalFiles.deleteScreenshot(stale);
        return saved;
      },
      async removeScreenshot() {
        if (entry.screenshotUri) await c.journalFiles.deleteScreenshot(entry.screenshotUri);
        return c.journal.updateNotes(entry.id, { screenshotUri: null }, now());
      },
      async remove() {
        const r = await c.journal.remove(entry.id);
        if (r.ok && entry.screenshotUri) await c.journalFiles.deleteScreenshot(entry.screenshotUri);
        return r;
      },
    },
  };
}

export function useManualEntry(): {
  save(form: ManualTradeForm): Promise<Result<JournalEntry, AppError>>;
  pickScreenshot(): Promise<Result<string | null, AppError>>;
  /** Removes a screenshot copied for a trade that was replaced or never saved. */
  discardScreenshot(uri: string): Promise<void>;
} {
  const c = useContainer();
  const rules = useRiskRules();
  // Stable, because the new-trade screen removes an unsaved draft screenshot in an effect cleanup that depends on it.
  const discardScreenshot = useCallback((uri: string) => c.journalFiles.deleteScreenshot(uri), [c]);
  return {
    async save(form) {
      const input = manualToInput(form, rules.maxRiskPerTradePercent);
      if (!input.ok) return input;
      return c.journal.add(input.value, toUtcIso(c.clock.now()));
    },
    pickScreenshot: () => c.journalFiles.pickScreenshot(),
    discardScreenshot,
  };
}

export type ImportState =
  | { readonly step: 'idle' }
  | { readonly step: 'reading' }
  | { readonly step: 'preview'; readonly fileName: string; readonly platform: string; readonly currency: string | null; readonly rows: readonly ImportPreviewRow[]; readonly skipped: readonly string[] }
  | { readonly step: 'saving' }
  | { readonly step: 'done'; readonly result: AddManyResult }
  | { readonly step: 'error'; readonly message: string };

/** Pick → parse → preview with duplicates marked → import (spec §14.4). */
export function useStatementImport(): { state: ImportState; pick(): Promise<void>; confirm(): Promise<void>; cancel(): void } {
  const c = useContainer();
  const rules = useRiskRules();
  const [state, setState] = useState<ImportState>({ step: 'idle' });
  const inFlight = useRef(false);

  const pick = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setState({ step: 'reading' });
    try {
      const file = await c.journalFiles.pickStatement();
      if (!file.ok) return setState({ step: 'error', message: file.error.message });
      if (!file.value) return setState({ step: 'idle' });
      const parsed = parseMtStatement(file.value.text);
      if (!parsed.ok) return setState({ step: 'error', message: parsed.error.message });
      const existing = await c.journal.externalIds('mt_import');
      if (!existing.ok) return setState({ step: 'error', message: existing.error.message });
      setState({
        step: 'preview',
        fileName: file.value.name,
        platform: parsed.value.platform.toUpperCase(),
        currency: parsed.value.accountCurrency,
        rows: importPreview(parsed.value, existing.value),
        skipped: parsed.value.skipped.map((s) => `Row ${s.row}: ${s.reason}`),
      });
    } finally {
      inFlight.current = false;
    }
  }, [c]);

  const confirm = useCallback(async () => {
    if (state.step !== 'preview' || inFlight.current) return;
    inFlight.current = true;
    const preview = state;
    setState({ step: 'saving' });
    try {
      const inputs = preview.rows.filter((r) => !r.duplicate).map((r) => importedToInput(r.trade, preview.fileName, rules.maxRiskPerTradePercent));
      const r = await c.journal.addMany(inputs, toUtcIso(c.clock.now()));
      setState(r.ok ? { step: 'done', result: { added: r.value.added, duplicates: r.value.duplicates + (preview.rows.length - inputs.length) } } : { step: 'error', message: r.error.message });
    } finally {
      inFlight.current = false;
    }
  }, [c, rules, state]);

  return { state, pick, confirm, cancel: () => setState({ step: 'idle' }) };
}

export interface PsychLab {
  readonly scenarios: readonly PsychScenario[];
  readonly attempts: readonly PsychAttempt[];
  answer(scenario: PsychScenario, responseId: string): Promise<Result<PsychAttempt, AppError>>;
}

export function usePsychLab(): QueryState<PsychLab> {
  const c = useContainer();
  const attempts = useLiveQuery(() => c.journal.psychAttempts(), ['psych_attempt']);
  const answering = useRef(false);
  if (attempts.status !== 'success') return attempts;
  return {
    status: 'success',
    data: {
      scenarios: c.content.psychScenarios(),
      attempts: attempts.data,
      async answer(scenario, responseId) {
        const response = scenario.responses.find((r) => r.id === responseId);
        if (!response) return { ok: false, error: { kind: 'ValidationError', message: 'Choose one of the responses' } };
        if (answering.current) return { ok: false, error: { kind: 'Cancelled', message: 'Already saving' } };
        answering.current = true;
        try {
          return await c.journal.recordPsych({ scenarioId: scenario.id, responseId, quality: response.quality }, toUtcIso(c.clock.now()));
        } finally {
          answering.current = false;
        }
      },
    },
  };
}
