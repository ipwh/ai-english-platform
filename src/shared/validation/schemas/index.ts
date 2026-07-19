// Sprint 6: Validation barrel
export { validateRequest, validateQuery } from '../validate';

// Common
export { studentId, userId, difficulty, gradeLevel, studentLevel, pagination } from './common.schema';

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

// Admin
export {
  adminCreateClassSchema, adminUpdateUserSchema, adminCreateUserSchema,
  adminExportSheetsSchema, adminFixClassesSchema, adminSyncSheetsSchema,
} from './admin.schema';

// Assignment (V2 enhancements)
export {
  assignmentCreateSchemaV2, assignmentUpdateSchema, assignmentQuestionSchema,
  submissionCreateSchema,
} from './assignment.schema';

// Group
export {
  groupCreateSchema, groupUpdateSchema, groupAddMembersSchema, groupRemoveMembersSchema,
} from './group.schema';

// Material & RAG
export {
  materialCreateSchema, materialUpdateSchema, ragQuerySchema, ragIndexSchema, ocrRequestSchema,
} from './material.schema';

// API Route schemas (for routes currently without Zod)
export {
  analyzeAnswerSchema, analyzeWritingSchemaApi, explainMistakeSchema, studyHelpSchema,
  loginSchema, roleUpdateSchemaApi,
  assignmentCreateSchemaApi,
  mistakeCreateSchemaApi, mistakeUpdateSchemaApi,
  vocabCreateSchemaApi, vocabUpdateSchemaApi,
  feedbackCreateSchemaApi, notificationCreateSchemaApi,
  groupCreateSchemaApi, groupUpdateSchemaApi,
} from './api-route.schema';
