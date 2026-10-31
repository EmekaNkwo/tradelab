import { validateContent, type RawContentFile } from '../validateContent';

const MANIFEST = { version: '2026.10.1' };

const question = (id: string) => ({
  id,
  prompt: 'What is the spread?',
  options: [
    { id: 'a', text: 'Ask minus bid', explanation: 'Right: it is the gap between the two prices.' },
    { id: 'b', text: 'Your profit', explanation: 'No: the spread is a cost, not a profit.' },
  ],
  correctOptionIds: ['a'],
  level: 'beginner',
  glossaryIds: ['spread'],
});

const fixtures = (): Record<string, Record<string, unknown> | undefined> => ({
  'glossary/spread.json': {
    id: 'spread',
    term: 'Spread',
    aliases: [],
    definition: { simple: 'The gap between the [[bid]] and the ask price.' },
    related: ['bid'],
    markets: ['forex'],
    level: 'beginner',
    sourceIds: [],
  },
  'glossary/bid.json': {
    id: 'bid',
    term: 'Bid',
    aliases: [],
    definition: { simple: 'The price you can sell at.' },
    related: [],
    markets: [],
    level: 'beginner',
    sourceIds: ['ref-book'],
  },
  'sources/ref-book.json': {
    id: 'ref-book',
    title: 'Reference',
    author: null,
    publisher: null,
    url: 'https://example.org/ref',
    publishedOn: null,
    type: 'book',
    quality: 'primary',
    claimsSupported: ['definition of bid'],
    limitations: 'Test fixture only.',
    lastVerifiedOn: '2026-10-01',
    humanReviewed: true,
    reviewedBy: 'Test reviewer',
    reviewedAt: '2026-10-01',
    relatedStrategyIds: [],
    relatedTraderIds: [],
    disagreements: [],
  },
  'quizzes/m1-check.json': { id: 'm1-check', title: 'Check', passMark: 0.8, questions: [question('q1')] },
  'lessons/l1.json': {
    id: 'l1',
    moduleId: 'm1',
    title: 'Spreads',
    level: 'beginner',
    estimatedMinutes: 15,
    inOneLine: { simple: 'The [[spread]] is a cost.' },
    explain: { simple: 'Explained.' },
    realNumbers: { assumptions: ['EUR/USD bid 1.1000, ask 1.1002'], steps: ['1.1002 - 1.1000 = 0.0002'] },
    anotherExample: { assumptions: ['GBP/USD bid 1.2500, ask 1.2503'], steps: ['1.2503 - 1.2500 = 0.0003'] },
    explainSimpler: 'Buying costs a little more than selling.',
    commonMistake: 'Ignoring it.',
    quickCheck: [question('lq1'), question('lq2')],
    doItNow: { kind: 'metatrader', instructions: 'Find the spread.' },
    glossaryIds: ['spread'],
    sourceIds: [],
  },
  'modules/m1.json': {
    id: 'm1',
    title: 'Basics',
    summary: 'Basics.',
    markets: ['forex'],
    level: 'beginner',
    lessonIds: ['l1'],
    checkpointQuizId: 'm1-check',
    practicalResult: 'Log spreads.',
    minPracticeDays: 0,
    skills: ['market_fundamentals'],
  },
  'programs/p1.json': { id: 'p1', title: 'Program', summary: 'P.', moduleIds: ['m1'], defaultWeeks: 4 },
  'disclosures/general.json': {
    id: 'general',
    version: 1,
    title: 'Risk',
    body: ['Strategies can lose money.'],
    triggers: ['first_launch'],
    statistics: [],
  },
});

function toFiles(map: Record<string, unknown>): RawContentFile[] {
  return Object.entries(map).map(([path, json]) => {
    const [type, fileName] = path.split('/') as [string, string];
    return { type, fileName, json };
  });
}

function messages(map: Record<string, unknown>): string[] {
  return validateContent(MANIFEST, toFiles(map)).issues.map((i) => `${i.file}: ${i.message}`);
}

describe('validateContent', () => {
  it('accepts a consistent content set and builds a hashed bundle', () => {
    const result = validateContent(MANIFEST, toFiles(fixtures()));
    expect(result.issues).toEqual([]);
    expect(result.bundle?.version).toBe('2026.10.1');
    expect(result.bundle?.glossary.map((g) => g.id)).toEqual(['bid', 'spread']);
    expect(result.bundle?.hash).toMatch(/^[0-9a-f]{8}$/);
  });

  it('is deterministic regardless of file order', () => {
    const files = toFiles(fixtures());
    expect(validateContent(MANIFEST, files).bundle?.hash).toBe(validateContent(MANIFEST, [...files].reverse()).bundle?.hash);
  });

  it('rejects a bad manifest', () => {
    const result = validateContent({ version: 'latest' }, toFiles(fixtures()));
    expect(result.bundle).toBeNull();
  });

  it('reports schema errors and unknown folders', () => {
    const f = fixtures();
    f['glossary/bid.json'] = { ...f['glossary/bid.json'], level: 'expert' };
    f['widgets/x.json'] = {};
    const out = messages(f);
    expect(out).toEqual(expect.arrayContaining([expect.stringMatching(/glossary\/bid.json: level/), expect.stringMatching(/unknown content type/)]));
  });

  it('requires file names to match ids and ids to be unique', () => {
    const f = fixtures();
    f['glossary/other.json'] = { ...f['glossary/bid.json'] };
    const out = messages(f);
    expect(out).toEqual(expect.arrayContaining([expect.stringMatching(/must be "bid.json"/), expect.stringMatching(/duplicate id "bid"/)]));
  });

  it('checks answer keys', () => {
    const f = fixtures();
    f['quizzes/m1-check.json'] = { ...f['quizzes/m1-check.json'], questions: [{ ...question('q1'), correctOptionIds: ['z'] }] };
    expect(messages(f)).toEqual(expect.arrayContaining([expect.stringMatching(/answer key "z" is not an option/)]));

    f['quizzes/m1-check.json'] = { ...f['quizzes/m1-check.json'], questions: [{ ...question('q1'), correctOptionIds: ['a', 'b'] }] };
    expect(messages(f)).toEqual(expect.arrayContaining([expect.stringMatching(/no wrong options/)]));
  });

  it('checks inline glossary links and term references', () => {
    const f = fixtures();
    f['lessons/l1.json'] = { ...f['lessons/l1.json'], explain: { simple: 'See [[leverage|leverage]].' } };
    expect(messages(f)).toEqual(expect.arrayContaining([expect.stringMatching(/unknown glossary link "leverage"/)]));
  });

  it('checks module, lesson, quiz, and program references', () => {
    const f = fixtures();
    f['modules/m1.json'] = { ...f['modules/m1.json'], lessonIds: ['l1', 'l9'], checkpointQuizId: 'nope' };
    f['programs/p1.json'] = { ...f['programs/p1.json'], moduleIds: ['m2'] };
    const out = messages(f);
    expect(out).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/unknown lesson "l9"/),
        expect.stringMatching(/unknown checkpoint quiz "nope"/),
        expect.stringMatching(/unknown module "m2"/),
      ]),
    );
  });

  it('requires question ids to be unique across lessons and quizzes (spaced-repetition keys)', () => {
    const f = fixtures();
    f['lessons/l1.json'] = { ...(f['lessons/l1.json'] as object), quickCheck: [question('q1'), question('lq2')] };
    expect(messages(f)).toEqual(expect.arrayContaining([expect.stringMatching(/question id "q1" is used more than once/)]));
  });

  it('enforces the 80% checkpoint pass mark', () => {
    const f = fixtures();
    f['quizzes/m1-check.json'] = { ...f['quizzes/m1-check.json'], passMark: 0.6 };
    expect(messages(f)).toEqual(expect.arrayContaining([expect.stringMatching(/at least 80%/)]));
  });

  it('requires every disclosure statistic to cite a known, human-reviewed source with full provenance', () => {
    const f = fixtures();
    const stat = {
      id: 'stat-1',
      statement: 'Example statistic.',
      sourceId: 'ref-book',
      jurisdiction: 'Example',
      provider: 'Example provider',
      publishedOn: '2026-01-01',
      verifiedOn: '2026-10-01',
      productsCovered: 'Example CFDs only',
    };
    f['disclosures/general.json'] = { ...f['disclosures/general.json'], statistics: [stat] };
    expect(messages(f)).toEqual([]);

    f['sources/ref-book.json'] = { ...f['sources/ref-book.json'], humanReviewed: false };
    expect(messages(f)).toEqual(expect.arrayContaining([expect.stringMatching(/not yet human-reviewed$/)]));

    const { productsCovered: _omitted, ...withoutProducts } = stat;
    f['disclosures/general.json'] = { ...f['disclosures/general.json'], statistics: [withoutProducts] };
    expect(messages(f)).toEqual(expect.arrayContaining([expect.stringMatching(/productsCovered/)]));
  });

  it('warns (but does not fail) on unreviewed sources', () => {
    const f = fixtures();
    f['sources/ref-book.json'] = { ...f['sources/ref-book.json'], humanReviewed: false };
    const result = validateContent(MANIFEST, toFiles(f));
    expect(result.bundle).not.toBeNull();
    expect(result.issues.map((i) => i.severity)).toEqual(['warning']);
  });

  it('rejects non-https source URLs', () => {
    const f = fixtures();
    f['sources/ref-book.json'] = { ...f['sources/ref-book.json'], url: 'http://example.org' };
    expect(messages(f)).toEqual(expect.arrayContaining([expect.stringMatching(/sources\/ref-book.json: url/)]));
  });

  it('withholds an unreviewed trader from the bundle and reports it, without failing the build', () => {
    const f = fixtures();
    f['traders/someone.json'] = {
      id: 'someone',
      name: 'Someone',
      markets: ['forex'],
      knownFor: 'Fixture',
      summary: 'Fixture.',
      documented: [{ text: 'Fixture.', sourceIds: ['ref-book'] }],
      interpretations: [],
      unverified: [],
      strategyIds: [],
      sourceIds: ['ref-book'],
      review: null,
    };
    const result = validateContent(MANIFEST, toFiles(f));
    expect(result.issues.filter((i) => i.severity === 'error')).toEqual([]);
    expect(result.bundle?.traders).toEqual([]);
    expect(result.withheld).toEqual([expect.objectContaining({ type: 'traders', id: 'someone' })]);
  });

  it('rejects a source that disagrees with itself or with a missing source', () => {
    const f = fixtures();
    f['sources/ref-book.json'] = {
      ...f['sources/ref-book.json'],
      disagreements: [
        { sourceId: 'ref-book', note: 'Self.' },
        { sourceId: 'missing-source', note: 'Missing.' },
      ],
    };
    const out = messages(f).filter((m) => m.startsWith('sources/ref-book') && /disagree/.test(m));
    expect(out.length).toBeGreaterThanOrEqual(2);
  });
});
