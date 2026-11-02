import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { AccessibilityInfo, StyleSheet, Text } from 'react-native';
import { accessibilityProblems, type HostNode } from '../../../testing/a11y';
import { ThemeProvider } from '../../../theme';
import { darkTheme, lightTheme } from '../../../theme/palettes';
import { Button } from '../Button';
import { Card } from '../Card';
import { CategoryBar } from '../CategoryBar';
import { ChangeChip, chipColors } from '../ChangeChip';
import { HeroCard, heroStops } from '../HeroCard';
import { AreaChart } from '../charts/AreaChart';
import { BarActivityChart } from '../charts/BarActivityChart';
import { AppText } from '../AppText';
import { listGroupItemStyle } from '../ListScreen';
import { expectSimulatedFiguresBadged, unbadgedSimulatedFigures } from '../../../testing/simulatedFigures';
import { BookOpen } from '../icons';
import { IconWell } from '../IconWell';
import { InstrumentIcon } from '../InstrumentIcon';
import { ListRow } from '../ListRow';
import { PeriodPicker } from '../PeriodPicker';
import { PnLValue } from '../PnLValue';
import { QuickAction } from '../QuickAction';
import { SectionHeader } from '../SectionHeader';
import { SimulatedBadge } from '../SimulatedBadge';
import { SplitNumber } from '../SplitNumber';
import { StatTile } from '../StatTile';
import { EmptyState, ErrorState, LoadingState, SkeletonState } from '../StateViews';
import { MINUS } from '../valueParts';

const inTheme = (ui: ReactElement, preference: 'light' | 'dark' = 'light') => render(<ThemeProvider preference={preference}>{ui}</ThemeProvider>);
const flat = (node: { props: { style?: unknown } }) => StyleSheet.flatten(node.props.style as never) as Record<string, unknown>;
const all = { includeHiddenElements: true } as const;

describe('ChangeChip', () => {
  it('shows sign, arrow and value, and spells out the direction', async () => {
    await inTheme(<ChangeChip direction="down" value="4.3%" tone="result" subject="Equity" testID="chip" />);
    expect(screen.getByText(`${MINUS}4.3%`, all)).toBeTruthy();
    expect(screen.getByTestId('chip')).toHaveProp('accessibilityLabel', 'Equity, loss of 4.3%');
    expect(screen.getByTestId('chip').queryAll((n) => /RNSVG/.test(n.type)).length).toBeGreaterThan(0);
  });

  it('uses result colours for results and brand/secondary for learning stats', () => {
    expect(chipColors('up', 'result')).toEqual({ fg: 'gainText', bg: 'gainTint' });
    expect(chipColors('down', 'result')).toEqual({ fg: 'lossText', bg: 'lossTint' });
    expect(chipColors('flat', 'result')).toEqual({ fg: 'textSecondary', bg: 'surfaceMuted' });
    expect(chipColors('up', 'neutral')).toEqual({ fg: 'brand', bg: 'brandTint' });
    expect(chipColors('down', 'neutral')).toEqual({ fg: 'textSecondary', bg: 'surfaceMuted' });
  });

  it('draws in white over the hero overlay', async () => {
    await inTheme(<ChangeChip direction="up" value="2" onHero testID="chip" />);
    expect(screen.getByTestId('chip')).toHaveProp('accessibilityLabel', 'up 2');
    expect(flat(screen.getByText('+2', all)).color).toBe(lightTheme.colors.onHero);
  });
});

describe('PnLValue', () => {
  it('shows signed money and R with an arrow, and a spoken label', async () => {
    await inTheme(<PnLValue direction="up" amount="$42.50" r="1.7R" subject="Result" testID="pnl" />);
    expect(screen.getByText('+$42.50 · +1.7R', all)).toBeTruthy();
    expect(screen.getByTestId('pnl')).toHaveProp('accessibilityLabel', 'Result, gain of $42.50, 1.7 R');
    expect(flat(screen.getByText('+$42.50 · +1.7R', all)).color).toBe(lightTheme.colors.gainText);
  });

  it('never speaks a sign on R, the direction is already in words', async () => {
    await inTheme(<PnLValue direction="down" amount="$10" r={`${MINUS}0.5R`} testID="pnl" />);
    expect(screen.getByTestId('pnl')).toHaveProp('accessibilityLabel', 'loss of $10, 0.5 R');
    expect(screen.getByText(`${MINUS}$10 · ${MINUS}0.5R`, all)).toBeTruthy();
  });

  it('uses the loss and neutral colours', async () => {
    await inTheme(
      <>
        <PnLValue direction="down" amount="$18.00" />
        <PnLValue direction="flat" amount="$0.00" />
      </>,
    );
    expect(flat(screen.getByText(`${MINUS}$18.00`, all)).color).toBe(lightTheme.colors.lossText);
    expect(flat(screen.getByText('±$0.00', all)).color).toBe(lightTheme.colors.textSecondary);
  });
});

describe('SimulatedBadge', () => {
  it.each([
    ['simulated', 'Simulated', 'Simulated money, not real'],
    ['paper', 'Paper', 'Paper trading, simulated money'],
    ['replay', 'Replay', 'Replay, simulated money'],
    ['demo', 'Demo (MT)', 'MetaTrader demo account, not real money'],
    ['backtest', 'Backtest · Simulated', 'Backtest, simulated results'],
  ] as const)('%s is a visible text pill', async (kind, text, spoken) => {
    await inTheme(<SimulatedBadge kind={kind} testID="b" />);
    expect(screen.getByText(text, all)).toBeTruthy();
    expect(screen.getByTestId('b')).toHaveProp('accessibilityLabel', spoken);
  });

  it('adds a detail such as the replay date', async () => {
    await inTheme(<SimulatedBadge kind="replay" detail="3 Mar 2024" testID="b" />);
    expect(screen.getByText('Replay · 3 Mar 2024', all)).toBeTruthy();
    expect(screen.getByTestId('b')).toHaveProp('accessibilityLabel', 'Replay, simulated money, 3 Mar 2024');
  });
});

describe('SplitNumber', () => {
  it('renders the integer and smaller decimals under one label', async () => {
    await inTheme(<SplitNumber value="$10,430.25" accessibilityLabel="Equity, simulated, $10,430.25" testID="n" />);
    const n = screen.getByTestId('n');
    expect(n).toHaveProp('accessibilityLabel', 'Equity, simulated, $10,430.25');
    expect(n).toHaveTextContent('$10,430.25');
    const inner = screen.getByText('.25', all);
    expect(flat(inner).fontSize).toBeLessThan(flat(n).fontSize as number);
    expect(flat(n).fontVariant).toEqual(['tabular-nums']);
  });

  it('leaves whole numbers alone', async () => {
    await inTheme(<SplitNumber value="1,200" size="title" accessibilityLabel="1,200" testID="n" />);
    expect(screen.getByTestId('n')).toHaveTextContent('1,200');
  });
});

describe('StatTile', () => {
  it('labels the figure and shows the change chip and simulated badge on the same tile', async () => {
    await inTheme(<StatTile caption="Balance" value="$10,000.00" split simulated="paper" change={{ direction: 'up', value: '2%', subject: 'Balance vs last week' }} testID="t" />);
    expect(screen.getByLabelText('Balance, simulated, $10,000.00')).toBeTruthy();
    expect(screen.getByText('Paper', all)).toBeTruthy();
    expect(screen.getByLabelText('Balance vs last week, up 2%')).toBeTruthy();
  });

  it('shows a plain value without split, and says the caption once', async () => {
    await inTheme(<StatTile caption="Quiz accuracy" value="82%" surface="card" />);
    expect(screen.getByLabelText('Quiz accuracy, 82%')).toHaveTextContent('82%');
    expect(screen.getByText('Quiz accuracy', all)).toHaveProp('importantForAccessibility', 'no');
    // A stat is not a heading.
    expect(screen.queryByRole('header')).toBeNull();
  });
});

describe('ListRow', () => {
  it('keeps the existing label and adds value and trailing text', async () => {
    const onPress = jest.fn();
    await inTheme(<ListRow title="Buy EUR/USD" subtitle="Paper" value="0.10 lots" trailing={<Text>x</Text>} trailingLabel="gain of $4" onPress={onPress} testID="row" icon={BookOpen} />);
    const row = screen.getByTestId('row');
    expect(row).toHaveProp('accessibilityLabel', 'Buy EUR/USD. Paper. 0.10 lots. gain of $4');
    expect(row).toHaveProp('accessibilityRole', 'button');
    await fireEvent.press(row);
    expect(onPress).toHaveBeenCalled();
  });

  it('is plain information, with no chevron or button role, when not tappable', async () => {
    await inTheme(<ListRow title="Gold" leading={<InstrumentIcon symbol="XAUUSD" />} testID="row" />);
    const row = screen.getByTestId('row');
    expect(row).toHaveProp('accessibilityLabel', 'Gold');
    expect(row.props.accessibilityRole).toBeUndefined();
  });
});

describe('CategoryBar', () => {
  it('fills to the clamped percent and labels label, caption and value', async () => {
    await inTheme(<CategoryBar label="Risk" caption="12 questions" percent={140} icon={BookOpen} testID="c" />);
    // The value is said once, from accessibilityValue.text, not repeated in the label.
    expect(screen.getByTestId('c')).toHaveProp('accessibilityLabel', 'Risk, 12 questions');
    expect(screen.getByTestId('c')).toHaveProp('accessibilityValue', { min: 0, max: 100, now: 100, text: '100%' });
    expect(flat(screen.getByTestId('c-fill', all)).width).toBe('100%');
  });

  it('shows a custom value', async () => {
    await inTheme(<CategoryBar label="EUR/USD" percent={30} value="3 trades" fill="gain" testID="c" />);
    expect(screen.getByTestId('c')).toHaveProp('accessibilityLabel', 'EUR/USD');
    // A custom value keeps its own unit in the spoken text; `now` still drives the bar.
    expect(screen.getByTestId('c')).toHaveProp('accessibilityValue', { min: 0, max: 100, now: 30, text: '3 trades' });
  });
});

describe('SectionHeader and QuickAction', () => {
  it('links "See all" with a spoken label', async () => {
    const onAction = jest.fn();
    await inTheme(<SectionHeader title="Recent trades" onAction={onAction} />);
    await fireEvent.press(screen.getByLabelText('See all, Recent trades'));
    expect(onAction).toHaveBeenCalled();
    expect(screen.getByText('See all →')).toBeTruthy();
  });

  it('has no link without an action', async () => {
    await inTheme(<SectionHeader title="Focus next" />);
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('quick action is a labelled button, filled when primary', async () => {
    const onPress = jest.fn();
    await inTheme(
      <>
        <QuickAction icon={BookOpen} label="Class" onPress={onPress} primary testID="qa" />
        <QuickAction icon={BookOpen} label="Replay" onPress={onPress} />
      </>,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Class' }));
    expect(onPress).toHaveBeenCalledTimes(1);
    const circle = screen.getByTestId('qa').children[0] as unknown as { props: { style?: unknown } };
    expect(flat(circle).backgroundColor).toBe(lightTheme.colors.brand);
  });
});

describe('PeriodPicker', () => {
  const options = [
    { value: 'week', label: 'This week' },
    { value: 'month', label: 'This month' },
  ] as const;

  it('opens from the pill and closes after a choice', async () => {
    const onChange = jest.fn();
    await inTheme(<PeriodPicker label="Period" options={options} value="week" onChange={onChange} testIDPrefix="p" />);
    const toggle = screen.getByTestId('p-toggle');
    expect(toggle).toHaveProp('accessibilityLabel', 'Period: This week');
    expect(screen.queryByTestId('p-month')).toBeNull();
    await fireEvent.press(toggle);
    expect(screen.getByTestId('p-toggle')).toHaveProp('accessibilityState', { expanded: true });
    expect(screen.getByTestId('p-week')).toHaveProp('accessibilityState', { selected: true });
    await fireEvent.press(screen.getByTestId('p-month'));
    expect(onChange).toHaveBeenCalledWith('month');
    expect(screen.queryByTestId('p-month')).toBeNull();
  });

  it('renders as chips', async () => {
    const onChange = jest.fn();
    await inTheme(<PeriodPicker label="Month" variant="chips" options={options} value="month" onChange={onChange} />);
    await fireEvent.press(screen.getByRole('radio', { name: 'This week' }));
    expect(onChange).toHaveBeenCalledWith('week');
  });

  it('works on a hero', async () => {
    await inTheme(<PeriodPicker label="Period" options={options} value="week" onChange={jest.fn()} onHero testIDPrefix="p" />);
    expect(screen.getByText('This week')).toBeTruthy();
  });
});

describe('Card, HeroCard, IconWell, InstrumentIcon', () => {
  it('cards use a soft shadow in light and a border in dark', async () => {
    await inTheme(<Card testID="c">{null}</Card>);
    expect(flat(screen.getByTestId('c'))).toMatchObject({ borderWidth: 0, shadowOpacity: 0.06, borderRadius: 20 });
    await inTheme(<Card testID="c">{null}</Card>, 'dark');
    expect(flat(screen.getByTestId('c'))).toMatchObject({ borderWidth: 1, borderColor: darkTheme.colors.border });
    await inTheme(
      <Card testID="c" variant="tile" accent="modePaper">
        {null}
      </Card>,
    );
    // An accent is a soft outline all round, never a side stripe.
    expect(flat(screen.getByTestId('c'))).toMatchObject({ backgroundColor: lightTheme.colors.surfaceMuted, borderWidth: 1.5, borderColor: `${lightTheme.colors.modePaper}80` });
    expect(flat(screen.getByTestId('c')).borderLeftWidth).toBeUndefined();
  });

  it('hero card draws the gradient, the optional pill and its children', async () => {
    await inTheme(
      <HeroCard pill={<SimulatedBadge />} testID="h">
        <Text>Inside</Text>
      </HeroCard>,
    );
    expect(screen.getByText('Inside')).toBeTruthy();
    expect(screen.getByText('Simulated', all)).toBeTruthy();
    expect(screen.getByTestId('h').queryAll((n) => /LinearGradient/.test(n.type)).length).toBe(1);
  });

  it('the light hero variant uses the soft end stop in both themes', async () => {
    expect(heroStops(lightTheme, 'light')).toEqual([lightTheme.colors.heroStart, lightTheme.colors.heroSoftEnd]);
    expect(heroStops(darkTheme, 'light')).toEqual([darkTheme.colors.heroStart, darkTheme.colors.heroSoftEnd]);
    expect(heroStops(darkTheme, 'strong')).toEqual([darkTheme.colors.heroStart, darkTheme.colors.heroEnd]);
    await inTheme(
      <HeroCard variant="light" testID="h">
        {null}
      </HeroCard>,
      'dark',
    );
    expect(screen.getByTestId('h').queryAll((n) => /LinearGradient/.test(n.type))).toHaveLength(1);
  });

  it('a simulated hero shows the badge and makes the figures inside say "simulated"', async () => {
    await inTheme(
      <HeroCard simulated="paper" pill={<Text>Week</Text>} testID="h">
        <SplitNumber value="$10,430.25" accessibilityLabel="Equity, $10,430.25" money testID="n" />
        <SplitNumber value="$5.00" accessibilityLabel="Paper balance, $5.00" testID="n2" />
      </HeroCard>,
    );
    expect(screen.getByText('Paper', all)).toBeTruthy();
    expect(screen.getByText('Week')).toBeTruthy();
    expect(screen.getByTestId('n')).toHaveProp('accessibilityLabel', 'Equity, $10,430.25, simulated');
    // Already says it: not repeated.
    expect(screen.getByTestId('n2')).toHaveProp('accessibilityLabel', 'Paper balance, $5.00');
    expectSimulatedFiguresBadged(screen.container as unknown as HostNode);
  });

  it('icon wells and instrument icons are hidden from screen readers', async () => {
    await inTheme(
      <>
        <IconWell icon={BookOpen} tone="onHero" testID="w" />
        {['EUR/USD', 'NGN/USD', 'XAUUSD', 'XAGUSD', 'USOIL', 'US500', 'AAPL', 'AUDNZD', 'CHF/CAD', 'GBP/CNH'].map((s) => (
          <InstrumentIcon key={s} symbol={s} testID={`i-${s}`} size={44} />
        ))}
      </>,
    );
    expect(screen.getByTestId('w', all)).toHaveProp('importantForAccessibility', 'no-hide-descendants');
    expect(screen.getByTestId('i-EUR/USD', all).queryAll((n) => n.type === 'RNSVGClipPath').length).toBe(2);
    // Glyphs follow the requested size.
    expect(flat(screen.getByTestId('i-XAUUSD', all))).toMatchObject({ width: 44, height: 44 });
    // An unknown currency falls back to a letter circle; a stock gets a letter avatar.
    expect(screen.getByTestId('i-NGN/USD', all).queryAll((n) => n.type === 'RNSVGText').length).toBe(1);
    expect(screen.getByText('A', all)).toBeTruthy();
  });
});

/** Starts a press (Pressability's responder grant) without releasing it. */
async function pressDown(testID: string) {
  await fireEvent(screen.getByTestId(testID), 'responderGrant', { nativeEvent: { touches: [], changedTouches: [], timestamp: 0 }, persist: jest.fn() });
  await act(async () => undefined);
}

describe('Button', () => {
  afterEach(() => jest.restoreAllMocks());

  it('scales to 0.98 while pressed', async () => {
    await inTheme(<Button label="Go" onPress={jest.fn()} testID="b" />);
    await pressDown('b');
    expect(flat(screen.getByTestId('b')).transform).toEqual([{ scale: 0.98 }]);
  });

  it('does not scale with reduce motion on', async () => {
    // Once: RN's Jest mock is itself a jest.fn, so a persistent value would leak into later tests.
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValueOnce(true);
    await inTheme(<Button label="Go" onPress={jest.fn()} variant="secondary" testID="b" />);
    await act(async () => undefined);
    await pressDown('b');
    expect(flat(screen.getByTestId('b')).transform).toEqual([{ scale: 1 }]);
    // Still pressed: the secondary fill changes, only the scale is dropped.
    expect(flat(screen.getByTestId('b')).backgroundColor).toBe(lightTheme.colors.brandTint);
  });

  it('danger and busy states keep the label', async () => {
    await inTheme(<Button label="Delete" variant="danger" busy onPress={jest.fn()} testID="b" />);
    expect(screen.getByTestId('b')).toHaveProp('accessibilityState', { disabled: true, busy: true, expanded: undefined });
    expect(screen.getByTestId('b')).toHaveProp('accessibilityLabel', 'Delete');
    expect(screen.getByText('Delete')).toBeTruthy();
  });

  it('danger shows a pressed fill', async () => {
    await inTheme(<Button label="Delete" variant="danger" onPress={jest.fn()} testID="b" />);
    expect(flat(screen.getByTestId('b')).backgroundColor).toBe(lightTheme.colors.lossText);
    await pressDown('b');
    expect(flat(screen.getByTestId('b')).backgroundColor).toBe(lightTheme.colors.lossStrong);
  });
});

describe('QuickAction press feedback', () => {
  afterEach(() => jest.restoreAllMocks());

  it('scales while pressed, and not with reduce motion on', async () => {
    await inTheme(<QuickAction icon={BookOpen} label="Class" onPress={jest.fn()} testID="qa" />);
    await pressDown('qa');
    expect(flat(screen.getByTestId('qa')).transform).toEqual([{ scale: 0.98 }]);
    // Once: RN's Jest mock is itself a jest.fn, so a persistent value would leak into later tests.
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValueOnce(true);
    await inTheme(<QuickAction icon={BookOpen} label="Replay" onPress={jest.fn()} testID="qa2" />);
    await act(async () => undefined);
    await pressDown('qa2');
    expect(flat(screen.getByTestId('qa2')).transform).toEqual([{ scale: 1 }]);
  });
});

describe('state views', () => {
  it('skeleton is static and announced once', async () => {
    await inTheme(<SkeletonState hero rows={2} label="Loading trades" />);
    expect(screen.getByTestId('skeleton')).toHaveProp('accessibilityLabel', 'Loading trades');
  });

  it('empty state has an icon well, one line and an action', async () => {
    const onAction = jest.fn();
    await inTheme(<EmptyState title="No trades yet" body="Place a paper trade." actionLabel="New order" onAction={onAction} />);
    await fireEvent.press(screen.getByRole('button', { name: 'New order' }));
    expect(onAction).toHaveBeenCalled();
  });

  it('error and loading states still render', async () => {
    await inTheme(
      <>
        <LoadingState />
        <ErrorState error={{ kind: 'StorageError', message: 'x' }} onRetry={jest.fn()} />
      </>,
    );
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });
});

describe('accessibility harness', () => {
  it.each(['light', 'dark'] as const)('finds no problems across the new components (%s)', async (scheme) => {
    const week = [
      { label: 'Mon', value: 20 },
      { label: 'Tue', value: 35 },
    ];
    const view = await inTheme(
      <>
        <QuickAction icon={BookOpen} label="Class" onPress={jest.fn()} />
        <SectionHeader title="Trades" onAction={jest.fn()} />
        <ListRow title="Row" onPress={jest.fn()} />
        <PeriodPicker label="Month" variant="chips" options={[{ value: 'a', label: 'Jan' }]} value="a" onChange={jest.fn()} />
        <PeriodPicker label="Period" options={[{ value: 'a', label: 'This week' }]} value="a" onChange={jest.fn()} />
        <Button label="Go" onPress={jest.fn()} />
        <ChangeChip direction="up" value="4%" subject="Quiz accuracy" />
        <PnLValue direction="down" amount="$3.00" />
        <SimulatedBadge kind="paper" />
        <StatTile caption="Balance" value="$10.00" simulated="paper" change={{ direction: 'up', value: '1%' }} />
        <CategoryBar label="Risk" percent={40} />
        <AreaChart title="Rate" points={week} format={String} />
        <BarActivityChart title="Minutes" points={week} format={String} />
      </>,
      scheme,
    );
    expect(accessibilityProblems(view.container as unknown as HostNode)).toEqual([]);
  });
});

describe('simulated money must be badged on its card', () => {
  it('passes when the card (or the tile) carries a SimulatedBadge', async () => {
    const view = await inTheme(
      <>
        <Card>
          <SimulatedBadge kind="paper" />
          <PnLValue direction="up" amount="$4" />
        </Card>
        <Card>
          <StatTile caption="Balance" value="$10.00" money simulated="paper" />
        </Card>
      </>,
    );
    expectSimulatedFiguresBadged(view.container as unknown as HostNode);
  });

  it('flags money with no badge on its card, and money outside any card', async () => {
    const view = await inTheme(
      <>
        <Card>
          <StatTile caption="Equity" value="$10.00" money split />
        </Card>
        <PnLValue direction="up" amount="$4" />
      </>,
    );
    expect(unbadgedSimulatedFigures(view.container as unknown as HostNode)).toEqual([
      { figure: 'Equity, $10.00', problem: 'card has no SimulatedBadge' },
      { figure: 'gain of $4', problem: 'money figure is not inside a card' },
    ]);
  });
});

describe('ListRow trailing content needs a spoken label', () => {
  it('is a type error to pass trailing without trailingLabel', async () => {
    // @ts-expect-error trailingLabel is required with trailing
    await inTheme(<ListRow title="Row" trailing={<Text>x</Text>} testID="row" />);
    expect(screen.getByTestId('row')).toHaveProp('accessibilityLabel', 'Row');
  });
});

describe('AppText heading role', () => {
  it('is a heading for title and heading, opt-in for display, and can be turned off', async () => {
    await inTheme(
      <>
        <AppText variant="title">T</AppText>
        <AppText variant="heading">H</AppText>
        <AppText variant="display">$1</AppText>
        <AppText variant="display" header>
          D
        </AppText>
        <AppText variant="title" header={false}>
          N
        </AppText>
      </>,
    );
    expect(screen.getAllByRole('header').map((n) => n.props.children)).toEqual(['T', 'H', 'D']);
  });
});

describe('ListScreen rows', () => {
  it('have no hard borders in light and keep the hairline in dark', () => {
    expect(listGroupItemStyle(lightTheme, 0, 2)).toMatchObject({ borderTopWidth: 0, borderLeftWidth: 0, borderTopLeftRadius: 20 });
    expect(listGroupItemStyle(darkTheme, 0, 2)).toMatchObject({ borderTopWidth: 1, borderLeftWidth: 1, borderBottomWidth: 0 });
    expect(listGroupItemStyle(darkTheme, 2, 2)).toMatchObject({ borderTopWidth: 0, borderBottomWidth: 1, borderBottomRightRadius: 20 });
    expect(listGroupItemStyle(lightTheme, 1, 2)).toMatchObject({ borderTopLeftRadius: 0, borderBottomLeftRadius: 0 });
  });
});
