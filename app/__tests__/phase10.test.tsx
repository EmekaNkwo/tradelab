import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { storageError } from '../../shared/errors';
import { err } from '../../shared/result';
import type { UtcIso } from '../../shared/time';
import { resetRouterMock, routerMock as router, searchParams } from '../../testing/routerMock';
import { createTestHarness, TestProviders, TEST_NOW, type TestHarness } from '../../testing/testContainer';
import SettingsScreen from '../(tabs)/more/settings';
import ChallengeScreen from '../progress/challenge/[id]';
import ChallengesScreen from '../progress/challenges';
import ProgressScreen from '../progress/index';
import SkillScreen from '../progress/skill/[id]';

jest.mock('expo-router', () => jest.requireActual<typeof import('../../testing/routerMock')>('../../testing/routerMock').createRouterModule());

const NOW = TEST_NOW as UtcIso;
let harness: TestHarness;
beforeEach(async () => {
  harness = await createTestHarness();
  resetRouterMock();
});
afterEach(() => harness.db.close());

const renderWith = (ui: ReactElement) => render(<TestProviders container={harness.container}>{ui}</TestProviders>);
const press = async (name: string | RegExp) => fireEvent.press(await screen.findByRole('button', { name }));

/** A wrong option for a shipped question. */
const wrong = (questionId: string): string[] => {
  const q = harness.container.content.question(questionId);
  const option = q?.options.find((o) => !q.correctOptionIds.includes(o.id));
  if (!option) throw new Error(`no wrong option for ${questionId}`);
  return [option.id];
};
const wrongAll = (ids: readonly string[]) => Object.fromEntries(ids.map((id) => [id, wrong(id)]));

/** Three wrong answers in a lesson on risk, two in the risk checkpoint, and some drills. */
async function seedWeakRisk() {
  const r = await harness.container.learning.recordAttempts(
    [
      { kind: 'lesson_check', refId: 'fx-position-sizing', answers: wrongAll(['fx-position-sizing-q1', 'fx-position-sizing-q2', 'fx-position-sizing-q3']), score: 0, passed: false },
      { kind: 'checkpoint', refId: 'forex-risk-checkpoint', answers: wrongAll(['forex-risk-checkpoint-q1', 'forex-risk-checkpoint-q2']), score: 0, passed: false },
    ],
    NOW,
  );
  if (!r.ok) throw new Error(r.error.message);
  for (const correct of [true, false, true]) await harness.container.practice.recordDrill({ kind: 'find_the_trend', seed: 1, optionId: 'up', correct }, NOW);
}

describe('Progress dashboard (spec §29)', () => {
  it('shows skills with their evidence, a reasoned practice path, awards and separate simulated trades', async () => {
    await seedWeakRisk();
    await renderWith(<ProgressScreen />);
    expect(await screen.findByTestId('progress-screen')).toBeTruthy();
    expect(screen.getByTestId('recommendation-risk_management').props.children).toMatch(/^You missed 3 of your last 3 risk management questions in "/);
    expect(screen.getByTestId('skill-risk_management').props.accessibilityLabel).toMatch(/Developing \(0%\)\. Based on 5 answers\.$/);
    // Three drills is too early to judge, so no percentage is shown.
    expect(screen.getByTestId('skill-chart_reading').props.accessibilityLabel).toMatch(/Too early to tell\. Based on 3 exercises\./);
    expect(screen.getByTestId('skill-psychology').props.accessibilityLabel).toMatch(/Not started\. No evidence yet\./);
    expect(screen.getByTestId('progress-xp').props.children).toBe(`${2 * 3} XP for understanding and discipline`);
    expect(screen.getByTestId('progress-challenges').props.children).toBe('0 of 8 completed');
    expect(screen.queryByTestId('badge-famous_traders_researcher')).toBeNull();
    expect(screen.getByTestId('badge-disciplined_simulator')).toBeTruthy();
    expect(screen.getByTestId('progress-streak')).toBeTruthy();
    expect(screen.getByText('No trades in the journal yet.')).toBeTruthy();
    expect(screen.getByTestId('awards-caption').props.children).toMatch(/placing more trades never earns more XP.*None of this shows you are ready to trade real money\.$/);
  });

  it('sends missed questions to the spaced review, and opens the lesson, drill and replay', async () => {
    await seedWeakRisk();
    await renderWith(<ProgressScreen />);
    await press('1. Review the 3 questions you missed');
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/review'));
    const items = await harness.container.learning.reviewItems();
    expect(items.ok && items.value.map((i) => [i.conceptId, i.dueDate]).sort()).toEqual(
      ['fx-position-sizing-q1', 'fx-position-sizing-q2', 'fx-position-sizing-q3'].map((id) => [id, '2026-10-29']),
    );
    await press(/^2\. Reread "/);
    expect(router.push).toHaveBeenCalledWith({ pathname: '/lesson/[id]', params: { id: 'fx-position-sizing' } });
    await press('3. Practise the Size it drill');
    expect(router.push).toHaveBeenCalledWith({ pathname: '/practice/drill', params: { kind: 'size_it' } });
    const replay = screen.getAllByRole('button', { name: /^\d\. Replay a simulated/ })[0]!;
    await fireEvent.press(replay);
    expect(router.push).toHaveBeenCalledWith({ pathname: '/practice/replay', params: expect.objectContaining({ scenario: expect.any(String) }) });
    await fireEvent.press(screen.getByTestId('skill-risk_management'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/progress/skill/[id]', params: { id: 'risk_management' } });
  });

  it('explains one skill’s score, components and weights', async () => {
    await seedWeakRisk();
    searchParams.current = { id: 'risk_management' };
    await renderWith(<SkillScreen />);
    expect((await screen.findByTestId('skill-level')).props.children).toBe('Developing · 0%');
    expect(screen.getByTestId('skill-evidence').props.children).toBe('Based on 5 answers.');
    expect(screen.getByTestId('skill-component-correctness').props.children).toMatch(/^Correctness \(weight 35%\): 0%\./);
    expect(screen.getByTestId('skill-component-retention').props.children).toMatch(/no evidence yet/);
    expect(screen.getByRole('button', { name: '1. Review the 3 questions you missed' })).toBeTruthy();
  });

  it('hides the percentage while it is too early, and says Secure is not readiness to trade', async () => {
    for (const correct of [true, false, true]) await harness.container.practice.recordDrill({ kind: 'find_the_trend', seed: 1, optionId: 'up', correct }, NOW);
    searchParams.current = { id: 'chart_reading' };
    await renderWith(<SkillScreen />);
    expect((await screen.findByTestId('skill-level')).props.children).toBe('Too early to tell');
    expect(screen.getByTestId('skill-component-application').props.children).toMatch(/too early to show/);
    expect(screen.queryByText(/%\. Drills/)).toBeNull();
  });

  it('shows "not found" for an unknown skill', async () => {
    searchParams.current = { id: 'day_trading' };
    await renderWith(<SkillScreen />);
    expect(await screen.findByText('Skill not found')).toBeTruthy();
  });
});

describe('Challenges (spec §27)', () => {
  it('lists the shipped challenges, without the gated famous-trader one', async () => {
    await renderWith(<ChallengesScreen />);
    expect(await screen.findByTestId('challenge-risk-management')).toBeTruthy();
    expect(screen.queryByTestId('challenge-famous-trader')).toBeNull();
    await fireEvent.press(screen.getByTestId('challenge-risk-management'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/progress/challenge/[id]', params: { id: 'risk-management' } });
  });

  it('shows each requirement with what it assesses and progress from real records', async () => {
    for (let i = 0; i < 10; i += 1) await harness.container.practice.recordDrill({ kind: 'size_it', seed: i, optionId: 'x', correct: i > 0 }, NOW);
    searchParams.current = { id: 'risk-management' };
    await renderWith(<ChallengeScreen />);
    expect(await screen.findByTestId('challenge-screen')).toBeTruthy();
    expect(screen.getByTestId('criterion-1').props.children).toBe('Size It drill: 8 or more of your last 10 right');
    expect(screen.getByText('9 of your last 10 right (need 8)')).toBeTruthy();
    expect(screen.getByText('✓ Risk control')).toBeTruthy();
    expect(screen.getByText('○ Correct rule use')).toBeTruthy();
    expect(screen.queryByText('Challenge completed')).toBeNull();
  });

  it('shows "not found" for a withheld challenge', async () => {
    searchParams.current = { id: 'famous-trader' };
    await renderWith(<ChallengeScreen />);
    expect(await screen.findByText('Challenge not found')).toBeTruthy();
  });
});

describe('Settings (spec §29)', () => {
  it('turns the streak and each learning reminder on and off', async () => {
    await renderWith(<SettingsScreen />);
    const streak = await screen.findByLabelText('Show my study streak');
    await fireEvent.press(within(streak).getByRole('radio', { name: 'Off' }));
    await waitFor(async () => {
      const s = await harness.container.settings.get();
      expect(s.ok && s.value.streaks).toBe(false);
    });
    const summary = screen.getByLabelText('Weekly summary on Sundays');
    // New reminder types start off.
    expect(within(summary).getByRole('radio', { name: 'Off' }).props.accessibilityState).toMatchObject({ selected: true });
    await fireEvent.press(within(summary).getByRole('radio', { name: 'On' }));
    await waitFor(async () => {
      const s = await harness.container.settings.get();
      expect(s.ok && s.value.reminders).toEqual({ weakReview: false, weeklySummary: true, backup: false });
    });
    // Changing a reminder setting reschedules reminders (none here: no class reminder is set up), and may prompt.
    expect(harness.reminders.synced.at(-1)).toEqual([]);
    expect(harness.reminders.options.at(-1)).toEqual({ prompt: true });
  });

  it('shows a failed reminder save next to that toggle', async () => {
    await renderWith(<SettingsScreen />);
    const backup = await screen.findByTestId('reminder-backup');
    jest.spyOn(harness.container.settings, 'update').mockResolvedValueOnce(err(storageError('disk full')));
    await fireEvent.press(within(backup).getByRole('radio', { name: 'On' }));
    const failure = 'Could not save or read your data';
    await waitFor(() => expect(within(screen.getByTestId('reminder-backup')).getByText(failure)).toBeTruthy());
    expect(within(screen.getByTestId('reminder-weeklySummary')).queryByText(failure)).toBeNull();
    expect(screen.getAllByText(failure)).toHaveLength(1);
  });
});
