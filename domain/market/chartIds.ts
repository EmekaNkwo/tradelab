/** Chart overlays and lower panes the app can draw; content presets are checked against these. */
export const CHART_OVERLAY_IDS = ['sma20', 'ema50', 'bollinger', 'channel20'] as const;
export const CHART_PANE_IDS = ['none', 'volume', 'rsi', 'macd', 'atr'] as const;
export type OverlayId = (typeof CHART_OVERLAY_IDS)[number];
export type PaneId = (typeof CHART_PANE_IDS)[number];
