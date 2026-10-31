/** Test-only CSV text: `count` hourly candles from 2024-01-01 00:00 (no zone), gently rising, with volume. */
export function hourlyCsv(count: number, options: { readonly header?: string; readonly delimiter?: string; readonly startMs?: number; readonly stepMs?: number } = {}): string {
  const d = options.delimiter ?? ',';
  const start = options.startMs ?? Date.UTC(2024, 0, 1);
  const step = options.stepMs ?? 3_600_000;
  const rows = Array.from({ length: count }, (_, i) => {
    const base = 1.1 + i * 0.0001;
    const t = new Date(start + i * step).toISOString().replace('T', ' ').slice(0, 16);
    return [t, base.toFixed(5), (base + 0.0005).toFixed(5), (base - 0.0005).toFixed(5), (base + 0.0001).toFixed(5), String(100 + i)].join(d);
  });
  return [options.header ?? ['date', 'open', 'high', 'low', 'close', 'volume'].join(d), ...rows].join('\n');
}
