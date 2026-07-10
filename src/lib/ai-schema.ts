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
  promptZh: z.string().nullish(),
  choices: z.array(z.string()).default([]),
  answer: z.string().min(1),
  explanationZh: z.string().min(1),
  explanationEn: z.string().min(1),
  commonMistake: z.string().min(1),
  grammarPoint: z.string().nullish(),
  listeningContent: z.string().nullish(),
  listeningContentZh: z.string().nullish(),
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
  relatedGrammarPoint: z.string().nullish(),
});

// ============================================
// 三、寫作分析
// ============================================

export const WritingAnalysisSchema = z.object({
  overallScore: z.number().min(0).max(100),
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
  revisedVersion: z.string().nullish(),
  generalComment: z.string(),
});

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
    priority: z.enum(['high', 'medium', 'low']),
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
