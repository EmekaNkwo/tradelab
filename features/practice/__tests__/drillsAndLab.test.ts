import { DRILL_KINDS } from '../../../domain/market';
import { DRILL_INFO } from '../useDrill';

it('every drill kind has a title and summary', () => {
  for (const k of DRILL_KINDS) {
    expect(DRILL_INFO[k].title).toBeTruthy();
    expect(DRILL_INFO[k].summary).toBeTruthy();
  }
});
