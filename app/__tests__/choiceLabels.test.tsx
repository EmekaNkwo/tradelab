import { fireEvent, render, screen } from '@testing-library/react-native';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { ReactElement } from 'react';
import { PreTradeChecklist } from '../../components/plan/PreTradeChecklist';
import { CHECKLIST } from '../../features/plan';
import { hiddenLabelProblems, settle, type HostNode } from '../../testing/a11y';
import { resetRouterMock } from '../../testing/routerMock';
import { createTestHarness, TestProviders, type TestHarness } from '../../testing/testContainer';
import StrategiesScreen from '../(tabs)/strategies/index';
import BuilderScreen from '../backtest/builder';
import OnboardingScreen from '../onboarding';

jest.mock('expo-router', () => jest.requireActual<typeof import('../../testing/routerMock')>('../../testing/routerMock').createRouterModule());

const ROOT = join(__dirname, '..', '..');

/**
 * Every `hideLabel` use, reviewed: each sits right below a heading or question with equivalent text
 * (checked on screen by hiddenLabelProblems, here and in accessibility.test.tsx). A new use must be added here.
 */
const REVIEWED_HIDE_LABEL: Readonly<Record<string, number>> = {
  'app/(tabs)/home/program.tsx': 1,
  'app/(tabs)/more/services.tsx': 1,
  'app/(tabs)/more/settings.tsx': 1,
  'app/(tabs)/strategies/index.tsx': 1,
  'app/backtest/builder.tsx': 1,
  'app/onboarding.tsx': 6,
  'components/labs/PickExercise.tsx': 1,
  'components/learning/QuestionCard.tsx': 1,
  'components/learning/ScheduleFields.tsx': 4,
};

/** `hideLabel` written as a JSX attribute (not a prop definition, default or condition). */
const HIDE_LABEL_ATTRIBUTE = /(?<![\w.])hideLabel(?=\s*$|\s+[A-Za-z{]|\s*\/?>)/gm;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === '__tests__' || name === 'node_modules') return [];
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith('.tsx') ? [path] : [];
  });
}

let harness: TestHarness;
beforeEach(async () => {
  harness = await createTestHarness();
  resetRouterMock();
});
afterEach(() => harness.db.close());

const renderWith = (ui: ReactElement) => render(<TestProviders container={harness.container}>{ui}</TestProviders>);
const root = () => screen.container as unknown as HostNode;
const press = async (name: string | RegExp) => fireEvent.press(await screen.findByRole('button', { name }));

describe('hidden choice labels', () => {
  it('are used only at the reviewed call sites', () => {
    const found: Record<string, number> = {};
    for (const file of [...sourceFiles(join(ROOT, 'app')), ...sourceFiles(join(ROOT, 'components'))]) {
      const count = readFileSync(file, 'utf8').match(HIDE_LABEL_ATTRIBUTE)?.length ?? 0;
      const rel = relative(ROOT, file);
      if (count > 0 && !rel.startsWith('components/ui/')) found[rel] = count;
    }
    expect(found).toEqual(REVIEWED_HIDE_LABEL);
  });

  it('every onboarding step that hides a label shows its question instead (incl. the schedule fields and a placement question)', async () => {
    await renderWith(<OnboardingScreen />);
    const check = () => expect(hiddenLabelProblems(root())).toEqual([]);
    await fireEvent.press(screen.getByRole('checkbox', { name: /I understand/ }));
    await press('Continue');
    check();
    await fireEvent.press(screen.getByRole('radio', { name: 'Complete beginner' }));
    await press('Continue');
    check();
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Forex' }));
    await press('Continue');
    check();
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Risk management' }));
    await press('Continue');
    check();
    await press('Continue');
    check(); // MetaTrader
    await press('Continue');
    expect(await screen.findByTestId('plan-preview')).toBeTruthy();
    check(); // program and schedule
    await press('Continue');
    await fireEvent.press((await screen.findAllByRole('button', { name: /^Test out of / }))[0]!);
    await settle();
    expect(screen.getAllByRole('radio').length + screen.queryAllByRole('checkbox').length).toBeGreaterThan(0);
    check(); // placement question
  });

  it('the strategy filters show each filter name above its chips', async () => {
    await renderWith(<StrategiesScreen />);
    await settle();
    await press('Filters');
    expect(screen.getByTestId('strategy-filters')).toBeTruthy();
    expect(hiddenLabelProblems(root())).toEqual([]);
  });
});

describe('labels shown once', () => {
  it('an optional limit turned on names itself once, above the toggle, not again on its stepper', async () => {
    await renderWith(<BuilderScreen />);
    await settle();
    const label = 'Stop for the day after losing %';
    const on = screen.getAllByRole('radio', { name: 'On' }).find((n) => n.props.accessibilityHint === label);
    if (!on) throw new Error('no toggle for the limit');
    await fireEvent.press(on);
    expect(screen.getAllByText(label)).toHaveLength(1);
    expect(screen.getByRole('button', { name: `Raise ${label}` })).toBeTruthy();
  });

  it('the pre-trade checklist shows each question once, readable by screen readers, with stable answer testIDs', async () => {
    await renderWith(<PreTradeChecklist answers={{}} onAnswer={() => undefined} fixed={['stop_set']} />);
    for (const item of CHECKLIST) {
      const text = item.id === 'stop_set' ? `${item.question} (answered from your order)` : item.question;
      const shown = screen.getAllByText(text);
      expect(shown).toHaveLength(1);
      for (let n: HostNode | null = shown[0] as unknown as HostNode; n; n = n.parent) {
        expect(n.props.accessibilityElementsHidden).not.toBe(true);
        expect(n.props.importantForAccessibility).not.toBe('no-hide-descendants');
      }
      for (const [value, name] of [['yes', 'Yes'], ['no', 'No'], ['unsure', 'Not sure']] as const) {
        const segment = screen.getByTestId(`checklist-${item.id}-${value}`);
        expect(segment.props.accessibilityLabel).toBe(name);
        expect(segment.props.accessibilityHint).toBe(text);
      }
    }
  });
});
