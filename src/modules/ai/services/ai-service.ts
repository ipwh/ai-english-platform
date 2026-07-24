// ============================================
// AI Facade — Sprint 94 Finalization
// Pure delegation. No business logic. No inline implementations.
// All AI logic lives in usecases/ and services/.
// ============================================

// ═══ Provider tracking ═══
import { providerRegistry } from '@/modules/ai/providers';
export function getLastAIProvider(): string { return providerRegistry.getLastUsed(); }
export function wasFallbackUsed(): boolean { const p = providerRegistry.getLastUsed(); return p !== 'deepseek' && p !== 'none'; }

// ═══ LLM Call ═══
export { callLLM } from './llm-call';

// ═══ Sanitizer ═══
export { sanitizeForAI } from './sanitizer';

// ═══ Configuration helpers ═══
import { config } from '@/shared/config/config';
import { hasServiceAccountSource } from '@/modules/ai/services/gcp-auth';
export function isDeepSeekConfigured(): boolean { return isAIConfigured(); }
export function isAIConfigured(): boolean {
  return (!!config.deepseek.apiKey && config.deepseek.apiKey !== 'sk-your-deepseek-api-key-here')
    || (!!config.vertex.projectId && hasServiceAccountSource())
    || !!config.gemini.apiKey;
}
export function isVertexGeminiConfigured(): boolean { return !!config.vertex.projectId && hasServiceAccountSource(); }
export function getAIProviders() {
  return {
    deepseek: !!config.deepseek.apiKey && config.deepseek.apiKey !== 'sk-your-deepseek-api-key-here',
    vertexGemini: isVertexGeminiConfigured(), geminiApiKey: !!config.gemini.apiKey,
    vertexProjectId: config.vertex.projectId || null, vertexLocation: config.vertex.location, vertexModel: config.vertex.model,
  };
}

// ═══ Retry Stats ═══
import { logger } from '@/shared/logger/logger';
interface RetryStats { totalAttempts: number; retryCount: number; retrySuccesses: number; failedTopics: string[]; lastReset: number; }
const _retryStats: RetryStats = { totalAttempts: 0, retryCount: 0, retrySuccesses: 0, failedTopics: [], lastReset: Date.now() };
export function resetRetryStats(): RetryStats { const prev = { ..._retryStats }; _retryStats.totalAttempts = 0; _retryStats.retryCount = 0; _retryStats.retrySuccesses = 0; _retryStats.failedTopics = []; _retryStats.lastReset = Date.now(); return prev; }
export function getRetryStats(): RetryStats & { retryRate: number } { return { ..._retryStats, retryRate: _retryStats.totalAttempts > 0 ? _retryStats.retryCount / _retryStats.totalAttempts : 0 }; }

// ═══ Backward-compat wrapper ═══
import type { GeneratedQuestion } from '../types/generation-types';
export type { GenerateQuestionsInput, GeneratedQuestion } from '../types/generation-types';
import { validateAndFixQuestion as _vafq } from './question-validator';
import type { ValidatableQuestion } from './question-validator';
export function validateAndFixQuestion(q: GeneratedQuestion, index: number): { fixed: GeneratedQuestion; warnings: string[]; rejected: boolean } {
  const r = _vafq(q as ValidatableQuestion, index);
  return { fixed: r.fixed as GeneratedQuestion, warnings: r.warnings, rejected: r.rejected };
}
export { normalizeGeneratedQuestions } from './question-normalizer';

// ═══ Use Case Delegation — all business logic lives in usecases/ ═══
export { generateQuestions } from '../usecases/generate-questions';
export { analyzeAnswer, type AnalyzeAnswerInput, type AnswerAnalysis } from '../usecases/analyze-answer';
export { analyzeWriting, type AnalyzeWritingInput, type WritingAnalysis } from '../usecases/analyze-writing';
export { explainMistake, type ExplainMistakeInput, type MistakeExplanation } from '../usecases/explain-mistake';
export { analyzeWord, type AnalyzeWordInput } from '../usecases/analyze-word';
export { analyzeProgress, type AnalyzeProgressInput, type ProgressAnalysis } from '../usecases/analyze-progress';
export { answerStudyHelp, type StudyHelpInput, type StudyHelpResponse } from '../usecases/study-help';
export { analyzeMaterial, type AnalyzeMaterialInput, type MaterialAnalysis } from '../usecases/analyze-material';
export { generateWritingPrompt, type GenerateWritingPromptInput, type GenerateWritingOutlineInput, type GenerateWritingGuideInput, type WritingGuide } from '../usecases/writing-prompt';
export { generateWritingOutline } from '../usecases/writing-outline';
export { generateWritingGuide } from '../usecases/writing-guide';
export { generateIntegratedSkills, type GenerateIntegratedSkillsInput } from '../usecases/integrated-skills-gen';
export { analyzeIntegratedSkills } from '../usecases/integrated-skills-analysis';
export type { AnalyzeIntegratedSkillsInput, IntegratedSkillsAnalysis, IntegratedSkillsTask } from '../usecases/integrated-skills-types';

// ═══ Compatibility re-exports ═══
export type { ChinglishWarning } from '@/modules/assessment/services/chinglish';
export { detectChinglish, loadChinglishRules } from '@/modules/assessment/services/chinglish';
export { DSE_EMPIRICAL_TOPICS, LISTENING_TOPICS_V2, READING_TOPICS_V2, getDSEEmpiricalTopics, validateDSEtopicMatch } from './dse-topics';
export type { TopicCategory, TopicEntry } from './dse-topics';
export { DSE_TEXT_TYPE_GUIDE, VOCAB_UPGRADES, CHINGLISH_FIXES } from './dse-writing-data';
export { STRICT_ANSWER_RULES } from '@/modules/ai/prompts';
export { BANNED_PATTERNS, TIME_FRAGMENT_PATTERNS } from './mcq-filters';
export { INTEGRATED_SKILLS_DIFF_MAP, INTEGRATED_SKILLS_TASK_TYPE_MAP } from './integrated-skills-config';
export { getRandomTopicV2 } from './topic-selector';
export { GeneratedQuestionsArraySchema, validateAIResponse } from '../schemas/ai-schema';

// ═══ generateAdaptiveWritingGuide — kept inline (complex coupling with WritingGuide) ═══
import { DSE_TEXT_TYPE_GUIDE as _DSETG } from './dse-writing-data';
import { callLLM as _callLLM } from './llm-call';
import { parseAIJSON as _parseAIJSON } from './json-utils';
export async function generateAdaptiveWritingGuide(input: { userId?: string; textType: string; gradeLevel: string; writingPrompt: string; studentDraft?: string; lang?: 'zh' | 'en' }): Promise<{ personalizedTips: string[]; structureIssues: string[]; suggestedNextParagraph: string; missingElements: string[] }> {
  if (!input.studentDraft || input.studentDraft.trim().length < 20) return { personalizedTips: ['開始寫作後，AI 會根據你的草稿提供個人化建議。'], structureIssues: [], suggestedNextParagraph: '先寫出你的 Introduction，然後回來查看 AI 建議。', missingElements: [] };
  const guide = _DSETG[input.textType]; const draftSnippet = input.studentDraft.slice(0, 2000);
  const sp = `你是一位香港 DSE English Paper 2 寫作導師。文體：${guide?.name || input.textType}，年級：${input.gradeLevel}。回覆純 JSON：{ "personalizedTips": [...], "structureIssues": [...], "suggestedNextParagraph": "...", "missingElements": [...] }，繁體中文。`;
  try {
    const r = await _callLLM([{ role: 'system', content: sp }, { role: 'user', content: `寫作任務：${input.writingPrompt}\n\n學生草稿：\n"""\n${draftSnippet}\n"""\n\n請提供個人化寫作建議。` }], { temperature: 0.4, maxTokens: 1024, jsonMode: true, timeoutMs: 15000, userId: input.userId });
    return _parseAIJSON<{ personalizedTips: string[]; structureIssues: string[]; suggestedNextParagraph: string; missingElements: string[] }>(r);
  } catch { logger.warn({ module: 'live-writing-coach' }, 'Live writing coach failed'); return { personalizedTips: ['繼續寫作，完成後可以使用 AI 批改獲得詳細分析。'], structureIssues: [], suggestedNextParagraph: '繼續發展你的下一個論點，記得使用 PEEL 結構。', missingElements: [] }; }
}
