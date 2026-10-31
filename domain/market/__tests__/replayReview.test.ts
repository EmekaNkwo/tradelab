import { dec } from '../../../shared/decimal';
import type { ClosedTrade } from '../replay';
import { reviewReplay } from '../replayReview';

const trade = (over: Partial<ClosedTrade>): ClosedTrade => ({
  side: 'buy',
  units: dec(10000),
  entry: dec('1.1000'),
  exit: dec('1.0980'),
  openedAt: 5,
  closedAt: 9,
  reason: 'stop_loss',
  profit: dec(-20),
  initialStop: dec('1.0980'),
  ...over,
});

describe('reviewReplay', () => {
  it('a well-managed loss gets full process marks', () => {
    // Risk: 0.0020 × 10,000 = 20 on 1,000 = 2.00% (limit 2%).
    const r = reviewReplay([trade({})], dec(1000));
    expect(r.processScore).toBe(1);
    expect(r.trades[0]!.riskPercent!.toFixed(2)).toBe('2.00');
    expect(r.trades[0]!.lines[0]).toMatch(/closed by its stop loss\. Result -20\.00/);
    expect(r.netResult.toString()).toBe('-20');
  });

  it('an unplanned win does not, and oversizing is called out', () => {
    const r = reviewReplay(
      [
        trade({ initialStop: null, exit: dec('1.1050'), profit: dec(50), reason: 'manual' }),
        trade({ openedAt: 12, units: dec(50000), profit: dec(-100) }),
      ],
      dec(1000),
    );
    expect(r.processScore).toBe(0);
    expect(r.trades[0]!.lines[1]).toMatch(/No stop loss/);
    // Second trade measured against the balance after the first: 100 / 1,050 = 9.52%.
    expect(r.trades[1]!.lines[1]).toMatch(/9\.52% .*above the 2% practice limit/);
  });

  it('reviews partial closes as one trade', () => {
    const r = reviewReplay(
      [trade({ units: dec(5000), profit: dec(5), reason: 'manual' }), trade({ units: dec(5000), profit: dec(-10) })],
      dec(1000),
    );
    expect(r.trades).toHaveLength(1);
    expect(r.trades[0]!.lines[0]).toMatch(/closed in parts, last closed by its stop loss\. Result -5\.00/);
    expect(r.trades[0]!.riskPercent!.toFixed(2)).toBe('2.00');
  });

  it('no trades: skipping is valid, no score', () => {
    const r = reviewReplay([], dec(1000));
    expect(r.processScore).toBeNull();
    expect(r.summary[0]).toMatch(/Skipping is a valid decision/);
  });
});

it('says when the learner stepped back, and explains a used-up balance (Phase 4 review)', () => {
  expect(reviewReplay([trade({})], dec(1000), dec(2), 3).summary.at(-1)).toMatch(/stepped back 3 times/);
  expect(reviewReplay([trade({})], dec(1000), dec(2), 0).summary.join(' ')).not.toMatch(/stepped back/);
  const r = reviewReplay([trade({ profit: dec(-1000) }), trade({ openedAt: 20 })], dec(1000));
  expect(r.trades[1]!.lines[1]).toMatch(/balance was used up/);
});
