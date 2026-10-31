import { marketScenarioSchema } from '../schemas';

const scenario = (title: string) => ({
  id: 'fixture-scenario',
  category: 'macro',
  title,
  setup: 'A made-up country releases a made-up number.',
  release: null,
  pricedIn: 'Nothing in particular.',
  question: 'What might happen?',
  reactions: [
    { id: 'a', text: 'Up', plausible: true, explanation: 'Possible.' },
    { id: 'b', text: 'Down', plausible: true, explanation: 'Possible.' },
    { id: 'c', text: 'Nothing', plausible: false, explanation: 'Unlikely.' },
  ],
  takeaway: 'Reactions depend on expectations.',
  glossaryIds: [],
});

describe('market scenario fictional label', () => {
  it('requires "(fictional)" in the title, like companies and calendar samples', () => {
    const r = marketScenarioSchema.safeParse(scenario('Inflation beats forecasts'));
    expect(r.success).toBe(false);
    expect(r.error?.issues.map((i) => i.message)).toEqual(['scenario titles must include "(fictional)"']);
  });

  it('accepts a labelled title', () => {
    expect(marketScenarioSchema.safeParse(scenario('Inflation beats forecasts (fictional)')).success).toBe(true);
  });
});
