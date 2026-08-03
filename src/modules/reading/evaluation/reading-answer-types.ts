// ============================================
// Phase 2A: Reading Answer Evaluation Types
// Structured evaluation model for DSE Paper 1 answers.
// Separates correctness from answer quality.
// ============================================

/** How much the student copied from the source passage */
export type CopyingLevel = 'none' | 'light' | 'heavy';

/** Quality of paraphrase relative to the source */
export type ParaphraseQuality = 'none' | 'limited' | 'adequate' | 'strong';

/** Grammatical fit of the answer to the question prompt */
export type GrammarFit = 'poor' | 'acceptable' | 'good';

/** How complete the answer is relative to what was expected */
export type Completeness = 'partial' | 'sufficient' | 'full';

/** A span of source text that supports the expected answer */
export interface EvidenceSpan {
  paragraphIndex?: number;
  lineStart?: number;
  lineEnd?: number;
  excerpt: string;
}

/** Structured evaluation result for a single DSE reading answer */
export interface ReadingAnswerEvaluation {
  /** Whether the answer is semantically correct */
  isCorrect: boolean;
  /** Marks awarded (0 to maxScore) */
  scoreAwarded: number;
  /** Maximum possible marks for this question */
  maxScore: number;

  // ── Copying detection ──
  /** Fraction of answer tokens found verbatim in source evidence (0-1) */
  copyingRatio: number;
  /** Classified copying severity */
  copyingLevel: CopyingLevel;
  /** True if any copying was detected (ratio > 0) */
  copyingDetected: boolean;

  // ── Paraphrase quality ──
  paraphraseQuality: ParaphraseQuality;

  // ── Grammar fit ──
  grammaticalFitToPrompt: GrammarFit;

  // ── Completeness ──
  completeness: Completeness;

  // ── Evidence ──
  /** Source text spans that support the expected answer */
  evidenceSpans: EvidenceSpan[];

  // ── Diagnostics ──
  notes: string[];
  warnings: string[];
}

/** Creates a default "not evaluated yet" result */
export function createEmptyEvaluation(maxScore: number): ReadingAnswerEvaluation {
  return {
    isCorrect: false,
    scoreAwarded: 0,
    maxScore,
    copyingRatio: 0,
    copyingLevel: 'none',
    copyingDetected: false,
    paraphraseQuality: 'none',
    grammaticalFitToPrompt: 'acceptable',
    completeness: 'partial',
    evidenceSpans: [],
    notes: [],
    warnings: [],
  };
}
