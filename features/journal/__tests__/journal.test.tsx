import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { parseMtStatement } from '../../../domain/journal';
import { dec } from '../../../shared/decimal';
import type { UtcIso } from '../../../shared/time';
import { SYNTHETIC_MT4_STATEMENT } from '../../../testing/statementFixture';
import { createTestHarness, TestProviders, type TestHarness } from '../../../testing/testContainer';
import { replayTradesToJournal } from '../../practice/replaySession';
import { emptyManualForm, importedToInput, manualToInput, reviewFromForm, emptyReviewForm, tradeTime } from '../journalForms';
import { useJournalEntry, useJournalSummaries, usePsychLab, useStatementImport } from '../useJournal';

const NOW = '2026-10-29T10:00:00.000Z' as UtcIso;

describe('journal forms', () => {
  it('turns a manual demo trade into an entry with R and a process score', () => {
    expect(manualToInput(emptyManualForm, 1).ok).toBe(false);
    expect(manualToInput({ ...emptyManualForm, instrument: 'EURUSD', size: '0.1', entry: 'x' }, 1).ok).toBe(false);
    expect(manualToInput({ ...emptyManualForm, instrument: 'EURUSD', size: '0x10', entry: '1.1' }, 1).ok).toBe(false);
    const base = { ...emptyManualForm, instrument: 'EURUSD', size: '0.1', entry: '1.1' };
    expect(manualToInput({ ...base, stop: '1.2' }, 1)).toMatchObject({ ok: false, error: { message: 'For a buy, the stop loss must be below the entry price' } });
    expect(manualToInput({ ...base, direction: 'sell', target: '1.2' }, 1).ok).toBe(false);
    expect(manualToInput({ ...base, plannedRisk: '500', equity: '100' }, 1).ok).toBe(false);
    const r = manualToInput(
      { ...emptyManualForm, instrument: ' EURUSD ', size: '0,1', entry: '1.1', stop: '1.095', result: '-50', plannedRisk: '50', equity: '10000', entryRationale: 'Retest' },
      1,
    );
    if (!r.ok) throw new Error(r.error.message);
    expect(r.value).toMatchObject({ source: 'manual', instrument: 'EURUSD', size: '0.1', pnlMoney: '-50', pnlR: '-1', stop: '1.095' });
    // Stop ✓, 0.5% risk ✓, no breaks ✓, reason ✓, not reviewed ✗ → 4 of 5.
    expect(r.value.processScore).toBeCloseTo(0.8);
  });

  it('maps an imported trade, keeping costs and the net result, without guessing the market', () => {
    const parsed = parseMtStatement(SYNTHETIC_MT4_STATEMENT);
    if (!parsed.ok) throw new Error(parsed.error.message);
    const input = importedToInput(parsed.value.trades[0]!, 'statement.htm', 1);
    expect(input).toMatchObject({ source: 'mt_import', externalId: 'mt4:900001:1002', market: null, instrument: 'EURUSD', costs: '-0.82', pnlMoney: '99.18', stop: '1.095' });
    expect(importedToInput(parsed.value.trades[1]!, 's', 1).stop).toBeNull();
  });

  it('labels simulated and broker times so they are not mistaken for each other', () => {
    expect(tradeTime('paper', '2020-01-06T10:00:00.000Z')).toBe('2020-01-06 10:00 (simulated chart time)');
    expect(tradeTime('mt_import', '2026-01-05T09:15:00.000Z')).toBe('2026-01-05 09:15 (broker server time)');
    expect(tradeTime('manual', '2026-01-05T09:15:00.000Z')).toBe('2026-01-05 09:15');
    expect(tradeTime('replay', null)).toBe('not recorded');
  });

  it('requires a rules answer and one lesson in a review', () => {
    expect(reviewFromForm(emptyReviewForm, NOW).ok).toBe(false);
    expect(reviewFromForm({ ...emptyReviewForm, rulesFollowed: true }, NOW).ok).toBe(false);
    expect(reviewFromForm({ ...emptyReviewForm, rulesFollowed: false, lesson: ' Wait ' }, NOW)).toMatchObject({ ok: true, value: { lesson: 'Wait', rulesFollowed: false } });
  });

  it('turns replay trades into journal entries with the running balance as equity', () => {
    const t = (profit: number, openedAt: number) => ({ side: 'buy' as const, units: dec(1000), entry: dec('1.1'), exit: dec('1.11'), openedAt, closedAt: openedAt + 1, reason: 'manual' as const, profit: dec(profit), initialStop: dec('1.09') });
    // Positions opened at 0 and 5; the second is closed in two parts.
    const view = { closed: [t(-10, 0), t(10, 5), t(4, 5)], candles: [] } as never;
    const entries = replayTradesToJournal('rpl_1', { kind: 'range', seed: 1, timeframe: 'H1', balance: '1000' }, view);
    expect(entries.map((e) => [e.externalId, e.equityAtEntry, e.plannedRisk, e.pnlR])).toEqual([
      ['rpl_1:0', '1000', '10', '-1'],
      ['rpl_1:1', '990', '10', '1'],
      ['rpl_1:2', '990', '10', '0.4'],
    ]);
    // Stop ✓, 1% risk ✓; no written reason ✗, not reviewed ✗. Rule breaks are not judged: replays run no rule check.
    expect(entries[0]!.processScore).toBeCloseTo(2 / 4);
  });
});

let harness: TestHarness;
beforeEach(async () => {
  harness = await createTestHarness();
});
afterEach(() => harness.db.close());
const wrapper = ({ children }: { children: ReactNode }) => <TestProviders container={harness.container}>{children}</TestProviders>;

describe('replay trades in the journal', () => {
  it('stores every closed replay trade as a journal entry the repository accepts', async () => {
    const t = (profit: number, openedAt: number) => ({ side: 'buy' as const, units: dec(1000), entry: dec('1.1'), exit: dec('1.11'), openedAt, closedAt: openedAt + 1, reason: 'manual' as const, profit: dec(profit), initialStop: dec('1.09') });
    const view = { closed: [t(-10, 0), t(10, 5)], candles: [] } as never;
    const entries = replayTradesToJournal('rpl_1', { kind: 'range', seed: 1, timeframe: 'H1', balance: '1000' }, view);
    const added = await harness.container.journal.addMany(entries, NOW);
    expect(added.ok).toBe(true);
    const listed = await harness.container.journal.list();
    expect(listed.ok && listed.value.filter((e) => e.source === 'replay').map((e) => e.externalId).sort()).toEqual(['rpl_1:0', 'rpl_1:1']);
  });
});

describe('useStatementImport', () => {
  it('previews, imports, and marks a second import as duplicates', async () => {
    harness.journalFiles.nextStatement = { name: 'demo.htm', text: SYNTHETIC_MT4_STATEMENT };
    const { result } = await renderHook(() => useStatementImport(), { wrapper });
    await act(async () => result.current.pick());
    const s = result.current.state;
    if (s.step !== 'preview') throw new Error(`expected preview, got ${s.step}`);
    expect([s.platform, s.currency, s.rows.length, s.rows.some((r) => r.duplicate)]).toEqual(['MT4', 'USD', 2, false]);
    expect(s.skipped.join(' ')).toMatch(/balance/i);
    await act(async () => result.current.confirm());
    expect(result.current.state).toEqual({ step: 'done', result: { added: 2, duplicates: 0 } });
    await act(async () => result.current.pick());
    const again = result.current.state;
    expect(again.step === 'preview' && again.rows.every((r) => r.duplicate)).toBe(true);
  });

  it('reports a file that is not a statement, and returns to idle on cancel', async () => {
    harness.journalFiles.nextStatement = { name: 'x.htm', text: '<html>hello</html>' };
    const { result } = await renderHook(() => useStatementImport(), { wrapper });
    await act(async () => result.current.pick());
    expect(result.current.state.step).toBe('error');
    harness.journalFiles.nextStatement = null;
    await act(async () => result.current.pick());
    expect(result.current.state.step).toBe('idle');
  });
});

describe('useJournalEntry and summaries', () => {
  it('saves a review, recomputes the process score, and attaches a screenshot', async () => {
    const parsed = parseMtStatement(SYNTHETIC_MT4_STATEMENT);
    if (!parsed.ok) throw new Error(parsed.error.message);
    const added = await harness.container.journal.add(importedToInput(parsed.value.trades[0]!, 's', 1), NOW);
    if (!added.ok) throw new Error(added.error.message);
    const { result } = await renderHook(() => useJournalEntry(added.value.id), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('success'));
    const data = () => (result.current.status === 'success' ? result.current.data : (null as never));
    // Stop ✓; reason ✗, not reviewed ✗. Risk unknown and rule breaks not checked for imports.
    expect(data().process.score).toBeCloseTo(1 / 3);
    await act(async () => {
      const r = await data().saveReview({ ...emptyReviewForm, rulesFollowed: true, lesson: 'Write the reason down' });
      expect(r.ok).toBe(true);
    });
    await waitFor(() => expect(data().entry.review?.lesson).toBe('Write the reason down'));
    // Stop ✓, followed plan ✓, reviewed ✓; no written reason ✗.
    expect(data().entry.processScore).toBeCloseTo(3 / 4);
    await act(async () => {
      expect((await data().saveNotes({ entryRationale: 'Pullback to support' })).ok).toBe(true);
    });
    // Notes feed the stored score too, so the list and summaries agree with this screen.
    await waitFor(() => expect(data().entry.processScore).toBe(1));
    harness.journalFiles.nextScreenshot = 'file:///docs/journal-shots/shot-1.jpg';
    await act(async () => {
      expect((await data().attachScreenshot()).ok).toBe(true);
    });
    await waitFor(() => expect(data().entry.screenshotUri).toBe('file:///docs/journal-shots/shot-1.jpg'));
    await act(async () => {
      expect((await data().remove()).ok).toBe(true);
    });
    expect(harness.journalFiles.deleted).toEqual(['file:///docs/journal-shots/shot-1.jpg']);

    const summaries = await renderHook(() => useJournalSummaries('month'), { wrapper });
    await waitFor(() => expect(summaries.result.current.status).toBe('success'));
  });
});

describe('usePsychLab', () => {
  it('lists the 14 scenarios and records an answer with its quality', async () => {
    const { result } = await renderHook(() => usePsychLab(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('success'));
    const lab = () => (result.current.status === 'success' ? result.current.data : (null as never));
    expect(lab().scenarios).toHaveLength(14);
    const scenario = lab().scenarios[0]!;
    const harmful = scenario.responses.find((r) => r.quality === 'harmful')!;
    await act(async () => {
      expect((await lab().answer(scenario, 'zz')).ok).toBe(false);
      expect((await lab().answer(scenario, harmful.id)).ok).toBe(true);
    });
    await waitFor(() => expect(lab().attempts.map((a) => a.quality)).toEqual(['harmful']));
  });
});
