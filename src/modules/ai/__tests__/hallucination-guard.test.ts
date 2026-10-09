// Sprint 44: AI Hallucination Guard — Tests
import { describe, it, expect, beforeEach } from 'vitest';
import {
  scoreHallucinationRisk,
  checkHallucinationBreaker,
  resetHallucinationBreaker,
  getHallucinationBreakerState,
  injectHallucinationGuard,
  verifyGrounding,
  HALLUCINATION_GUARD,
} from '../services/hallucination-guard';

beforeEach(() => {
  resetHallucinationBreaker();
});

// ============================================
// Hallucination Scoring
// ============================================

describe('Hallucination Guard — Scoring', () => {
  it('should score safe output as low risk', () => {
    const result = scoreHallucinationRisk(
      'The past tense of "go" is "went". This is a common irregular verb in English.',
    );
    expect(result.risk).toBeLessThan(0.25);
    expect(result.verdict).toBe('safe');
  });

  it('should detect fabricated citations', () => {
    const result = scoreHallucinationRisk(
      'According to a study by Harvard University, 85% of students prefer online learning.',
    );
    expect(result.risk).toBeGreaterThan(0.15);
    expect(result.indicators).toContain('fabricated-citation');
  });

  it('should detect overconfident claims', () => {
    const result = scoreHallucinationRisk(
      'It is certainly true that all teachers prefer this method of instruction.',
    );
    expect(result.indicators).toContain('overconfident-claim');
  });

  it('should detect absolute claims', () => {
    const result = scoreHallucinationRisk(
      'Everyone knows that English is the hardest language to learn. No one disagrees with this.',
    );
    expect(result.indicators).toContain('absolute-claim');
  });

  it('should detect fabricated statistics', () => {
    const result = scoreHallucinationRisk(
      'Studies show that 73.5% of students improve within 2 weeks of using this method.',
    );
    expect(result.indicators).toContain('fabricated-statistic');
  });

  it('should detect fabricated academic references', () => {
    const result = scoreHallucinationRisk(
      'As demonstrated by Smith et al. (2023), the effectiveness of AI tutoring is proven.',
    );
    expect(result.indicators).toContain('fabricated-academic-reference');
  });

  it('should detect too-short output', () => {
    const result = scoreHallucinationRisk('OK');
    expect(result.indicators).toContain('too-short-output');
    expect(result.verdict).toBe('suspect');
  });

  it('should detect unusually long output', () => {
    const longOutput = 'x'.repeat(5001);
    const result = scoreHallucinationRisk(longOutput);
    expect(result.indicators).toContain('unusually-long-output');
  });

  it('should verify grounding against source material', () => {
    const sourceMaterial = 'The DSE English exam consists of four papers. Paper 1 is Reading, Paper 2 is Writing, Paper 3 is Listening and Integrated Skills, and Paper 4 is Speaking.';
    const result = scoreHallucinationRisk(
      'Paper 1 is Reading comprehension. Paper 2 involves writing tasks.',
      sourceMaterial,
    );
    // Should have good grounding
    expect(result.risk).toBeLessThan(0.25);
  });

  it('should flag low grounding when output diverges from source', () => {
    const sourceMaterial = 'The cat sat on the mat.';
    const result = scoreHallucinationRisk(
      'According to a study by Harvard researchers, spaced repetition improves retention by 78%.',
      sourceMaterial,
    );
    expect(result.indicators).toContain('fabricated-citation');
    expect(result.risk).toBeGreaterThan(0.15);
  });
});

// ============================================
// Circuit Breaker
// ============================================

describe('Hallucination Guard — Circuit Breaker', () => {
  it('should accept safe outputs', () => {
    const score = { risk: 0.1, indicators: [], verdict: 'safe' as const };
    const result = checkHallucinationBreaker(score);
    expect(result.accepted).toBe(true);
  });

  it('should accept suspect outputs but track them', () => {
    const score = { risk: 0.3, indicators: ['fabricated-citation'], verdict: 'suspect' as const };
    const result = checkHallucinationBreaker(score);
    expect(result.accepted).toBe(true);
    expect(getHallucinationBreakerState().consecutiveFailures).toBe(1);
  });

  it('should reject likely-hallucination outputs', () => {
    const score = { risk: 0.6, indicators: ['fabricated-citation', 'fabricated-statistic'], verdict: 'likely-hallucination' as const };
    const result = checkHallucinationBreaker(score);
    expect(result.accepted).toBe(false);
    expect(result.reason).toContain('rejected');
  });

  it('should open circuit breaker after consecutive rejections', () => {
    const badScore = { risk: 0.6, indicators: ['fabricated-citation'], verdict: 'likely-hallucination' as const };
    for (let i = 0; i < 5; i++) {
      checkHallucinationBreaker(badScore);
    }
    const result = checkHallucinationBreaker(badScore);
    expect(result.accepted).toBe(false);
    expect(result.reason).toContain('circuit breaker is open');
  });

  it('should reset consecutive failures on safe output', () => {
    const suspectScore = { risk: 0.3, indicators: ['fabricated-citation'], verdict: 'suspect' as const };
    checkHallucinationBreaker(suspectScore);
    expect(getHallucinationBreakerState().consecutiveFailures).toBe(1);

    const safeScore = { risk: 0.1, indicators: [], verdict: 'safe' as const };
    checkHallucinationBreaker(safeScore);
    expect(getHallucinationBreakerState().consecutiveFailures).toBe(0);
  });
});

// ============================================
// Prompt Guard Injection
// ============================================

describe('Hallucination Guard — Prompt Injection', () => {
  it('should inject guard into system prompt', () => {
    const prompt = 'You are an English teacher. Provide detailed explanations for student questions.';
    const result = injectHallucinationGuard(prompt);
    expect(result).toContain('Anti-Hallucination');
    expect(result).toContain('Do NOT fabricate');
  });

  it('should use LITE guard for short prompts', () => {
    const shortPrompt = 'Be helpful.';
    const result = injectHallucinationGuard(shortPrompt);
    expect(result).toContain('Anti-Hallucination');
    // LITE version is shorter
    expect(result.length).toBeLessThan(HALLUCINATION_GUARD.length + shortPrompt.length);
  });

  it('should not double-inject guard', () => {
    const alreadyGuarded = 'You are a teacher.\n\n## ⚠️ CRITICAL: Anti-Hallucination Rules';
    const result = injectHallucinationGuard(alreadyGuarded);
    // Should not append a second guard
    expect(result.match(/Anti-Hallucination Rules/g)?.length).toBe(1);
  });

  it('should inject full guard for longer prompts', () => {
    const longPrompt = 'x'.repeat(600);
    const result = injectHallucinationGuard(longPrompt);
    expect(result).toContain('VERIFY your answer against the provided source material');
  });
});

// ============================================
// Grounding Verification
// ============================================

describe('Hallucination Guard — Grounding Verification', () => {
  it('should give high grounding score for well-grounded output', () => {
    const source = 'The DSE English Paper 1 is the Reading paper. It contains Part A and Part B. Part B has two sections: B1 (easier) and B2 (harder).';
    const output = 'The DSE Reading paper is Paper 1. It has Part A and Part B sections. Students can choose between B1 and B2.';
    const result = verifyGrounding(output, source);
    expect(result.groundingScore).toBeGreaterThan(0.3);
    expect(result.unsupportedClaims.length).toBeLessThanOrEqual(1);
  });

  it('should detect unsupported claims', () => {
    const source = 'The cat sat on the mat.';
    const output = 'The cat sat on the mat. Additionally, dogs are excellent companions for children and help develop emotional intelligence.';
    const result = verifyGrounding(output, source);
    expect(result.unsupportedClaims.length).toBeGreaterThan(0);
  });

  it('should handle empty output gracefully', () => {
    const result = verifyGrounding('', 'Some source material.');
    expect(result.groundingScore).toBe(0.5);
  });
});
