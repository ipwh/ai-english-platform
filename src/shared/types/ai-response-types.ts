// ============================================
// AI Response Types — client-safe type definitions
// These are pure interfaces with ZERO runtime dependencies.
// Safe to import in 'use client' components.
//
// Kept in sync with the canonical types in:
//   src/modules/ai/usecases/analyze-writing.ts (WritingAnalysis)
// ============================================

/** AI writing analysis result (HKDSE CLO framework) */
export interface WritingAnalysisResult {
  overallScore: number;           // 0-100
  contentScore?: number;          // CLO Content 0-7
  languageScore?: number;         // CLO Language 0-7
  organizationScore?: number;     // CLO Organization 0-7
  cloTotalScore?: number;         // CLO total 0-21
  dseLevel?: string;              // e.g. "5**", "4", "3"
  strengths: string[];
  weaknesses: string[];
  grammarErrors: Array<{ original: string; correction: string; explanation: string }>;
  chinglishWarnings: Array<{ original: string; suggestion: string; explanation: string }>;
  vocabularySuggestions: Array<{ original: string; suggestion: string; reason: string }>;
  structureFeedback: string;
  revisedVersion?: string;
  generalComment: string;
}
