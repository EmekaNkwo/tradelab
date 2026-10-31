import { PRACTICE_INSTRUMENTS } from '../../../domain/simulation';
import { paperCandles } from '../paperSession';

/**
 * Saved paper accounts store only a seed and a cursor; their candles are
 * regenerated. If this test fails, the generator or an instrument's start
 * price changed and every saved account's positions and stops would now sit
 * on different prices. Do not just update the numbers: add a generator
 * version to the account (a migration) first.
 */
describe('paper candles are stable for saved accounts', () => {
  it.each(PRACTICE_INSTRUMENTS.map((i) => [i.id, i] as const))('%s', (_id, instrument) => {
    const candles = paperCandles(instrument, 'strong_uptrend', 12345, 'H1');
    const fingerprint = [0, 100, 399].map((k) => candles[k]!.close.toString());
    expect({ count: candles.length, fingerprint }).toMatchSnapshot();
  });
});
