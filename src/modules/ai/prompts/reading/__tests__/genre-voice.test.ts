// ============================================
// Phase 4A.2: Genre Voice Coverage Tests (6 tests)
// ============================================

import { describe, it, expect } from 'vitest';
import { DSE_TEXT_TYPES } from '@/modules/ai/prompts/reading/text-types';

describe('Phase 4A.2: Genre Voice Coverage', () => {
  it('1. all text types have voice metadata', () => {
    for (const t of DSE_TEXT_TYPES) {
      expect(t.voice, `${t.id} missing voice`).toBeDefined();
      expect(t.voice!.length, `${t.id} voice too short`).toBeGreaterThan(20);
    }
  });

  it('2. all text types have stanceStrength between 0-1', () => {
    for (const t of DSE_TEXT_TYPES) {
      expect(t.stanceStrength, `${t.id} missing stanceStrength`).toBeDefined();
      expect(t.stanceStrength!).toBeGreaterThanOrEqual(0);
      expect(t.stanceStrength!).toBeLessThanOrEqual(1);
    }
  });

  it('3. all text types have paragraphMovement', () => {
    for (const t of DSE_TEXT_TYPES) {
      expect(t.paragraphMovement, `${t.id} missing paragraphMovement`).toBeDefined();
      expect(t.paragraphMovement!.length).toBeGreaterThan(10);
    }
  });

  it('4. all text types have subjectivity between 0-1', () => {
    for (const t of DSE_TEXT_TYPES) {
      expect(t.subjectivity, `${t.id} missing subjectivity`).toBeDefined();
      expect(t.subjectivity!).toBeGreaterThanOrEqual(0);
      expect(t.subjectivity!).toBeLessThanOrEqual(1);
    }
  });

  it('5. genres differ meaningfully in stance strength', () => {
    const stances = DSE_TEXT_TYPES.map(t => t.stanceStrength!);
    const unique = new Set(stances);
    // At least 3 distinct stance levels
    expect(unique.size).toBeGreaterThanOrEqual(3);
  });

  it('6. genres differ meaningfully in subjectivity', () => {
    const subjs = DSE_TEXT_TYPES.map(t => t.subjectivity!);
    const unique = new Set(subjs);
    expect(unique.size).toBeGreaterThanOrEqual(3);
  });
});
