import { darkTheme, lightTheme } from '../../../theme/palettes';
import { chartPalette, chartTheme } from '../chartTheme';

function luminance(hex: string): number {
  const ch = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as [number, number, number];
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

describe.each([
  ['light', lightTheme],
  ['dark', darkTheme],
])('chart theme (%s)', (_n, theme) => {
  const t = chartTheme(theme);

  it('candles use the gain/loss fills, never brand green', () => {
    expect(t.gainCandle).toBe(theme.colors.gain);
    expect(t.lossCandle).toBe(theme.colors.loss);
    expect(t.gainCandle).not.toBe(theme.colors.brand);
  });

  it('candles, line, drawings, crosshair and indicators (non-text) meet 3:1 on the chart background', () => {
    for (const color of [t.gainCandle, t.lossCandle, t.line, t.drawing, t.crosshair, t.overlaySecondary]) {
      expect(contrast(color, t.background)).toBeGreaterThanOrEqual(3);
    }
  });

  it('axis text is text: 4.5:1 on the chart background', () => {
    expect(contrast(t.axisText, t.background)).toBeGreaterThanOrEqual(4.5);
  });

  it('the chart palette puts chart colours in the token slots the chart reads', () => {
    const p = chartPalette(theme);
    expect(p.positive).toBe(t.gainCandle);
    expect(p.negative).toBe(t.lossCandle);
    expect(p.primary).toBe(t.drawing);
    expect(p.textMuted).toBe(t.crosshair);
    expect(p.border).toBe(t.grid);
    expect(p.surface).toBe(t.background);
    expect(p.text).toBe(t.line);
    expect(p.modeReplay).toBe(t.overlaySecondary);
    expect(t.zoneOpacity).toBeGreaterThan(0);
    expect(t.frame).toBe(theme.colors.border);
  });

  it('holds only the chart slots', () => {
    expect(Object.keys(chartPalette(theme)).sort()).toEqual(['border', 'modeReplay', 'negative', 'positive', 'primary', 'surface', 'text', 'textMuted']);
  });

  it('does not change the theme it reads', () => {
    const before = JSON.stringify(theme.colors);
    chartPalette(theme);
    expect(JSON.stringify(theme.colors)).toBe(before);
  });
});
