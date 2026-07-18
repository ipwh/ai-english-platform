// ============================================
// Tests: Rate Limiter — Sliding Window Algorithm
// ============================================

import { describe, it, expect, beforeEach } from 'vitest';
import { checkRateLimit } from '@/shared/utils/rate-limiter';
import type { RateLimitConfig } from '@/shared/utils/rate-limiter';

// ============================================
// In-memory Rate Limiter Tests
// ============================================

const defaultConfig: RateLimitConfig = {
  maxRequests: 5,
  windowMs: 60_000,
};

describe('checkRateLimit (in-memory)', () => {
  beforeEach(() => {
    // Each test gets a unique identifier to avoid cross-test interference
  });

  it('should allow first request', async () => {
    const result = await checkRateLimit({
      ...defaultConfig,
      identifier: 'test-allow-first-' + Math.random(),
    });
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4); // 5 - 1
    expect(result.resetAt).toBeGreaterThan(Date.now());
  });

  it('should allow up to maxRequests', async () => {
    const id = 'test-max-' + Math.random();
    for (let i = 0; i < 5; i++) {
      const result = await checkRateLimit({ ...defaultConfig, identifier: id });
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4 - i);
    }
  });

  it('should block request exceeding maxRequests', async () => {
    const id = 'test-block-' + Math.random();
    // Exhaust the limit
    for (let i = 0; i < 5; i++) {
      await checkRateLimit({ ...defaultConfig, identifier: id });
    }
    // 6th request should be blocked
    const result = await checkRateLimit({ ...defaultConfig, identifier: id });
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.message).toBeTruthy();
  });

  it('should use global key when no identifier provided', async () => {
    const result = await checkRateLimit({ maxRequests: 100, windowMs: 60_000 });
    expect(result.allowed).toBe(true);
  });

  it('should isolate different identifiers', async () => {
    const idA = 'test-isolate-a-' + Math.random();
    const idB = 'test-isolate-b-' + Math.random();

    // Exhaust A
    for (let i = 0; i < 5; i++) {
      await checkRateLimit({ ...defaultConfig, identifier: idA });
    }
    const blocked = await checkRateLimit({ ...defaultConfig, identifier: idA });
    expect(blocked.allowed).toBe(false);

    // B should still be allowed
    const allowed = await checkRateLimit({ ...defaultConfig, identifier: idB });
    expect(allowed.allowed).toBe(true);
    expect(allowed.remaining).toBe(4);
  });

  it('should provide human-readable message in Chinese', async () => {
    const id = 'test-msg-' + Math.random();
    for (let i = 0; i < 5; i++) {
      await checkRateLimit({ ...defaultConfig, identifier: id });
    }
    const result = await checkRateLimit({ ...defaultConfig, identifier: id });
    expect(result.message).toMatch(/請求過於頻繁/);
    expect(result.message).toMatch(/秒後重試/);
  });

  it('should include maxRequests and window info in message', async () => {
    const id = 'test-msg-detail-' + Math.random();
    const config = { maxRequests: 3, windowMs: 30_000 };
    for (let i = 0; i < 3; i++) {
      await checkRateLimit({ ...config, identifier: id });
    }
    const result = await checkRateLimit({ ...config, identifier: id });
    expect(result.message).toContain('3');
    expect(result.message).toContain('30');
  });
});

// ============================================
// Predefined Rate Limits Tests
// ============================================

describe('Predefined rate limits', () => {
  it('AI_RATE_LIMIT should be importable', async () => {
    const { AI_RATE_LIMIT } = await import('@/shared/utils/rate-limiter');
    expect(AI_RATE_LIMIT.maxRequests).toBeGreaterThan(0);
    expect(AI_RATE_LIMIT.windowMs).toBeGreaterThan(0);
  });

  it('LOGIN_RATE_LIMIT should be stricter than AI limit', async () => {
    const { AI_RATE_LIMIT, LOGIN_RATE_LIMIT } = await import('@/shared/utils/rate-limiter');
    expect(LOGIN_RATE_LIMIT.maxRequests).toBeLessThan(AI_RATE_LIMIT.maxRequests);
  });
});
