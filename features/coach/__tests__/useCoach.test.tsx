import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import type { CloudCoachRequest } from '../../../data';
import type { CoachRequest } from '../../../domain/coach/types';
import { ok, type Result } from '../../../shared/result';
import type { AppError } from '../../../shared/errors';
import { createTestHarness, TestProviders, type TestHarness } from '../../../testing/testContainer';
import { useCoach } from '..';
import { conceptContext, conceptRequest } from '../requests';

let h: TestHarness;
const wrapper = ({ children }: { children: ReactNode }) => <TestProviders container={h.container}>{children}</TestProviders>;

/** Each cloud call waits until the test answers it. */
let pending: ((text: string) => void)[] = [];
beforeEach(async () => {
  h = await createTestHarness();
  pending = [];
  await h.container.secrets.set('anthropic_api_key', 'sk-ant-0123456789abcdef');
  const s = await h.container.settings.get();
  if (!s.ok) throw new Error(s.error.message);
  await h.container.settings.update({ integrations: { ...s.value.integrations, coach: 'cloud' } }, '2026-10-30T10:00:00.000Z' as never);
  h.cloudCoach.send = (req: CloudCoachRequest) => {
    h.cloudCoach.requests.push(req);
    return new Promise<Result<{ text: string }, AppError>>((resolve) => pending.push((text) => resolve(ok({ text }))));
  };
});
afterEach(() => h.db.close());

const req = (): CoachRequest => conceptRequest(conceptContext(h.container.content, 'spread', 'simple'), 'simple', 'Why?');

describe('useCoach races (C)', () => {
  it('sends one request when Ask is pressed twice quickly', async () => {
    const { result } = await renderHook(() => useCoach(), { wrapper });
    await act(async () => {
      void result.current.ask(req());
      void result.current.ask(req());
    });
    await waitFor(() => expect(pending).toHaveLength(1));
    expect(h.cloudCoach.requests).toHaveLength(1);
    await act(async () => pending[0]?.('First answer.'));
    await waitFor(() => expect(result.current.state.status).toBe('answered'));
  });

  it('ignores a cancelled request’s late answer and shows the new one', async () => {
    const { result } = await renderHook(() => useCoach(), { wrapper });
    await act(async () => void result.current.ask(req()));
    await waitFor(() => expect(pending).toHaveLength(1));
    await act(async () => result.current.cancel());
    await act(async () => void result.current.ask(req()));
    await waitFor(() => expect(pending).toHaveLength(2));
    await act(async () => pending[0]?.('Stale answer.'));
    expect(result.current.state.status).toBe('asking');
    await act(async () => pending[1]?.('Fresh answer.'));
    await waitFor(() => expect(result.current.state.status).toBe('answered'));
    const s = result.current.state;
    expect(s.status === 'answered' && s.reply.paragraphs.join(' ')).toBe('Fresh answer.');
  });
});
