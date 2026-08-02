// Sprint 93: Question Generation Use Case — canonical implementation
// Physically extracted from ai-service.ts

import { callLLM } from '../services/llm-call';
import { parseAIJSON } from '../services/json-utils';
import { sanitizeForAI } from '../services/sanitizer';
import { validateAIResponse, GeneratedQuestionsArraySchema } from '../schemas/ai-schema';
import { isDSERAGEnabled, retrievePastPaperContent, retrieveMarkingScheme, buildDSEContextPrompt, type DSESkill } from '../services/rag-service';
import { buildCompactSystemPrompt } from '../prompts/generate-questions-prompt';
import { validateDSEtopicMatch } from '../services/dse-topics';
import { selectDiverseTopic } from '../services/topic-selector';
import { BANNED_PATTERNS, TIME_FRAGMENT_PATTERNS, getFallbackFillers } from '../services/mcq-filters';
import { normalizeGeneratedQuestions } from '../services/question-normalizer';
import { validateAndFixQuestion } from '../services/question-validator';
import { validateListeningConsistency } from '../services/listening-normalizer';
import { logger } from '@/shared/logger/logger';
import type { GenerateQuestionsInput, GeneratedQuestion } from '../types/generation-types';

export type { GenerateQuestionsInput, GeneratedQuestion };

export async function generateQuestions(input: GenerateQuestionsInput): Promise<GeneratedQuestion[]> {
  const count = input.count || 5;
  const skillDesc = input.grammarItemZh || input.languageSkillZh || input.grammarItem || input.languageSkill || '綜合';
  const typeDesc = input.questionType || 'mc';
  const diffMap = { remedial: '補底', core: '核心', challenge: '挑戰' };

  const isListening = input.languageSkill === 'listening';
  const isReading = input.languageSkill === 'reading';
  const isWriting = input.languageSkill === 'writing';
  const isSpeaking = input.languageSkill === 'speaking';
  const _isMcq = typeDesc === 'mc';

  // 寫作技能自動使用 short-writing 題型
  const effectiveQuestionType = isWriting ? 'short-writing' : typeDesc;

  const isErrorCorrection = false; // error-correction disabled — underline rendering not supported in UI

  // 聽力/閱讀/口語題使用較低 temperature 提高準確性
  const qTemperature = (isListening || isReading || isSpeaking) ? 0.45 : 0.7;

  // ============================================
  // DSE RAG 整合：檢索相關歷屆試題與 Marking Scheme
  // ============================================
  const skillMap: Record<string, DSESkill> = {
    reading: 'Reading',
    writing: 'Writing',
    listening: 'Listening',
    speaking: 'Speaking',
    integrated: 'Integrated',
  };
  const dseSkill: DSESkill = (input.languageSkill && skillMap[input.languageSkill]) || 'General';

  let dseContextPrompt = '';
  try {
    if (isDSERAGEnabled()) {
      logger.info({ module: 'dse-rag', dseSkill, topic: input.topic, difficulty: input.difficulty, userId: input.userId }, 'Retrieving past paper content...');

      const [pastPaperChunks, markingSchemeChunks] = await Promise.all([
        retrievePastPaperContent(dseSkill, input.topic, input.difficulty, input.gradeLevel, 3),
        retrieveMarkingScheme(dseSkill, 2),
      ]);

      dseContextPrompt = buildDSEContextPrompt(
        pastPaperChunks.map(r => ({ content: r.chunk.content, title: r.materialTitle, score: r.score })),
        markingSchemeChunks.map(r => ({ content: r.chunk.content, title: r.materialTitle, score: r.score })),
        'generate_questions'
      );

      if (dseContextPrompt) {
        logger.info({ module: 'dse-rag', pastPaperChunks: pastPaperChunks.length, markingSchemeChunks: markingSchemeChunks.length }, 'Retrieved past paper and marking scheme chunks');
      } else {
        logger.info({ module: 'dse-rag' }, 'No relevant past papers, using pure prompt mode');
      }
    }
  } catch (err) {
    // RAG 失敗不應中斷出題流程，fallback 到純 prompt
    logger.warn({ module: 'dse-rag', error: err instanceof Error ? err.message : String(err) }, 'RAG retrieval failed, falling back to pure prompt');
    dseContextPrompt = '';
  }

  const systemPrompt = (() => {
    try {
      return buildCompactSystemPrompt(input, dseContextPrompt);
    } catch (err) {
      logger.error({ module: 'generate-questions', error: err instanceof Error ? err.message : String(err) }, 'buildCompactSystemPrompt failed');
      throw err;
    }
  })();

  const userPrompt = `請生成 ${count} 道 ${skillDesc}（${diffMap[input.difficulty]}程度，${input.gradeLevel}）的${effectiveQuestionType === 'mc' ? '選擇題' : effectiveQuestionType === 'fill-blank' ? '填充題' : effectiveQuestionType === 'error-correction' ? '改錯題' : effectiveQuestionType === 'short-writing' ? '短文寫作題' : '練習題'}。`;

  // buildCompactSystemPrompt already includes dseContextPrompt
  const finalSystemPrompt = systemPrompt;

  // ============================================
  // Generation with retry — ensure question count + quality
  // ============================================
  const MAX_RETRIES = 2;
  let lastError = '';
  
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    // On retry: force different topic and slightly lower temperature
    const retryTopic = attempt > 0
      ? selectDiverseTopic({ userId: input.userId || 'anonymous', skill: isListening ? 'listening' : isReading ? 'reading' : isWriting ? 'writing' : isSpeaking ? 'speaking' : 'grammar', gradeLevel: input.gradeLevel })
      : undefined;
    const retryPrompt = attempt > 0
      ? `\n\n⚠️ RETRY INSTRUCTION: Previous attempt produced insufficient or low-quality questions. Please generate EXACTLY ${count} questions with COMPLETE fields. Use topic: "${retryTopic}". Ensure every question has a valid answer that appears verbatim in the listening/reading content.\n\nDO NOT use the same scenarios or topics as before.`
      : '';
    
    const effectiveSystemPrompt = finalSystemPrompt + retryPrompt;

    logger.info({ module: 'generate-questions', attempt, systemPromptLen: effectiveSystemPrompt.length, userPromptLen: userPrompt.length, estimatedTokens: Math.ceil((effectiveSystemPrompt.length + userPrompt.length) / 4), skill: input.languageSkill, difficulty: input.difficulty }, 'Calling LLM for question generation');

  const result = await callLLM(
    [
      { role: 'system', content: effectiveSystemPrompt },
      { role: 'user', content: userPrompt },
    ],
    { temperature: attempt > 0 ? Math.max(0.3, qTemperature - 0.15) : qTemperature, maxTokens: isListening ? 4096 : 2048, jsonMode: true, timeoutMs: 35000, userId: input.userId }
  );

    logger.info({ module: 'generate-questions', resultLen: result.length, resultPreview: result.slice(0, 300), attempt }, 'LLM response received');

  const tryValidate = (rawText: string, label: string = '') => {
    const prefix = label ? `[${label}] ` : '';
    const parsed = parseGeneratedQuestions(rawText);
    logger.info({ module: 'generate-questions', parsedCount: parsed.length, parsedTypes: parsed.map(q => q.type), label }, 'Questions parsed');
    if (parsed.length === 0) {
      throw new Error(`${prefix}AI 回傳無法解析為題目陣列（原始回應前 500 字：${rawText.slice(0, 500)}）`);
    }
    const normalized = normalizeGeneratedQuestions(parsed);
    logger.info({ module: 'generate-questions', normalizedCount: normalized.length, parsedCount: parsed.length, label }, 'Questions normalized');
    if (normalized.length === 0) {
      throw new Error(`${prefix}所有題目在標準化過程中被過濾（原始題目數：${parsed.length}，範例：${JSON.stringify(parsed[0]).slice(0, 200)}）`);
    }
    const validated = validateAIResponse(GeneratedQuestionsArraySchema, normalized);
    if (!validated.success) {
      logger.error({ module: 'generate-questions', zodError: validated.error, normalizedCount: normalized.length }, 'Zod validation failed');
      throw new Error(`${prefix}${validated.error}`);
    }
    return validated.data;
  };

  try {
    const questions = tryValidate(result, `attempt${attempt + 1}`);
    // 後驗證：逐題一致性檢查與自動修正
    const allWarnings: string[] = [];
    const fixedQuestions = questions.map((q, i) => {
      const { fixed, warnings } = validateAndFixQuestion(q, i + 1);
      allWarnings.push(...warnings);
      return fixed;    });
    if (allWarnings.length > 0) {
      logger.warn({ module: 'ai-service', warnings: allWarnings }, 'Generated questions had consistency issues (auto-fixed)');
    }

    // === 出題後品質檢查 ===
    const actualCount = fixedQuestions.length;
    let hasCriticalFailures = isListening
      ? (() => {
          const check = validateListeningConsistency(fixedQuestions);
          if (!check.passed) {
            logger.warn({ module: 'ai-service', attempt: attempt + 1, errors: check.errors, warnings: check.warnings }, 'Listening consistency issues');
          } else {
            logger.info({ module: 'ai-service', attempt: attempt + 1 }, 'Listening consistency passed');
          }
          if (check.errors.length > 0) {
            lastError = check.errors.join('; ');
            return check.questionIndices.length >= fixedQuestions.length * 0.5;
          }
          return false;
        })()
      : false;

    // === Reading Content Validation ===
    if (isReading) {
      const readingIssues = fixedQuestions.filter(q => {
        if (!q.readingContent) return true; // Missing reading content is critical
        return q.readingContent.trim().length < 50; // Too short
      });
      if (readingIssues.length > 0) {
        logger.warn({ module: 'ai-service', readingIssueCount: readingIssues.length, totalQuestions: fixedQuestions.length }, 'Reading questions have missing/short readingContent');
        if (readingIssues.length >= fixedQuestions.length * 0.5) {
          lastError = 'Too many reading questions with insufficient content';
          hasCriticalFailures = true;
        }
      }
    }

    // === Retry decision ===
    const needsRetry = actualCount < count || hasCriticalFailures;
    
    if (!needsRetry || attempt >= MAX_RETRIES - 1) {
      if (actualCount === 0) {
        throw new Error(`AI generated 0 valid questions after ${attempt + 1} attempt(s). Last error: ${lastError || 'all questions rejected by quality checks'}`);
      }
      if (actualCount < count && attempt > 0) {
        logger.warn({ module: 'ai-service', attempts: attempt + 1, actualCount, expectedCount: count, lastError: lastError || undefined }, 'Returning best effort after retry attempts');
      }
      // DSE topic validation (informational only)
      const skillForValidation: 'writing' | 'reading' | 'listening' =
        isListening ? 'listening' : isReading ? 'reading' : 'writing';
      const topicCheck = validateDSEtopicMatch(
        fixedQuestions.map(q => (q.prompt || '') + ' ' + (q.explanationEn || '')).join(' '),
        skillForValidation,
      );
      if (!topicCheck.matched) {
        logger.warn({ module: 'ai-service', dseTopicScore: topicCheck.score }, 'DSE topic match LOW');
      }
      return fixedQuestions;
    }
    
    logger.warn({ module: 'ai-service', attempt: attempt + 1, maxRetries: MAX_RETRIES, actualCount, expectedCount: count, criticalFailure: hasCriticalFailures }, 'Retrying question generation');
    // Continue to next iteration of retry loop
  } catch (firstErr: unknown) {
    const firstMsg = firstErr instanceof Error ? firstErr.message : String(firstErr);
    if (!/AI 回傳格式無法解析|AI 回傳資料格式異常|JSON/i.test(firstMsg)) {
      throw firstErr;
    }

    // 第二階段：請模型只做「格式修復」，避免偶發非 JSON 輸出導致 500
    const repairSystemPrompt = `你是 JSON 格式修復器。請將輸入內容轉為有效 JSON 陣列。
不要新增或刪除題目，只修正格式。
回覆必須是純 JSON 陣列，不可包含任何其他文字。`;

    const repairUserPrompt = `請把以下內容轉成有效 JSON 陣列，每題需包含：
type, prompt, promptZh, choices, answer, explanationZh, explanationEn, commonMistake, grammarPoint

原始內容：
${result.slice(0, 12000)}`;

    const repaired = await callLLM(
      [
        { role: 'system', content: repairSystemPrompt },
        { role: 'user', content: repairUserPrompt },
      ],
      { temperature: 0, maxTokens: 4096, jsonMode: true, timeoutMs: 15000, userId: input.userId }
    );

    const repairedQuestions = tryValidate(repaired, 'repair');
    if (repairedQuestions.length === 0) {
      throw new Error('AI 回傳格式修復後仍未產生有效題目');
    }
    return repairedQuestions;
  }
  } // end retry loop

  // All retries exhausted or unreachable
  throw new Error(`AI question generation failed after ${MAX_RETRIES} attempts. ${lastError ? 'Last error: ' + lastError : 'No valid questions produced.'}`);
}

/**
 * 穩健地解析 AI 生成的題目 JSON
 */
function parseGeneratedQuestions(raw: string): GeneratedQuestion[] {
  const parsed = parseAIJSON<GeneratedQuestion[] | { questions: GeneratedQuestion[] }>(raw);
  return Array.isArray(parsed) ? parsed : (parsed.questions || []);
}

