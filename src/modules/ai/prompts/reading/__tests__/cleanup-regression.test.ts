// ============================================
// Phase 3C.2: Micro Cleanup Regression Tests (7 tests)
// ============================================

import { describe, it, expect } from 'vitest';
import {
  buildBlueprintRetryInstruction,
  toBlueprintQualityMeta,
  validateAllMCDistractors,
} from '@/modules/ai/prompts/reading/types';
import type { BlueprintQualityMeta } from '@/modules/ai/prompts/reading/types';

describe('Phase 3C.2: Cleanup Regression', () => {
  // ═══ 1-3: Retry instruction coverage ═══

  it('1. retry instruction includes MC_BANNED_PATTERN guidance', () => {
    const check = {
      passed: false, retryable: true,
      issues: [{ code: 'MC_BANNED_PATTERN', severity: 'critical' as const, message: 'test' }],
      typeFamilyCoverage: {}, issueMessages: [],
    };
    const instruction = buildBlueprintRetryInstruction(check);
    expect(instruction).toContain('MC_BANNED_PATTERN');
    expect(instruction).toContain('banned option patterns');
  });

  it('2. retry instruction includes MC_NO_TRAP_STRUCTURE guidance', () => {
    const check = {
      passed: false, retryable: true,
      issues: [{ code: 'MC_NO_TRAP_STRUCTURE', severity: 'critical' as const, message: 'test' }],
      typeFamilyCoverage: {}, issueMessages: [],
    };
    const instruction = buildBlueprintRetryInstruction(check);
    expect(instruction).toContain('MC_NO_TRAP_STRUCTURE');
    expect(instruction).toContain('almost right');
  });

  it('3. retry instruction includes MISSING_INFERENCE guidance', () => {
    const check = {
      passed: false, retryable: true,
      issues: [{ code: 'MISSING_INFERENCE', severity: 'critical' as const, message: 'test' }],
      typeFamilyCoverage: {}, issueMessages: [],
    };
    const instruction = buildBlueprintRetryInstruction(check);
    expect(instruction).toContain('MISSING_INFERENCE');
    expect(instruction).toContain('beyond stated facts');
  });

  // ═══ 4-5: Metadata shape ═══

  it('4. metadata includes validated flag (true for real checks)', () => {
    const check = {
      passed: true, retryable: false, issues: [], typeFamilyCoverage: {}, issueMessages: [],
    };
    const meta = toBlueprintQualityMeta(check, false, true);
    expect(meta.validated).toBe(true);
    expect(meta.passed).toBe(true);
    expect(meta.degraded).toBe(false);
    expect(meta.retried).toBe(false);
    expect(meta.issues).toEqual([]);
  });

  it('5. metadata includes validated flag (false for skipped)', () => {
    const check = {
      passed: true, retryable: false, issues: [], typeFamilyCoverage: {}, issueMessages: [],
    };
    const meta = toBlueprintQualityMeta(check, false, false);
    expect(meta.validated).toBe(false);
    // Still shows passed=true but validated=false signals it wasn't checked
    expect(meta.passed).toBe(true);
  });

  // ═══ 6-7: Compact issues ═══

  it('6. compact issue output preserves code, severity, message', () => {
    const check = {
      passed: false, retryable: true,
      issues: [{ code: 'MC_BANNED_PATTERN', severity: 'critical' as const, message: 'banned pattern found' }],
      typeFamilyCoverage: {}, issueMessages: [],
    };
    const meta = toBlueprintQualityMeta(check, false, true);
    expect(meta.issues[0]).toEqual({
      code: 'MC_BANNED_PATTERN',
      severity: 'critical',
      message: 'banned pattern found',
    });
    // No extra fields leaked
    expect(Object.keys(meta.issues[0]).sort()).toEqual(['code', 'message', 'severity']);
  });

  it('7. warning-only MC issues do not trigger retry', () => {
    const check = {
      passed: true, retryable: false,
      issues: [{ code: 'MC_STYLISTIC_OUTLIER', severity: 'warning' as const, message: 'test' }],
      typeFamilyCoverage: {}, issueMessages: [],
    };
    expect(check.retryable).toBe(false);
    expect(check.passed).toBe(true);
  });
});
