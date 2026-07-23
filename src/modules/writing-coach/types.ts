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

// ============================================
// Sprint 47: Rule-based Format Validation Types
// 程式化格式檢查，補足 AI 評分的盲點
// ============================================

export interface FormatValidationResult {
  textType: string;
  textTypeZh: string;
  overallValid: boolean;
  score: number; // 0-100, percentage of format elements correctly present
  checks: FormatCheck[];
  issues: FormatIssue[];
  summary: string;
  summaryZh: string;
}

export interface FormatCheck {
  element: string;
  elementZh: string;
  description: string;
  passed: boolean;
  found: boolean;
  details?: string;
}

export interface FormatIssue {
  element: string;
  elementZh: string;
  severity: 'critical' | 'major' | 'minor';
  problem: string;
  problemZh: string;
  fix: string;
  fixZh: string;
}

/** Letter-specific format validation */
export interface LetterFormatValidation extends FormatValidationResult {
  hasSenderAddress: boolean;
  hasDate: boolean;
  hasRecipientAddress: boolean;
  hasSalutation: boolean;
  salutationType: 'named' | 'unnamed' | 'unknown';
  closingType: 'sincerely' | 'faithfully' | 'other' | 'missing';
  salutationClosingMatch: boolean;
  usesContractions: boolean;
  contractionCount: number;
}

/** Speech-specific format validation */
export interface SpeechFormatValidation extends FormatValidationResult {
  hasGreeting: boolean;
  greetingIncludesAudience: boolean;
  greetingOrderCorrect: boolean; // guests → principal → teachers → students
  hasSelfIntroduction: boolean;
  hasCallToAction: boolean;
  hasThankYou: boolean;
  audienceEngagementCount: number; // rhetorical questions, "you", "we"
}

/** Proposal-specific format validation */
export interface ProposalFormatValidation extends FormatValidationResult {
  hasTitle: boolean;
  hasSubHeadings: boolean;
  subHeadingCount: number;
  hasObjectives: boolean;
  hasTimeline: boolean;
  hasBudget: boolean;
  hasExpectedOutcomes: boolean;
  hasConclusion: boolean;
}

/** Article-specific format validation */
export interface ArticleFormatValidation extends FormatValidationResult {
  hasHeadline: boolean;
  headlineIsCatchy: boolean;
  hasByline: boolean;
  hasLeadParagraph: boolean;
  averageParagraphLength: number;
  paragraphLengthGood: boolean; // paragraphs not too long
}

/** Report-specific format validation */
export interface ReportFormatValidation extends FormatValidationResult {
  hasTitle: boolean;
  hasSubHeadings: boolean;
  hasIntroduction: boolean;
  hasFindings: boolean;
  hasRecommendations: boolean;
  usesObjectiveTone: boolean;
  firstPersonCount: number;
}

/** PEEL structure detection result */
export interface PEELValidationResult {
  paragraphIndex: number;
  hasPoint: boolean;
  hasExplain: boolean;
  hasExample: boolean;
  hasLink: boolean;
  peelScore: number; // 0-4
  analysis: string;
  analysisZh: string;
}

/** Connector diversity analysis */
export interface ConnectorAnalysis {
  totalConnectors: number;
  uniqueConnectors: number;
  diversityScore: number; // 0-100
  categories: {
    addition: string[];      // Furthermore, Moreover, In addition
    contrast: string[];      // However, Nevertheless, In contrast
    cause: string[];         // Therefore, Consequently, As a result
    example: string[];       // For instance, To illustrate
    conclusion: string[];    // In conclusion, To sum up
    concession: string[];    // Admittedly, Granted, Although
  };
  overusedConnectors: string[];
  suggestions: string[];
  suggestionsZh: string[];
}

// Sprint 36: Writing Coach 2.0 — heuristic scoring types (merged from writing-coach-v2)

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

