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

// ============================================
// Sprint 39: Writing Coach Pro — enhanced types
// ============================================

export interface IELTSScores {
  taskAchievement: { score: number; maxScore: number; band: number; comments: string };
  coherenceAndCohesion: { score: number; maxScore: number; band: number; comments: string };
  lexicalResource: { score: number; maxScore: number; band: number; comments: string };
  grammaticalRange: { score: number; maxScore: number; band: number; comments: string };
  overallBand: number;
}

export interface ProRubricScores extends RubricScores {
  ielts?: IELTSScores;
}

export interface SentenceVarietyAnalysis {
  simpleCount: number;
  compoundCount: number;
  complexCount: number;
  compoundComplexCount: number;
  varietyScore: number; // 0-1
  averageLength: number;
  longestSentence: number;
  suggestions: string[];
  suggestionsZh: string[];
}

export interface ToneRegisterAnalysis {
  tone: 'formal' | 'semi-formal' | 'informal' | 'inconsistent';
  register: 'academic' | 'professional' | 'casual' | 'mixed';
  consistency: number; // 0-1
  inappropriateShifts: Array<{ location: string; from: string; to: string }>;
  suggestions: string[];
  suggestionsZh: string[];
}

export interface LogicArgumentAnalysis {
  thesisClarity: number; // 0-1
  argumentStrength: number; // 0-1
  evidenceQuality: number; // 0-1
  counterargumentPresence: boolean;
  logicalFallacies: string[];
  transitionsQuality: number;
  overallPersuasiveness: number;
  suggestions: string[];
  suggestionsZh: string[];
}

export interface ExpressionUpgrade {
  original: string;
  upgraded: string;
  type: 'clarity' | 'conciseness' | 'impact' | 'flow' | 'formality';
  explanation: string;
  explanationZh: string;
}

export interface ParagraphRewrite {
  originalParagraph: string;
  rewrittenParagraph: string;
  changes: Array<{ what: string; why: string; whyZh: string }>;
  improvementScore: number;
}

export interface SentenceRewrite {
  original: string;
  rewritten: string;
  technique: 'combine' | 'split' | 'reorder' | 'vary-opening' | 'active-voice' | 'parallelism';
  explanation: string;
  explanationZh: string;
}

export interface ProRevisionPlan extends RevisionPlan {
  vocabularyUpgrades: ExpressionUpgrade[];
  grammarUpgrades: ExpressionUpgrade[];
  betterExpressions: ExpressionUpgrade[];
  sentenceRewrites: SentenceRewrite[];
  paragraphRewrites: ParagraphRewrite[];
  estimatedScoreGain: number;
}

export interface ProRevisionComparison {
  essayId: string;
  originalVersion: number;
  newVersion: number;
  scoreChange: { before: number; after: number; gain: number };
  improvements: Array<{ area: string; before: string; after: string; impact: string }>;
  vocabularyChanges: { added: string[]; removed: string[]; upgraded: Array<{ from: string; to: string }> };
  grammarChanges: { fixed: number; remaining: number };
}

export interface RevisionRecord {
  id: string;
  essayId: string;
  studentId: string;
  version: number;
  content: string;
  scores: ProRubricScores;
  totalScore: number;
  createdAt: string;
  changesFromPrevious?: ProRevisionComparison;
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
