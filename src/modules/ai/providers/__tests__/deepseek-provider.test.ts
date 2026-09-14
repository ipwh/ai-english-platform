// ============================================
// Tests: DeepSeekProvider — V4.1 request shaping (thinking mode)
// Docs: api-docs.deepseek.com/zh-cn/guides/thinking_mode (2026-09-14)
// ============================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { deepseekProvider } from '../deepseek-provider';
import { config } from '@/shared/config/config';

type RequestBody = Record<string, unknown>;

const originalApiKey = config.deepseek.apiKey;

/** Stub global fetch and capture every request body sent by the provider. */
function stubFetch(content = 'final answer'): RequestBody[] {
  const bodies: RequestBody[] = [];
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)) as RequestBody);
    return new Response(JSON.stringify({
      choices: [{ message: { content, reasoning_content: 'chain of thought' } }],
      usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }));
  return bodies;
}

describe('DeepSeekProvider request shaping', () => {
  beforeEach(() => { config.deepseek.apiKey = 'sk-test-key'; });

  afterEach(() => {
    config.deepseek.apiKey = originalApiKey;
    vi.unstubAllGlobals();
  });

  it('leaves thinking at the API default when the option is unset', async () => {
    const bodies = stubFetch();
    await deepseekProvider.call([{ role: 'user', content: 'hi' }], { temperature: 0.3 });

    expect(bodies[0].thinking).toBeUndefined();
    expect(bodies[0].reasoning_effort).toBeUndefined();
    expect(bodies[0].temperature).toBe(0.3);
  });

  it('sends thinking enabled with reasoning_effort and omits temperature', async () => {
    const bodies = stubFetch();
    await deepseekProvider.call([{ role: 'user', content: 'hi' }], {
      thinking: true,
      reasoningEffort: 'low',
      temperature: 0.3,
    });

    expect(bodies[0].thinking).toEqual({ type: 'enabled' });
    expect(bodies[0].reasoning_effort).toBe('low');
    // Thinking mode ignores temperature — sending it would be silently dropped.
    expect(bodies[0].temperature).toBeUndefined();
  });

  it('sends thinking disabled and keeps temperature control', async () => {
    const bodies = stubFetch();
    await deepseekProvider.call([{ role: 'user', content: 'hi' }], { thinking: false, temperature: 0 });

    expect(bodies[0].thinking).toEqual({ type: 'disabled' });
    expect(bodies[0].temperature).toBe(0);
  });

  it('returns only the final answer, not the reasoning chain', async () => {
    stubFetch('final answer');
    const result = await deepseekProvider.call([{ role: 'user', content: 'hi' }]);
    expect(result).toBe('final answer');
  });

  it('sends the configured model name', async () => {
    const bodies = stubFetch();
    await deepseekProvider.call([{ role: 'user', content: 'hi' }]);
    expect(bodies[0].model).toBe(config.deepseek.model);
  });
});
