// ============================================
// Phase 2B: Reading Diagnostic Feedback Types
// Structured feedback model for DSE Paper 1.
// ============================================

/** DSE reading error taxonomy */
export type ReadingErrorType =
  | 'missed_keyword'
  | 'missed_contrast'
  | 'missed_negation'
  | 'wrong_reference'
  | 'paraphrase_too_close'
  | 'paraphrase_too_far'
  | 'tone_too_vague'
  | 'pos_mismatch'
  | 'grammar_mismatch'
  | 'incomplete_answer'
  | 'distractor_trap'
  | 'unsupported_inference';

/** Structured diagnostic feedback for a single DSE reading answer */
export interface ReadingDiagnosticFeedback {
  /** Overall verdict */
  verdict: 'correct' | 'partially_correct' | 'incorrect';

  /** The reading skill being tested (e.g. "Referencing", "Vocabulary in context") */
  skillTarget: string;

  /** Where to find the answer in the passage */
  locatingClue?: string;

  /** Summary of the evidence that supports the expected answer */
  evidenceSummary?: string;

  /** Classified error type if the answer is wrong/weak */
  errorType?: ReadingErrorType;

  /** Concrete advice on how to improve */
  improvementAdvice?: string;

  /** Specific paraphrase guidance */
  paraphraseAdvice?: string;

  /** Specific grammar/form guidance */
  grammarAdvice?: string;

  /** For MC items: explanations of why distractors are wrong */
  distractorNotes?: string[];

  /** Confidence in this diagnosis */
  confidence?: 'low' | 'medium' | 'high';
}

/** DSE skill labels by type */
export const DSE_SKILL_LABELS: Record<string, string> = {
  multiple_choice: 'Comprehension — Multiple choice',
  true_false_not_given: 'Comprehension — True/False/Not Given',
  reference: 'Referencing — Pronoun/antecedent resolution',
  vocabulary_in_context: 'Vocabulary in context — Word meaning from clues',
  inference: 'Inference — Reading between the lines',
  tone_attitude: 'Tone/attitude — Writer\'s stance and purpose',
  summary_cloze: 'Summary cloze — Completing a summary accurately',
  sentence_transformation: 'Sentence transformation — Paraphrase and grammar fit',
  short_answer: 'Short answer — Locating and paraphrasing evidence',
};
