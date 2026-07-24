// Sprint 6: Validation barrel
export { validateRequest, validateQuery } from '../validate';

// Sprint 102: Re-export auth ownership helpers for convenience
export { verifyStudentSelfAccess } from '@/shared/auth/api-auth';

// Common
export { studentId, userId, difficulty, gradeLevel, pagination } from './common.schema';

// Auth
export { loginSchema, registerSchema, settingsSchema, roleUpdateSchema } from './auth.schema';

// AI Requests
export {
  generateQuestionsSchema, analyzeWritingSchema, analyzeAnswerSchema,
  explainMistakeSchema, generateIntegratedSkillsSchema, analyzeIntegratedSkillsSchema,
  generateWritingSchema, analyzeWordSchema, studyHelpSchema,
} from './ai-request.schema';

// CRUD
export {
  assignmentCreateSchema, practiceCreateSchema, vocabularyCreateSchema,
  vocabularySuggestSchema, mistakeCreateSchema, mistakeBulkSchema,
  feedbackSchema, writingDraftSchema, notificationCreateSchema,
  ttsRequestSchema, diagnosticCreateSchema,
} from './crud.schema';
