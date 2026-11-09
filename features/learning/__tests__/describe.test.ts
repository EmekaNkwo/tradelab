import { describeStatus, plural } from '../describe';

describe('plural', () => {
  it('adds es to words like class, and s otherwise', () => {
    expect(plural(1, 'class')).toBe('1 class');
    expect(plural(7, 'class')).toBe('7 classes');
    expect(plural(2, 'study day')).toBe('2 study days');
    expect(plural(3, 'week')).toBe('3 weeks');
  });

  it('says "classes behind" and "classes ahead"', () => {
    expect(describeStatus({ kind: 'behind', classesBehind: 7 } as never)).toBe('7 classes behind');
    expect(describeStatus({ kind: 'ahead', classesAhead: 2 } as never)).toBe('2 classes ahead');
  });
});
