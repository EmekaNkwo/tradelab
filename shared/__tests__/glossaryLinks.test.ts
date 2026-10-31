import { parseGlossaryLinks, plainText } from '../glossaryLinks';

describe('glossary links', () => {
  it('splits text into plain runs and terms, with optional labels', () => {
    expect(parseGlossaryLinks('The [[bid]] is below the [[ask|asking price]].')).toEqual([
      { kind: 'text', text: 'The ' },
      { kind: 'term', id: 'bid', label: 'bid' },
      { kind: 'text', text: ' is below the ' },
      { kind: 'term', id: 'ask', label: 'asking price' },
      { kind: 'text', text: '.' },
    ]);
  });

  it('turns ids into words when there is no label, and handles text without links', () => {
    expect(plainText('A [[base-currency]] first')).toBe('A base currency first');
    expect(parseGlossaryLinks('no links')).toEqual([{ kind: 'text', text: 'no links' }]);
    expect(parseGlossaryLinks('[[pip]]')).toEqual([{ kind: 'term', id: 'pip', label: 'pip' }]);
  });

  it('leaves malformed markup as text', () => {
    expect(plainText('[[Not An Id]] and [[pip')).toBe('[[Not An Id]] and [[pip');
  });
});
