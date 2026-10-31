import { CHART_OVERLAY_IDS, CHART_PANE_IDS, type OverlayId, type PaneId } from '../../domain/market/chartIds';
import { SCENARIO_KINDS, type ScenarioKind } from '../../domain/market/scenarios';

/** A Chart Lab setup opened from a lab concept (spec §11 "annotated chart"). */
export interface ChartLabPreset {
  readonly kind: ScenarioKind;
  readonly overlays: readonly OverlayId[];
  readonly pane: PaneId;
  /** What to look for, shown above the chart. */
  readonly lookFor: string | null;
}

export interface ChartLabParams {
  readonly scenario?: string;
  readonly overlays?: string;
  readonly pane?: string;
  readonly lookFor?: string;
}

const isOneOf = <T extends string>(list: readonly T[], v: string | undefined): v is T => v !== undefined && (list as readonly string[]).includes(v);

/** Route params → preset. Unknown values are dropped, so a bad link opens the normal Chart Lab. */
export function presetFromParams(p: ChartLabParams): ChartLabPreset | null {
  if (!isOneOf(SCENARIO_KINDS, p.scenario)) return null;
  const overlays = (p.overlays ?? '').split(',').filter((o): o is OverlayId => isOneOf(CHART_OVERLAY_IDS, o));
  const lookFor = (p.lookFor ?? '').trim().slice(0, 500);
  return { kind: p.scenario, overlays: [...new Set(overlays)], pane: isOneOf(CHART_PANE_IDS, p.pane) ? p.pane : 'volume', lookFor: lookFor || null };
}

/** Preset → route params, for links. */
export function presetToParams(preset: { readonly scenario: string; readonly overlays: readonly string[]; readonly pane: string; readonly lookFor: string }): Required<ChartLabParams> {
  return { scenario: preset.scenario, overlays: preset.overlays.join(','), pane: preset.pane, lookFor: preset.lookFor };
}
