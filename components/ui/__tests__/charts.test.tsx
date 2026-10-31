import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { processColor, StyleSheet } from 'react-native';
import { ThemeProvider } from '../../../theme';
import { lightTheme } from '../../../theme/palettes';
import { heroBarColor } from '../../../theme/tokens';
import { AreaChart } from '../charts/AreaChart';
import { BarActivityChart } from '../charts/BarActivityChart';

const inTheme = (ui: ReactElement) => render(<ThemeProvider preference="light">{ui}</ThemeProvider>);
const all = { includeHiddenElements: true } as const;
const fmt = (v: number) => `${v}%`;
const points = [
  { label: 'Jan', value: 50 },
  { label: 'Feb', value: 70 },
  { label: 'Mar', value: 40 },
  { label: 'Apr', value: 60 },
];
const chartView = () => screen.getByRole('adjustable');
const layout = async (width: number) => fireEvent(chartView(), 'layout', { nativeEvent: { layout: { width, height: 180, x: 0, y: 0 } } });

describe('AreaChart', () => {
  it('summarises the data and starts on the last point', async () => {
    await inTheme(<AreaChart title="Plan-follow rate" points={points} format={fmt} testID="area" />);
    expect(chartView()).toHaveProp('accessibilityLabel', 'Plan-follow rate, 4 points from Jan to Apr. Starts at 50%, ends at 60%. Highest 70% (Feb), lowest 40% (Mar).');
    expect(chartView()).toHaveProp('accessibilityValue', { text: 'Selected: Apr, 60%' });
  });

  it('draws once it has a width, with the value pill over the selection', async () => {
    await inTheme(<AreaChart title="Rate" points={points} format={fmt} testID="area" />);
    expect(screen.queryByTestId('area-pill', all)).toBeTruthy();
    expect(chartView().queryAll((n) => n.type === 'RNSVGPath')).toHaveLength(0);
    await layout(300);
    expect(chartView().queryAll((n) => n.type === 'RNSVGPath').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('60%', all)).toBeTruthy();
  });

  it('selects the point under a tap or drag', async () => {
    const onSelect = jest.fn();
    await inTheme(<AreaChart title="Rate" points={points} format={fmt} onSelect={onSelect} />);
    await layout(300);
    await fireEvent(chartView(), 'responderGrant', { nativeEvent: { locationX: 0 } });
    expect(onSelect).toHaveBeenLastCalledWith(0);
    await fireEvent(chartView(), 'responderMove', { nativeEvent: { locationX: 110 } });
    expect(onSelect).toHaveBeenLastCalledWith(1);
    expect(chartView()).toHaveProp('accessibilityValue', { text: 'Selected: Feb, 70%' });
    expect(chartView().props.onStartShouldSetResponder()).toBe(true);
  });

  it('moves the selection with screen-reader swipes', async () => {
    await inTheme(<AreaChart title="Rate" points={points} format={fmt} initialIndex={1} />);
    await fireEvent(chartView(), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    expect(chartView()).toHaveProp('accessibilityValue', { text: 'Selected: Mar, 40%' });
    await fireEvent(chartView(), 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
    await fireEvent(chartView(), 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
    await fireEvent(chartView(), 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
    expect(chartView()).toHaveProp('accessibilityValue', { text: 'Selected: Jan, 50%' });
  });

  it('keeps a valid selection when the data shrinks, grows, or arrives (defaults to the last point)', async () => {
    const months = (n: number) => Array.from({ length: n }, (_, i) => ({ label: `M${i}`, value: i * 10 }));
    const at = (n: number, extra: object = {}) => (
      <ThemeProvider preference="light">
        <AreaChart title="Rate" points={months(n)} format={fmt} {...extra} />
      </ThemeProvider>
    );
    const view = await render(at(0));
    expect(chartView().props.accessibilityValue).toBeUndefined();
    await view.rerender(at(30));
    expect(chartView()).toHaveProp('accessibilityValue', { text: 'Selected: M29, 290%' });
    await view.rerender(at(7));
    expect(chartView()).toHaveProp('accessibilityValue', { text: 'Selected: M6, 60%' });
    await layout(300);
    await fireEvent(chartView(), 'responderGrant', { nativeEvent: { locationX: 0 } });
    await view.rerender(at(12));
    expect(chartView()).toHaveProp('accessibilityValue', { text: 'Selected: M0, 0%' });
    await view.rerender(at(0));
    expect(screen.getByText('No data yet.')).toBeTruthy();
    await view.rerender(at(5, { initialIndex: 99 }));
    expect(chartView()).toHaveProp('accessibilityValue', { text: 'Selected: M0, 0%' });
  });

  it('draws equity curves in the neutral tone, learning stats in brand', async () => {
    await inTheme(<AreaChart title="Equity" points={points} format={fmt} tone="neutral" />);
    await layout(300);
    const strokes = chartView()
      .queryAll((n) => n.type === 'RNSVGPath')
      .map((n) => (n.props.stroke as { payload?: number } | undefined)?.payload)
      .filter((p) => p !== undefined);
    expect(strokes).toContain(processColor(lightTheme.colors.textPrimary));
    expect(strokes).not.toContain(processColor(lightTheme.colors.brand));
  });

  it('says so when there is no data', async () => {
    await inTheme(<AreaChart title="Rate" points={[]} format={fmt} />);
    expect(chartView()).toHaveProp('accessibilityLabel', 'Rate: no data yet.');
    await fireEvent(chartView(), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    expect(screen.getByText('No data yet.')).toBeTruthy();
  });
});

describe('BarActivityChart', () => {
  const week = [
    { label: 'Mon', value: 20 },
    { label: 'Tue', value: 0 },
    { label: 'Wed', value: 40 },
  ];

  it('makes every bar a labelled button and starts on the last one', async () => {
    await inTheme(<BarActivityChart title="Study minutes" points={week} format={(v) => `${v} min`} testID="bars" />);
    expect(screen.getByRole('button', { name: 'Mon, 20 min' })).toBeTruthy();
    expect(screen.getByTestId('bars-bar-2')).toHaveProp('accessibilityState', { selected: true });
    expect(screen.getByTestId('bars-summary')).toHaveProp('accessibilityLabel', 'Study minutes, 3 points from Mon to Wed. Starts at 20 min, ends at 40 min. Highest 40 min (Wed), lowest 0 min (Tue).');
    // Screen readers skip fully transparent views, so the hidden summary must not use opacity 0.
    expect(StyleSheet.flatten(screen.getByTestId('bars-summary').props.style).opacity).toBeUndefined();
  });

  it('selects a bar on tap and shows its value pill', async () => {
    const onSelect = jest.fn();
    await inTheme(<BarActivityChart title="Study minutes" points={week} format={(v) => `${v} min`} onSelect={onSelect} testID="bars" />);
    await fireEvent.press(screen.getByTestId('bars-bar-0'));
    expect(onSelect).toHaveBeenCalledWith(0);
    expect(screen.getByTestId('bars-bar-0')).toHaveProp('accessibilityState', { selected: true });
    expect(screen.getByText('20 min', all)).toBeTruthy();
  });

  it('draws white bars on a dark hero: selected solid, others at the 3:1 opacity', async () => {
    await inTheme(<BarActivityChart title="Study minutes" points={week} format={(v) => `${v} min`} onDark testID="bars" />);
    const fill = (i: number) => (StyleSheet.flatten(screen.getByTestId(`bars-fill-${i}`).props.style) as { backgroundColor: string }).backgroundColor;
    expect(fill(2)).toBe(lightTheme.colors.onHero);
    expect(fill(0)).toBe(heroBarColor);
  });

  it('gives every bar at least a 44pt touch width, scrolling when they do not fit', async () => {
    const many = Array.from({ length: 14 }, (_, i) => ({ label: `D${i}`, value: i }));
    await inTheme(<BarActivityChart title="Minutes" points={many} format={String} testID="bars" />);
    for (let i = 0; i < many.length; i += 1) {
      const style = StyleSheet.flatten(screen.getByTestId(`bars-bar-${i}`).props.style) as { minWidth: number; minHeight: number };
      expect(style.minWidth).toBeGreaterThanOrEqual(44);
      expect(style.minHeight).toBeGreaterThanOrEqual(44);
    }
    expect(screen.container.queryAll((n) => /ScrollView/.test(n.type) && n.props.horizontal === true)).toHaveLength(1);
  });

  it('keeps a valid selection when the data shrinks, grows, or arrives', async () => {
    const days = (n: number) => Array.from({ length: n }, (_, i) => ({ label: `D${i}`, value: i + 1 }));
    const view = await inTheme(<BarActivityChart title="M" points={[]} format={String} testID="bars" />);
    await view.rerender(
      <ThemeProvider preference="light">
        <BarActivityChart title="M" points={days(7)} format={String} testID="bars" />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('bars-bar-6')).toHaveProp('accessibilityState', { selected: true });
    await fireEvent.press(screen.getByTestId('bars-bar-5'));
    await view.rerender(
      <ThemeProvider preference="light">
        <BarActivityChart title="M" points={days(3)} format={String} testID="bars" />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('bars-bar-2')).toHaveProp('accessibilityState', { selected: true });
  });

  it('skips values that cannot be drawn', async () => {
    await inTheme(<BarActivityChart title="M" points={[{ label: 'A', value: Number.NaN }, { label: 'B', value: 3 }]} format={String} testID="bars" />);
    expect(screen.queryByTestId('bars-bar-1')).toBeNull();
    expect(screen.getByRole('button', { name: 'B, 3' })).toBeTruthy();
  });

  it('says so when there is no activity', async () => {
    await inTheme(<BarActivityChart title="Study minutes" points={[]} format={String} />);
    expect(screen.getByText('No activity yet.')).toBeTruthy();
  });
});
