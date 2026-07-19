// Sprint 32: Mistake Intelligence Engine — type definitions

export type TrendDirection = 'improving' | 'stable' | 'worsening';
export type WeaknessSeverity = 'critical' | 'major' | 'minor';

/** Aggregated mistake summary per grammar category — persisted in DB */
export interface StudentMistakeSummary {
  id: string;
  studentId: string;
  grammarCategory: string;
  mistakeCount: number;
  lastSeen: Date;
  severity: WeaknessSeverity;
  mastered: boolean;
  trend: TrendDirection;
  updatedAt: Date;
}

/** A single weakness item returned to the frontend */
export interface WeaknessItem {
  grammarCategory: string;
  grammarCategoryZh: string;
  mistakeCount: number;
  severity: WeaknessSeverity;
  trend: TrendDirection;
  mastered: boolean;
  lastSeen: Date;
}

/** Full weakness profile for a student */
export interface WeaknessProfile {
  studentId: string;
  /** Top 10 weaknesses by mistake count */
  topWeaknesses: WeaknessItem[];
  /** Most frequent mistakes across all categories */
  mostFrequentMistakes: WeaknessItem[];
  /** Overall improvement trend */
  improvementTrend: TrendDirection;
  /** Generated recommendations (zh + en) */
  recommendations: string[];
  generatedAt: Date;
}

/** Input for computing trend from time-series data */
export interface TrendInput {
  category: string;
  /** Weekly mistake counts, ordered from oldest to newest */
  weeklyCounts: number[];
}

/** Label mapping for display */
export const GRAMMAR_CATEGORY_LABELS: Record<string, string> = {
  'tenses': '時態',
  'passive-voice': '被動語態',
  'conditionals': '條件句',
  'relative-clauses': '關係子句',
  'reported-speech': '轉述句',
  'modal-verbs': '情態動詞',
  'articles': '冠詞',
  'prepositions': '介詞',
  'subject-verb-agreement': '主謂一致',
  'gerunds-infinitives': '動名詞與不定詞',
  'connectors': '連接詞',
  'comparatives': '比較級',
  'inversion': '倒裝句',
  'phrasal-verbs': '片語動詞',
  'subjunctive': '虛擬語氣',
  'general': '一般文法',
};
