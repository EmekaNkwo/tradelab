import type { Theme } from '../../theme';

/**
 * Every chart colour decision, from the theme (brief §8). Pure, so it is tested without rendering and survives
 * PriceChart being swapped for another version: the chart only reads `chartPalette(theme)`.
 *
 * Candles and result bars use the gain/loss fills (≥3:1 on the chart surface), never brand green. Drawings use
 * brand, the second indicator tone is violet, the crosshair and grid stay quiet.
 */
export interface ChartTheme {
  readonly background: string;
  readonly frame: string;
  readonly grid: string;
  readonly gainCandle: string;
  readonly lossCandle: string;
  /** Close line in line style. */
  readonly line: string;
  readonly crosshair: string;
  readonly axisText: string;
  /** Trend lines, levels, Fibonacci, and indicators with the `primary` tone (the chart shares that slot). */
  readonly drawing: string;
  /** Zones are drawn in `drawing` at this opacity. */
  readonly zoneOpacity: number;
  /** Second indicator tone (EMA, channel, MACD signal), distinct from `drawing`. */
  readonly overlaySecondary: string;
}

export function chartTheme(theme: Theme): ChartTheme {
  const c = theme.colors;
  return {
    background: c.surface,
    frame: c.border,
    grid: c.border,
    gainCandle: c.gain,
    lossCandle: c.loss,
    line: c.textPrimary,
    crosshair: c.textSecondary,
    axisText: c.textSecondary,
    drawing: c.brand,
    zoneOpacity: 0.12,
    overlaySecondary: c.simulatedBadge,
  };
}

/** The slots PriceChart reads by name; level and indicator tones (chartModel) index into it. */
export interface ChartPalette {
  readonly surface: string;
  readonly border: string;
  readonly positive: string;
  readonly negative: string;
  readonly text: string;
  readonly textMuted: string;
  readonly primary: string;
  readonly modeReplay: string;
}

/** The chart's colours under the slot names the chart component reads, so it needs one line to adopt them. */
export function chartPalette(theme: Theme): ChartPalette {
  const t = chartTheme(theme);
  return {
    surface: t.background,
    border: t.grid,
    positive: t.gainCandle,
    negative: t.lossCandle,
    text: t.line,
    textMuted: t.crosshair,
    primary: t.drawing,
    modeReplay: t.overlaySecondary,
  };
}
