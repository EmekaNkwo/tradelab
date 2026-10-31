import { createAnthropicCoachTransport } from '../anthropicCoach';
import type { FetchLike } from '../httpClient';

const KEY = 'sk-ant-test-0123456789abcdef';
const message = (overrides: Record<string, unknown> = {}) => ({
  id: 'msg_test',
  type: 'message',
  role: 'assistant',
  model: 'claude-opus-5-5',
  content: [{ type: 'text', text: 'First idea.\n\nSecond idea.' }],
  stop_reason: 'end_turn',
  stop_sequence: null,
  usage: { input_tokens: 10, output_tokens: 10 },
  ...overrides,
});
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'request-id': 'req_test' } });
const REQ = { apiKey: KEY, model: 'claude-opus-5-5' as const, system: 'system prompt', message: 'Explain a spread.' };

/** A mocked transport: records each request and answers with the next queued response. */
function mockFetch(...responses: (() => Response | Promise<Response>)[]) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchImpl: FetchLike = async (input, init) => {
    calls.push({ url: typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url, init });
    const next = responses.shift();
    if (!next) throw new Error('no response queued');
    return next();
  };
  return { calls, fetchImpl };
}

describe('Anthropic cloud coach transport (spec §24.3)', () => {
  it('sends one Messages API request to the approved host with the chosen model, system prompt and low effort', async () => {
    const { calls, fetchImpl } = mockFetch(() => reply(200, message()));
    const r = await createAnthropicCoachTransport(fetchImpl).send(REQ);
    expect(r).toEqual({ ok: true, value: { text: 'First idea.\n\nSecond idea.' } });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('https://api.anthropic.com/v1/messages');
    const body = JSON.parse(String(calls[0]?.init?.body)) as Record<string, unknown>;
    expect(body).toMatchObject({ model: 'claude-opus-5-5', system: 'system prompt', output_config: { effort: 'low' }, messages: [{ role: 'user', content: 'Explain a spread.' }] });
    expect(body).not.toHaveProperty('thinking');
  });

  it('reports refusals, cut-off and empty replies instead of showing them', async () => {
    for (const [body, text] of [
      [message({ stop_reason: 'refusal', content: [] }), /declined/],
      [message({ stop_reason: 'max_tokens' }), /cut off/],
      [message({ content: [] }), /empty answer/],
    ] as const) {
      const r = await createAnthropicCoachTransport(mockFetch(() => reply(200, body)).fetchImpl).send(REQ);
      expect(!r.ok && r.error.message).toMatch(text);
    }
  });

  it('maps a bad key to a plain message without retrying', async () => {
    const { calls, fetchImpl } = mockFetch(() => reply(401, { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }));
    const r = await createAnthropicCoachTransport(fetchImpl).send(REQ);
    expect(!r.ok && r.error.message).toMatch(/did not accept your API key/);
    expect(calls).toHaveLength(1);
  });

  it('retries a rate limit once, then reports it', async () => {
    const limited = () => reply(429, { type: 'error', error: { type: 'rate_limit_error', message: 'slow down' } });
    const { calls, fetchImpl } = mockFetch(limited, limited);
    const r = await createAnthropicCoachTransport(fetchImpl).send(REQ);
    expect(!r.ok && r.error.message).toMatch(/rate limit/);
    expect(calls).toHaveLength(2);
  }, 20_000);

  it('returns Cancelled when the learner cancels', async () => {
    const controller = new AbortController();
    const fetchImpl: FetchLike = (_i, init) => new Promise((_res, reject) => init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
    const pending = createAnthropicCoachTransport(fetchImpl).send({ ...REQ, signal: controller.signal });
    controller.abort();
    const r = await pending;
    expect(!r.ok && r.error.kind).toBe('Cancelled');
  });
});
