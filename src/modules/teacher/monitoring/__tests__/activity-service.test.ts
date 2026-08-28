// Sprint 133: activity-service tests — short-writing detection (pure logic)
import { describe, it, expect, vi } from 'vitest';

// The service imports db at module level; mock it to avoid
// provider mismatch in the test environment (same pattern as teacher-copilot tests).
vi.mock('@/shared/db/db', () => ({
  db: { writingDraft: { findMany: vi.fn().mockResolvedValue([]) } },
}));

import { countShortWritings, SHORT_WRITING_THRESHOLD_WORDS } from '../services/activity-service';

const words = (n: number) => Array(n).fill('word').join(' ');

describe('countShortWritings', () => {
  it('counts drafts below the word threshold as short', () => {
    const result = countShortWritings([
      { studentId: 's1', draft: words(50) },
      { studentId: 's1', draft: words(150) },
      { studentId: 's2', draft: 'tiny' },
    ]);
    expect(result.get('s1')).toBe(1);
    expect(result.get('s2')).toBe(1);
  });

  it('ignores blank drafts', () => {
    const result = countShortWritings([{ studentId: 's1', draft: '   ' }]);
    expect(result.get('s1')).toBeUndefined();
  });

  it('keeps a sane threshold (100 words)', () => {
    expect(SHORT_WRITING_THRESHOLD_WORDS).toBe(100);
  });

  it('returns empty map for no drafts', () => {
    expect(countShortWritings([]).size).toBe(0);
  });
});
