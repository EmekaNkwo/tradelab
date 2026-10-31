import { areaPath, barFractions, chartSummary, clampSelection, finitePoints, indexAtX, pillLeft, selectedText, smoothPath, stepIndex, toPoints, valueRange } from '../charts/chartMath';

const box = { width: 300, height: 120, top: 20, bottom: 0 };
const fmt = (v: number) => `${v}%`;

describe('chart geometry', () => {
  it('spreads points across the width and maps the range to the usable height', () => {
    const pts = toPoints([0, 50, 100], box);
    expect(pts.map((p) => p.x)).toEqual([0, 150, 300]);
    expect(pts[0]!.y).toBe(120);
    expect(pts[2]!.y).toBe(20);
  });

  it('centres a single point and widens a flat range', () => {
    expect(toPoints([5], box)[0]!.x).toBe(150);
    expect(valueRange([3, 3])).toEqual({ min: 2, max: 4 });
    expect(valueRange([])).toEqual({ min: 0, max: 1 });
  });

  it('draws a smooth path that never overshoots the data', () => {
    const pts = toPoints([10, 80, 20, 90, 90, 40], box);
    const d = smoothPath(pts);
    expect(d.startsWith('M0,')).toBe(true);
    const ys = [...d.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map((m) => Number(m[2]));
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(20 - 1e-9);
    expect(Math.max(...ys)).toBeLessThanOrEqual(120 + 1e-9);
    expect(smoothPath([])).toBe('');
    expect(smoothPath([{ x: 1, y: 2 }])).toBe('M1,2');
  });

  it('closes the area down to the baseline', () => {
    const pts = toPoints([1, 2], box);
    expect(areaPath(pts, 120)).toMatch(/ L300,120 L0,120 Z$/);
    expect(areaPath([], 120)).toBe('');
  });

  it('selects the nearest point to a touch, clamped', () => {
    expect(indexAtX(0, 300, 7)).toBe(0);
    expect(indexAtX(160, 300, 7)).toBe(3);
    expect(indexAtX(999, 300, 7)).toBe(6);
    expect(indexAtX(-20, 300, 7)).toBe(0);
    expect(indexAtX(10, 0, 7)).toBe(0);
  });

  it('keeps the value pill inside the chart', () => {
    expect(pillLeft(5, 60, 300)).toBe(0);
    expect(pillLeft(150, 60, 300)).toBe(120);
    expect(pillLeft(299, 60, 300)).toBe(240);
  });

  it('steps a selection for screen readers, clamped', () => {
    expect(stepIndex(0, -1, 5)).toBe(0);
    expect(stepIndex(4, 1, 5)).toBe(4);
    expect(stepIndex(2, 1, 5)).toBe(3);
  });

  it('scales bars to the tallest, ignoring negatives', () => {
    expect(barFractions([0, 25, 50])).toEqual([0, 0.5, 1]);
    expect(barFractions([0, 0])).toEqual([0, 0]);
    expect(barFractions([-5, 10])).toEqual([0, 1]);
  });
});

describe('chart data hygiene', () => {
  it('drops values that cannot be drawn', () => {
    const pts = [
      { label: 'a', value: 1 },
      { label: 'b', value: Number.NaN },
      { label: 'c', value: Number.POSITIVE_INFINITY },
      { label: 'd', value: 2 },
    ];
    expect(finitePoints(pts).map((p) => p.label)).toEqual(['a', 'd']);
    const clean = [{ label: 'a', value: 1 }];
    expect(finitePoints(clean)).toBe(clean);
  });

  it('finds the range of long series without spreading them into Math.min', () => {
    const long = Array.from({ length: 200_000 }, (_, i) => i % 1000);
    expect(valueRange(long)).toEqual({ min: 0, max: 999 });
  });

  it('clamps the selection into the data, defaulting to the last point', () => {
    expect(clampSelection(null, undefined, 0)).toBeNull();
    expect(clampSelection(null, undefined, 7)).toBe(6);
    expect(clampSelection(29, undefined, 7)).toBe(6);
    expect(clampSelection(null, 2, 7)).toBe(2);
    expect(clampSelection(null, -3, 7)).toBe(0);
    expect(clampSelection(3, 1, 7)).toBe(3);
  });
});

describe('chart text', () => {
  const points = [
    { label: 'Jan', value: 50 },
    { label: 'Feb', value: 70 },
    { label: 'Mar', value: 40 },
  ];

  it('summarises range, ends, high and low', () => {
    expect(chartSummary('Plan-follow rate', points, fmt)).toBe(
      'Plan-follow rate, 3 points from Jan to Mar. Starts at 50%, ends at 40%. Highest 70% (Feb), lowest 40% (Mar).',
    );
    expect(chartSummary('X', [], fmt)).toBe('X: no data yet.');
    expect(chartSummary('X', [points[0]!], fmt)).toBe('X: Jan, 50%.');
  });

  it('says the selected value', () => {
    expect(selectedText(points, 1, fmt)).toBe('Feb, 70%');
    expect(selectedText(points, null, fmt)).toBeNull();
    expect(selectedText(points, 9, fmt)).toBeNull();
  });
});
