import { dec } from '../../../shared/decimal';
import { baseSymbol, costsText, equityChange, spokenMoney, groupedFixed, moneyMagnitude, moneyText, riskAtStopsText, tradeR, tradeRow } from '../paperFigures';
import type { PaperTrade } from '../../../domain/simulation';

const trade = (over: Partial<PaperTrade>): PaperTrade =>
  ({
    positionId: 1, side: 'buy', size: dec('0.1'), entry: dec('1.10250'), exit: dec('1.10410'), openedAt: 0, closedAt: 1, reason: 'manual',
    gross: dec('16'), costs: dec('-1.4'), net: dec('42.5'), initialStop: dec('1.1'), violations: [], plannedRisk: dec('25'), equityAtOrder: dec('10000'),
    ...over,
  }) as PaperTrade;

describe('paper figures', () => {
  it('formats money from the Decimal digits, with thousands and a true minus', () => {
    expect(groupedFixed(dec('1234567.891'))).toBe('1,234,567.89');
    expect(moneyText(dec('10000'))).toBe('10,000.00 USD');
    expect(moneyText(dec('-12.4'))).toBe('−12.40 USD');
    expect(moneyText(dec('-0.001'))).toBe('0.00 USD');
    expect(moneyMagnitude(dec('-12.4'))).toBe('12.40 USD');
  });

  it('drops the simulated tag for icons', () => {
    expect(baseSymbol('EUR/USD (simulated)')).toBe('EUR/USD');
    expect(baseSymbol('AAPL')).toBe('AAPL');
  });

  it('derives R only from a trade’s own planned risk', () => {
    expect(tradeR(trade({}))).toBe('1.7R');
    expect(tradeR(trade({ net: dec('-25') }))).toBe('1.0R');
    expect(tradeR(trade({ plannedRisk: null }))).toBeNull();
    expect(tradeR(trade({ plannedRisk: dec('0') }))).toBeNull();
  });

  it('builds a history row and flags a broken rule', () => {
    const row = tradeRow(trade({ side: 'sell', violations: ['no_stop'] as never }), 'EUR/USD (simulated)', 'lots');
    expect(row.title).toBe('Sell EUR/USD · 0.1 lots');
    expect(row.subtitle).toBe('1.1025 → 1.1041 · costs 1.40 USD · rule broken');
    expect(row.amount).toBe('42.50 USD');
    expect(tradeRow(trade({}), 'X', 'shares').subtitle).not.toMatch(/rule broken/);
  });

  it('measures equity against the starting balance', () => {
    expect(equityChange({ equity: dec('10430'), startingBalance: dec('10000') })).toEqual({ delta: 4.3, text: '4.3%' });
    expect(equityChange({ equity: dec('9900'), startingBalance: dec('10000') })).toEqual({ delta: -1, text: '1.0%' });
    expect(equityChange({ equity: dec('1'), startingBalance: dec('0') })).toBeNull();
  });

  it('says when risk at the stops is not defined', () => {
    expect(riskAtStopsText({ riskAtStops: dec('25'), positions: [] })).toBe('25.00 USD');
    expect(riskAtStopsText({ riskAtStops: null, positions: [{}] as never })).toBe('Not defined');
    expect(riskAtStopsText({ riskAtStops: null, positions: [] })).toBe('0.00 USD');
  });

  it('calls a net swap credit a credit, never a cost', () => {
    expect(costsText(dec('-1.4'))).toBe('costs 1.40 USD');
    expect(costsText(dec('2.25'))).toBe('swap credit 2.25 USD');
    expect(costsText(dec('0'))).toBe('no costs');
    expect(costsText(dec('-0.001'))).toBe('no costs');
    expect(tradeRow(trade({ costs: dec('0.6') }), 'EUR/USD', 'lots').subtitle).toBe('1.1025 → 1.1041 · swap credit 0.60 USD');
  });

  it('speaks a negative amount with the word minus', () => {
    expect(spokenMoney(dec('-1234.5'))).toBe('minus 1,234.50 USD');
    expect(spokenMoney(dec('12'))).toBe('12.00 USD');
  });
});
