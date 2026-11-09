import { filterDimensionsFor } from '../labels';

describe('filterDimensionsFor', () => {
  it('leaves out market choices no strategy covers, and keeps the rest', () => {
    const dims = filterDimensionsFor([{ markets: ['forex'] }, { markets: ['stocks', 'forex'] }]);
    const markets = dims.find((d) => d.key === 'markets')?.options.map((o) => o.value);
    expect(markets).toEqual(['forex', 'stocks']);
    expect(dims.find((d) => d.key === 'levels')?.options).toHaveLength(3);
  });
});
