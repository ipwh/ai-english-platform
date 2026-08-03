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
// Phase 3C: MC Distractor Intelligence Types
// ============================================

/** DSE-style distractor trap categories */
export type DistractorTrapType =
  | 'half_true'
  | 'scope_shift'
  | 'contrast_miss'
  | 'cause_effect_swap'
  | 'reference_confusion'
  | 'tone_overstatement'
  | 'tone_understatement'
  | 'detail_from_wrong_paragraph'
  | 'qualifier_miss'
  | 'negation_miss';

/** Optional quality metadata for MC options */
export interface MCOptionQualityMeta {
  distractorType?: DistractorTrapType;
  sourceParagraph?: number;
  trapBasis?: string;
  evidenceHint?: string;
}

/** A single MC option with optional quality metadata */
export interface MCOption {
  label: string;
  text: string;
  meta?: MCOptionQualityMeta;
}

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
  /** Phase 4B.1: Explicit skill category override. When set, this takes priority over type-based mapping.
   *  Allows e.g. an MCQ to target 'toneStance', or a shortAnswer to target 'inference'. */
  skillCategory?: ReadingSkillCategory;
  paragraphRef?: number;
  lineRef?: string;
  targetPhrase?: string; // Key phrase the question references — system computes paragraph/line from this
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
  content: string; // Full passage text — line numbers are rendered by layout engine
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

// ============================================
// Sprint 102: Rubric-Based Semantic Evaluation Types
// ============================================

export interface RubricConcept {
  id: string;
  description: string;
  marks: number;
  acceptedSynonyms: string[];
  acceptedParaphrases: string[];
}

export interface QuestionRubric {
  requiredConcepts: RubricConcept[];
  optionalConcepts?: RubricConcept[];
  partialCreditRules: { minRequiredForPartial: number; partialMarks: number };
  commonMisconceptions?: string[];
  maxMarks: number;
}

export interface RubricEvaluation {
  score: number;
  maxScore: number;
  decision: 'correct' | 'partial' | 'incorrect';
  matchedConcepts: string[];
  missingConcepts: string[];
  feedback: string;
  feedbackEn?: string;
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

  const hasParagraphRefs = questions.every(q => q.paragraphRef || q.lineRef || q.targetPhrase);
  if (!hasParagraphRefs) issues.push('Some questions missing paragraph/line/targetPhrase references');

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

// ============================================
// Phase 4B: Skill Boundary Definitions — Whole-Text, Stance, Cross-Paragraph
// ============================================

/**
 * Reading skill categories for DSE Paper 1 question classification.
 * Each question maps to exactly ONE primary skill category.
 * These are used to ensure skill diversity and prevent overlap.
 */
export type ReadingSkillCategory =
  | 'factual'           // Literal comprehension; answer directly stated
  | 'reference'         // Pronoun/noun-phrase referent resolution
  | 'vocabulary'        // Word/phrase meaning in context
  | 'inference'         // Implied meaning beyond stated facts (within one paragraph)
  | 'crossParagraph'    // Requires connecting 2+ paragraphs to answer
  | 'wholeText'         // Requires synthesizing the entire passage
  | 'toneStance'        // Author's attitude, tone, stance, purpose
  | 'paragraphFunction' // Why a paragraph exists; its rhetorical role
  | 'mainIdea'          // Central thesis or gist of the passage
  | 'summaryTransform'; // Cloze, table, error-correction summary

/** Skill boundary definitions with DSE-typical features */
export interface SkillBoundary {
  category: ReadingSkillCategory;
  label: string;
  /** What this skill tests that others don't */
  distinctFrom: string;
  /** Common confusions — skills often mistaken for this one */
  notToBeConfusedWith: ReadingSkillCategory[];
  /** Minimum paragraph span required (1 = single para ok) */
  minParagraphSpan: number;
  /** Typical marks in DSE */
  typicalMarks: number;
  /** Question stem patterns characteristic of this skill */
  stemPatterns: string[];
}

/**
 * Hard boundaries between skill categories.
 * Used by validators to detect overlap and by prompts to guide generation.
 */
export const READING_SKILL_BOUNDARIES: Record<ReadingSkillCategory, SkillBoundary> = {
  factual: {
    category: 'factual',
    label: 'Factual / Literal',
    distinctFrom: 'Tests ability to locate explicitly stated information in a single paragraph.',
    notToBeConfusedWith: ['inference', 'wholeText'],
    minParagraphSpan: 1,
    typicalMarks: 1,
    stemPatterns: [
      'According to paragraph X',
      'What is stated about',
      'Which of the following is true',
      'Complete the following using',
    ],
  },
  reference: {
    category: 'reference',
    label: 'Reference / Pronoun Resolution',
    distinctFrom: 'Tests ability to identify what a pronoun or demonstrative refers to — NOT comprehension of meaning.',
    notToBeConfusedWith: ['vocabulary', 'inference'],
    minParagraphSpan: 1,
    typicalMarks: 1,
    stemPatterns: [
      'What does \'it\' refer to',
      'Who or what does \'they\' refer to',
      'What does \'this\' (line X) refer to',
    ],
  },
  vocabulary: {
    category: 'vocabulary',
    label: 'Vocabulary in Context',
    distinctFrom: 'Tests word/phrase meaning as used in the passage — NOT general dictionary definition.',
    notToBeConfusedWith: ['reference', 'inference'],
    minParagraphSpan: 1,
    typicalMarks: 1,
    stemPatterns: [
      'What does \'X\' mean',
      'Find a word that means',
      'Which phrase describes',
      'What does the expression suggest',
    ],
  },
  inference: {
    category: 'inference',
    label: 'Inference / Implied Meaning',
    distinctFrom: 'Tests reading between the lines within a single paragraph — NOT whole-text synthesis.',
    notToBeConfusedWith: ['factual', 'crossParagraph', 'wholeText', 'toneStance'],
    minParagraphSpan: 1,
    typicalMarks: 2,
    stemPatterns: [
      'What does X imply',
      'Why does the writer mention',
      'What can be inferred from',
      'Explain why',
    ],
  },
  crossParagraph: {
    category: 'crossParagraph',
    label: 'Cross-Paragraph Reasoning',
    distinctFrom: 'Tests ability to connect claims, evidence, or developments ACROSS 2+ paragraphs — NOT single-paragraph inference.',
    notToBeConfusedWith: ['inference', 'wholeText'],
    minParagraphSpan: 2,
    typicalMarks: 2,
    stemPatterns: [
      'How does paragraph X develop the idea in paragraph Y',
      'Compare the views expressed in paragraphs X and Y',
      'How does the writer build the argument from paragraph X to paragraph Y',
      'What change occurs between paragraphs X and Y',
    ],
  },
  wholeText: {
    category: 'wholeText',
    label: 'Whole-Text Synthesis',
    distinctFrom: 'Tests ability to integrate information from the ENTIRE passage — NOT summary, not single-paragraph, not cross-paragraph only.',
    notToBeConfusedWith: ['summaryTransform', 'crossParagraph', 'mainIdea', 'inference'],
    minParagraphSpan: 3,
    typicalMarks: 2,
    stemPatterns: [
      'What is the overall message',
      'How does the passage as a whole present',
      'What conclusion can be drawn from the entire passage',
      'Which statement best captures the passage\'s overall',
    ],
  },
  toneStance: {
    category: 'toneStance',
    label: 'Tone / Attitude / Stance',
    distinctFrom: 'Tests recognition of authorial voice through word choice, hedging, contrast, and structure — NOT factual content or simple positive/negative labeling.',
    notToBeConfusedWith: ['factual', 'inference', 'mainIdea'],
    minParagraphSpan: 1,
    typicalMarks: 2,
    stemPatterns: [
      'What is the writer\'s attitude toward',
      'The tone of the passage can best be described as',
      'What stance does the author take on',
      'How does the writer feel about',
      'What is the writer\'s purpose in',
    ],
  },
  paragraphFunction: {
    category: 'paragraphFunction',
    label: 'Paragraph Function / Rhetorical Role',
    distinctFrom: 'Tests why a paragraph exists — its rhetorical job in the passage structure — NOT what it says.',
    notToBeConfusedWith: ['factual', 'mainIdea', 'crossParagraph'],
    minParagraphSpan: 1,
    typicalMarks: 1,
    stemPatterns: [
      'What is the function of paragraph X',
      'What purpose does paragraph X serve',
      'Why does the writer include paragraph X',
      'How does paragraph X contribute to the passage',
    ],
  },
  mainIdea: {
    category: 'mainIdea',
    label: 'Main Idea / Central Thesis',
    distinctFrom: 'Tests identification of the passage\'s central argument or gist — NOT paragraph function, NOT whole-text detail synthesis.',
    notToBeConfusedWith: ['wholeText', 'paragraphFunction', 'factual'],
    minParagraphSpan: 3,
    typicalMarks: 1,
    stemPatterns: [
      'What is the main idea of the passage',
      'The passage is mainly about',
      'Which of the following best summarizes the passage',
      'The writer\'s main point is',
    ],
  },
  summaryTransform: {
    category: 'summaryTransform',
    label: 'Summary Cloze / Transformation',
    distinctFrom: 'Tests ability to complete structured summaries — NOT open-ended synthesis.',
    notToBeConfusedWith: ['wholeText', 'factual'],
    minParagraphSpan: 1,
    typicalMarks: 1,
    stemPatterns: [
      'Complete the summary',
      'Complete the following',
      'Fill in the blanks',
    ],
  },
};

/** Map DSE question type to its primary skill category, respecting explicit overrides.
 *  Phase 4B.1: Accepts optional skillCategory from the question for type-skill decoupling.
 */
export function mapTypeToSkillCategory(
  type: DSEreadingQuestionType,
  explicitSkill?: ReadingSkillCategory,
): ReadingSkillCategory {
  if (explicitSkill) return explicitSkill;
  const mapping: Partial<Record<DSEreadingQuestionType, ReadingSkillCategory>> = {
    mcq: 'factual',
    trueFalseNG: 'factual',
    matching: 'factual',
    shortAnswer: 'factual',
    negativeInference: 'factual',
    referencing: 'reference',
    vocabularyInContext: 'vocabulary',
    synonymSearch: 'vocabulary',
    phraseSearch: 'vocabulary',
    inference: 'inference',
    authorIntention: 'inference',
    toneAttitude: 'toneStance',
    sequencing: 'crossParagraph',
    exampleFinding: 'factual',
    summaryCloze: 'summaryTransform',
    mcCloze: 'summaryTransform',
    tableCompletion: 'summaryTransform',
    causeEffectCompletion: 'summaryTransform',
    errorCorrectionSummary: 'summaryTransform',
  };
  return mapping[type] ?? 'factual';
}

/** Phase 4B.1: Resolve the effective skill category for a question, respecting explicit override. */
export function resolveSkillCategory(q: DSEreadingQuestion): ReadingSkillCategory {
  return mapTypeToSkillCategory(q.type, q.skillCategory);
}

/** Constants for skill distribution in question sets */
export const SKILL_DISTRIBUTION = {
  /** Maximum ratio of questions that should be single-paragraph factual */
  maxFactualRatio: 0.55,
  /** Minimum higher-order skills (crossParagraph + wholeText + toneStance + paragraphFunction + mainIdea) for passages with 4+ paragraphs */
  minHigherOrderRatio: 0.20,
  /** Maximum same-skill repetition (prevent all questions being same category) */
  maxSameSkillRatio: 0.40,
  /** Phase 4B.1: Maximum higher-order ratio for short passages (≤3 paragraphs) — keep it lighter */
  maxHigherOrderShortPassage: 0.15,
  /** Phase 4B.1: Maximum whole-text items for Part A (typically 1-2 short passages) */
  maxWholeTextPartA: 1,
} as const;

// ============================================
// Phase 3A: Question Quality Blueprint & Hardened Validators
// ============================================

/** Required question type families for a balanced DSE Paper 1 set */
export const REQUIRED_TYPE_FAMILIES = {
  factual: {
    label: 'Factual / Literal comprehension',
    types: ['mcq', 'trueFalseNG', 'shortAnswer', 'mcCloze', 'negativeInference'],
    minCount: 2,
  },
  reference: {
    label: 'Reference / Pronoun resolution',
    types: ['referencing'],
    minCount: 1,
  },
  vocabulary: {
    label: 'Vocabulary in context',
    types: ['vocabularyInContext', 'synonymSearch', 'phraseSearch'],
    minCount: 1,
  },
  inference: {
    label: 'Inference / Implied meaning',
    types: ['inference', 'authorIntention'],
    minCount: 1,
  },
  toneStance: {
    label: 'Tone / Attitude / Stance',
    types: ['toneAttitude'],
    minCount: 1,
  },
  wholeText: {
    label: 'Whole-text or cross-paragraph understanding',
    types: ['__whole_text__'],
    minCount: 1,
  },
  summaryTransform: {
    label: 'Summary cloze or sentence transformation',
    types: ['summaryCloze', 'mcCloze', 'tableCompletion', 'causeEffectCompletion', 'errorCorrectionSummary'],
    minCount: 1,
  },
};

/** Phase 3A.3: Issue severity levels */
export type QualitySeverity = 'info' | 'warning' | 'critical';

/** A single blueprint validation issue with severity */
export interface BlueprintIssue {
  code: string;
  severity: QualitySeverity;
  message: string;
}

/** Standardized blueprint quality metadata across all generation paths */
export interface BlueprintQualityMeta {
  passed: boolean;
  retried: boolean;
  degraded: boolean;
  /** Whether full validation was actually performed (false for preParsed/skipped paths) */
  validated: boolean;
  /** Compact issue list: code, severity, message */
  issues: { code: string; severity: QualitySeverity; message: string }[];
}

/** Post-generation quality check result */
export interface QuestionSetQualityCheck {
  passed: boolean;
  retryable: boolean;
  issues: BlueprintIssue[];
  typeFamilyCoverage: Record<string, { required: number; actual: number; ok: boolean }>;
  issueMessages: string[];
}

export function validateQuestionSetBlueprint(
  questions: DSEreadingQuestion[],
  paragraphCount: number,
  opts?: { mode?: 'full-paper' | 'exercise' | 'legacy'; part?: DSEpart },
): QuestionSetQualityCheck {
  const issues: BlueprintIssue[] = [];
  const mode = opts?.mode ?? 'legacy';
  const part = opts?.part;
  const isShortSet = questions.length <= 6;
  const isPartA = part === 'A';

  // ── 1. Type family coverage ──
  const typeFamilyCoverage: Record<string, { required: number; actual: number; ok: boolean }> = {};
  for (const [key, family] of Object.entries(REQUIRED_TYPE_FAMILIES)) {
    if (key === 'wholeText') continue;
    if (key === 'summaryTransform' && isShortSet && mode !== 'full-paper') continue;
    const actual = questions.filter(q => family.types.includes(q.type)).length;
    const ok = actual >= family.minCount;
    typeFamilyCoverage[key] = { required: family.minCount, actual, ok };
    if (!ok) {
      const isCritical = key === 'inference' || key === 'toneStance' || (key === 'factual' && actual === 0);
      issues.push({
        code: `MISSING_${key.toUpperCase()}`,
        severity: isCritical ? 'critical' : 'warning',
        message: `Type family "${family.label}" has ${actual}/${family.minCount} items`,
      });
    }
  }

  // ── 2. Whole-text check ──
  const wholeTextItems = questions.filter(q => !q.paragraphRef);
  typeFamilyCoverage['wholeText'] = {
    required: paragraphCount >= 3 ? 1 : 0, actual: wholeTextItems.length, ok: wholeTextItems.length >= 1 || paragraphCount < 3,
  };
  if (wholeTextItems.length === 0 && paragraphCount >= 3 && !isShortSet) {
    issues.push({ code: 'MISSING_WHOLE_TEXT', severity: 'critical', message: 'No whole-text or cross-paragraph item in multi-paragraph passage' });
  }

  // ── 3. Summary/transformation (context-aware) ──
  const summaryItems = questions.filter(q => REQUIRED_TYPE_FAMILIES.summaryTransform.types.includes(q.type));
  typeFamilyCoverage['summaryTransform'] = {
    required: mode === 'full-paper' ? 1 : 0, actual: summaryItems.length, ok: summaryItems.length >= 1 || mode !== 'full-paper',
  };
  if (summaryItems.length === 0 && mode === 'full-paper') {
    issues.push({ code: 'MISSING_SUMMARY_TRANSFORM', severity: 'critical', message: 'No summary cloze or transformation item in full paper' });
  } else if (summaryItems.length === 0 && !isShortSet && mode !== 'full-paper') {
    issues.push({ code: 'MISSING_SUMMARY_TRANSFORM', severity: 'warning', message: 'No summary cloze or transformation item (recommended)' });
  }

  // ── 4. Distractor quality ──
  let distractorCount = 0;
  for (const q of questions) {
    if (!q.choices || q.choices.length < 3) continue;
    for (let ci = 0; ci < q.choices.length; ci++) {
      const choice = q.choices[ci].replace(/^[A-D][.)\s]+/, '').trim();
      if (choice.length < 4 && choice.length > 0) distractorCount++;
      const avgLen = q.choices.reduce((s, c) => s + c.length, 0) / q.choices.length;
      if (choice.length > avgLen * 2 && avgLen > 10) distractorCount++;
      if (/all\s*of\s*the\s*above|none\s*of\s*the\s*above/i.test(choice)) distractorCount++;
    }
  }
  if (distractorCount >= 3) {
    issues.push({ code: 'WEAK_DISTRACTORS', severity: 'warning', message: `${distractorCount} distractor quality issue(s)` });
  } else if (distractorCount > 0) {
    issues.push({ code: 'WEAK_DISTRACTORS', severity: 'info', message: `${distractorCount} minor distractor issue(s)` });
  }

  // ── 5. Paragraph coverage (content-bearing, >30% threshold) ──
  const usedParagraphs = new Set<number>();
  for (const q of questions) { if (q.paragraphRef) usedParagraphs.add(q.paragraphRef); }
  const uncovered: number[] = [];
  for (let p = 1; p <= paragraphCount; p++) { if (!usedParagraphs.has(p)) uncovered.push(p); }
  if (uncovered.length > paragraphCount * 0.3 && paragraphCount >= 4) {
    issues.push({ code: 'UNCOVERED_PARAGRAPHS', severity: 'warning', message: `Paragraph(s) ${uncovered.join(', ')} have no questions` });
  } else if (uncovered.length > 0 && paragraphCount >= 4) {
    issues.push({ code: 'UNCOVERED_PARAGRAPHS', severity: 'info', message: `Paragraph(s) ${uncovered.join(', ')} lightly covered` });
  }

  // ── 6. Paraphrase demand ──
  let lowParaCount = 0;
  for (const q of questions) {
    if (q.type === 'mcq' || q.type === 'trueFalseNG' || q.type === 'referencing') continue;
    if (q.answer && q.questionText) {
      const answerWords = new Set(q.answer.toLowerCase().split(/\s+/).filter(w => w.length > 3));
      const questionWords = new Set(q.questionText.toLowerCase().split(/\s+/).filter(w => w.length > 3));
      let overlap = 0; for (const w of answerWords) if (questionWords.has(w)) overlap++;
      const ratio = answerWords.size > 0 ? overlap / answerWords.size : 0;
      if (ratio > 0.6 && answerWords.size >= 3) lowParaCount++;
    }
  }
  if (lowParaCount > questions.length * 0.5) {
    issues.push({ code: 'LOW_PARAPHRASE_DEMAND', severity: 'warning', message: `${lowParaCount}/${questions.length} items have low paraphrase demand` });
  } else if (lowParaCount > 0) {
    issues.push({ code: 'LOW_PARAPHRASE_DEMAND', severity: 'info', message: `${lowParaCount} item(s) have low paraphrase demand` });
  }

  // ── 7. Difficulty progression ──
  const midPoint = Math.floor(questions.length * 0.6);
  const earlyComplex = questions.slice(0, midPoint).filter(q => ['inference', 'toneAttitude', 'authorIntention'].includes(q.type));
  const lateSimple = questions.slice(midPoint).filter(q => ['mcq', 'trueFalseNG', 'shortAnswer'].includes(q.type) && (q.marks || 1) <= 1);
  if (earlyComplex.length >= 3 || lateSimple.length >= 3) {
    issues.push({ code: 'FLAT_PROGRESSION', severity: 'warning', message: 'Difficulty progression is flat' });
  }

  // ══════════════════════════════════════════
  // Phase 4B: Skill Boundary & Overlap Checks
  // ══════════════════════════════════════════

  const skillCategories = questions.map(q => resolveSkillCategory(q));
  const skillCounts = new Map<ReadingSkillCategory, number>();
  for (const sc of skillCategories) {
    skillCounts.set(sc, (skillCounts.get(sc) ?? 0) + 1);
  }

  // ── 8. Skill distribution: too many factual items ──
  const factualCount = skillCounts.get('factual') ?? 0;
  if (questions.length >= 6 && factualCount / questions.length > SKILL_DISTRIBUTION.maxFactualRatio) {
    issues.push({
      code: 'SKILL_OVERLOAD_FACTUAL',
      severity: 'warning',
      message: `${factualCount}/${questions.length} (${Math.round(factualCount / questions.length * 100)}%) items are factual — too many; need more higher-order skills`,
    });
  }

  // ── 9. Higher-order skill ratio ──
  const higherOrderCount = (skillCounts.get('crossParagraph') ?? 0) +
    (skillCounts.get('wholeText') ?? 0) +
    (skillCounts.get('toneStance') ?? 0) +
    (skillCounts.get('paragraphFunction') ?? 0) +
    (skillCounts.get('mainIdea') ?? 0);
  if (paragraphCount >= 4 && questions.length >= 6 &&
      higherOrderCount / questions.length < SKILL_DISTRIBUTION.minHigherOrderRatio) {
    issues.push({
      code: 'SKILL_LOW_HIGHER_ORDER',
      severity: 'warning',
      message: `Only ${higherOrderCount}/${questions.length} higher-order items — need ≥${Math.ceil(SKILL_DISTRIBUTION.minHigherOrderRatio * questions.length)} for passages with ${paragraphCount} paragraphs`,
    });
  }

  // ── 9b. Phase 4B.1: Part A guardrail — cap higher-order items for short passages ──
  if (isPartA && paragraphCount <= 3 && questions.length >= 4 &&
      higherOrderCount / questions.length > SKILL_DISTRIBUTION.maxHigherOrderShortPassage) {
    issues.push({
      code: 'PART_A_HIGHER_ORDER_OVERLOAD',
      severity: 'warning',
      message: `Part A with ${paragraphCount} paragraphs has ${higherOrderCount}/${questions.length} higher-order items — exceeds ${Math.round(SKILL_DISTRIBUTION.maxHigherOrderShortPassage * 100)}% cap for short passages`,
    });
  }

  // ── 9c. Phase 4B.1: Part A guardrail — max whole-text items ──
  if (isPartA) {
    if (wholeTextItems.length > SKILL_DISTRIBUTION.maxWholeTextPartA) {
      issues.push({
        code: 'PART_A_TOO_MANY_WHOLE_TEXT',
        severity: 'warning',
        message: `Part A has ${wholeTextItems.length} whole-text items — exceeds maximum of ${SKILL_DISTRIBUTION.maxWholeTextPartA} for Part A`,
      });
    }
  }

  // ── 10. Same-skill repetition ──
  for (const [skill, count] of skillCounts) {
    if (count > 0 && count / questions.length > SKILL_DISTRIBUTION.maxSameSkillRatio && questions.length >= 6) {
      issues.push({
        code: 'SKILL_REPETITION',
        severity: 'warning',
        message: `Skill "${READING_SKILL_BOUNDARIES[skill]?.label ?? skill}" used ${count}/${questions.length} times — exceeds ${Math.round(SKILL_DISTRIBUTION.maxSameSkillRatio * 100)}% maximum`,
      });
      break; // Report only the worst offender
    }
  }

  // ── 11. Tone/stance questions too close to factual (heuristic) ──
  const toneItems = questions.filter(q => q.type === 'toneAttitude');
  for (const tq of toneItems) {
    const text = (tq.questionText + ' ' + (tq.answer || '')).toLowerCase();
    const hasToneVocabulary = /attitude|tone|stance|feel|purpose|view|position|perspective|regard|consider|critic|praise|skeptic|ironic|humorous|serious|objective|subjective/.test(text);
    const isSimpleLabel = /^(positive|negative|neutral|optimistic|pessimistic)$/.test(tq.answer?.toLowerCase().trim() ?? '');
    if (!hasToneVocabulary && !isSimpleLabel) {
      issues.push({
        code: 'TONE_TOO_FACTUAL',
        severity: 'info',
        message: `Tone/attitude question #${tq.index} may be too close to factual — lacks tone-specific vocabulary or nuanced stance`,
      });
      break;
    }
  }

  // ── 12. Whole-text questions that can be answered from one paragraph ──
  const wholeTextQuestions = questions.filter(q => !q.paragraphRef);
  for (const wtq of wholeTextQuestions) {
    // Heuristic: if a non-paragraphRef question mentions a specific paragraph in its text, it's actually local
    const mentionsSingleParagraph = /\bparagraph\s+\d+\b/i.test(wtq.questionText) &&
      !/(?:paragraphs?\s+\d+\s*(?:and|through|to|–|-)\s*\d+|entire\s+passage|whole\s+passage|as\s+a\s+whole|overall)/i.test(wtq.questionText);
    if (mentionsSingleParagraph) {
      issues.push({
        code: 'WHOLE_TEXT_LOCAL',
        severity: 'warning',
        message: `Question #${wtq.index} has no paragraphRef but mentions a single paragraph — may be answerable from one paragraph only`,
      });
      break;
    }
  }

  // ── 13. Cross-paragraph questions that are single-paragraph ──
  const crossParaTypes: DSEreadingQuestionType[] = ['sequencing'];
  const crossParaItems = questions.filter(q => crossParaTypes.includes(q.type));
  for (const cp of crossParaItems) {
    // Sequencing should typically reference multiple paragraphs
    if (cp.paragraphRef && !/\b(?:paragraphs?|paras?)\s*\d+\s*(?:-|to|through|and)\s*\d+/i.test(cp.questionText)) {
      issues.push({
        code: 'CROSS_PARA_SINGLE',
        severity: 'info',
        message: `Cross-paragraph question #${cp.index} references only paragraph ${cp.paragraphRef} — may not require cross-paragraph reasoning`,
      });
      break;
    }
  }

  // ── 14. Skill overlap: whole-text vs summary ──
  const hasWholeText = wholeTextQuestions.length > 0;
  const hasSummaryTransform = skillCounts.get('summaryTransform') ?? 0 > 0;
  if (hasWholeText && hasSummaryTransform && questions.length <= 6 && paragraphCount < 4) {
    issues.push({
      code: 'SKILL_OVERLAP_WHOLE_TEXT_SUMMARY',
      severity: 'info',
      message: 'Short passage has both whole-text and summary items — ensure they test different skills',
    });
  }

  return {
    passed: !issues.some(i => i.severity === 'critical'),
    retryable: issues.some(i => i.severity === 'critical'),
    issues,
    typeFamilyCoverage,
    issueMessages: issues.map(i => `[${i.severity}] ${i.code}: ${i.message}`),
  };
}

export function shouldRetryBlueprint(check: QuestionSetQualityCheck): boolean {
  return check.retryable && check.issues.some(i => i.severity === 'critical');
}

/** Phase 3A.3: Convert blueprint check result to standardized metadata */
export function toBlueprintQualityMeta(
  check: QuestionSetQualityCheck,
  retried: boolean,
  validated = true,
): BlueprintQualityMeta {
  return {
    passed: check.passed,
    retried,
    degraded: !check.passed,
    validated,
    issues: check.issues.map(i => ({ code: i.code, severity: i.severity, message: i.message })),
  };
}

/** Phase 3C.2: Per-code retry guidance for targeted regeneration */
const RETRY_GUIDANCE_BY_CODE: Record<string, string> = {
  MISSING_INFERENCE: 'Add at least one inference-based question requiring reading beyond stated facts.',
  MISSING_TONESTANCE: 'Add at least one tone/attitude/stance question requiring whole-text judgement.',
  MISSING_WHOLE_TEXT: 'Add at least one whole-text or cross-paragraph question.',
  MISSING_SUMMARY_TRANSFORM: 'Add a summary cloze or sentence transformation item.',
  MC_BANNED_PATTERN: 'Remove banned option patterns (all/none of the above). Use plausible distractors.',
  MC_NO_TRAP_STRUCTURE: 'Revise distractors so at least one is almost right but wrong in scope/tone/reference/degree/logic.',
  MC_DUPLICATE_DISTRACTORS: 'Ensure distractors are distinct — no near-duplicate wrong ideas.',
  MC_STYLISTIC_OUTLIER: 'Make correct answer and distractors similar in length/tone/style.',
  // Phase 4B: Skill boundary retry guidance
  SKILL_OVERLOAD_FACTUAL: 'Reduce factual items; add more higher-order questions (cross-paragraph, whole-text, tone/stance, paragraph function).',
  SKILL_LOW_HIGHER_ORDER: 'Add higher-order questions: cross-paragraph reasoning, whole-text synthesis, tone/stance, or paragraph function.',
  SKILL_REPETITION: 'Diversify question skills — too many questions test the same skill category.',
  TONE_TOO_FACTUAL: 'Make tone/attitude questions rely on word choice, hedging, contrast — not simple positive/negative labels.',
  WHOLE_TEXT_LOCAL: 'Ensure whole-text question requires integrating information from 3+ paragraphs — not answerable from one paragraph.',
  CROSS_PARA_SINGLE: 'Ensure cross-paragraph question requires connecting claims across 2+ paragraphs.',
  SKILL_OVERLAP_WHOLE_TEXT_SUMMARY: 'Differentiate whole-text synthesis from summary cloze — they test different reading skills.',
  // Phase 4B.1: Part A guardrails
  PART_A_HIGHER_ORDER_OVERLOAD: 'Reduce higher-order questions in this Part A paper — short passages should focus on factual, reference, and vocabulary items.',
  PART_A_TOO_MANY_WHOLE_TEXT: 'Reduce whole-text items in Part A — at most 1 whole-text synthesis question per Part A paper.',
};

export function buildBlueprintRetryInstruction(check: QuestionSetQualityCheck): string {
  const criticalCodes = check.issues
    .filter(i => i.severity === 'critical')
    .map(i => {
      const guidance = RETRY_GUIDANCE_BY_CODE[i.code] || '';
      return `- ${i.code}: ${i.message}${guidance ? `\n  → ${guidance}` : ''}`;
    });

  return `
⚠️ RETRY INSTRUCTION — Fix these CRITICAL failures:
${criticalCodes.join('\n')}

Requirements:
- Preserve passage quality and readability
- Fix question type balance and distractor quality
- Ensure at least one distractor per MC item is "almost right"
- Keep same overall question count and marks distribution
`;
}

// ============================================
// Phase 3C: MC Distractor Quality Validators
// ============================================

/** Banned option patterns (not DSE-compatible) */
const BANNED_OPTION_PATTERNS = [
  /all\s*of\s*the\s*above/i,
  /none\s*of\s*the\s*above/i,
  /both\s+A\s+and\s+B/i,
  /all\s+these\s+answers/i,
];

export interface MCDistractorCheck {
  passed: boolean;
  issues: string[];
  hasPlausibleTrap: boolean;
  stylisticOutlier: boolean;
  duplicateDistractors: boolean;
  bannedPatternFound: boolean;
}

/**
 * Phase 3C: Validate a single MC question's distractor quality.
 */
export function validateMCDistractors(
  choices: string[],
  correctAnswer: string,
): MCDistractorCheck {
  const issues: string[] = [];
  const cleaned = choices.map(c => c.replace(/^[A-D][.)\s]+/, '').trim());
  const correctIdx = choices.findIndex(c =>
    c.replace(/^[A-D][.)\s]+/, '').trim().toLowerCase() === correctAnswer.toLowerCase() ||
    /^[A-D]$/i.test(correctAnswer) && c.trim().toUpperCase().startsWith(correctAnswer.toUpperCase()),
  );

  // ── 1. Banned patterns ──
  let bannedPatternFound = false;
  for (const choice of cleaned) {
    for (const pattern of BANNED_OPTION_PATTERNS) {
      if (pattern.test(choice)) {
        bannedPatternFound = true;
        issues.push(`Banned pattern in option: "${choice.slice(0, 40)}"`);
        break;
      }
    }
  }

  // ── 2. Length outliers ──
  const lengths = cleaned.map(c => c.length);
  const avgLen = lengths.reduce((s, l) => s + l, 0) / lengths.length;
  let stylisticOutlier = false;
  if (correctIdx >= 0 && avgLen > 15) {
    const correctLen = lengths[correctIdx];
    // Correct option is much longer or shorter than others
    const othersAvg = (lengths.reduce((s, l) => s + l, 0) - correctLen) / (lengths.length - 1);
    if (correctLen > othersAvg * 1.8 || correctLen < othersAvg * 0.4) {
      stylisticOutlier = true;
      issues.push(`Correct option length (${correctLen}) is a stylistic outlier vs others avg (${Math.round(othersAvg)})`);
    }
  }

  // ── 3. Duplicate-like distractors ──
  let duplicateDistractors = false;
  for (let i = 0; i < cleaned.length; i++) {
    for (let j = i + 1; j < cleaned.length; j++) {
      const a = cleaned[i].toLowerCase().replace(/\s+/g, ' ');
      const b = cleaned[j].toLowerCase().replace(/\s+/g, ' ');
      if (i !== correctIdx && j !== correctIdx) {
        // Two distractors share >70% word overlap
        const aWords = new Set(a.split(' '));
        const bWords = b.split(' ');
        const overlap = bWords.filter(w => aWords.has(w)).length;
        const ratio = Math.min(bWords.length, aWords.size) > 0 ? overlap / Math.min(bWords.length, aWords.size) : 0;
        if (ratio >= 0.5 && bWords.length >= 3) {
          duplicateDistractors = true;
          issues.push(`Distractors ${String.fromCharCode(65 + i)} and ${String.fromCharCode(65 + j)} are near-duplicates`);
        }
      }
    }
  }

  // ── 4. Trap presence heuristic ──
  // At least one distractor must differ from the correct answer on a meaningful dimension
  let hasPlausibleTrap = false;
  if (cleaned.length >= 4 && correctIdx >= 0) {
    const correctText = cleaned[correctIdx].toLowerCase();
    const distractors = cleaned.filter((_, i) => i !== correctIdx);

    for (const d of distractors) {
      const dLower = d.toLowerCase();
      // Check for half-true: shares >30% content words but differs
      const cWords = new Set(correctText.split(/\s+/).filter(w => w.length > 3));
      const dWords = dLower.split(/\s+/).filter(w => w.length > 3);
      const shared = dWords.filter(w => cWords.has(w)).length;
      const shareRatio = Math.min(cWords.size, dWords.length) > 0 ? shared / Math.min(cWords.size, dWords.length) : 0;

      // Check for contrast/negation cues
      const hasContrast = /\b(but|however|although|not|never|unlike|whereas|rather|instead|only|except)\b/i.test(dLower);

      if (shareRatio >= 0.3 || hasContrast) {
        hasPlausibleTrap = true;
        break;
      }
    }
  }

  if (!hasPlausibleTrap && cleaned.length >= 3) {
    issues.push('No plausible trap structure detected — distractors may be too weak');
  }

  return {
    passed: issues.length === 0,
    issues,
    hasPlausibleTrap,
    stylisticOutlier,
    duplicateDistractors,
    bannedPatternFound,
  };
}

/**
 * Phase 3C.1: Run MC distractor validation across all questions.
 * Returns BlueprintIssue[] for integration into the blueprint quality pipeline.
 */
export function validateAllMCDistractors(questions: DSEreadingQuestion[]): BlueprintIssue[] {
  const issues: BlueprintIssue[] = [];
  let mcCount = 0;
  let noTrapCount = 0;
  let bannedCount = 0;

  for (const q of questions) {
    if (!q.choices || q.choices.length < 3) continue;
    // Only check MCQ-type questions
    if (!['mcq', 'mcCloze', 'negativeInference', 'authorIntention'].includes(q.type)) continue;
    mcCount++;

    const check = validateMCDistractors(q.choices, q.answer);

    // Banned patterns → critical
    if (check.bannedPatternFound) {
      bannedCount++;
      issues.push({
        code: 'MC_BANNED_PATTERN',
        severity: 'critical',
        message: `Q${q.index}: MC item uses banned distractor pattern (all/none of the above)`,
      });
    }

    // No plausible trap → warning (critical if >50% of MC items lack traps)
    if (!check.hasPlausibleTrap) {
      noTrapCount++;
    }

    // Duplicate distractors → warning
    if (check.duplicateDistractors) {
      issues.push({
        code: 'MC_DUPLICATE_DISTRACTORS',
        severity: 'warning',
        message: `Q${q.index}: MC item has near-duplicate distractors`,
      });
    }

    // Stylistic outlier → warning
    if (check.stylisticOutlier) {
      issues.push({
        code: 'MC_STYLISTIC_OUTLIER',
        severity: 'warning',
        message: `Q${q.index}: Correct option is a stylistic outlier (length/specificity)`,
      });
    }
  }

  // No plausible trap across multiple MC items → critical if pervasive
  if (mcCount > 0 && noTrapCount > mcCount * 0.5) {
    issues.push({
      code: 'MC_NO_TRAP_STRUCTURE',
      severity: noTrapCount === mcCount ? 'critical' : 'warning',
      message: `${noTrapCount}/${mcCount} MC items lack plausible trap structure`,
    });
  } else if (noTrapCount > 0) {
    issues.push({
      code: 'MC_NO_TRAP_STRUCTURE',
      severity: 'warning',
      message: `${noTrapCount} MC item(s) lack plausible trap structure`,
    });
  }

  return issues;
}
