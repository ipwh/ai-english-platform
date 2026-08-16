// Sprint 42: Remaining API route schemas — batch P16
import { z } from 'zod';
import { difficulty, studentId, studentLevel } from './common.schema';

// ============================================
// AI Routes
// ============================================

export const analyzeIntegratedSkillsSchema = z.object({
  listeningContent: z.string().min(1),
  noteTakingGuide: z.string().optional(),
  expectedContentPoints: z.array(z.string()).optional(),
  writingTask: z.string().min(1),
  taskType: z.string().min(1),
  studentNotes: z.string().optional(),
  studentWriting: z.string().min(1),
  gradeLevel: studentLevel,
  dataFileSources: z.array(z.object({
    type: z.string(),
    title: z.string(),
    content: z.string(),
    relevantFor: z.array(z.number()),
    sourceDate: z.string().optional(),
  })).optional(),
});

export const analyzeMaterialSchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
  gradeLevel: studentLevel,
});

export const analyzeProgressSchema = z.object({
  studentId: studentId,
  studentLevel: studentLevel,
  overallAccuracy: z.number().min(0).max(100).default(0),
  weakSkills: z.array(z.string()).default([]),
  recentPerformance: z.string().default(''),
  streakDays: z.number().int().min(0).default(0),
});

export const generateIntegratedSkillsSchema = z.object({
  gradeLevel: studentLevel,
  difficulty: difficulty,
  taskType: z.string().min(1),
  topicHint: z.string().optional(),
});

export const studyHelpSchemaApi = z.object({
  question: z.string().min(1),
  studentLevel: studentLevel,
  weakSkills: z.array(z.string()).optional(),
  recentMistakes: z.array(z.string()).optional(),
  recentPerformance: z.string().optional(),
});

// ============================================
// Vocabulary Sub-routes
// ============================================

export const vocabExampleSchema = z.object({
  word: z.string().min(1),
  partOfSpeech: z.string().optional(),
  meaningZh: z.string().optional(),
  gradeLevel: studentLevel,
});

export const vocabQuizSchema = z.object({
  studentId,
  type: z.enum(['mc', 'fill-blank', 'spelling']).default('mc'),
  count: z.coerce.number().int().min(1).max(30).default(10),
  wordIds: z.array(z.string()).optional(),
});

export const vocabSuggestSchema = z.object({
  studentId,
  text: z.string().min(1),
  source: z.string().optional(),
  gradeLevel: studentLevel,
});

export const vocabSpellingGenerateSchema = z.object({
  studentId,
  count: z.coerce.number().int().min(1).max(20).default(5),
  mode: z.enum(['fill', 'type']).default('type'),
  wordIds: z.array(z.string()).optional(),
});

export const vocabSpellingSubmitSchema = z.object({
  sessionId: z.string().min(1),
  studentId,
  attempts: z.array(z.object({
    word: z.string(),
    correctSpelling: z.string(),
    studentSpelling: z.string(),
    isCorrect: z.boolean(),
  })).min(1),
});

export const vocabExportPdfSchema = z.object({
  studentId,
  wordIds: z.array(z.string()).optional(),
  format: z.enum(['pdf']).default('pdf'),
});

// ============================================
// Writing Coach
// ============================================

export const writingCoachAnalyzeSchema = z.object({
  essayId: z.string().optional(),
  studentId: studentId.optional(),
  title: z.string().optional(),
  content: z.string().min(1),
  textType: z.string().optional(),
  gradeLevel: studentLevel,
  action: z.enum(['analyze', 'suggest', 'outline']).optional(),
});

// R3.10-K Phase 6: /api/writing/model-essays is DEPRECATED (no runtime
// consumer). Schema retained for compatibility only.
export const modelEssaysGenSchema = z.object({
  prompt: z.string().min(1),
  textType: z.string().optional(),
  wordLimit: z.coerce.number().int().min(50).max(2000).default(300),
  gradeLevel: studentLevel,
  studentLevel: studentLevel,
});

// ============================================
// Mistakes Bulk
// ============================================

export const mistakeBulkSchemaApi = z.object({
  studentId,
  action: z.enum(['deleteAll', 'deleteSelected']),
  ids: z.array(z.string()).optional(),
});

// ============================================
// Analytics & Export
// ============================================

export const analyticsReportSchema = z.object({
  studentId,
  type: z.enum(['progress', 'grammar', 'vocabulary', 'writing', 'comprehensive']).default('progress'),
});

export const writingAnalysisExportSchema = z.object({
  overallScore: z.number().optional(),
  studentDraft: z.string().optional(),
  contentScore: z.number().min(0).max(7).optional(),
  languageScore: z.number().min(0).max(7).optional(),
  organizationScore: z.number().min(0).max(7).optional(),
  dseLevel: z.string().optional(),
  strengths: z.array(z.string()).optional(),
  weaknesses: z.array(z.string()).optional(),
  generalComment: z.string().optional(),
});

// ============================================
// LLM Eval (minimal validation)
// ============================================

export const llmEvalSchema = z.object({
  action: z.string().min(1),
}).passthrough();

// ============================================
// Experiment (minimal validation)
// ============================================

export const experimentSchema = z.object({
  action: z.string().min(1),
}).passthrough();

// ============================================
// Writing Coach Router
// ============================================

export const writingCoachRouterSchema = z.object({
  action: z.enum(['create', 'analyze', 'compare', 'revise', 'listAll']),
}).passthrough();
