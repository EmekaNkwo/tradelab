import { BACKTEST_TEMPLATES } from '../../../domain/backtest';
import { priceFit, PRICE_FIT_RATIO, typicalPrice } from '../../../domain/marketData/priceFit';
import { practiceInstrument } from '../../../domain/simulation/instruments';
import { dec } from '../../../shared/decimal';
import type { UtcIso } from '../../../shared/time';
import { defaultRunForm, formFromInputs, runInputs, type ChosenData } from '../setup';

/** Review findings B (run setup) and E (costs on real data). */

const H1 = { ...BACKTEST_TEMPLATES.find((t) => t.strategyId === 'trend-following-moving-averages')!.definition, timeframe: 'H1' as const };
const CONTEXT = { versionsTried: 1, otherVersionsWithOutOfSample: 0 };
const CHOSEN: ChosenData = { id: 'ds_1', candleCount: 742, contentHash: 'c'.repeat(64), label: 'Imported: eurusd.csv' };

describe('run inputs on real data (B)', () => {
  it('take the data set, its real candle count, hash and label from the resolved choice, not the form', () => {
    const form = { ...defaultRunForm(H1), datasetId: 'ds_1', candles: '3000', costsConfirmed: true };
    const r = runInputs(H1, form, CONTEXT, CHOSEN);
    expect(r.ok && r.value.dataset).toEqual({ instrumentId: H1.instrumentId, timeframe: 'H1', seed: 0, candles: 742, datasetId: 'ds_1', contentHash: CHOSEN.contentHash, dataLabel: CHOSEN.label });
  });

  it('refuse a form that names a data set which did not resolve', () => {
    const form = { ...defaultRunForm(H1), datasetId: 'ds_gone', costsConfirmed: true };
    const r = runInputs(H1, form, CONTEXT, null);
    expect(!r.ok && r.error.map((i) => i.field)).toContain('datasetId');
    const mismatched = runInputs(H1, form, CONTEXT, CHOSEN);
    expect(!mismatched.ok && mismatched.error.map((i) => i.field)).toContain('datasetId');
  });

  it('need the learner to confirm the costs for real data, but not for simulated data', () => {
    const form = { ...defaultRunForm(H1), datasetId: 'ds_1' };
    const r = runInputs(H1, form, CONTEXT, CHOSEN);
    expect(!r.ok && r.error.map((i) => i.field)).toEqual(['costsConfirmed']);
    expect(runInputs(H1, defaultRunForm(H1), CONTEXT).ok).toBe(true);
  });

  it('a stored real-data run is reloaded with its costs already confirmed', () => {
    const r = runInputs(H1, { ...defaultRunForm(H1), datasetId: 'ds_1', costsConfirmed: true }, CONTEXT, CHOSEN);
    if (!r.ok) throw new Error('not ok');
    expect(formFromInputs(r.value)).toMatchObject({ datasetId: 'ds_1', costsConfirmed: true });
  });
});

describe('practice costs on real prices (E)', () => {
  const eurusd = practiceInstrument('sim-eurusd')!;
  const candle = (close: string) => ({ time: '2024-01-01T00:00:00.000Z' as UtcIso, open: dec(close), high: dec(close), low: dec(close), close: dec(close), volume: dec(0) });

  it('fits within ×3 and ÷3 of the practice market’s price, with no warning', () => {
    for (const price of [eurusd.startPrice, eurusd.startPrice * (PRICE_FIT_RATIO - 0.01), eurusd.startPrice / (PRICE_FIT_RATIO - 0.01)]) {
      expect(priceFit(eurusd, price)).toMatchObject({ fits: true, warning: null });
    }
  });

  it('warns beyond that, and scales the spread and slippage as a rough estimate', () => {
    const fit = priceFit(eurusd, 150);
    expect(fit.fits).toBe(false);
    expect(fit.warning).toMatch(/default costs and pip value do not fit/);
    expect(Number(fit.estimatedSpread)).toBeCloseTo(Number(eurusd.spread.toString()) * (150 / eurusd.startPrice), 1);
    expect(priceFit(eurusd, 0.2).fits).toBe(false);
  });

  it('uses the median close, so one spike does not move the price level', () => {
    expect(typicalPrice([candle('1'), candle('1.2'), candle('900'), candle('1.1'), candle('1.3')])).toBe(1.2);
    expect(typicalPrice([])).toBeNull();
  });
});
