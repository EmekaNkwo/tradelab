import { generateScenario } from '../../../domain/market/scenarios';
import { advancePaper, placePaperOrder, practiceInstrument, startPaper, type PaperState } from '../../../domain/simulation';
import { dec } from '../../../shared/decimal';
import type { UtcIso } from '../../../shared/time';
import { openTestDatabase, type TestDatabase } from '../../../testing/nodeSqlite';
import { createBackup } from '../../backup/export';
import { restoreBackup } from '../../backup/restore';
import { createChangeBus } from '../../db/changeBus';
import { runMigrations } from '../../db/migrate';
import { MIGRATIONS } from '../../db/migrations';
import { createJournalRepository, type JournalEntryInput } from '../journalRepository';
import { createPaperRepository, parsePaperState, serialisePaperState } from '../paperRepository';
import { createSettingsRepository } from '../settingsRepository';

const NOW = '2026-10-29T10:00:00.000Z' as UtcIso;
const LATER = '2026-10-29T11:00:00.000Z' as UtcIso;
let seq = 0;
const newId = (prefix: string) => `${prefix}_${(seq += 1)}`;

async function fresh(): Promise<TestDatabase> {
  const db = openTestDatabase();
  await runMigrations(db, MIGRATIONS, NOW);
  return db;
}

const fx = practiceInstrument('sim-eurusd')!;
const candles = generateScenario({ kind: 'range', seed: 3, startPrice: fx.startPrice, precision: fx.precision }).candles;

function tradedState(): PaperState {
  const s0 = startPaper(fx, candles, 50, dec(10000));
  if (!s0.ok) throw new Error(s0.error.message);
  const mid = candles[50]!.close;
  const placed = placePaperOrder(s0.value, fx, candles, {
    side: 'buy',
    type: 'market',
    size: dec('0.1'),
    price: null,
    stopLoss: mid.minus('0.0050'),
    takeProfit: null,
    violations: ['risk_per_trade'],
    plannedRisk: dec(50),
    equityAtOrder: dec(10000),
  });
  if (!placed.ok) throw new Error(placed.error.message);
  return advancePaper(advancePaper(placed.value, fx, candles), fx, candles);
}

describe('paperRepository', () => {
  it('round-trips the full engine state exactly', () => {
    const s = tradedState();
    const back = parsePaperState(JSON.stringify(serialisePaperState(s)));
    expect(back).not.toBeNull();
    expect(serialisePaperState(back!)).toEqual(serialisePaperState(s));
    expect(back!.positions[0]!.entry.eq(s.positions[0]!.entry)).toBe(true);
    expect(parsePaperState('{"nope":1}')).toBeNull();
    expect(parsePaperState('not json')).toBeNull();
    const stored = serialisePaperState(s);
    // A cursor past the last candle would crash the chart; an unknown instrument cannot be priced.
    expect(parsePaperState(JSON.stringify({ ...stored, cursor: 400 }))).toBeNull();
    expect(parsePaperState(JSON.stringify({ ...stored, instrumentId: 'sim-unknown' }))).toBeNull();
  });

  it('creates, saves, resets, lists, and removes accounts', async () => {
    const db = await fresh();
    const repo = createPaperRepository(db, createChangeBus(), newId);
    const s = tradedState();
    const input = { name: ' Forex practice ', instrumentId: fx.id, scenarioKind: 'range', seed: 3, timeframe: 'H1' as const, startingBalance: '10000', state: s };
    expect((await repo.create({ ...input, name: '' }, NOW)).ok).toBe(false);
    const created = await repo.create(input, NOW);
    if (!created.ok) throw new Error(created.error.message);
    expect(created.value.name).toBe('Forex practice');
    const advanced = advancePaper(s, fx, candles);
    expect((await repo.saveState(created.value.id, advanced, LATER)).ok).toBe(true);
    const got = await repo.get(created.value.id);
    expect(got.ok && got.value.state.cursor).toBe(advanced.cursor);
    expect((await repo.reset(created.value.id, 9, s, LATER)).ok).toBe(true);
    const list = await repo.list();
    expect(list.ok && list.value.map((a) => [a.seed, a.resets])).toEqual([[9, 1]]);
    expect((await repo.saveState('missing', s, LATER)).ok).toBe(false);
    await db.runAsync("INSERT INTO paper_account VALUES ('bad', 'Bad', 'x', 'range', 1, 'H1', '1', 'garbage', 0, ?, ?)", [NOW, NOW]);
    const listed = await repo.list();
    expect(listed.ok && listed.value).toHaveLength(1);
    expect((await repo.get('bad')).ok).toBe(false);
    expect((await repo.remove(created.value.id)).ok).toBe(true);
    expect((await repo.get(created.value.id)).ok).toBe(false);
  });
});

const ENTRY: JournalEntryInput = {
  source: 'mt_import',
  sourceRef: 'statement.htm',
  externalId: 'mt4:1001',
  market: 'forex',
  instrument: 'EURUSD',
  direction: 'sell',
  strategy: null,
  entry: '1.1000',
  stop: null,
  target: null,
  size: '0.1',
  sizeUnit: 'lots',
  exit: '1.0950',
  pnlMoney: '50',
  pnlPips: null,
  pnlR: null,
  plannedRisk: null,
  costs: '-0.7',
  equityAtEntry: null,
  openedAt: '2026-10-01T10:00:00',
  closedAt: '2026-10-01T12:00:00',
  conditions: null,
  entryRationale: '  ',
  exitRationale: null,
  emotion: null,
  ruleViolations: [],
  noteBefore: null,
  noteAfter: null,
  screenshotUri: null,
  processScore: null,
};

describe('journalRepository', () => {
  it('adds entries, skips duplicates on import, and keeps sources apart', async () => {
    const db = await fresh();
    const repo = createJournalRepository(db, createChangeBus(), newId);
    const first = await repo.add(ENTRY, NOW);
    if (!first.ok) throw new Error(first.error.message);
    expect(first.value.entryRationale).toBeNull();
    const many = await repo.addMany([ENTRY, { ...ENTRY, externalId: 'mt4:1002' }, { ...ENTRY, source: 'manual', externalId: null }], LATER);
    expect(many.ok && many.value).toEqual({ added: 2, duplicates: 1 });
    const ids = await repo.externalIds('mt_import');
    expect(ids.ok && [...ids.value].sort()).toEqual(['mt4:1001', 'mt4:1002']);
    const manual = await repo.list({ source: 'manual' });
    expect(manual.ok && manual.value).toHaveLength(1);
    expect((await repo.addMany([{ ...ENTRY, entry: 'abc' }], NOW)).ok).toBe(false);
  });

  it('saves a review, notes, and emotion ratings, and validates them', async () => {
    const db = await fresh();
    const repo = createJournalRepository(db, createChangeBus(), newId);
    const e = await repo.add(ENTRY, NOW);
    if (!e.ok) throw new Error(e.error.message);
    const review = { thesis: 'Range top', planVsActual: 'As planned', rulesFollowed: true, resultNote: 'Won', lesson: 'Set the stop first', nextGoal: 'Stops', reviewedAt: LATER };
    expect((await repo.saveReview(e.value.id, { ...review, lesson: ' ' }, 0.5, LATER)).ok).toBe(false);
    expect((await repo.saveReview(e.value.id, review, 2, LATER)).ok).toBe(false);
    expect((await repo.saveReview(e.value.id, review, 0.6, LATER)).ok).toBe(true);
    expect((await repo.updateNotes(e.value.id, { emotion: { confidence: 6, stress: 1, patience: 1, feeling: null } }, LATER)).ok).toBe(false);
    expect((await repo.updateNotes(e.value.id, { emotion: { confidence: 4, stress: 2, patience: 3, feeling: 'calm' }, noteAfter: 'ok' }, LATER)).ok).toBe(true);
    expect((await repo.updateNotes(e.value.id, { id: 'x' } as never, LATER)).ok).toBe(false);
    const got = await repo.get(e.value.id);
    if (!got.ok) throw new Error(got.error.message);
    expect(got.value).toMatchObject({ processScore: 0.6, review, noteAfter: 'ok', emotion: { feeling: 'calm' }, updatedAt: LATER });
    expect((await repo.remove(e.value.id)).ok).toBe(true);
    expect((await repo.remove(e.value.id)).ok).toBe(false);
  });

  it('records Psychology Lab answers', async () => {
    const repo = createJournalRepository(await fresh(), createChangeBus(), newId);
    expect((await repo.recordPsych({ scenarioId: 'psych-fomo', responseId: 'b', quality: 'helpful' }, NOW)).ok).toBe(true);
    expect((await repo.recordPsych({ scenarioId: '', responseId: 'b', quality: 'helpful' }, NOW)).ok).toBe(false);
    const all = await repo.psychAttempts();
    expect(all.ok && all.value.map((a) => a.quality)).toEqual(['helpful']);
  });

  it('skips an unreadable row instead of failing the list', async () => {
    const db = await fresh();
    const repo = createJournalRepository(db, createChangeBus(), newId);
    await repo.add(ENTRY, NOW);
    await db.runAsync("UPDATE journal_entry SET rule_violations = 'oops'", []);
    const list = await repo.list();
    expect(list.ok && list.value).toEqual([]);
  });
});

describe('risk rules setting and backup', () => {
  it('stores risk rules, rejects out-of-range ones, and backs up every Phase 5 table', async () => {
    const db = await fresh();
    const bus = createChangeBus();
    const settings = createSettingsRepository(db, bus);
    const current = await settings.get();
    if (!current.ok) throw new Error(current.error.message);
    expect(current.value.riskRules.maxRiskPerTradePercent).toBe(1);
    expect((await settings.update({ riskRules: { ...current.value.riskRules, maxRiskPerTradePercent: 50 } }, NOW)).ok).toBe(false);
    expect((await settings.update({ riskRules: { ...current.value.riskRules, maxRiskPerTradePercent: 0.5 } }, NOW)).ok).toBe(true);

    await createPaperRepository(db, bus, newId).create(
      { name: 'FX', instrumentId: 'sim-eurusd', scenarioKind: 'range', seed: 1, timeframe: 'H1', startingBalance: '10000', state: tradedState() },
      NOW,
    );
    const journal = createJournalRepository(db, bus, newId);
    await journal.add({ ...ENTRY, screenshotUri: 'file:///docs/journal-shots/a.jpg' }, NOW);
    await journal.recordPsych({ scenarioId: 'psych-fomo', responseId: 'a', quality: 'harmful' }, NOW);
    const backup = await createBackup(db, '0.1.0', NOW);
    if (!backup.ok) throw new Error(backup.error.message);
    const target = await fresh();
    expect((await restoreBackup(target, createChangeBus(), backup.value)).ok).toBe(true);
    const restored = await createSettingsRepository(target, createChangeBus()).get();
    expect(restored.ok && restored.value.riskRules.maxRiskPerTradePercent).toBe(0.5);
    const accounts = await createPaperRepository(target, createChangeBus(), newId).list();
    expect(accounts.ok && accounts.value).toHaveLength(1);
    const entries = await createJournalRepository(target, createChangeBus(), newId).list();
    expect(entries.ok && entries.value).toHaveLength(1);
    // Screenshots stay on the phone, so their paths are not carried in the backup.
    expect(backup.value.tables.journal_entry![0]!.screenshot_uri).toBeNull();
    expect(entries.ok && entries.value[0]!.screenshotUri).toBeNull();

    const tables = backup.value.tables;
    const badState = { ...backup.value, tables: { ...tables, paper_account: tables.paper_account!.map((r) => ({ ...r, state: '{}' })) } };
    expect((await restoreBackup(await fresh(), createChangeBus(), badState)).ok).toBe(false);
    const badEntry = { ...backup.value, tables: { ...tables, journal_entry: tables.journal_entry!.map((r) => ({ ...r, review: '{"x":1}' })) } };
    expect((await restoreBackup(await fresh(), createChangeBus(), badEntry)).ok).toBe(false);
  });
});
