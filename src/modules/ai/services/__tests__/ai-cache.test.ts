// ============================================
// Tests: AI response cache contract
// A provider FAILURE (empty answer) must never become a cached "result".
// ============================================

import { beforeEach, describe, expect, it } from 'vitest';
import { aiCache } from '../ai-cache';

beforeEach(async () => {
  await aiCache.clear();
});

describe('aiCache', () => {
  it('stores and returns a real answer', async () => {
    await aiCache.set('prompt-A', 'the answer');
    expect(await aiCache.get('prompt-A')).toBe('the answer');
  });

  it('never caches an empty answer (provider failure must not be replayed)', async () => {
    await aiCache.set('prompt-B', '');
    expect(await aiCache.get('prompt-B')).toBeNull();
  });

  it('never caches a whitespace-only answer', async () => {
    await aiCache.set('prompt-C', '   \n  ');
    expect(await aiCache.get('prompt-C')).toBeNull();
  });

  it('keys are scoped: different prompts do not collide', async () => {
    await aiCache.set('prompt-D', 'answer D');
    expect(await aiCache.get('prompt-E')).toBeNull();
  });
});