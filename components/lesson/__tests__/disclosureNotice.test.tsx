import { render, screen } from '@testing-library/react-native';
import type { Disclosure } from '../../../features/content';
import { fixtureContent } from '../../../testing/strategyFixtures';
import { createTestHarness, TestProviders, type TestHarness } from '../../../testing/testContainer';
import { DisclosureNotice } from '../DisclosureNotice';

/** Fictional test statistics: none of these figures describe anything real. */
const DISCLOSURE: Disclosure = {
  id: 'fixture-disclosure',
  version: 1,
  title: 'Fixture risk warning',
  body: ['Fictional body text.'],
  triggers: ['always'],
  statistics: [
    {
      id: 'fixture-stat',
      statement: 'Fictional statistic statement for tests.',
      sourceId: 'fixture-primary',
      jurisdiction: 'Fixtureland',
      provider: 'Fixture Regulator',
      publishedOn: '2026-01-15',
      verifiedOn: '2026-10-20',
      productsCovered: 'fixture contracts',
    },
    { id: 'orphan-stat', statement: 'A figure with no source in the bundle.', sourceId: 'no-such-source', jurisdiction: 'X', provider: 'Y', publishedOn: '2026-01-01', verifiedOn: '2026-01-01', productsCovered: 'Z' },
  ],
};

let harness: TestHarness;
beforeEach(async () => {
  harness = await createTestHarness();
});
afterEach(() => harness.db.close());

const renderNotice = (disclosure: Disclosure) =>
  render(
    <TestProviders container={{ ...harness.container, content: fixtureContent() }}>
      <DisclosureNotice disclosure={disclosure} />
    </TestProviders>,
  );

describe('DisclosureNotice statistics (spec §3)', () => {
  it('shows each statistic with its source, provider, jurisdiction, dates and products', async () => {
    await renderNotice(DISCLOSURE);
    expect(screen.getByText('Fictional body text.')).toBeTruthy();
    const stat = screen.getByTestId('disclosure-stat-fixture-stat');
    expect(stat).toHaveTextContent(/Fictional statistic statement for tests\./);
    expect(stat).toHaveTextContent(/Source: Fixture Primary Book, Fixture Author/);
    expect(stat).toHaveTextContent(/Fixture Regulator, Fixtureland/);
    expect(stat).toHaveTextContent(/published 2026-01-15, checked 2026-10-20/);
    expect(stat).toHaveTextContent(/covers fixture contracts/);
  });

  it('leaves out a statistic whose source is missing, so no figure appears uncited', async () => {
    await renderNotice(DISCLOSURE);
    expect(screen.queryByTestId('disclosure-stat-orphan-stat')).toBeNull();
    expect(screen.queryByText(/no source in the bundle/)).toBeNull();
  });

  it('shows only the title and body when there are no statistics', async () => {
    await renderNotice({ ...DISCLOSURE, statistics: [] });
    expect(screen.getByText('Fixture risk warning')).toBeTruthy();
    expect(screen.queryByTestId(/disclosure-stat-/)).toBeNull();
  });
});
