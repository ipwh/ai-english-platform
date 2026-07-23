// Sprint 33: Recommendation Engine 2.0 — type definitions

export type RecommendationType = 'exercise' | 'grammar' | 'vocabulary' | 'writing';

/** DSE exam weight per grammar topic (based on past paper frequency analysis) */
export type ExamWeight = 'very-high' | 'high' | 'medium' | 'low';

export interface GrammarTopicWeight {
  grammarCategory: string;
  grammarCategoryZh: string;
  examWeight: ExamWeight;
  /** Normalized 0-1 weight for the algorithm */
  normalizedWeight: number;
}

/**
 * DSE grammar topic exam weights.
 * Derived from HKDSE Paper 1 & 2 frequency analysis.
 * Very High = tested almost every year, High = tested most years,
 * Medium = tested occasionally, Low = rarely tested.
 */
export const DSE_GRAMMAR_WEIGHTS: GrammarTopicWeight[] = [
  { grammarCategory: 'tenses', grammarCategoryZh: '時態', examWeight: 'very-high', normalizedWeight: 1.0 },
  { grammarCategory: 'subject-verb-agreement', grammarCategoryZh: '主謂一致', examWeight: 'very-high', normalizedWeight: 0.95 },
  { grammarCategory: 'passive-voice', grammarCategoryZh: '被動語態', examWeight: 'high', normalizedWeight: 0.85 },
  { grammarCategory: 'conditionals', grammarCategoryZh: '條件句', examWeight: 'high', normalizedWeight: 0.85 },
  { grammarCategory: 'relative-clauses', grammarCategoryZh: '關係子句', examWeight: 'high', normalizedWeight: 0.80 },
  { grammarCategory: 'connectors', grammarCategoryZh: '連接詞', examWeight: 'high', normalizedWeight: 0.80 },
  { grammarCategory: 'articles', grammarCategoryZh: '冠詞', examWeight: 'medium', normalizedWeight: 0.65 },
  { grammarCategory: 'prepositions', grammarCategoryZh: '介詞', examWeight: 'medium', normalizedWeight: 0.60 },
  { grammarCategory: 'modal-verbs', grammarCategoryZh: '情態動詞', examWeight: 'medium', normalizedWeight: 0.60 },
  { grammarCategory: 'gerunds-infinitives', grammarCategoryZh: '動名詞與不定詞', examWeight: 'medium', normalizedWeight: 0.55 },
  { grammarCategory: 'reported-speech', grammarCategoryZh: '轉述句', examWeight: 'medium', normalizedWeight: 0.55 },
  { grammarCategory: 'comparatives', grammarCategoryZh: '比較級', examWeight: 'medium', normalizedWeight: 0.50 },
  { grammarCategory: 'inversion', grammarCategoryZh: '倒裝句', examWeight: 'low', normalizedWeight: 0.35 },
  { grammarCategory: 'phrasal-verbs', grammarCategoryZh: '片語動詞', examWeight: 'low', normalizedWeight: 0.30 },
  { grammarCategory: 'subjunctive', grammarCategoryZh: '虛擬語氣', examWeight: 'low', normalizedWeight: 0.25 },
  { grammarCategory: 'general', grammarCategoryZh: '一般文法', examWeight: 'medium', normalizedWeight: 0.50 },
];

export const EXAM_WEIGHT_MAP: Record<string, number> = Object.fromEntries(
  DSE_GRAMMAR_WEIGHTS.map(w => [w.grammarCategory, w.normalizedWeight]),
);

/** Input data for a single recommendation candidate */
export interface RecommendationCandidate {
  /** Grammar category or vocabulary set or writing topic */
  id: string;
  label: string;
  labelZh: string;
  type: RecommendationType;
  /** 0-100 mastery score from StudentMastery (lower = more need) */
  masteryScore: number;
  /** Total mistake count for this category */
  mistakeCount: number;
  /** DSE exam normalized weight 0-1 */
  examWeight: number;
  /** Days since last practice (0 = today) */
  daysSinceLastPractice: number;
  /** How many times practiced */
  practiceCount: number;
}

/** A scored and ranked recommendation */
export interface ScoredRecommendation {
  candidate: RecommendationCandidate;
  /** Raw weighted score 0-1 (higher = more recommended) */
  totalScore: number;
  breakdown: {
    weaknessScore: number;    // 0-0.40
    mistakeScore: number;     // 0-0.30
    examScore: number;        // 0-0.20
    retentionScore: number;   // 0-0.10
  };
  rank: number;
}

/** Full recommendation result */
export interface RecommendationResult {
  studentId: string;
  /** Top recommendations across all types */
  topRecommendations: ScoredRecommendation[];
  /** Recommended grammar topics */
  recommendedGrammar: ScoredRecommendation[];
  /** Recommended vocabulary areas */
  recommendedVocabulary: ScoredRecommendation[];
  /** Recommended writing topics */
  recommendedWriting: ScoredRecommendation[];
  /** Recommended exercise focus */
  recommendedExercise: ScoredRecommendation[];
  generatedAt: Date;
}
