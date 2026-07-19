// Sprint 27: AI Writing Coach — types
import type { CEFRLevel } from '@/modules/knowledge-graph/types';

export interface EssaySubmission {
  studentId: string;
  essayId: string;
  title: string;
  content: string;
  textType: string;
  gradeLevel: string;
  wordCount: number;
  submittedAt: string;
  previousVersionId?: string;
}

export interface EssayReview {
  essayId: string;
  reviewedAt: string;
  rubricScores: RubricScores;
  grammarIssues: GrammarIssue[];
  vocabularySuggestions: VocabularySuggestion[];
  coherenceAnalysis: CoherenceAnalysis;
  taskFulfillment: TaskFulfillment;
  organization: OrganizationAnalysis;
  styleAnalysis: StyleAnalysis;
  overallFeedback: string;
  overallFeedbackZh: string;
  revisionPlan: RevisionPlan;
  totalScore: number;
  estimatedLevel: string;
}

export interface RubricScores {
  hkdse: HKDSEScores;
  cefr: CEFRScores;
  overallBand: string;
}

export interface HKDSEScores {
  content: { score: number; maxScore: number; comments: string; commentsZh: string };
  language: { score: number; maxScore: number; comments: string; commentsZh: string };
  organization: { score: number; maxScore: number; comments: string; commentsZh: string };
  total: number;
  maxTotal: number;
  estimatedLevel: string;
}

export interface CEFRScores {
  overall: CEFRLevel;
  subScores: Record<string, CEFRLevel>;
}

export interface GrammarIssue {
  type: string;
  description: string;
  descriptionZh: string;
  location: { start: number; end: number };
  original: string;
  correction: string;
  rule: string;
  ruleZh: string;
  severity: 'critical' | 'major' | 'minor';
}

export interface VocabularySuggestion {
  original: string;
  suggestion: string;
  reason: string;
  reasonZh: string;
  type: 'precision' | 'variety' | 'formality' | 'collocation' | 'chinglish';
  impact: 'high' | 'medium' | 'low';
}

export interface CoherenceAnalysis {
  score: number;
  strengths: string[];
  weaknesses: string[];
  transitionUsage: { count: number; variety: number; appropriateness: number };
  paragraphFlow: string;
}

export interface TaskFulfillment {
  score: number;
  addressedAllParts: boolean;
  wordCountAdequate: boolean;
  textTypeAppropriate: boolean;
  toneAppropriate: boolean;
  comments: string;
  commentsZh: string;
}

export interface OrganizationAnalysis {
  score: number;
  hasClearIntroduction: boolean;
  hasClearConclusion: boolean;
  paragraphCount: number;
  averageParagraphLength: number;
  logicalFlow: string;
  suggestions: string[];
  suggestionsZh: string[];
}

export interface StyleAnalysis {
  score: number;
  register: string;
  tone: string;
  sentenceVariety: { simple: number; compound: number; complex: number };
  vocabularyRichness: number;
  suggestions: string[];
  suggestionsZh: string[];
}

export interface RevisionPlan {
  essayId: string;
  priorityActions: PriorityAction[];
  estimatedTimeMinutes: number;
  focusAreas: string[];
  focusAreasZh: string[];
  nextSteps: string[];
  nextStepsZh: string[];
}

export interface PriorityAction {
  order: number;
  category: 'grammar' | 'vocabulary' | 'organization' | 'content' | 'style';
  action: string;
  actionZh: string;
  expectedImprovement: string;
  effort: 'low' | 'medium' | 'high';
}

export interface RevisionComparison {
  originalId: string;
  revisedId: string;
  improvements: Array<{
    category: string;
    before: string;
    after: string;
    impact: string;
  }>;
  scoreChange: { before: number; after: number; difference: number };
  wordCountChange: { before: number; after: number };
}

export interface RevisionHistory {
  essayId: string;
  versions: EssayVersion[];
}

export interface EssayVersion {
  versionId: string;
  content: string;
  submittedAt: string;
  score: number;
  changes: string;
}
