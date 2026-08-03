// ============================================
// Phase 4C: Summary Cloze & Transformation Tests (18 tests)
// ============================================

import { describe, it, expect } from 'vitest';
import {
  evaluateSummaryClozeAnswer,
  CLOZE_ANSWER_MODES,
  POS_CUES,
} from '@/modules/ai/prompts/reading/types';
import type { SummaryClozeAnswerMode, SummaryClozeAnswerCheck } from '@/modules/ai/prompts/reading/types';

// ══════════════════════════════════════════
// A: Answer Mode Definitions
// ══════════════════════════════════════════

describe('Phase 4C-A: Answer Mode Definitions', () => {
  it('1. copy mode: appearsInPassage=true, requiresGrammaticalChange=false', () => {
    const mode = CLOZE_ANSWER_MODES.copy;
    expect(mode.appearsInPassage).toBe(true);
    expect(mode.requiresGrammaticalChange).toBe(false);
    expect(mode.acceptParaphrases).toBe(false);
  });

  it('2. change mode: appearsInPassage=false, requiresGrammaticalChange=true', () => {
    const mode = CLOZE_ANSWER_MODES.change;
    expect(mode.appearsInPassage).toBe(false);
    expect(mode.requiresGrammaticalChange).toBe(true);
    expect(mode.acceptParaphrases).toBe(false);
  });

  it('3. create mode: appearsInPassage=false, acceptParaphrases=true', () => {
    const mode = CLOZE_ANSWER_MODES.create;
    expect(mode.appearsInPassage).toBe(false);
    expect(mode.requiresGrammaticalChange).toBe(true);
    expect(mode.acceptParaphrases).toBe(true);
  });

  it('4. all three modes are defined', () => {
    const modes: SummaryClozeAnswerMode[] = ['copy', 'change', 'create'];
    for (const m of modes) {
      expect(CLOZE_ANSWER_MODES[m]).toBeDefined();
      expect(CLOZE_ANSWER_MODES[m].mode).toBe(m);
    }
  });
});

// ══════════════════════════════════════════
// B: Copy Mode Evaluation
// ══════════════════════════════════════════

describe('Phase 4C-B: Copy Mode Evaluation', () => {
  it('5. exact match is accepted in copy mode', () => {
    const result = evaluateSummaryClozeAnswer('completed', 'completed', 'copy');
    expect(result.accepted).toBe(true);
    expect(result.isExactMatch).toBe(true);
  });

  it('6. wrong answer is rejected in copy mode', () => {
    const result = evaluateSummaryClozeAnswer('started', 'completed', 'copy');
    expect(result.accepted).toBe(false);
    expect(result.isExactMatch).toBe(false);
  });

  it('7. copy mode does not accept paraphrases', () => {
    const result = evaluateSummaryClozeAnswer('finished', 'completed', 'copy');
    expect(result.accepted).toBe(false);
  });
});

// ══════════════════════════════════════════
// C: Change Mode Evaluation
// ══════════════════════════════════════════

describe('Phase 4C-C: Change Mode Evaluation', () => {
  it('8. grammatically adjusted form is accepted in change mode', () => {
    // Passage has "decided" → gap needs noun "decision"
    const result = evaluateSummaryClozeAnswer('decision', 'decision', 'change', [], 'They decided to expand.');
    expect(result.accepted).toBe(true);
  });

  it('9. direct copy is rejected when change is expected', () => {
    // Student copies "decided" but gap needs "decision"
    const result = evaluateSummaryClozeAnswer('decided', 'decision', 'change', [], 'They decided to expand.');
    expect(result.accepted).toBe(false);
    expect(result.copiedWhenChangeExpected).toBe(true);
  });

  it('10. unrelated word is rejected in change mode', () => {
    const result = evaluateSummaryClozeAnswer('expanded', 'decision', 'change', [], 'They decided to expand.');
    expect(result.accepted).toBe(false);
  });

  it('11. change mode with stem overlap is accepted (e.g., decide→decision)', () => {
    const result = evaluateSummaryClozeAnswer('decision', 'decision', 'change');
    expect(result.accepted).toBe(true);
  });
});

// ══════════════════════════════════════════
// D: Create Mode Evaluation
// ══════════════════════════════════════════

describe('Phase 4C-D: Create Mode Evaluation', () => {
  it('12. model answer match is accepted in create mode', () => {
    const result = evaluateSummaryClozeAnswer('problematic', 'problematic', 'create');
    expect(result.accepted).toBe(true);
    expect(result.isExactMatch).toBe(true);
  });

  it('13. acceptAlso alternative is accepted in create mode', () => {
    const result = evaluateSummaryClozeAnswer(
      'difficult', 'problematic', 'create',
      ['troubled', 'difficult', 'challenging'],
      'The project faced numerous obstacles.',
    );
    expect(result.accepted).toBe(true);
    expect(result.isAcceptableParaphrase).toBe(true);
  });

  it('14. valid paraphrase not in passage is accepted in create mode', () => {
    const result = evaluateSummaryClozeAnswer(
      'challenging', 'problematic', 'create', [],
      'The project faced numerous obstacles and delays.',
    );
    // "challenging" does not appear in the passage → valid paraphrase
    expect(result.accepted).toBe(true);
    expect(result.isAcceptableParaphrase).toBe(true);
  });

  it('15. word that exists in passage text is rejected if not in acceptAlso', () => {
    const result = evaluateSummaryClozeAnswer(
      'obstacles', 'problematic', 'create', [],
      'The project faced numerous obstacles and delays.',
    );
    // "obstacles" appears verbatim in passage → likely just copy, not acceptable paraphrase
    expect(result.accepted).toBe(false);
  });
});

// ══════════════════════════════════════════
// E: POS Cues
// ══════════════════════════════════════════

describe('Phase 4C-E: POS Cue Definitions', () => {
  it('16. noun cues include articles and quantifiers', () => {
    expect(POS_CUES.noun).toBeDefined();
    expect(POS_CUES.noun.before.test('the ')).toBe(true);
    expect(POS_CUES.noun.before.test('a ')).toBe(true);
    expect(POS_CUES.noun.before.test('some ')).toBe(true);
  });

  it('17. verb cues include auxiliaries and "to"', () => {
    expect(POS_CUES.verb).toBeDefined();
    expect(POS_CUES.verb.before.test('to ')).toBe(true);
    expect(POS_CUES.verb.before.test('has ')).toBe(true);
    expect(POS_CUES.verb.before.test('will ')).toBe(true);
  });

  it('18. adjective cues include linking verbs', () => {
    expect(POS_CUES.adjective).toBeDefined();
    expect(POS_CUES.adjective.before.test('is ')).toBe(true);
    expect(POS_CUES.adjective.before.test('seems ')).toBe(true);
  });
});
