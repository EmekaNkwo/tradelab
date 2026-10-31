import { fireEvent, render, screen } from '@testing-library/react-native';
import { homeActions } from '../home/HomeQuickActions';
import { HomeHeader, initialsOf } from '../home/HomeHeader';
import { ACTIVE_TAB_STROKE, stackScreenOptions, TabIcon, tabScreenOptions } from '../navigation/navigatorStyles';
import { lightTheme, darkTheme, ThemeProvider } from '../../theme';
import { Button } from '../ui/Button';
import { CardHeader } from '../ui/CardHeader';
import { House } from '../ui/icons';
import type { HostNode } from '../../testing/a11y';

const inTheme = (ui: React.ReactElement) => render(<ThemeProvider preference="light">{ui}</ThemeProvider>);

describe('navigator chrome', () => {
  it.each([
    ['light', lightTheme],
    ['dark', darkTheme],
  ])('stack headers use the surface, a brand back arrow without a title, and the heading type (%s)', (_n, theme) => {
    const o = stackScreenOptions(theme);
    expect(o.headerStyle.backgroundColor).toBe(theme.colors.surface);
    expect(o.headerTintColor).toBe(theme.colors.brand);
    expect(o.headerBackButtonDisplayMode).toBe('minimal');
    expect(o.headerTitleStyle).toMatchObject({ fontSize: 17, fontWeight: '600', color: theme.colors.textPrimary });
    expect(o.contentStyle.backgroundColor).toBe(theme.colors.bg);
  });

  it('the tab bar is a surface bar with a top hairline; active is brand, inactive secondary', () => {
    const o = tabScreenOptions(lightTheme);
    expect(o.tabBarStyle).toMatchObject({ backgroundColor: lightTheme.colors.surface, borderTopColor: lightTheme.colors.border, borderTopWidth: 1 });
    expect(o.tabBarActiveTintColor).toBe(lightTheme.colors.brand);
    expect(o.tabBarInactiveTintColor).toBe(lightTheme.colors.textSecondary);
    expect(o.headerShown).toBe(false);
  });

  it('marks the active tab with a tinted pill and a heavier stroke, not colour alone', async () => {
    await inTheme(
      <>
        <TabIcon icon={House} focused color={lightTheme.colors.brand} theme={lightTheme} />
        <TabIcon icon={House} focused={false} color={lightTheme.colors.textSecondary} theme={lightTheme} />
      </>,
    );
    const active = screen.getByTestId('tab-icon-active', { includeHiddenElements: true });
    expect(active).toHaveStyle({ backgroundColor: lightTheme.colors.brandTint });
    const svgs = (screen.container as unknown as HostNode).queryAll((n) => /SvgView/.test(n.type));
    const strokes = svgs.map((n) => n.props.strokeWidth);
    expect(strokes).toContain(ACTIVE_TAB_STROKE);
    expect(strokes).toContain(1.75);
  });
});

describe('Home header', () => {
  it('takes initials from up to two words', () => {
    expect(initialsOf('ada  obi chukwu')).toBe('AO');
    expect(initialsOf(' Ngozi ')).toBe('N');
  });

  it('greets with a name and shows initials when a name exists', async () => {
    await inTheme(<HomeHeader greeting="Good afternoon" name="Ada Obi" due={{ due: false, label: 'Reminders: nothing is due' }} />);
    expect(screen.getByTestId('home-greeting')).toHaveTextContent('Good afternoon, Ada Obi');
    expect(screen.getByText('AO', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByTestId('home-bell-dot')).toBeNull();
    expect(screen.getByLabelText('Reminders: nothing is due')).toBeTruthy();
  });

  it('shows no greeting until the time zone is known, and no dot until due is known', async () => {
    await inTheme(<HomeHeader greeting={null} due={null} />);
    expect(screen.queryByTestId('home-greeting')).toBeNull();
    expect(screen.getByLabelText('Reminders')).toBeTruthy();
  });
});

describe('Home quick actions', () => {
  it('include Class only when a class is due, and only routes that can open', () => {
    const all = () => true;
    expect(homeActions(null, all).map((a) => a.key)).toEqual(['chart-lab', 'replay', 'calculator', 'more']);
    expect(homeActions({ id: 'c1' }, all)[0]).toMatchObject({ key: 'class', href: '/class/c1', primary: true });
    expect(homeActions({ id: 'c1' }, (r) => r === '/more').map((a) => a.key)).toEqual(['more']);
  });
});

describe('shared pieces', () => {
  it('the hero button is a white pill with heroEnd ink and keeps its label exact', async () => {
    const onPress = jest.fn();
    await inTheme(<Button label="Start today's class" variant="hero" onPress={onPress} />);
    const button = screen.getByRole('button', { name: "Start today's class" });
    expect(button).toHaveStyle({ backgroundColor: lightTheme.colors.onHero });
    expect(screen.getByText("Start today's class")).toHaveStyle({ color: lightTheme.colors.heroEnd });
    await fireEvent.press(button);
    expect(onPress).toHaveBeenCalled();
  });

  it('a card header can carry the simulated badge', async () => {
    await inTheme(<CardHeader icon={House} title="History (2)" badge="paper" testID="h" />);
    expect(screen.getByText('History (2)')).toBeTruthy();
    expect(screen.getByLabelText('Paper trading, simulated money')).toBeTruthy();
  });
});
