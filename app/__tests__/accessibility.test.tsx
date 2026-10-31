import { render } from '@testing-library/react-native';
import type { ComponentType } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { join } from 'node:path';
import { backtestSetup, defaultRunForm, runBacktestSliced, runInputs, templateFor } from '../../features/backtest';
import type { Container } from '../../features/app';
import { pickAndCheckCsv, saveImport } from '../../features/marketData';
import { newPaperState, paperCandles } from '../../features/paper/paperSession';
import { practiceInstrument } from '../../features/paper';
import { completeOnboarding } from '../../features/learning/useCases';
import type { UtcIso } from '../../shared/time';
import { accessibilityProblems, hiddenLabelProblems, pressables, settle, type HostNode } from '../../testing/a11y';
import { appRoutes, routePathFromFile } from '../../testing/appRoutes';
import { hourlyCsv } from '../../testing/csvFixtures';
import { resetRouterMock, searchParams } from '../../testing/routerMock';
import { fixtureContent } from '../../testing/strategyFixtures';
import { createTestHarness, TestProviders, type TestHarness } from '../../testing/testContainer';

jest.mock('expo-router', () => jest.requireActual<typeof import('../../testing/routerMock')>('../../testing/routerMock').createRouterModule());


/** Every interactive element on these screens has a role, a name, and a 44×44 target (spec §31). */
interface Prepared {
  readonly params?: Record<string, string>;
  /** A container with different content (e.g. the reviewed trader fixtures). */
  readonly container?: Container;
}
type Setup = (h: TestHarness) => Promise<Prepared>;

const NOW = '2026-10-29T10:00:00.000Z' as UtcIso;
const none: Setup = async () => ({});
async function onboard(h: TestHarness): Promise<string> {
  const r = await completeOnboarding(h.container, {
    riskAcknowledged: true,
    experience: 'complete_beginner',
    markets: ['forex'],
    goals: ['understand_markets'],
    explanationLevel: 'simple',
    metaTrader: null,
    timeZone: 'Africa/Lagos',
    programId: 'practical-forex-trader',
    settings: { startDate: '2026-10-29' as never, timeline: { kind: 'weeks', weeks: 4 }, studyDays: [1, 2, 3, 4, 5], dailyMinutes: 15 },
    classTime: null,
    remindersEnabled: false,
    placementPassedModuleIds: [],
  });
  if (!r.ok) throw new Error('onboarding failed');
  return r.value.id;
}
const onboarded: Setup = async (h) => {
  await onboard(h);
  return {};
};
const params =
  (p: Record<string, string>): Setup =>
  async () => ({ params: p });
async function saveStrategy(h: TestHarness) {
  const trend = templateFor('trend-following-moving-averages')!;
  const v = await h.container.backtests.saveVersion({ strategyId: null, name: 'Trend', definition: trend.definition, templateId: trend.strategyId, note: '' }, NOW);
  if (!v.ok) throw new Error(v.error.message);
  return v.value;
}
const savedStrategy: Setup = async (h) => {
  const v = await saveStrategy(h);
  return { params: { id: v.strategyId, strategyId: v.strategyId } };
};
const savedRun: Setup = async (h) => {
  const v = await saveStrategy(h);
  const inputs = runInputs(v.definition, { ...defaultRunForm(v.definition, 4), candles: '500' }, { versionsTried: 1, otherVersionsWithOutOfSample: 0 });
  if (!inputs.ok) throw new Error('inputs');
  const ds = await h.container.datasets.load(inputs.value.dataset);
  if (!ds.ok) throw new Error('data');
  const setup = backtestSetup(v.definition, inputs.value, ds.value);
  if (!setup.ok) throw new Error(setup.error.message);
  const r = await runBacktestSliced(setup.value, { yieldToLoop: async () => undefined });
  if (!r.ok || r.value.kind !== 'done') throw new Error('run');
  const run = await h.container.backtests.saveRun(v.strategyId, v.version, inputs.value, r.value.result, NOW);
  if (!run.ok) throw new Error(run.error.message);
  return { params: { id: run.value.id } };
};
const journalEntry: Setup = async (h) => {
  const e = await h.container.journal.add(
    {
      source: 'manual', sourceRef: null, externalId: null, market: 'forex', instrument: 'EURUSD', direction: 'buy', strategy: null, entry: '1.1', stop: '1.09', target: null,
      size: '0.1', sizeUnit: 'lots', exit: '1.09', pnlMoney: '-100', pnlPips: null, pnlR: '-1', plannedRisk: '100', costs: null, equityAtEntry: '10000', openedAt: null, closedAt: null,
      conditions: null, entryRationale: 'Retest', exitRationale: null, emotion: null, ruleViolations: [], noteBefore: null, noteAfter: null, screenshotUri: null, processScore: 0.8,
    },
    NOW,
  );
  if (!e.ok) throw new Error(e.error.message);
  return { params: { id: e.value.id } };
};
const paperAccount: Setup = async (h) => {
  const instrument = practiceInstrument('sim-eurusd')!;
  const state = newPaperState(instrument, paperCandles(instrument, 'range', 7, 'H1'), 7, '10000');
  if (!state.ok) throw new Error(state.error.message);
  const a = await h.container.paper.create({ name: 'Practice', instrumentId: instrument.id, scenarioKind: 'range', seed: 7, timeframe: 'H1', startingBalance: '10000', state: state.value }, NOW);
  if (!a.ok) throw new Error(a.error.message);
  return { params: { id: a.value.id } };
};
const dailyClass: Setup = async (h) => {
  const enrolment = await onboard(h);
  const classes = await h.container.learning.classes(enrolment);
  if (!classes.ok || !classes.value[0]) throw new Error('no class');
  return { params: { id: classes.value[0].id } };
};
const importedData: Setup = async (h) => {
  h.datasetFiles.nextCsv = { name: 'eurusd-h1.csv', text: hourlyCsv(400) };
  const picked = await pickAndCheckCsv(h.container);
  if (!picked.ok || !picked.value) throw new Error('pick');
  const saved = await saveImport(h.container, picked.value, { symbol: 'EURUSD', name: 'Euro', market: 'forex', currency: 'USD', utcOffset: '+00:00' });
  if (!saved.ok) throw new Error(saved.error.message);
  return { params: { id: saved.value.id } };
};
const withTraders =
  (p: Record<string, string> = {}): Setup =>
  async (h) => ({ params: p, container: { ...h.container, content: fixtureContent() } });

/** Screens by file, relative to this test, with what each needs to show its content. */
const SCREENS: readonly [string, string, Setup][] = [
  ['Home', '../(tabs)/home/index', onboarded],
  ['Program', '../(tabs)/home/program', onboarded],
  ['Onboarding', '../onboarding', none],
  ['Learn', '../(tabs)/learn/index', none],
  ['Programs', '../(tabs)/learn/programs', none],
  ['Glossary', '../(tabs)/learn/glossary', none],
  ['Glossary term', '../glossary/[id]', params({ id: 'ask' })],
  ['Calculators', '../(tabs)/learn/calculators', none],
  ['MetaTrader tasks', '../(tabs)/learn/metatrader', none],
  ['MetaTrader task', '../mt-task/[id]', params({ id: 'mt-add-pairs' })],
  ['Lesson', '../lesson/[id]', params({ id: 'fx-breakouts' })],
  ['Practice', '../(tabs)/practice/index', none],
  ['Chart Lab', '../(tabs)/practice/chart-lab', none],
  ['Replay', '../(tabs)/practice/replay', none],
  ['Drill', '../(tabs)/practice/drill', params({ kind: 'trend' })],
  ['Paper trading', '../(tabs)/practice/paper/index', none],
  ['Journal', '../(tabs)/journal/index', none],
  ['New journal entry', '../(tabs)/journal/new', none],
  ['Journal stats', '../(tabs)/journal/stats', none],
  ['Psychology Lab', '../(tabs)/journal/psychology', none],
  ['Statement import', '../(tabs)/journal/import', none],
  ['Strategies', '../(tabs)/strategies/index', none],
  ['Strategy page', '../strategy/[id]', params({ id: 'channel-breakout' })],
  ['More', '../(tabs)/more/index', none],
  ['Settings', '../(tabs)/more/settings', none],
  ['Risk rules', '../(tabs)/more/risk-rules', none],
  ['Trading plan', '../(tabs)/more/plan/index', none],
  ['Edit trading plan', '../(tabs)/more/plan/edit', none],
  ['Checklist', '../(tabs)/more/checklist', none],
  ['Sessions', '../(tabs)/more/sessions', none],
  ['Broker check', '../(tabs)/more/broker-check', none],
  ['Progress review', '../(tabs)/more/progress-review', none],
  ['Backup', '../(tabs)/more/backup', none],
  ['About', '../(tabs)/more/about', none],
  ['Services', '../(tabs)/more/services', none],
  ['Labs', '../labs/index', none],
  ['Lab concepts', '../labs/concepts/[lab]', params({ lab: 'technical' })],
  ['Lab concept', '../labs/concept/[id]', params({ id: 'ta-false-breakouts' })],
  ['Companies', '../labs/companies', none],
  ['Company', '../labs/company/[id]', params({ id: 'example-faxworth-machines' })],
  ['Red flags', '../labs/red-flags', none],
  ['Red flag case', '../labs/red-flag/[id]', params({ id: 'rf-dilution-reverse-splits' })],
  ['Scenarios', '../labs/scenarios', none],
  ['Scenario', '../labs/scenario/[id]', params({ id: 'cs-crude-inventory-draw' })],
  ['Market comparison', '../labs/markets', none],
  ['Backtesting Lab', '../backtest/index', none],
  ['Builder', '../backtest/builder', none],
  ['Your strategy', '../backtest/strategy/[id]', savedStrategy],
  ['Run a backtest', '../backtest/run', savedStrategy],
  ['Playbook', '../backtest/playbook/[id]', savedStrategy],
  ['Compare', '../backtest/compare', none],
  ['Portfolio', '../portfolio/index', none],
  ['Sandbox', '../portfolio/sandbox', none],
  ['Progress', '../progress/index', onboarded],
  ['Challenges', '../progress/challenges', none],
  ['Challenge', '../progress/challenge/[id]', params({ id: 'backtesting' })],
  ['Skill', '../progress/skill/[id]', params({ id: 'chart_reading' })],
  ['Price data', '../data/index', none],
  ['Import price data', '../data/import', none],
  ['Calendar', '../calendar/index', none],
  ['Calendar event', '../calendar/[id]', params({ id: 'ce-central-bank-meeting' })],
  ['News to Learning', '../news', none],
  ['Coach', '../coach', none],
  ['Review', '../review', onboarded],
  ['Daily class', '../class/[id]', dailyClass],
  ['Backtest report', '../backtest/result/[id]', savedRun],
  ['Journal entry', '../(tabs)/journal/entry/[id]', journalEntry],
  ['Paper account', '../(tabs)/practice/paper/[id]', paperAccount],
  ['Price data set', '../data/[id]', importedData],
  ['Famous traders', '../traders', withTraders()],
  ['Trader page', '../trader/[id]', withTraders({ id: 'fixture-trader' })],
  ['Research Library', '../research/index', withTraders()],
  // Dev builds only (release builds cannot reach it: devRoutes.test.tsx); every shared component, light and dark.
  ['Component gallery (dev)', '../dev/gallery', none],
];

/** Routes not in the table above, each with the reason. */
const NOT_CHECKED: Readonly<Record<string, string>> = {
  '/': 'A redirect to /home; it renders nothing interactive.',
};

let harness: TestHarness;
beforeEach(async () => {
  harness = await createTestHarness();
  resetRouterMock();
});
afterEach(() => harness.db.close());

describe('accessibility of interactive elements', () => {
  it('covers every route file, or says why not', () => {
    const covered = new Set(SCREENS.map(([, path]) => routePathFromFile(join(__dirname, path))));
    const missing = appRoutes().filter((r) => !covered.has(r) && !(r in NOT_CHECKED));
    expect(missing).toEqual([]);
  });

  it.each(SCREENS)('%s', async (_name, path, setup) => {
    const prepared = await setup(harness);
    searchParams.current = prepared.params ?? {};
    const Screen = require(path).default as ComponentType; // eslint-disable-line @typescript-eslint/no-require-imports
    const view = await render(
      <TestProviders container={prepared.container ?? harness.container}>
        <Screen />
      </TestProviders>,
    );
    await settle(6);
    const root = view.container as unknown as HostNode;
    expect(accessibilityProblems(root)).toEqual([]);
    expect(hiddenLabelProblems(root)).toEqual([]);
    await view.unmount();
  });

  it('the helper reports a missing role, name or input label, and a target under 44×44 in either direction', async () => {
    const view = await render(
      <>
        <Pressable onPress={() => undefined} style={{ minHeight: 44, minWidth: 44 }}>
          <Text>No role</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => undefined} style={{ minHeight: 44 }} />
        <Pressable accessibilityRole="button" accessibilityLabel="Tiny" onPress={() => undefined} style={{ height: 20, width: 20 }} />
        <Pressable accessibilityRole="button" accessibilityLabel="Tiny with slop" hitSlop={12} onPress={() => undefined} style={{ height: 20, width: 20 }} />
        <View style={{ flexDirection: 'row' }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Narrow in a row" onPress={() => undefined} style={{ minHeight: 44 }} />
          <Pressable accessibilityRole="button" accessibilityLabel="Grows in a row" onPress={() => undefined} style={{ minHeight: 44, flex: 1 }} />
        </View>
        <Text accessibilityRole="link" onPress={() => undefined}>
          Standalone text link
        </Text>
        <Text>
          Running text with an <Text accessibilityRole="link" onPress={() => undefined}>inline link</Text>.
        </Text>
        <TextInput placeholder="Unlabelled" />
        <TextInput accessibilityLabel="Labelled" />
      </>,
    );
    const problems = accessibilityProblems(view.container as unknown as HostNode).map((p) => `${p.element}: ${p.problem}`);
    expect(problems).toEqual([
      'TextInput "Unlabelled": text input has no accessibilityLabel',
      'View "No role": every pressable needs an accessibilityRole',
      'View "": no accessible name (label or text)',
      expect.stringMatching(/^View "Tiny": touch target under 44×44/),
      expect.stringMatching(/^View "Narrow in a row": touch target under 44×44 .*not stretched/),
      expect.stringMatching(/^Text "Standalone text link": touch target under 44×44/),
    ]);
  });

  it('the helper reports a choice that does not say which group it is in (TalkBack skips a plain View’s label)', async () => {
    const chip = (label: string, hint?: string) => (
      <Pressable accessibilityRole="radio" accessibilityLabel={label} accessibilityHint={hint} onPress={() => undefined} style={{ minHeight: 44, minWidth: 44 }} />
    );
    const view = await render(
      <>
        <View accessibilityRole="radiogroup" accessibilityLabel="Direction">
          {chip('Buy', 'Direction')}
          {chip('Sell')}
        </View>
        <View accessibilityRole="radiogroup">{chip('Unnamed group', 'Something')}</View>
      </>,
    );
    const problems = accessibilityProblems(view.container as unknown as HostNode).map((p) => `${p.element}: ${p.problem}`);
    expect(problems).toEqual(['View "Sell": choice does not name its group "Direction"', 'View "Unnamed group": choice group has no accessibilityLabel']);
  });

  it('the helper matches the group name exactly, not as part of an option name', async () => {
    const view = await render(
      <View accessibilityLabel="Market">
        <Pressable accessibilityRole="checkbox" accessibilityLabel="Market order" onPress={() => undefined} style={{ minHeight: 44, minWidth: 44 }} />
        <Pressable accessibilityRole="checkbox" accessibilityLabel="Limit" accessibilityHint="Market" onPress={() => undefined} style={{ minHeight: 44, minWidth: 44 }} />
      </View>,
    );
    const problems = accessibilityProblems(view.container as unknown as HostNode).map((p) => `${p.element}: ${p.problem}`);
    expect(problems).toEqual(['View "Market order": choice does not name its group "Market"']);
  });

  it('the helper reports a hidden choice label with no visible equivalent on screen', async () => {
    const chip = <Pressable accessibilityRole="radio" accessibilityLabel="Yes" accessibilityHint="Followed" onPress={() => undefined} style={{ minHeight: 44, minWidth: 44 }} />;
    const shown = await render(
      <>
        <Text>Followed</Text>
        <View accessibilityRole="radiogroup" accessibilityLabel="Followed">{chip}</View>
        <Text>What is your experience?</Text>
        <View accessibilityRole="radiogroup" accessibilityLabel="Experience">{chip}</View>
      </>,
    );
    expect(hiddenLabelProblems(shown.container as unknown as HostNode)).toEqual([]);
    const missing = await render(
      <View accessibilityRole="radiogroup" accessibilityLabel="Followed">
        {chip}
      </View>,
    );
    expect(hiddenLabelProblems(missing.container as unknown as HostNode)).toEqual([{ element: 'group "Followed"', problem: 'label is hidden but no equivalent text is shown' }]);
  });

  it('the checks run on real controls', async () => {
    const Screen = require('../(tabs)/more/settings').default as ComponentType; // eslint-disable-line @typescript-eslint/no-require-imports
    const view = await render(
      <TestProviders container={harness.container}>
        <Screen />
      </TestProviders>,
    );
    await settle(6);
    expect(pressables(view.container as unknown as HostNode).length).toBeGreaterThan(3);
  });
});
