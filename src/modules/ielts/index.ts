// ============================================
// IELTS Module — public barrel (2026-10-03 PHASE IELTS-01)
// ============================================
// Isolated IELTS-style practice subsystem. NEVER writes HKDSE evidence, XP,
// mistakes or mastery. All bands are practice estimates.
// ============================================

// Domain
export * from './domain/types';
export {
  roundToHalfBand,
  computeOverallBand,
  computeWritingSectionBand,
  isValidBand,
  formatBand,
  formatBandRange,
} from './domain/bands';
export {
  countIeltsWords,
  validateWordLimit,
  checkWritingLength,
  IELTS_MIN_WORDS_TASK1,
  IELTS_MIN_WORDS_TASK2,
} from './domain/word-count';
export {
  normalizeIeltsAnswer,
  normalizeTrueFalseNotGiven,
  normalizeYesNoNotGiven,
  completionCompareKey,
} from './domain/normalization';
export {
  IELTS_CONVERSION_TABLES,
  getConversionTable,
  estimateBandFromRawScore,
  estimateComponentBandForAttempt,
  isBandEstimate,
  IELTS_FULL_COMPONENT_QUESTION_COUNT,
} from './domain/conversion';
export {
  IELTS_TARGET_BAND_VALUES,
  IELTS_TARGET_BAND_BASIS,
  isIeltsTargetBand,
  difficultyForTargetBand,
  type IeltsTargetBand,
} from './domain/difficulty';

// Scoring
export { scoreIeltsItem, scoreIeltsItemDefinition, extractOptionPairs } from './scoring/objective-scorer';
export {
  aggregateObjectiveResults,
  computeWritingTaskBand,
  computeWritingEstimate,
} from './scoring/aggregate';

// Validation
export {
  validateIeltsQuestion,
  assertPublishable,
  isServableStatus,
  skillMatchesQuestionType,
  emptyBatchContext,
  type IeltsValidationReport,
  type IeltsValidationIssue,
} from './validation/question-validator';
export {
  IELTS_STATUS_TRANSITIONS,
  canTransition,
  applyTransition,
  statusAfterAiValidation,
} from './validation/pipeline';

// Writing / Speaking domain config
export {
  IELTS_WRITING_TASKS,
  IELTS_WRITING_CRITERIA_DEFINITIONS,
  IELTS_WRITING_RUBRIC_VERSION,
  IELTS_TASK_SPECIFICATION_VERSION,
  extractTaskRequirements,
  type IeltsWritingTaskConfig,
} from './writing/criteria';
export {
  IELTS_SPEAKING_PARTS,
  IELTS_SPEAKING_CRITERIA_DEFINITIONS,
  defaultPronunciationState,
} from './speaking/criteria';
export {
  IELTS_SPEAKING_TOPIC_BANK,
  IELTS_SPEAKING_TOPIC_CATEGORIES,
  getSpeakingTopicsByCategory,
  getSpeakingTopicsForPart,
  findSpeakingTopicById,
  type IeltsSpeakingTopic,
  type IeltsSpeakingTopicCategory,
} from './speaking/topic-bank';
export {
  IELTS_SPEAKING_PREP_SECTIONS,
  IELTS_SPEAKING_NOTE_GRID,
  IELTS_SPEAKING_STORY_MERGING,
  IELTS_SPEAKING_PRACTICE_LOOP,
  IELTS_SPEAKING_PITFALLS,
  IELTS_SPEAKING_PREP_LIMITATIONS,
} from './speaking/strategies';

// Governance
export {
  IELTS_HUMAN_EVIDENCE,
  IELTS_MARKER_EQUIVALENCE,
  IELTS_CALIBRATION_STATUS,
  IELTS_FEATURE_STATUS,
  IELTS_AI_COST_STATUS,
  getGovernanceSnapshot,
  resolveAssessmentSourceGate,
  isCalibratedSourceAllowed,
  containsForbiddenClaim,
} from './governance/states';
export {
  computeAgreementMetrics,
  computeCalibrationReport,
  validCalibrationPairs,
  currentCalibrationStatus,
  MIN_CALIBRATION_PAIRS,
  type IeltsCalibrationPair,
} from './governance/calibration';
export { IELTS_EVENTS, emitIeltsEvent } from './governance/events';
export {
  IELTS_SUBSYSTEM_STATUS,
  IELTS_SUBSYSTEM_STATUS_REASON,
} from './governance/states';

// Services
export {
  listPublishedIeltsTests,
  getTestForStudentAttempt,
  getSectionTranscriptForDelivery,
  listPublishedWritingPrompts,
  type IeltsTestSummary,
  type IeltsAttemptTimeTest,
  type IeltsWritingPromptSummary,
} from './services/catalog-service';
export {
  startIeltsAttempt,
  submitIeltsAttempt,
  getIeltsAttemptDetail,
  type IeltsSubmissionSummary,
  type IeltsAttemptDetail,
  type IeltsSubmittedAnswerInput,
} from './services/attempt-service';
export {
  assessIeltsWriting,
  isQuoteVerbatim,
  buildTaskTypeAnalysis,
  type IeltsWritingAssessmentResult,
  type IeltsWritingAssessmentOutcome,
  type IeltsTaskTypeAnalysis,
} from './services/writing-assessment-service';
export {
  prepareIeltsSpeaking,
  type IeltsSpeakingPrepResult,
  type IeltsSpeakingPrepOutcome,
} from './services/speaking-prep-service';
export { getIeltsProgress, type IeltsProgressSummary } from './services/progress-service';
export {
  generateIeltsPracticeContent,
  generateIeltsWritingTask,
  IELTS_GENERATION_GENERATOR_VERSION,
  IELTS_GENERATION_MIN_SET_ITEMS,
  IELTS_GENERATION_MAX_READING_SET_ITEMS,
  IELTS_GENERATION_MAX_LISTENING_SET_ITEMS,
  IELTS_FULL_COMPONENT_TARGETS,
  type IeltsGenerationInput,
  type IeltsGenerationOutcome,
  type IeltsWritingGenerationInput,
  type IeltsWritingGenerationOutcome,
} from './services/generation-service';
export {
  createIeltsQuestionDraft,
  validateIeltsQuestionById,
  transitionIeltsQuestionStatus,
  transitionIeltsTestStatus,
  listAdminQuestions,
  listAdminIeltsTests,
  type IeltsAdminQuestionListItem,
  type IeltsAdminTestSummary,
} from './services/admin-service';
export {
  ensureStarterContent,
  STARTER_CONTENT_REVIEWER,
  STARTER_CONTENT_VERSION,
  type IeltsStarterProvisionResult,
} from './services/starter-content-service';
export {
  explainIeltsMistake,
  IELTS_EXPLANATION_MAX_CONTENT_CHARS,
  type IeltsMistakeExplanationInput,
  type IeltsMistakeExplanationResult,
  type IeltsMistakeExplanationOutcome,
} from './services/mistake-explanation-service';
export {
  generateIeltsInstantPractice,
  IELTS_INSTANT_PRACTICE_DAILY_LIMIT,
  IELTS_INSTANT_DEFAULT_ITEMS,
  IELTS_INSTANT_MIN_ITEMS,
  IELTS_INSTANT_MAX_READING_ITEMS,
  IELTS_INSTANT_MAX_LISTENING_ITEMS,
  type IeltsInstantPracticeInput,
  type IeltsInstantPracticeResult,
  type IeltsInstantPracticeOutcome,
} from './services/instant-practice-service';
