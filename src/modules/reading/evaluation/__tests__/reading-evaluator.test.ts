// ============================================
// Phase 2A.1: Reading Answer Evaluator Tests (14 tests)
// ============================================

import { describe, it, expect } from 'vitest';
import {
  estimateCopyingRatio,
  classifyCopyingLevel,
  classifyParaphraseQuality,
  detectGrammarFit,
  buildEvaluation,
  shouldApplyCopyPenalty,
  detectExpectedPos,
  isVagueToneAnswer,
  applyQualityDowngrade,
  requiresApiEvaluation,
  detectLexicalShift,
  detectStructuralShift,
  normalizeForComparison,
} from '@/modules/reading/evaluation';
import { createEmptyEvaluation } from '@/modules/reading/evaluation';

const SAMPLE_EVIDENCE =
  'The concept of general knowledge has long been a subject of debate in educational circles. ' +
  'In an age of increasing specialization, some argue that a broad base of general knowledge is no longer necessary.';

describe('Phase 2A.1: Reading Answer Evaluator', () => {
  // ═══ 1-5: Copy Detection ═══

  it('1. detects heavy copying when answer is verbatim from evidence', () => {
    const ratio = estimateCopyingRatio('a broad base of general knowledge is no longer necessary', SAMPLE_EVIDENCE);
    expect(ratio).toBeGreaterThanOrEqual(0.85);
    expect(classifyCopyingLevel(ratio)).toBe('heavy');
  });

  it('2. detects light copying with partial overlap', () => {
    const ratio = estimateCopyingRatio('general knowledge is not needed today', SAMPLE_EVIDENCE);
    expect(ratio).toBeGreaterThan(0.3);
    expect(ratio).toBeLessThan(0.85);
    const level = classifyCopyingLevel(ratio);
    expect(['light', 'none']).toContain(level);
  });

  it('3. detects no copying for fully paraphrased answer', () => {
    const ratio = estimateCopyingRatio('understanding many subjects helps students think better', SAMPLE_EVIDENCE);
    expect(ratio).toBeLessThan(0.5);
  });

  it('4. short-answer safeguard: 2-word answer does not trigger copy penalty', () => {
    expect(shouldApplyCopyPenalty('general knowledge')).toBe(false);
    expect(shouldApplyCopyPenalty('no longer necessary')).toBe(false); // 3 tokens
    expect(shouldApplyCopyPenalty('a broad base of general knowledge')).toBe(true); // 6 tokens
  });

  it('5. exact substring match returns ratio 1', () => {
    const ratio = estimateCopyingRatio(
      'a broad base of general knowledge is no longer necessary',
      SAMPLE_EVIDENCE,
    );
    expect(ratio).toBe(1);
    expect(classifyCopyingLevel(ratio)).toBe('heavy');
  });

  // ═══ 6-8: Paraphrase Quality ═══

  it('6. strong paraphrase: lexical + structural shift', () => {
    const studentAnswer = 'some believe that wide-ranging understanding is not required anymore';
    const ratio = estimateCopyingRatio(studentAnswer, SAMPLE_EVIDENCE);
    const lex = detectLexicalShift(studentAnswer, SAMPLE_EVIDENCE);
    const struct = detectStructuralShift(studentAnswer, SAMPLE_EVIDENCE);
    const quality = classifyParaphraseQuality({
      copyingRatio: ratio,
      hasLexicalShift: lex,
      hasStructuralShift: struct,
    });
    expect(['adequate', 'strong']).toContain(quality);
  });

  it('7. no paraphrase: exact copy', () => {
    const quality = classifyParaphraseQuality({
      copyingRatio: 0.95,
      hasLexicalShift: false,
      hasStructuralShift: false,
    });
    expect(quality).toBe('none');
  });

  it('8. limited paraphrase: light overlap, no shifts', () => {
    const quality = classifyParaphraseQuality({
      copyingRatio: 0.55,
      hasLexicalShift: false,
      hasStructuralShift: false,
    });
    expect(quality).toBe('limited');
  });

  // ═══ 9-11: Grammar Fit ═══

  it('9. sentence transformation with poor grammar fit', () => {
    const fit = detectGrammarFit('Complete the sentence using your own words.', 'the');
    expect(fit).toBe('poor');
  });

  it('10. single-word answer matches single-word expectation', () => {
    const fit = detectGrammarFit('Find ONE word from paragraph 2.', 'knowledge');
    expect(fit).toBe('good');
  });

  it('11. acceptable grammar for short phrase', () => {
    const fit = detectGrammarFit('State one reason.', 'lack of funding');
    expect(['acceptable', 'good']).toContain(fit);
  });

  // ═══ 12-14: Per-Type Hardening ═══

  it('12. vocabulary_in_context: POS detection from question', () => {
    expect(detectExpectedPos('Find a verb in paragraph 1')).toBe('verb');
    expect(detectExpectedPos('What noun is used to describe...')).toBe('noun');
    expect(detectExpectedPos('What does the word mean')).toBe('unknown');
  });

  it('13. tone_attitude: vague answer is flagged', () => {
    expect(isVagueToneAnswer('positive')).toBe(true);
    expect(isVagueToneAnswer('good')).toBe(true);
    expect(isVagueToneAnswer('critical')).toBe(false);
    expect(isVagueToneAnswer('sceptical')).toBe(false);
  });

  it('14. quality downgrade does not flip correctness', () => {
    const eval_ = createEmptyEvaluation(3);
    eval_.isCorrect = true;
    eval_.scoreAwarded = 3;
    eval_.paraphraseQuality = 'strong';
    eval_.grammaticalFitToPrompt = 'good';

    const downgraded = applyQualityDowngrade(eval_, 'Test downgrade reason');

    // Correctness and score preserved
    expect(downgraded.isCorrect).toBe(true);
    expect(downgraded.scoreAwarded).toBe(3);
    // Quality downgraded
    expect(downgraded.paraphraseQuality).toBe('adequate');
    expect(downgraded.grammaticalFitToPrompt).toBe('acceptable');
    // Warning added
    expect(downgraded.warnings).toContain('Test downgrade reason');
  });
});

// ═══ Supplementary: Integration Tests ═══

describe('Phase 2A.1: buildEvaluation hardening', () => {
  it('15. heavy copy + correct: quality downgraded, correctness preserved', () => {
    const ev = buildEvaluation({
      isCorrect: true,
      maxScore: 2,
      studentAnswer: 'a broad base of general knowledge is no longer necessary',
      evidence: SAMPLE_EVIDENCE,
      questionPrompt: 'According to paragraph 1, what do some argue?',
      expectedAnswer: 'general knowledge is no longer necessary',
      dseType: 'short_answer',
    });

    expect(ev.isCorrect).toBe(true);
    expect(ev.scoreAwarded).toBe(2);
    expect(ev.copyingLevel).toBe('heavy');
    expect(ev.warnings.length).toBeGreaterThan(0);
    expect(ev.warnings.some(w => w.includes('heavily copied'))).toBe(true);
  });

  it('16. vague tone answer: quality downgraded', () => {
    const ev = buildEvaluation({
      isCorrect: true,
      maxScore: 2,
      studentAnswer: 'positive',
      evidence: 'The author expresses admiration for the project.',
      questionPrompt: 'What is the author\'s tone in paragraph 3?',
      expectedAnswer: 'admiring',
      dseType: 'tone_attitude',
    });

    expect(ev.isCorrect).toBe(true);
    const hasVagueWarning = ev.warnings.some(w => w.includes('vague'));
    const hasVagueNote = ev.notes.some(n => n.includes('vague'));
    expect(hasVagueWarning || hasVagueNote).toBe(true);
  });

  it('17. grammar-poor sentence transformation: quality affected, not correctness', () => {
    const ev = buildEvaluation({
      isCorrect: true,
      maxScore: 3,
      studentAnswer: 'the',
      evidence: 'The project was completed ahead of schedule.',
      questionPrompt: 'Complete the sentence using your own words: The project...',
      expectedAnswer: 'was finished early',
      dseType: 'sentence_transformation',
    });

    expect(ev.isCorrect).toBe(true);
    expect(ev.grammaticalFitToPrompt).toBe('poor');
    const hasGrammarWarning = ev.warnings.some(w => w.includes('Grammar does not fit'));
    const hasQualityDowngrade = ev.paraphraseQuality !== 'strong';
    expect(hasGrammarWarning || hasQualityDowngrade).toBe(true);
  });

  it('18. vocabulary meaning close but answer is too short', () => {
    const ev = buildEvaluation({
      isCorrect: true,
      maxScore: 1,
      studentAnswer: 'know',
      evidence: 'The concept of general knowledge has long been a subject of debate.',
      questionPrompt: 'Find a noun in paragraph 1 that means "understanding of facts".',
      expectedAnswer: 'knowledge',
      dseType: 'vocabulary_in_context',
    });

    expect(ev.isCorrect).toBe(true);
    // POS note should mention expected POS
    const posNote = ev.notes.find(n => n.includes('POS'));
    expect(posNote).toBeDefined();
    expect(posNote).toContain('noun');
  });

  it('19. objective item bypass: multiple_choice not API-evaluated', () => {
    expect(requiresApiEvaluation('multiple_choice')).toBe(false);
    expect(requiresApiEvaluation('true_false_not_given')).toBe(false);
    expect(requiresApiEvaluation('reference')).toBe(true);
    expect(requiresApiEvaluation('inference')).toBe(true);
  });

  it('20. strong paraphrase + correct: no quality penalty', () => {
    const ev = buildEvaluation({
      isCorrect: true,
      maxScore: 2,
      studentAnswer: 'some believe that wide-ranging understanding is not required anymore',
      evidence: SAMPLE_EVIDENCE,
      questionPrompt: 'According to paragraph 1, what do some argue?',
      expectedAnswer: 'general knowledge is no longer necessary',
      dseType: 'short_answer',
    });

    expect(ev.isCorrect).toBe(true);
    // Should not have copy penalty
    const hasCopyPenalty = ev.warnings.some(w => w.includes('copied'));
    expect(hasCopyPenalty).toBe(false);
    // Should be adequate or strong paraphrase
    expect(['adequate', 'strong']).toContain(ev.paraphraseQuality);
  });
});
