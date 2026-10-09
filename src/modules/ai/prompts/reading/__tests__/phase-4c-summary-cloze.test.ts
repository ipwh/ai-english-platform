// ============================================
// Phase 4C: Summary Cloze & Transformation Tests (18 tests)
// ============================================

import { describe, it, expect } from 'vitest';
import {
  evaluateSummaryClozeAnswer,
  CLOZE_ANSWER_MODES,
  POS_CUES,
  SENTENCE_TRANSFORMATION_RULES,
} from '@/modules/ai/prompts/reading/types';
import type { SummaryClozeAnswerMode } from '@/modules/ai/prompts/reading/types';

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

  it('14. morphology-related word not in passage is accepted in create mode', () => {
    // "importance" shares stem with "important" → morphological relation → accepted
    const result = evaluateSummaryClozeAnswer(
      'importance', 'important', 'create', [],
      'Education plays a vital role in society.',
    );
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

// ══════════════════════════════════════════
// F: Phase 4C.1 — Tightened Create Mode
// ══════════════════════════════════════════

describe('Phase 4C.1-F: Tightened Create Mode', () => {
  it('19. random non-passage word is REJECTED in create mode (no acceptAlso, no morphology)', () => {
    // "wonderful" is not in passage, not in acceptAlso, not morphologically related to "problematic"
    const result = evaluateSummaryClozeAnswer(
      'wonderful', 'problematic', 'create', [],
      'The project faced numerous obstacles.',
    );
    expect(result.accepted).toBe(false);
  });

  it('20. semantically plausible word is REJECTED if not in acceptAlso (conservative)', () => {
    // "hard" is semantically close but not in acceptAlso and not morphologically related
    const result = evaluateSummaryClozeAnswer(
      'hard', 'problematic', 'create', ['troubled', 'difficult'],
      'The project faced numerous obstacles.',
    );
    expect(result.accepted).toBe(false);
  });

  it('21. morphology-related word IS accepted even without acceptAlso', () => {
    // "problem" shares stem with "problematic" → morphological relation
    const result = evaluateSummaryClozeAnswer(
      'problem', 'problematic', 'create', [],
      'The project faced numerous obstacles.',
    );
    expect(result.accepted).toBe(true);
    expect(result.isAcceptableParaphrase).toBe(true);
  });
});

// ══════════════════════════════════════════
// G: Phase 4C.1 — Improved Change Mode
// ══════════════════════════════════════════

describe('Phase 4C.1-G: Improved Change Mode', () => {
  it('22. noun→adjective change is accepted (importance→important)', () => {
    const result = evaluateSummaryClozeAnswer(
      'important', 'important', 'change', [],
      'The importance of education is clear.',
    );
    expect(result.accepted).toBe(true);
  });

  it('23. verb→noun change is accepted (develop→development)', () => {
    const result = evaluateSummaryClozeAnswer(
      'development', 'development', 'change', [],
      'They plan to develop the area.',
    );
    expect(result.accepted).toBe(true);
  });

  it('24. present→past participle change is accepted (interesting→interested)', () => {
    const result = evaluateSummaryClozeAnswer(
      'interested', 'interested', 'change', [],
      'The lecture was interesting.',
    );
    expect(result.accepted).toBe(true);
  });

  it('25. singular→plural is accepted (decision→decisions)', () => {
    const result = evaluateSummaryClozeAnswer(
      'decisions', 'decisions', 'change', [],
      'They made a decision.',
    );
    expect(result.accepted).toBe(true);
  });

  it('26. unrelated word with no morphology connection is rejected', () => {
    const result = evaluateSummaryClozeAnswer(
      'building', 'decision', 'change', [],
      'They decided to expand.',
    );
    expect(result.accepted).toBe(false);
  });
});

// ══════════════════════════════════════════
// H: Phase 4C.1 — Sentence Transformation Rules
// ══════════════════════════════════════════

describe('Phase 4C.1-H: Sentence Transformation Rules', () => {
  it('27. SENTENCE_TRANSFORMATION_RULES defines required change types', () => {
    expect(SENTENCE_TRANSFORMATION_RULES.requiredChanges).toContain('voice');
    expect(SENTENCE_TRANSFORMATION_RULES.requiredChanges).toContain('wordForm');
    expect(SENTENCE_TRANSFORMATION_RULES.requiredChanges.length).toBeGreaterThanOrEqual(3);
  });

  it('28. weakPatterns detect trivial rewrites', () => {
    const weak = SENTENCE_TRANSFORMATION_RULES.weakPatterns;
    expect(weak.some(p => p.test('Rewrite the sentence using the word "approval"'))).toBe(true);
    expect(weak.some(p => p.test('Replace the word "decided" with "made a decision"'))).toBe(true);
  });

  it('29. strongPatterns detect genuine restructuring', () => {
    const strong = SENTENCE_TRANSFORMATION_RULES.strongPatterns;
    expect(strong.some(p => p.test('Rewrite in the passive voice'))).toBe(true);
    expect(strong.some(p => p.test('Transform the adjective into a noun'))).toBe(true);
    expect(strong.some(p => p.test('Combine the sentences using a relative clause'))).toBe(true);
  });

  it('30. weak rewrite with just word swap does NOT match strong patterns', () => {
    const strong = SENTENCE_TRANSFORMATION_RULES.strongPatterns;
    expect(strong.some(p => p.test('Rewrite using the word "happy"'))).toBe(false);
  });
});
