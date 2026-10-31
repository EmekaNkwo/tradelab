import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { accessibilityProblems, hiddenLabelProblems, type HostNode } from '../../testing/a11y';
import { resetRouterMock, searchParams } from '../../testing/routerMock';
import { expectSimulatedFiguresBadged, simulatedFigureCount } from '../../testing/simulatedFigures';
import { createTestHarness, TestProviders, type TestHarness } from '../../testing/testContainer';
import CalculatorsScreen from '../(tabs)/learn/calculators';

jest.mock('expo-router', () => jest.requireActual<typeof import('../../testing/routerMock')>('../../testing/routerMock').createRouterModule());

/** Calculators restyle (brief §5.7): input card, result hero with a split figure and formula, assumptions under it. */
let harness: TestHarness;
beforeEach(async () => {
  harness = await createTestHarness();
  resetRouterMock();
});
afterEach(() => harness.db.close());

const renderWith = (ui: ReactElement) => render(<TestProviders container={harness.container}>{ui}</TestProviders>);
const root = () => screen.container as unknown as HostNode;
/** A calculation is not simulated account money: no money markers, so no Simulated badge is required or shown. */
const checkScreen = () => {
  expect(accessibilityProblems(root())).toEqual([]);
  expect(hiddenLabelProblems(root())).toEqual([]);
  expectSimulatedFiguresBadged(root());
  expect(simulatedFigureCount(root())).toBe(0);
  expect(screen.queryByText(/^Simulated$/)).toBeNull();
};

describe('Calculators', () => {
  it('leads with the answer as a split figure on the hero, labelled a calculation, with the formula under it', async () => {
    await renderWith(<CalculatorsScreen />);
    const hero = await screen.findByTestId('calculator-hero');
    expect(hero.props.accessibilityLiveRegion).toBe('polite');
    expect(screen.getByText('Calculation only')).toBeTruthy();
    expect(screen.getByLabelText('One pip in your account currency, 1.00 USD, calculation only')).toHaveTextContent('1.00 USD');
    expect(screen.getByText(/^Pip value =/)).toBeTruthy();
    expect(screen.getByText('Details')).toBeTruthy();
    expect(screen.getByTestId('calculator-assumptions')).toHaveTextContent(/100,000 units per lot/);
    checkScreen();
  });

  it('shows units inside the large fields', async () => {
    await renderWith(<CalculatorsScreen />);
    expect(screen.getByTestId('field-lots').props.accessibilityHint).toBe('1 lot = 100,000 units of the base currency. Unit: lots.');
    expect(screen.getByText('lots', { includeHiddenElements: true })).toBeTruthy();
    // The help caption repeats the hint, so it is hidden from screen readers.
    const help = screen.getByText('1 lot = 100,000 units of the base currency', { includeHiddenElements: true });
    const hidden = (n: typeof help | null): boolean => !!n && (n.props.accessibilityElementsHidden === true || hidden(n.parent));
    expect(hidden(help)).toBe(true);
    expect(screen.queryByText('1 lot = 100,000 units of the base currency')).toBeNull();
    expect(screen.queryByTestId('calculator-formula')).toBeNull();
  });

  it('signs a profit or loss and marks its direction with an arrow, still only a calculation', async () => {
    searchParams.current = { calc: 'profit_loss' };
    await renderWith(<CalculatorsScreen />);
    const figure = await screen.findByTestId('calculator-signed');
    expect(figure).toHaveTextContent(/^[+\u2212\u00b1]/);
    expect(figure.props.accessibilityLabel).toMatch(/(gain of|loss of|no gain or loss).*calculation only$/);
    expect(screen.getByText('Calculation only')).toBeTruthy();
    checkScreen();
  });

  it('puts the futures warnings with the assumptions and keeps the hero for the result', async () => {
    searchParams.current = { calc: 'futures_contract' };
    await renderWith(<CalculatorsScreen />);
    expect(screen.getByLabelText(/^Profit or loss, (gain of|loss of|no gain or loss)/)).toBeTruthy();
    const assumptions = screen.getByTestId('calculator-assumptions');
    expect(assumptions).toHaveTextContent(/Margin is not the maximum loss/);
    expect(assumptions).toHaveTextContent(/Every futures contract has its own tick size/);
    checkScreen();
  });

  it('a text answer still leads the hero; bad input replaces the hero with the error', async () => {
    await renderWith(<CalculatorsScreen />);
    await fireEvent.press(screen.getByRole('radio', { name: 'Free margin and margin level' }));
    await fireEvent.changeText(screen.getByTestId('field-usedMargin'), '0');
    expect(await screen.findByText('No open positions')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('field-usedMargin'), 'abc');
    expect(await screen.findByTestId('calculator-error')).toBeTruthy();
    expect(screen.queryByTestId('calculator-hero')).toBeNull();
    expect(screen.getByTestId('calculator-assumptions')).toBeTruthy();
    // The formula stays in view while the error shows.
    expect(screen.getByTestId('calculator-formula')).toHaveTextContent(/^Formula: /);
    checkScreen();
  });
});
