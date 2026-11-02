import { render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '../../theme';
import { FLASK_PATH, LIP, MARK_COLORS, PRICE_POINTS } from '../../theme/brandMark';
import { accessibilityProblems, type HostNode } from '../../testing/a11y';
import { BootScreen } from '../brand/BootScreen';

/** Half-width of the flask body at height y (straight sides from the neck at 39.5 to the base at 75.2). */
function flaskHalfWidth(y: number): number {
  return 7 + ((y - 39.5) / (75.2 - 39.5)) * (26.6 - 7);
}

function luminance(hex: string): number {
  const ch = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as [number, number, number];
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

describe('brand mark geometry', () => {
  it('keeps every price point inside the flask body, so the line never pokes through the glass', () => {
    for (const [x, y] of PRICE_POINTS) {
      expect(y).toBeGreaterThan(39.5);
      expect(y).toBeLessThan(75.2);
      expect(Math.abs(x - 50)).toBeLessThan(flaskHalfWidth(y) - 3);
    }
  });

  it('is centred on (50, 50), so every asset can place it by its centre', () => {
    const ys = FLASK_PATH.match(/-?\d+(\.\d+)?/g)!.map(Number);
    expect(LIP.y + (84.5 - LIP.y) / 2).toBeCloseTo(50, 0);
    expect(ys).toContain(84.5);
  });

  it('draws the line with at least 4.5:1 against both the glass and the liquid, and glass at least 3:1 on the tile', () => {
    expect(contrast(MARK_COLORS.line, MARK_COLORS.glass)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(MARK_COLORS.line, MARK_COLORS.liquid)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(MARK_COLORS.glass, MARK_COLORS.tileStart)).toBeGreaterThanOrEqual(3);
    expect(contrast(MARK_COLORS.glass, MARK_COLORS.tileEnd)).toBeGreaterThanOrEqual(3);
  });
});

describe('BootScreen', () => {
  it.each(['light', 'dark'] as const)('shows the mark and the name, and speaks one status line (%s)', async (scheme) => {
    await render(
      <ThemeProvider preference={scheme}>
        <BootScreen />
      </ThemeProvider>,
    );
    const boot = screen.getByTestId('boot-screen');
    expect(boot.props.accessibilityLabel).toBe('Opening TradeLab…');
    expect(boot.props.accessibilityLiveRegion).toBe('polite');
    expect(screen.getByText('TradeLab')).toBeTruthy();
    expect(accessibilityProblems(screen.container as unknown as HostNode)).toEqual([]);
  });
});
