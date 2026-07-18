// Sprint 12: Cache Tests
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { get, set, del, has, ttl, getOrCompute, clearAll, clearNamespace, getStats, startPruning, stopPruning } from '../cache-service';
import { grammarKeys, vocabKeys, exerciseKeys, essayKeys } from '../cache-keys';

beforeEach(() => { clearAll(); });
afterEach(() => { stopPruning(); });

describe('CacheService', () => {
  it('should set and get a value', () => {
    set('test:key', 'hello', { namespace: 'grammar:explanation' });
    expect(get('test:key')).toBe('hello');
  });

  it('should return undefined for missing key', () => {
    expect(get('nonexistent')).toBeUndefined();
  });

  it('should expire entries after TTL', async () => {
    set('test:expire', 'value', { namespace: 'grammar:explanation', ttl: 0.01 }); // 10ms
    await new Promise(r => setTimeout(r, 20));
    expect(get('test:expire')).toBeUndefined();
  });

  it('should check existence with has()', () => {
    set('test:has', 'x', { namespace: 'vocabulary:analysis' });
    expect(has('test:has')).toBe(true);
    del('test:has');
    expect(has('test:has')).toBe(false);
  });

  it('should return TTL remaining', () => {
    set('test:ttl', 'x', { namespace: 'grammar:explanation', ttl: 60 });
    const remaining = ttl('test:ttl');
    expect(remaining).toBeGreaterThan(0);
    expect(remaining).toBeLessThanOrEqual(60);
    expect(ttl('nonexistent')).toBe(-1);
  });

  it('should clear namespace', () => {
    set('a:1', 'x', { namespace: 'grammar:explanation' });
    set('a:2', 'y', { namespace: 'grammar:explanation' });
    set('b:1', 'z', { namespace: 'vocabulary:analysis' });

    const count = clearNamespace('grammar:explanation');
    expect(count).toBe(2);
    expect(get('a:1')).toBeUndefined();
    expect(get('b:1')).toBe('z');
  });

  it('should get or compute', async () => {
    let computeCount = 0;
    const fn = async () => { computeCount++; return 'computed'; };

    const r1 = await getOrCompute('test:compute', { namespace: 'grammar:explanation' }, fn);
    expect(r1).toBe('computed');
    expect(computeCount).toBe(1);

    const r2 = await getOrCompute('test:compute', { namespace: 'grammar:explanation' }, fn);
    expect(r2).toBe('computed');
    expect(computeCount).toBe(1); // Still 1 — cached
  });

  it('should track stats', () => {
    set('s:stats', 'a', { namespace: 'grammar:explanation' });
    get('s:stats');
    get('s:stats');
    get('s:missing');

    const stats = getStats();
    expect(stats.entries).toBe(1);
    expect(stats.hits).toBe(2);
    expect(stats.misses).toBe(1);
    expect(stats.hitRate).toBeCloseTo(2 / 3);
  });

  it('should support default TTL of 1 hour', () => {
    set('test:default', 'x', { namespace: 'grammar:explanation' });
    const remaining = ttl('test:default');
    expect(remaining).toBeGreaterThan(3500); // ~1 hour
    expect(remaining).toBeLessThanOrEqual(3600);
  });
});

describe('CacheKeys', () => {
  it('should generate grammar keys', () => {
    const k = grammarKeys.explainMistake('q1', 'wrong answer');
    expect(k).toMatch(/^grammar:explanation:mistake:q1:/);
  });

  it('should generate vocab keys', () => {
    const k = vocabKeys.wordAnalysis('ubiquitous', 'S5');
    expect(k).toBe('vocabulary:analysis:ubiquitous:S5');
  });

  it('should generate exercise keys', () => {
    const k = exerciseKeys.forStudent('s1', 'grammar', 'core');
    expect(k).toBe('exercise:generated:s1:grammar:core');
  });

  it('should generate essay keys', () => {
    const k = essayKeys.analysis('s1', 'My Essay', 'abc123');
    expect(k).toMatch(/^essay:feedback:analysis:s1:/);
  });

  it('should produce consistent keys for same input', () => {
    const k1 = grammarKeys.questionGen('same params');
    const k2 = grammarKeys.questionGen('same params');
    expect(k1).toBe(k2);
  });
});
