// ============================================
// Reading Types & Schemas — DSE Paper 1 data models
// Comprehensive types for full DSE Paper 1 generation & validation
// ============================================

// ============================================
// Question Types (19 DSE types)
// ============================================
export const DSE_READING_QUESTION_TYPES = [
  'mcq',
  'trueFalseNG',
  'matching',
  'summaryCloze',
  'mcCloze',
  'errorCorrectionSummary',
  'shortAnswer',
  'referencing',
  'inference',
  'toneAttitude',
  'sequencing',
  'synonymSearch',
  'phraseSearch',
  'negativeInference',
  'tableCompletion',
  'causeEffectCompletion',
  'exampleFinding',
  'authorIntention',
  'vocabularyInContext',
] as const;

export type DSEreadingQuestionType = typeof DSE_READING_QUESTION_TYPES[number];

// ============================================
// DSE Part Labels
// ============================================
export type DSEpart = 'A' | 'B1' | 'B2';

// ============================================
// DSE Text Types (12+)
// ============================================
export const DSE_TEXT_TYPE_IDS = [
  'feature_article',
  'newspaper_article',
  'restaurant_review',
  'interview',
  'informational_webpage',
  'government_guide',
  'job_advertisement',
  'blog_post',
  'literary_excerpt',
  'letter_to_editor',
  'advertisement_poster',
  'argumentative_essay',
] as const;

export type DSEtextTypeId = typeof DSE_TEXT_TYPE_IDS[number];

// ============================================
// HKEAA Level
// ============================================
export type HKEAALevel = 1 | 2 | 3 | 4 | 5;

// ============================================
// Vocabulary Hint
// ============================================
export interface VocabularyHint {
  word: string;
  meaningZh: string;
  lineRef?: number;
}

// ============================================
// Single Question (within a passage)
// ============================================
export interface DSEreadingQuestion {
  index: number;
  type: DSEreadingQuestionType;
  paragraphRef?: number;
  lineRef?: string;
  questionText: string;
  questionTextZh?: string;
  marks: number; // 1-6
  wordLimit?: string; // e.g. "ONE word", "no more than THREE words", "30-50 words"
  choices?: string[]; // For MCQ, mcCloze, negativeInference, authorIntention
  answer: string;
  acceptAlso?: string[]; // Alternative acceptable answers (for open-ended)
  explanationZh: string;
  explanationEn?: string;
  commonMistake?: string; // Common student error
}

// ============================================
// Single Passage (within a DSE paper)
// ============================================
export interface DSEreadingPassage {
  textNumber: number; // Text 1, Text 2, etc.
  title: string;
  content: string; // Full passage text with [line N] and [paragraph] markers
  wordCount: number;
  textType: DSEtextTypeId;
  source: string; // "adapted from The Guardian"
  contentZh?: string; // Chinese辅助说明
  vocabularyHints?: VocabularyHint[];
  questions: DSEreadingQuestion[];
}

// ============================================
// Complete DSE Paper (multi-passage)
// ============================================
export interface DSEreadingPaper {
  paperTitle: string;
  part: DSEpart;
  paperInstructions: string;
  totalMarks: number; // Always 42 for Part A, B1, B2
  timeAllowed: string; // "1 hour 30 minutes (for both Parts A and B)"
  targetLevel: HKEAALevel;
  gradeLevel: string; // S1-S6
  passages: DSEreadingPassage[];
  generatedAt?: string;
  modelUsed?: string;
}

// ============================================
// API Request Types
// ============================================
export interface GenerateReadingRequest {
  gradeLevel: string; // S1-S6
  part: DSEpart; // A, B1, or B2
  targetLevel: HKEAALevel;
  topic?: string;
  textTypes?: DSEtextTypeId[];
  questionCount?: number; // Override default question count
}

export interface GenerateReadingExerciseRequest {
  gradeLevel: string;
  difficulty: 'remedial' | 'core' | 'challenge';
  topic?: string;
  count?: number; // Number of questions
  partLabel?: DSEpart;
}

// ============================================
// API Response Types
// ============================================
export interface GenerateReadingResponse {
  paper: DSEreadingPaper;
  metadata: {
    generationTimeMs: number;
    tokenCount?: number;
    warnings?: string[];
  };
}

// ============================================
// Validation Types
// ============================================
export interface PassageQualityCheck {
  passed: boolean;
  wordCount: { actual: number; expected: { min: number; max: number }; ok: boolean };
  hasLineMarkers: boolean;
  hasParagraphMarkers: boolean;
  hasSource: boolean;
  textTypeValid: boolean;
  issues: string[];
}

export interface QuestionQualityCheck {
  passed: boolean;
  totalMarks: number;
  expectedMarks: number;
  questionCount: number;
  typesUsed: DSEreadingQuestionType[];
  hasMarksAnnotations: boolean;
  hasWordLimits: boolean;
  hasParagraphRefs: boolean;
  usesDSEwording: boolean;
  issues: string[];
}

// ============================================
// Answer Analysis Types
// ============================================
export interface AnswerAnalysis {
  questionIndex: number;
  studentAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
  isPartiallyCorrect: boolean;
  score: number; // 0 to maxMarks
  maxMarks: number;
  errorType?: ReadingErrorType;
  feedbackZh: string;
  feedbackEn: string;
}

export type ReadingErrorType =
  | 'reference_error'        // Wrong referent for pronoun
  | 'paraphrase_error'       // Incorrect paraphrase
  | 'inference_error'        // Wrong inference
  | 'vocabulary_error'       // Misunderstood word meaning
  | 'word_limit_exceeded'    // Exceeded word limit
  | 'grammar_error'          // Grammar mistake in answer
  | 'not_in_passage'         // Answer not found in passage
  | 'partial_understanding'  // Partially correct
  | 'false_vs_ng_confusion'  // Confused False with Not Given
  | 'over_inference'         // Inferred beyond what passage supports
  | 'spelling_error'         // Spelling mistake
  | 'incomplete_answer';     // Missing key detail

// ============================================
// Student Performance Tracking
// ============================================
export interface ReadingPerformance {
  paperId: string;
  studentId: string;
  part: DSEpart;
  totalMarks: number;
  scoredMarks: number;
  accuracy: number; // 0-1
  timeTakenMs: number;
  questionAnalyses: AnswerAnalysis[];
  errorBreakdown: Record<ReadingErrorType, number>;
  typeBreakdown: Record<DSEreadingQuestionType, { correct: number; total: number }>;
  estimatedLevel: HKEAALevel;
  completedAt: string;
}

// ============================================
// Passage Readability Metrics
// ============================================
export interface ReadabilityMetrics {
  fleschKincaidGrade: number; // US grade level
  fleschReadingEase: number; // 0-100
  averageSentenceLength: number;
  averageWordLength: number;
  complexWordRatio: number; // Words with 3+ syllables
  totalWords: number;
  totalSentences: number;
  targetLevel: HKEAALevel;
  levelMatch: boolean; // Whether readability matches target HK level
}

// ============================================
// HK-Local Content Metrics
// ============================================
export interface HKLocalMetrics {
  hkTermCount: number;
  hkPlaceReferences: string[];
  hkCultureReferences: string[];
  hkLocalRatio: number; // 0-1
  meetsRecommendedRatio: boolean; // >= 0.30 (接近40%)
}

// ============================================
// Utility: Map platform difficulty to HKEAA level
// ============================================
export function platformDifficultyToHKEAALevel(difficulty: 'remedial' | 'core' | 'challenge', part: DSEpart): HKEAALevel {
  const map: Record<string, Record<DSEpart, HKEAALevel>> = {
    remedial: { A: 2, B1: 2, B2: 2 },
    core: { A: 3, B1: 3, B2: 4 },
    challenge: { A: 4, B1: 4, B2: 5 },
  };
  return map[difficulty]?.[part] ?? 3;
}

/**
 * Get the max attainable level for a given part
 */
export function maxAttainableLevel(part: DSEpart): HKEAALevel {
  return part === 'B1' ? 4 : 5;
}

/**
 * Get recommended word count range for a part
 */
export function passageWordCountRange(part: DSEpart): { min: number; max: number } {
  switch (part) {
    case 'A': return { min: 700, max: 1000 };
    case 'B1': return { min: 400, max: 700 };
    case 'B2': return { min: 700, max: 1000 };
  }
}

/**
 * Get recommended question count for a part
 */
export function recommendedQuestionCount(part: DSEpart): number {
  switch (part) {
    case 'A': return 19;
    case 'B1': return 22;
    case 'B2': return 21;
  }
}

/**
 * Simple Flesch-Kincaid readability estimation (pure JS, no dependencies)
 * Returns approximate US grade level
 */
export function estimateReadability(text: string): ReadabilityMetrics {
  // Remove [line N] and [paragraph] markers for analysis
  const cleanText = text.replace(/\[line \d+\]/gi, '').replace(/\[\d+\]/g, '').trim();

  const sentences = cleanText.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const words = cleanText.split(/\s+/).filter(w => w.length > 0);

  const totalWords = words.length;
  const totalSentences = sentences.length || 1;
  const totalSyllables = words.reduce((sum, w) => sum + estimateSyllables(w), 0);

  const averageSentenceLength = totalWords / totalSentences;
  const averageWordLength = cleanText.replace(/\s/g, '').length / totalWords;

  // Complex words: 3+ syllables
  const complexWords = words.filter(w => estimateSyllables(w) >= 3).length;
  const complexWordRatio = complexWords / totalWords;

  // Flesch-Kincaid Grade Level
  const fleschKincaidGrade = 0.39 * averageSentenceLength + 11.8 * (totalSyllables / totalWords) - 15.59;

  // Flesch Reading Ease
  const fleschReadingEase = 206.835 - 1.015 * averageSentenceLength - 84.6 * (totalSyllables / totalWords);

  return {
    fleschKincaidGrade: Math.round(fleschKincaidGrade * 10) / 10,
    fleschReadingEase: Math.round(fleschReadingEase * 10) / 10,
    averageSentenceLength: Math.round(averageSentenceLength * 10) / 10,
    averageWordLength: Math.round(averageWordLength * 10) / 10,
    complexWordRatio: Math.round(complexWordRatio * 100) / 100,
    totalWords,
    totalSentences,
    targetLevel: 3, // Will be set by caller
    levelMatch: false, // Will be set by caller
  };
}

/**
 * Simple syllable counter (approximate)
 */
function estimateSyllables(word: string): number {
  const cleaned = word.toLowerCase().replace(/[^a-z]/g, '');
  if (cleaned.length <= 3) return 1;
  const vowelGroups = cleaned.match(/[aeiouy]+/g);
  const count = vowelGroups ? vowelGroups.length : 1;
  // Adjust for silent e
  if (cleaned.endsWith('e') && count > 1) return count - 1;
  return count;
}

/**
 * Check if readability matches target HKEAA level
 * Rough mapping: L1=grade4-6, L2=grade7-8, L3=grade9-10, L4=grade11-12, L5=grade13+
 */
export function mapReadabilityToHKEAALevel(metrics: ReadabilityMetrics): HKEAALevel {
  const grade = metrics.fleschKincaidGrade;
  if (grade <= 6) return 1;
  if (grade <= 8) return 2;
  if (grade <= 10) return 3;
  if (grade <= 12) return 4;
  return 5;
}

/**
 * Simple HK-local content density check
 */
export function checkHKLocalContent(text: string): HKLocalMetrics {
  const hkPlaces = [
    'Hong Kong', 'Kowloon', 'New Territories', 'Central', 'Wan Chai', 'Mong Kok',
    'Tsim Sha Tsui', 'Causeway Bay', 'Tai Kwun', 'Victoria Harbour', 'Lantau',
    'Stanley', 'Sai Kung', 'Sheung Wan', 'Admiralty', 'Sha Tin', 'Tai Po',
    'Tuen Mun', 'Yuen Long', 'Aberdeen', 'Repulse Bay',
  ];
  const hkCulture = [
    'cha chaan teng', 'dai pai dong', 'dim sum', 'Cantonese', 'DSE', 'HKDSE',
    'HKEAA', 'Octopus', 'MTR', 'tram', 'junk boat', 'feng shui', 'lion dance',
    'dragon boat', 'mahjong', 'typhoon', 'public housing', 'subdivided flat',
  ];

  const textLower = text.toLowerCase();
  const foundPlaces = hkPlaces.filter(p => textLower.includes(p.toLowerCase()));
  const foundCulture = hkCulture.filter(c => textLower.includes(c.toLowerCase()));

  const words = text.split(/\s+/).length;
  const hkTermCount = foundPlaces.length + foundCulture.length;
  const hkLocalRatio = Math.min(1, hkTermCount / Math.max(1, words / 100)); // Per 100 words

  return {
    hkTermCount,
    hkPlaceReferences: foundPlaces,
    hkCultureReferences: foundCulture,
    hkLocalRatio: Math.round(hkLocalRatio * 100) / 100,
    meetsRecommendedRatio: hkLocalRatio >= 0.30,
  };
}

/**
 * Validate passage quality
 */
export function validatePassageQuality(passage: DSEreadingPassage, part: DSEpart): PassageQualityCheck {
  const issues: string[] = [];
  const range = passageWordCountRange(part);

  const ok = passage.wordCount >= range.min && passage.wordCount <= range.max;
  if (!ok) {
    issues.push(`Word count ${passage.wordCount} outside range ${range.min}-${range.max}`);
  }

  const hasLineMarkers = /\[line \d+\]/i.test(passage.content);
  if (!hasLineMarkers) issues.push('Missing [line N] markers');

  const hasParagraphMarkers = /\[\d+\]/.test(passage.content);
  if (!hasParagraphMarkers) issues.push('Missing [paragraph number] markers');

  const hasSource: boolean = passage.source.length > 10;
  if (!hasSource) issues.push('Missing or insufficient source attribution');

  const textTypeValid = DSE_TEXT_TYPE_IDS.includes(passage.textType as DSEtextTypeId);
  if (!textTypeValid) issues.push(`Invalid text type: ${passage.textType}`);

  return {
    passed: issues.length === 0,
    wordCount: { actual: passage.wordCount, expected: range, ok },
    hasLineMarkers,
    hasParagraphMarkers,
    hasSource,
    textTypeValid,
    issues,
  };
}

/**
 * Validate question quality against DSE standards
 */
export function validateQuestionQuality(questions: DSEreadingQuestion[], part: DSEpart): QuestionQualityCheck {
  const issues: string[] = [];
  const totalMarks = questions.reduce((s, q) => s + q.marks, 0);
  const expectedMarks = 42;

  if (totalMarks !== expectedMarks) {
    issues.push(`Total marks ${totalMarks} ≠ expected ${expectedMarks}`);
  }

  const expectedCount = recommendedQuestionCount(part);
  if (Math.abs(questions.length - expectedCount) > 3) {
    issues.push(`Question count ${questions.length} deviates from expected ~${expectedCount}`);
  }

  const typesUsed = [...new Set(questions.map(q => q.type))];
  if (typesUsed.length < 4) {
    issues.push(`Only ${typesUsed.length} question types used (need ≥ 4)`);
  }

  const hasMarksAnnotations = questions.every(q => q.marks > 0);
  if (!hasMarksAnnotations) issues.push('Some questions missing marks annotations');

  const needsWordLimit = ['summaryCloze', 'shortAnswer', 'tableCompletion', 'causeEffectCompletion', 'inference', 'synonymSearch'];
  const relevantQuestions = questions.filter(q => needsWordLimit.includes(q.type));
  const hasWordLimits = relevantQuestions.every(q => q.wordLimit);
  if (!hasWordLimits && relevantQuestions.length > 0) {
    issues.push('Questions requiring word limits are missing wordLimit field');
  }

  const hasParagraphRefs = questions.every(q => q.paragraphRef || q.lineRef);
  if (!hasParagraphRefs) issues.push('Some questions missing paragraph/line references');

  return {
    passed: issues.length === 0,
    totalMarks,
    expectedMarks,
    questionCount: questions.length,
    typesUsed,
    hasMarksAnnotations,
    hasWordLimits,
    hasParagraphRefs,
    usesDSEwording: true, // Assumed from prompt
    issues,
  };
}
