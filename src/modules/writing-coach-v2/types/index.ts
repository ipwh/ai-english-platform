// Sprint 36: Writing Coach 2.0 — type definitions

export type DSEBand = 'U' | '1' | '2' | '3' | '4' | '5' | '5*' | '5**';

/** 8 assessment dimensions */
export interface WritingDimensions {
  grammar: number;         // 0-10
  vocabulary: number;      // 0-10
  sentenceVariety: number; // 0-10
  coherence: number;       // 0-10
  cohesion: number;        // 0-10
  organization: number;    // 0-10
  taskResponse: number;    // 0-10
  tone: number;            // 0-10
}

export interface BandPrediction {
  predictedBand: DSEBand;
  confidence: number;      // 0-1
  /** Per-dimension contribution to final score */
  breakdown: WritingDimensions;
  /** Weighted total (0-100) */
  weightedTotal: number;
  /** Comparison to DSE benchmarks */
  benchmarkComparison: string;
}

export interface RevisionChecklistItem {
  dimension: keyof WritingDimensions;
  priority: 'high' | 'medium' | 'low';
  task: string;
  taskZh: string;
  /** Specific example from the essay */
  example?: string;
}

export interface NextPracticeSuggestion {
  focusArea: string;
  focusAreaZh: string;
  reason: string;
  /** Recommended exercise type */
  exerciseType: 'grammar-drill' | 'vocab-practice' | 'sentence-writing' | 'paragraph-writing' | 'essay-writing';
  estimatedSessions: number;
}

export interface WeakSentenceExample {
  sentence: string;
  issue: string;
  issueZh: string;
  suggestion: string;
  suggestionZh: string;
}

export interface PersonalizedSuggestion {
  category: 'grammar' | 'vocabulary' | 'structure' | 'style';
  title: string;
  titleZh: string;
  detail: string;
  detailZh: string;
}

export interface WritingCoachResult {
  essayId: string;
  studentId: string;
  title: string;
  /** 8 dimensions scored 0-10 each */
  dimensions: WritingDimensions;
  /** DSE band prediction */
  bandPrediction: BandPrediction;
  /** Prioritized revision checklist */
  revisionChecklist: RevisionChecklistItem[];
  /** Suggested next practice focus */
  nextPractice: NextPracticeSuggestion[];
  /** Weak sentences extracted from essay */
  weakSentences: WeakSentenceExample[];
  /** Personalized improvement suggestions */
  personalizedSuggestions: PersonalizedSuggestion[];
  analyzedAt: Date;
}
