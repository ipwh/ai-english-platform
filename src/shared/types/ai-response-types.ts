// ============================================
// AI Response Types — client-safe type definitions
// These are pure interfaces with ZERO runtime dependencies.
// Safe to import in 'use client' components.
//
// Kept in sync with the canonical types in:
//   src/modules/ai/usecases/analyze-writing.ts (WritingAnalysis)
// ============================================

/** Writing artifact identity (generated_model vs student_submission etc.). */
export interface WritingArtifactMetadataResult {
  source: "student_submission" | "generated_model" | "teacher_example" | "imported_example";
  /** PEDAGOGICAL TARGET ONLY — never a scoring authority. */
  pedagogicalTargetLevel?: "1" | "2" | "3" | "4" | "5";
  generationTarget?: "low" | "mid" | "high";
  generationVersion?: string;
  qualityStatus?: "verified" | "unverified";
}

/** Evidence-backed structured feedback item (Phase 3). */
export interface EvidenceBackedFeedbackResult {
  dimension: "content" | "language" | "organization" | "task_coverage" | "vocabulary" | "grammar";
  kind: "strength" | "weakness" | "recommendation";
  claim: string;
  evidence: string[];
  recommendation?: string;
  confidence?: "high" | "medium" | "low";
}

/** Separated revision modes (Phase 4). */
export interface WritingRevisionResult {
  faithfulCorrection?: string;
  enhancedVersion?: string;
}

/** Sprint 131: Per-dimension CLO rationale (educational feedback). */
export interface CloDimensionRationaleResult {
  dimension: "content" | "language" | "organization";
  score: number;
  strengths: string[];
  limitations: string[];
  evidence: string[];
  nextSteps: string[];
}

/** AI writing analysis result (HKDSE CLO framework) */
export interface WritingAnalysisResult {
  overallScore: number;           // 0-100 platform score (NOT official HKEAA)
  contentScore?: number;          // CLO Content 0-7
  languageScore?: number;         // CLO Language 0-7
  organizationScore?: number;     // CLO Organization 0-7
  cloTotalScore?: number;         // CLO total 0-21
  /** @deprecated Legacy name retained for API compatibility. Use platformWritingEstimate instead. */
  dseLevel?: string;              // internal estimated level (1-5), NOT official HKEAA grade
  /** Preferred name. Same value as dseLevel — internal diagnostic estimate, not an official HKEAA level. */
  platformWritingEstimate?: string;
  strengths: string[];
  weaknesses: string[];
  grammarErrors: Array<{ original: string; correction: string; explanation: string }>;
  chinglishWarnings: Array<{ original: string; suggestion: string; explanation: string }>;
  vocabularySuggestions: Array<{ original: string; suggestion: string; reason: string }>;
  structureFeedback: string;
  revisedVersion?: string;
  generalComment: string;
  /** Phase 3: Evidence-backed structured feedback (optional). */
  feedback?: EvidenceBackedFeedbackResult[];
  /** Phase 4: Separated revision modes. */
  revision?: WritingRevisionResult;
  /** Phase 5: Rubric metadata. */
  rubric?: { rubricVersion: string; paper: "Paper 2"; taskType?: string; examYear?: string };
  /** Sprint 131: Per-dimension CLO rationale — educational feedback, NOT score authority. */
  cloRationales?: CloDimensionRationaleResult[];
  /** Canonical scoring contract version (HKDSE_P2_WRITING_CANONICAL_V2). */
  scoringVersion?: string;
  /** Echo-only artifact identity — NEVER used for scoring. */
  artifact?: WritingArtifactMetadataResult;
}
