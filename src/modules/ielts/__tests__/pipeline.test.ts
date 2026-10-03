// ============================================
// IELTS Status Machine — AI can never publish
// ============================================
import { describe, expect, it } from 'vitest';
import { applyTransition, canTransition, statusAfterAiValidation } from '../validation/pipeline';

describe('transition table', () => {
  it('permits the documented forward path only', () => {
    expect(canTransition('DRAFT', 'AI_VALIDATED')).toBe(true);
    expect(canTransition('AI_VALIDATED', 'QA_REQUIRED')).toBe(true);
    expect(canTransition('QA_REQUIRED', 'HUMAN_APPROVED')).toBe(true);
    expect(canTransition('HUMAN_APPROVED', 'PUBLISHED')).toBe(true);
    expect(canTransition('PUBLISHED', 'REJECTED')).toBe(true); // retire
  });

  it('forbids skipping QA and reviving rejected items', () => {
    expect(canTransition('DRAFT', 'PUBLISHED')).toBe(false);
    expect(canTransition('AI_VALIDATED', 'HUMAN_APPROVED')).toBe(false);
    expect(canTransition('REJECTED', 'DRAFT')).toBe(false);
  });
});

describe('actor guards', () => {
  it('AI may only set AI_VALIDATED or REJECTED', () => {
    expect(applyTransition({ from: 'DRAFT', to: 'AI_VALIDATED', actor: 'AI' }).allowed).toBe(true);
    const publish = applyTransition({ from: 'HUMAN_APPROVED', to: 'PUBLISHED', actor: 'AI' });
    expect(publish.allowed).toBe(false);
    expect(publish.error).toContain('AI_CANNOT_TRANSITION');
  });

  it('SYSTEM automation reaches only QA_REQUIRED', () => {
    expect(applyTransition({ from: 'DRAFT', to: 'AI_VALIDATED', actor: 'SYSTEM' }).allowed).toBe(true);
    expect(applyTransition({ from: 'AI_VALIDATED', to: 'QA_REQUIRED', actor: 'SYSTEM' }).allowed).toBe(true);
    expect(applyTransition({ from: 'QA_REQUIRED', to: 'HUMAN_APPROVED', actor: 'SYSTEM' }).allowed).toBe(false);
  });

  it('HUMAN_APPROVED and PUBLISHED require a reviewer id', () => {
    const noReviewer = applyTransition({ from: 'QA_REQUIRED', to: 'HUMAN_APPROVED', actor: 'HUMAN' });
    expect(noReviewer.allowed).toBe(false);
    expect(noReviewer.error).toContain('REVIEWER_REQUIRED');

    expect(
      applyTransition({ from: 'QA_REQUIRED', to: 'HUMAN_APPROVED', actor: 'HUMAN', reviewerId: 't-1' }).allowed,
    ).toBe(true);
    expect(
      applyTransition({ from: 'HUMAN_APPROVED', to: 'PUBLISHED', actor: 'HUMAN', reviewerId: 't-1' }).allowed,
    ).toBe(true);
  });

  it('validator rejection blocks approval/publication', () => {
    const blocked = applyTransition({
      from: 'QA_REQUIRED',
      to: 'HUMAN_APPROVED',
      actor: 'HUMAN',
      reviewerId: 't-1',
      validatorOk: false,
    });
    expect(blocked.allowed).toBe(false);
    expect(blocked.error).toContain('VALIDATOR_REJECTED');
  });

  it('statusAfterAiValidation defaults to QA_REQUIRED or REJECTED', () => {
    expect(statusAfterAiValidation(true)).toBe('QA_REQUIRED');
    expect(statusAfterAiValidation(false)).toBe('REJECTED');
  });
});
