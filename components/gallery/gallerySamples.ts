import type { ChartPoint } from '../ui/charts/chartMath';

/** Made-up sample values for the dev-only gallery. Never shown in the app's screens. */
export const SAMPLE_WEEK: readonly ChartPoint[] = [
  { label: 'Mon', value: 20 },
  { label: 'Tue', value: 35 },
  { label: 'Wed', value: 0 },
  { label: 'Thu', value: 45 },
  { label: 'Fri', value: 30 },
  { label: 'Sat', value: 15 },
  { label: 'Sun', value: 25 },
];

export const SAMPLE_TREND: readonly ChartPoint[] = [
  { label: 'Jan', value: 52 },
  { label: 'Feb', value: 58 },
  { label: 'Mar', value: 55 },
  { label: 'Apr', value: 64 },
  { label: 'May', value: 71 },
  { label: 'Jun', value: 69 },
];

export const minutes = (v: number): string => `${v} min`;
export const percent = (v: number): string => `${v}%`;
