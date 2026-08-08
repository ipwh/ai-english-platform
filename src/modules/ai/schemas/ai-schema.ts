// ============================================
// AI 回應 Zod Schema 驗證
// 作為 parseAIJSON 的第二層防護，確保 AI 回傳格式正確
// ============================================

import { z } from 'zod';

// ============================================
// 一、題目生成
// ============================================

export const GeneratedQuestionSchema = z.object({
  type: z.enum(['mc', 'fill-blank', 'error-correction', 'short-writing', 'matching']),
  prompt: z.string().min(1),
  promptZh: z.string().optional(),
  choices: z.array(z.string()).default([]),
  answer: z.string().min(1).refine(ans => ans.trim().length > 0, { message: 'Answer cannot be empty' }),
  explanationZh: z.string().default(''),
  explanationEn: z.string().default(''),
  commonMistake: z.string().default(''),
  grammarPoint: z.string().optional(),
  listeningContent: z.string().optional(),
  listeningContentZh: z.string().optional(),
  readingContent: z.string().optional(),
  readingContentZh: z.string().optional(),
});

export const GeneratedQuestionsArraySchema = z.array(GeneratedQuestionSchema);

// ============================================
// 二、答案分析
// ============================================

export const AnswerAnalysisSchema = z.object({
  isCorrect: z.boolean(),
  score: z.number().min(0).max(100),
  feedbackZh: z.string().min(1),
  feedbackEn: z.string().min(1),
  mistakeType: z.enum([
    'grammar', 'vocabulary', 'comprehension', 'careless',
    'time-management', 'chinglish', 'none',
  ]),
  explanation: z.string().min(1),
  improvementTip: z.string().min(1),
  relatedGrammarPoint: z.string().optional(),
});

// ============================================
// 三、寫作分析
// ============================================

export const EvidenceBackedFeedbackSchema = z.object({
  id: z.string().min(1),
  dimension: z.enum([
    "content",
    "language",
    "organization",
    "task_coverage",
    "vocabulary",
    "grammar",
  ]),
  priority: z.enum(["essential", "important", "optional"]).default("important"),
  kind: z.enum(["strength", "weakness", "recommendation"]),
  claim: z.string().min(1),
  evidence: z.array(z.string()),
  recommendation: z.string().optional(),
  action: z.string().optional(),
  example: z.string().optional(),
  confidence: z.enum(["high", "medium", "low"]).optional(),
});

export type EvidenceBackedFeedback = z.infer<typeof EvidenceBackedFeedbackSchema>;

export const WritingRevisionSchema = z.object({
  faithfulCorrection: z.string().optional(),
  enhancedVersion: z.string().optional(),
});

export type WritingRevision = z.infer<typeof WritingRevisionSchema>;

export const WritingRubricMetadataSchema = z.object({
  rubricVersion: z.string(),
  examYear: z.string().optional(),
  paper: z.literal("Paper 2"),
  taskType: z.string().optional(),
});

// NOTE: Canonical WritingRubricMetadata type lives in ../types/rubric-version.ts.
// This schema exists for Zod runtime validation only.

/**
 * Per-dimension CLO rationale — educational feedback only, NOT a score authority.
 * The `score` field is a copy of the canonical CLO score; it MUST NOT be used
 * to compute or override the formal scoring pipeline.
 */
export const CloDimensionRationaleSchema = z.object({
  dimension: z.enum(["content", "language", "organization"]),
  score: z.number().min(0).max(7),
  strengths: z.array(z.string()),
  limitations: z.array(z.string()),
  evidence: z.array(z.string()),
  nextSteps: z.array(z.string()),
});

export type CloDimensionRationale = z.infer<typeof CloDimensionRationaleSchema>;

export const WritingAnalysisSchema = z.object({
  overallScore: z.number().min(0).max(100),
  contentScore: z.number().min(0).max(7).optional(),
  languageScore: z.number().min(0).max(7).optional(),
  organizationScore: z.number().min(0).max(7).optional(),
  cloTotalScore: z.number().min(0).max(21).optional(),
  dseLevel: z.string().min(1, 'DSE level is required'),
  /** Preferred name; same value as dseLevel. @deprecated — dseLevel retained for API compatibility. */
  platformWritingEstimate: z.string().optional(),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  grammarErrors: z.array(z.object({
    original: z.string(),
    correction: z.string(),
    explanation: z.string(),
  })),
  chinglishWarnings: z.array(z.object({
    original: z.string(),
    suggestion: z.string(),
    explanation: z.string(),
  })),
  vocabularySuggestions: z.array(z.object({
    original: z.string(),
    suggestion: z.string(),
    reason: z.string(),
  })),
  structureFeedback: z.string(),
  revisedVersion: z.string().optional(),
  generalComment: z.string(),
  feedback: z.array(EvidenceBackedFeedbackSchema).optional(),
  cloRationales: z.array(CloDimensionRationaleSchema).optional(),
  revision: WritingRevisionSchema.optional(),
  rubric: WritingRubricMetadataSchema.optional(),
});

// ============================================
// 三點五、Semantic / Task-Coverage Evaluation (internal)
// ============================================

export const TaskRequirementEvidenceSchema = z.object({
  id: z.string().min(1),
  requirement: z.string().min(1),
  status: z.enum(["satisfied", "partial", "missing", "unclear"]),
  type: z.enum([
    "content_point", "position", "reason", "example",
    "audience", "text_type", "format", "tone",
    "instruction", "other",
  ]),
  source: z.enum(["explicit", "clearly_implied"]),
  evidence: z.array(z.string()),
  explanation: z.string().min(1),
});

export type TaskRequirementEvidence = z.infer<typeof TaskRequirementEvidenceSchema>;

export const SemanticEvaluationSchema = z.object({
  taskSummary: z.string().min(1),
  requirements: z.array(TaskRequirementEvidenceSchema),
  overallCoverage: z.enum(["high", "medium", "low"]),
});

export type SemanticEvaluation = z.infer<typeof SemanticEvaluationSchema>;

// ============================================
// 四、錯題解說
// ============================================

export const MistakeExplanationSchema = z.object({
  reasonZh: z.string().min(1),
  reasonEn: z.string().min(1),
  ruleExplanation: z.string().min(1),
  examples: z.array(z.object({
    wrong: z.string(),
    correct: z.string(),
  })),
  memoryTip: z.string().min(1),
  relatedTopics: z.array(z.string()),
});

// ============================================
// 五、進度分析
// ============================================

export const ProgressAnalysisSchema = z.object({
  summary: z.string().min(1),
  strengthsAreas: z.array(z.string()),
  urgentAreas: z.array(z.string()),
  recommendedFocus: z.array(z.object({
    skill: z.string(),
    reason: z.string(),
    priority: z.preprocess(
      (val) => {
        if (typeof val !== 'string') return val;
        const v = val.toLowerCase().trim();
        if (v.startsWith('high') || v === 'urgent' || v === 'critical') return 'high';
        if (v.startsWith('med') || v === 'moderate' || v === 'normal') return 'medium';
        if (v.startsWith('low') || v === 'minor') return 'low';
        return v;
      },
      z.enum(['high', 'medium', 'low']),
    ),
  })),
  studyPlan: z.string().min(1),
  encouragementMessage: z.string().min(1),
  estimatedTimeToImprove: z.string().min(1),
});

export const StudyHelpResponseSchema = z.object({
  answer: z.string().min(1),
  followUpTips: z.array(z.string()),
  recommendedFocus: z.array(z.string()),
});

// ============================================
// 六、教材分析
// ============================================

export const MaterialAnalysisSchema = z.object({
  summary: z.string().min(1),
  keyVocabulary: z.array(z.object({
    word: z.string(),
    meaningZh: z.string(),
    exampleSentence: z.string(),
  })),
  keyGrammarPoints: z.array(z.object({
    point: z.string(),
    explanationZh: z.string(),
  })),
  suggestedQuestions: z.array(z.object({
    type: z.string(),
    prompt: z.string(),
    answer: z.string(),
  })),
  difficultyLevel: z.enum(['remedial', 'core', 'challenge']),
  suggestedGrade: z.string(),
});

// ============================================
// 七、單字 AI 分析 — 生字簿快速加入 / 自動擴充
// ============================================

export const WordAnalysisSchema = z.object({
  word: z.string().min(1),
  partOfSpeech: z.string().min(1),              // 主要詞性
  allPartOfSpeech: z.array(z.string()).default([]), // 所有常見詞性
  meaningZh: z.string().min(1),                 // 主要中文意思
  secondaryMeaningZh: z.string().optional(),    // 次要中文意思
  exampleSentence: z.string().min(1),           // 英文例句
  exampleZh: z.string().min(1),                 // 例句中文翻譯
  synonyms: z.array(z.string()).default([]),    // 同義字
  antonyms: z.array(z.string()).default([]),    // 反義字
  collocations: z.array(z.string()).default([]),// 常見搭配
});

export type WordAnalysis = z.infer<typeof WordAnalysisSchema>;

// ============================================
// 八、Integrated Skills 任務生成
// ============================================

export const IntegratedSkillsTaskSchema = z.object({
  listeningContent: z.string().min(1),
  listeningTopicZh: z.string(),
  dataFile: z.object({
    sources: z.array(z.object({
      type: z.string(),
      title: z.string(),
      content: z.string(),
      relevantFor: z.array(z.number()),
      sourceDate: z.string().optional(),
    })),
  }).optional(),
  noteTakingGuide: z.array(z.object({
    question: z.string(),
    hint: z.string(),
  })),
  writingTask: z.string().min(1),
  expectedContentPoints: z.array(z.string()),
  listeningAnswers: z.array(z.object({
    question: z.string(),
    answer: z.string(),
  })),
});

// ============================================
// 九、Integrated Skills 答案分析
// ============================================

export const IntegratedSkillsAnalysisSchema = z.object({
  overallScore: z.number().min(0).max(100),
  listeningAccuracy: z.number().min(0).max(100),
  writingQuality: z.number().min(0).max(100),
  contentCompleteness: z.number().min(0).max(100),
  languageAccuracy: z.number().min(0).max(100),
  organizationClarity: z.number().min(0).max(100),
  capturedPoints: z.array(z.string()),
  missedPoints: z.array(z.string()),
  overCopyWarnings: z.array(z.object({
    original: z.string(),
    suggestion: z.string(),
  })),
  grammarErrors: z.array(z.object({
    original: z.string(),
    correction: z.string(),
    explanation: z.string(),
  })),
  vocabularySuggestions: z.array(z.object({
    original: z.string(),
    suggestion: z.string(),
    reason: z.string(),
  })),
  structureFeedback: z.string(),
  generalComment: z.string(),
  improvementTips: z.array(z.string()),
  estimatedLevel: z.string(),
});

// ============================================
// 十、自適應寫作指導
// ============================================

export const AdaptiveWritingGuideOutputSchema = z.object({
  personalizedTips: z.array(z.string()),
  structureIssues: z.array(z.string()),
  suggestedNextParagraph: z.string(),
  missingElements: z.array(z.string()),
});

// ============================================
// 輔助：安全驗證（不回傳完整 error details 給 client）
// ============================================

export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

/**
 * 遞迴移除物件中的 null 值，轉為 undefined。
 * Gemini 傾向對 optional 欄位回傳 null，而 DeepSeek 會直接省略。
 * 此函數統一處理，避免 Zod .optional() 因 null 而驗證失敗。
 */
function stripNulls(obj: unknown): unknown {
  if (obj === null) return undefined;
  if (Array.isArray(obj)) return obj.map(stripNulls);
  if (typeof obj === 'object' && obj !== null) {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const cleaned = stripNulls(value);
      if (cleaned !== undefined) {
        result[key] = cleaned;
      }
    }
    return result;
  }
  return obj;
}

/**
 * 安全地驗證 AI 回傳資料，失敗時回傳人類可讀的錯誤訊息
 */
export function validateAIResponse<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): ValidationResult<T> {
  const cleaned = stripNulls(data);
  const result = schema.safeParse(cleaned);
  if (result.success) {
    return { success: true, data: result.data };
  }
  // 僅回傳第一個錯誤，避免洩漏過多內部資訊
  const firstIssue = result.error.issues[0];
  const field = firstIssue.path.join('.') || 'root';
  return {
    success: false,
    error: `AI 回傳資料格式異常（${field}: ${firstIssue.message}）。請重試。`,
  };
}
