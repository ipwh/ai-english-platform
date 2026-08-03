// ============================================
// Phase 4D: Paper Reviewer Types — HKDSE Reading Paper Quality Audit
// ============================================

/** Overall paper verdict */
export type ReviewerVerdict = 'pass' | 'revise' | 'reject';

/** Severity of an issue found during review */
export type IssueSeverity = 'low' | 'medium' | 'high';

/** Categorised issue types for paper-level review */
export type ReviewIssueType =
  | 'skillOverlap'
  | 'weakDistractors'
  | 'directLift'
  | 'toneTooFlat'
  | 'toneTooFactual'
  | 'summaryTooEasy'
  | 'summaryTooLiteral'
  | 'transformationTooTrivial'
  | 'transformationTooIsolated'
  | 'blueprintImbalance'
  | 'passageArtificial'
  | 'partALoad'
  | 'feedbackTooTranslational'
  | 'progressionWeak'
  | 'wholeTextMissing'
  | 'wholeTextTooLocal'
  | 'crossParagraphWeak'
  | 'vocabularyTooObvious'
  | 'questionTooLeading'
  | 'questionTooNarrow'
  | 'answerModeMismatch'
  | 'paraphraseTooWeak'
  | 'grammarCueWeak'
  | 'evaluatorTooLenient'
  | 'evaluatorTooStrict'
  | 'other';

/** Review section identifiers */
export type ReviewSection =
  | 'passage'
  | 'blueprint'
  | 'mc'
  | 'reference'
  | 'vocabulary'
  | 'inference'
  | 'tone'
  | 'wholeText'
  | 'summaryCloze'
  | 'sentenceTransformation'
  | 'feedback'
  | 'partA';

/** A single risk flagged during review */
export interface ReviewRisk {
  type: ReviewIssueType;
  severity: IssueSeverity;
  detail: string;
  whyItMatters: string;
  fix: string;
  sampleRewrite?: string;
}

/** A section-level review */
export interface SectionReview {
  section: ReviewSection;
  /** 0-100 score for this section */
  score: number;
  strengths: string[];
  issues: {
    type: ReviewIssueType;
    severity: IssueSeverity;
    detail: string;
    fix: string;
  }[];
}

/** An item-level note */
export interface ItemNote {
  questionId: string;
  skillTarget: string;
  issueType: ReviewIssueType;
  severity: IssueSeverity;
  detail: string;
  fix: string;
  sampleRewrite?: string;
}

/** A prioritised fix */
export interface PriorityFix {
  rank: number;
  action: string;
  reason: string;
}

/** A paper-level strength */
export interface ReviewStrength {
  title: string;
  detail: string;
}

/** Complete paper review result */
export interface PaperReview {
  /** 0-100 overall quality score */
  overallScore: number;
  verdict: ReviewerVerdict;
  /** One-paragraph summary of the overall quality */
  summary: string;
  majorStrengths: ReviewStrength[];
  majorRisks: ReviewRisk[];
  sectionReviews: SectionReview[];
  itemNotes: ItemNote[];
  priorityFixes: PriorityFix[];
}

/** Severity weight mapping for score calculation */
export const SEVERITY_WEIGHTS: Record<IssueSeverity, number> = {
  low: 2,
  medium: 5,
  high: 12,
};

/** Section weight mapping for overall score (sum = 100) */
export const SECTION_WEIGHTS: Record<ReviewSection, number> = {
  passage: 15,
  blueprint: 15,
  mc: 12,
  reference: 5,
  vocabulary: 6,
  inference: 8,
  tone: 8,
  wholeText: 10,
  summaryCloze: 8,
  sentenceTransformation: 5,
  feedback: 5,
  partA: 3,
};

/** Available issue types with descriptions */
export const REVIEW_ISSUE_DESCRIPTIONS: Record<ReviewIssueType, string> = {
  skillOverlap: 'Two or more questions test the same skill in a way that reduces assessment diversity.',
  weakDistractors: 'MC distractors are too obvious, implausible, or trivially eliminable.',
  directLift: 'Answer can be found by direct copying without comprehension or transformation.',
  toneTooFlat: 'Tone/attitude question lacks nuance and can be answered with a simple label.',
  toneTooFactual: 'Tone/attitude question is actually testing factual recall, not authorial voice.',
  summaryTooEasy: 'Summary cloze is solvable by keyword matching without grammar or comprehension.',
  summaryTooLiteral: 'Summary cloze blanks require only direct copying, no grammatical adjustment.',
  transformationTooTrivial: 'Sentence transformation requires only word swap, not structural change.',
  transformationTooIsolated: 'Sentence transformation is detached from the reading passage context.',
  blueprintImbalance: 'Question type distribution is unrealistic or unbalanced for DSE.',
  passageArtificial: 'Passage sounds AI-generated, textbook-like, or lacks natural voice.',
  partALoad: 'Part A or short passage has too many higher-order items.',
  feedbackTooTranslational: 'Feedback only translates the answer without diagnostic explanation.',
  progressionWeak: 'Difficulty curve is flat; later questions are not more demanding than early ones.',
  wholeTextMissing: 'No question requires integrating information from multiple paragraphs.',
  wholeTextTooLocal: 'A whole-text-labelled question can be answered from a single paragraph.',
  crossParagraphWeak: 'Cross-paragraph question does not actually require connecting claims across paragraphs.',
  vocabularyTooObvious: 'Vocabulary question tests a word defined in the immediate context.',
  questionTooLeading: 'Question stem gives away the answer through phrasing or keyword mirroring.',
  questionTooNarrow: 'Question tests a trivial detail rather than meaningful comprehension.',
  answerModeMismatch: 'Answer mode (copy/change/create) does not match the gap design.',
  paraphraseTooWeak: 'Answer can be given by lightly rewording the passage without real paraphrase.',
  grammarCueWeak: 'Blank in cloze/transformation lacks clear part-of-speech or grammar cues.',
  evaluatorTooLenient: 'Auto-evaluation accepts answers that should be marked incorrect.',
  evaluatorTooStrict: 'Auto-evaluation rejects valid paraphrases or alternative answers.',
  other: 'Other issue not covered by standard categories.',
};

/** Calculate overall score from section scores weighted by importance */
export function calculateOverallScore(sectionReviews: SectionReview[]): number {
  let totalWeighted = 0;
  let totalWeight = 0;
  for (const sr of sectionReviews) {
    const weight = SECTION_WEIGHTS[sr.section] ?? 5;
    totalWeighted += sr.score * weight;
    totalWeight += weight;
  }
  return totalWeight > 0 ? Math.round(totalWeighted / totalWeight) : 0;
}

/** Determine verdict from overall score */
export function scoreToVerdict(score: number): ReviewerVerdict {
  if (score >= 85) return 'pass';
  if (score >= 65) return 'revise';
  return 'reject';
}

/** Validate that a PaperReview has all required fields */
export function validateReviewStructure(review: unknown): review is PaperReview {
  if (!review || typeof review !== 'object') return false;
  const r = review as Record<string, unknown>;
  return (
    typeof r.overallScore === 'number' &&
    typeof r.verdict === 'string' &&
    ['pass', 'revise', 'reject'].includes(r.verdict as string) &&
    typeof r.summary === 'string' &&
    Array.isArray(r.majorStrengths) &&
    Array.isArray(r.majorRisks) &&
    Array.isArray(r.sectionReviews) &&
    Array.isArray(r.itemNotes) &&
    Array.isArray(r.priorityFixes)
  );
}
