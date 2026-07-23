// ============================================
// DeepSeek AI 服務層
// 整合 DeepSeek API 提供 AI 分析及練習生成
// API 文件: https://platform.deepseek.com/api-docs
// ============================================

import {
  GeneratedQuestionsArraySchema,
  AnswerAnalysisSchema,
  WritingAnalysisSchema,
  MistakeExplanationSchema,
  ProgressAnalysisSchema,
  StudyHelpResponseSchema,
  MaterialAnalysisSchema,
  validateAIResponse,
} from '../schemas/ai-schema';
import { hasServiceAccountSource } from '@/modules/ai/services/gcp-auth';

// ============================================
// DSE RAG 整合 (Feature Flag: DSE_RAG_ENABLED)
// ============================================
import {
  isDSERAGEnabled,
  retrievePastPaperContent,
  retrieveMarkingScheme,
  buildDSEContextPrompt,
} from './rag-service';
import type { DSESkill } from './rag-service';

// ============================================
// PDPO 去識別化 + Prompt Injection 防護
// 已拆分至 src/lib/ai/sanitizer.ts
// ============================================
import { sanitizeForAI } from '../services/sanitizer';
export { sanitizeForAI } from '../services/sanitizer';

// ============================================
// Rule-based Chinglish 前置檢測（補充 AI 批改）
// 規則從 chinglish-rules.json 外部讀取，教師可自行編輯
// ============================================

export type { ChinglishWarning } from '@/modules/assessment/services/chinglish';
export { detectChinglish, loadChinglishRules } from '@/modules/assessment/services/chinglish';
import { detectChinglish } from '@/modules/assessment/services/chinglish';

// ============================================
// DSE Topic Database + Validation (extracted)
// ============================================
export {
  DSE_EMPIRICAL_TOPICS,
  LISTENING_TOPICS_V2,
  READING_TOPICS_V2,
  getDSEEmpiricalTopics,
  validateDSEtopicMatch,
} from '../services/dse-topics';
export type { TopicCategory, TopicEntry } from '../services/dse-topics';
import {
  getDSEEmpiricalTopics,
  validateDSEtopicMatch,
} from '../services/dse-topics';

// ============================================
// DSE Writing 文體資料 + 詞彙升級 + 中式英文修正 (extracted)
// ============================================
export {
  DSE_TEXT_TYPE_GUIDE,
  VOCAB_UPGRADES,
  CHINGLISH_FIXES,
} from '../services/dse-writing-data';
import {
  DSE_TEXT_TYPE_GUIDE,
  VOCAB_UPGRADES,
} from '../services/dse-writing-data';

// ============================================
// 答案準確性規則 (extracted prompt)
// ============================================
export { STRICT_ANSWER_RULES } from '@/modules/ai/prompts';
import { STRICT_ANSWER_RULES } from '@/modules/ai/prompts';
import { HALLUCINATION_GUARD } from '@/modules/ai/services/hallucination-guard';

// ============================================
// 已提取的 System Prompts
// ============================================
import {
  getExplainMistakeSystemPrompt, buildExplainMistakeUserPrompt,
  getProgressAnalysisSystemPrompt, buildProgressAnalysisUserPrompt,
  getWritingOutlineSystemPrompt, buildWritingOutlineUserPrompt,
} from '@/modules/ai/prompts';
import { BANNED_PATTERNS, TIME_FRAGMENT_PATTERNS, getFallbackFillers } from '../services/mcq-filters';
import {
  INTEGRATED_SKILLS_DIFF_MAP,
  INTEGRATED_SKILLS_TASK_TYPE_MAP,
} from '../services/integrated-skills-config';
export { BANNED_PATTERNS, TIME_FRAGMENT_PATTERNS } from '../services/mcq-filters';
export {
  INTEGRATED_SKILLS_DIFF_MAP,
  INTEGRATED_SKILLS_TASK_TYPE_MAP,
} from '../services/integrated-skills-config';

// ============================================
// Topic Selection Engine (extracted)
// ============================================
export { getRandomTopicV2 } from '../services/topic-selector';
import { getRandomTopicV2 } from '../services/topic-selector';

// ============================================
// 🆕 Sprint 0.5 — Extracted modules (import directly for new code):
//   '@/modules/ai/services/question-validator' — validateAndFixQuestion, normalizeMcqAnswer, etc.
//   '@/modules/ai/services/listening-normalizer' — normalizeListeningContent, validateListeningConsistency
//   '@/modules/ai/services/json-utils' — parseAIJSON, repairTruncatedJSON
// The functions below are original definitions kept for backward compatibility.
// ============================================

// ============================================
// 設定（統一從 config.ts 讀取）
// ============================================

import { config } from '@/shared/config/config';
import { logger } from '@/shared/logger/logger';
import { providerRegistry } from '@/modules/ai/providers';
import type { ChatMessage, LLMCallOptions } from '@/modules/ai/providers';

// ============================================
// Provider 追蹤 — delegated to providerRegistry
// ============================================
export function getLastAIProvider(): string { return providerRegistry.getLastUsed(); }
export function wasFallbackUsed(): boolean { const p = providerRegistry.getLastUsed(); return p !== 'deepseek' && p !== 'none'; }

// ============================================
// ⚠️ Legacy direct API calls extracted to ai/services/ai-legacy.ts
// Sprint 77: Dead code — zero runtime consumers. Provider-specific logic
//          now lives exclusively in ai/providers/.
// ============================================

// ============================================
// Bounded Context: Provider Orchestration
// Owner: ai/providers/provider-registry.ts
// ============================================
export async function callLLM(
  messages: ChatMessage[],
  options?: LLMCallOptions
): Promise<string> {
  const result = await providerRegistry.call(messages, options);
  return result.text;
}

// ============================================
// 一、練習題目生成
// ============================================

export interface GenerateQuestionsInput {
  grammarItem?: string;
  grammarItemZh?: string;
  languageSkill?: string;
  languageSkillZh?: string;
  difficulty: 'remedial' | 'core' | 'challenge';
  gradeLevel: string;
  count?: number;
  questionType?: 'mc' | 'fill-blank' | 'error-correction' | 'short-writing' | 'matching';
  topic?: string;
  /** DeepSeek user_id for per-user concurrency isolation */
  userId?: string;
}

export interface GeneratedQuestion {
  type: string;
  prompt: string;
  promptZh?: string;
  choices?: string[];
  answer: string;
  explanationZh: string;
  explanationEn: string;
  commonMistake: string;
  grammarPoint?: string;
  /** 聆聽題：獨立聆聽內容（對話/段落） */
  listeningContent?: string;
  listeningContentZh?: string;
  /** 閱讀題：獨立閱讀篇章 */
  readingContent?: string;
  readingContentZh?: string;
}

const MCQ_LETTERS = ['A', 'B', 'C', 'D'] as const;

function toMcqLetter(index: number): string {
  return MCQ_LETTERS[index] || 'A';
}

function stripMcqPrefix(choice: string): string {
  return choice
    .trim()
    // A. / (A) / A) / 1. / (1)
    .replace(/^\s*\(?\s*(?:[A-Da-d]|[1-4])\s*\)?\s*[\].:：)\-、]\s*/u, '')
    // A followed by space (looser, only for letter prefixes, NEVER number prefixes)
    .replace(/^\s*\(?\s*(?:[A-Da-d])\s*\)?\s+/u, '')
    // T: / F) / True: / False. — only when followed by punctuation
    .replace(/^\s*\(?\s*(?:T|F|True|False)\s*\)?\s*[\].:：)\-、]\s*/iu, '')
    .replace(/^\s*\(?\s*(?:T|F|True|False)\s*\)?\s+/iu, '')
    .trim();
}

function normalizeMcqAnswer(answerRaw: string, normalizedChoices: string[]): string {
  const answer = answerRaw.trim();
  if (!answer) return 'A';

  const letterMatch = answer.match(/\b([A-D])\b/i);
  if (letterMatch) return letterMatch[1].toUpperCase();

  const numberMatch = answer.match(/\b([1-4])\b/);
  if (numberMatch) return toMcqLetter(Number(numberMatch[1]) - 1);

  const normalizedAnswerText = stripMcqPrefix(answer).toLowerCase();
  const choiceIndex = normalizedChoices.findIndex(c => c.toLowerCase() === normalizedAnswerText);
  if (choiceIndex >= 0) return toMcqLetter(choiceIndex);

  const tfMatch = normalizedAnswerText.match(/^(true|false|t|f)$/i);
  if (tfMatch) {
    const target = tfMatch[1].toLowerCase().startsWith('t') ? 'true' : 'false';
    const tfChoiceIndex = normalizedChoices.findIndex(c => c.trim().toLowerCase().startsWith(target));
    if (tfChoiceIndex >= 0) return toMcqLetter(tfChoiceIndex);
  }

  // Failed all matching attempts — log warning before defaulting
  logger.warn({ module: 'ai-service', answerRaw: answerRaw.slice(0, 80), choices: normalizedChoices.join('|').slice(0, 120) }, 'normalizeMcqAnswer: could not match answer to any choice, defaulting to A');
  return 'A';
}

// STRICT_ANSWER_RULES extracted to src/lib/ai/prompts/answer-rules.ts

function normalizeAnswer(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[\u2018\u2019\u201C\u201D]/g, "'")
    .replace(/[""]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[.!?,;:]$/, '');
}

/** 答案一致性自動修正：不只看警告，更主動修復常見不匹配問題。
 *  v2.0: 新增 `rejected` 旗標 — 聆聽/閱讀題答案完全無法在內容中找到時拒絕該題。 */
export function validateAndFixQuestion(q: GeneratedQuestion, index: number): { fixed: GeneratedQuestion; warnings: string[]; rejected: boolean } {
  const warnings: string[] = [];
  const fixed = { ...q };
  const rejected = false;

  // 1. MCQ：答案必須指向 choices 中的某個選項
  if (fixed.type === 'mc' && fixed.choices && fixed.choices.length > 0) {
    const answerRaw = (fixed.answer || '').trim();
    const answerLetter = answerRaw.toUpperCase();
    const letterIndex = MCQ_LETTERS.indexOf(answerLetter as typeof MCQ_LETTERS[number]);

    if (letterIndex >= 0 && letterIndex < fixed.choices.length) {
      // 答案字母有效
    } else {
      // 嘗試比對完整文字
      const normAnswer = normalizeAnswer(answerRaw);
      const matchIndex = fixed.choices.findIndex(c =>
        normalizeAnswer(stripMcqPrefix(c)) === normAnswer
      );

      if (matchIndex >= 0) {
        fixed.answer = toMcqLetter(matchIndex);
        warnings.push(`Q${index}: auto-fixed answer "${answerRaw}" → "${fixed.answer}"`);
      } else {
        warnings.push(`Q${index}: answer "${answerRaw}" does not match any choice`);
      }
    }

    // MCQ 選項品質檢查：拒絕碎片化選項（如 "30"、"00"）和無效格式
    for (let ci = 0; ci < fixed.choices.length; ci++) {
      const choice = stripMcqPrefix(fixed.choices[ci] || '');
      // 檢查是否為裸數字碎片（少於 3 字元的純數字或含冒號碎片）
      if (/^[\d:.\s]{1,3}$/.test(choice) && !/^\d{1,2}:\d{2}/.test(choice)) {
        warnings.push(`Q${index}: choice ${MCQ_LETTERS[ci]} "${choice}" looks like a number fragment — likely AI generation error`);
      }
      // 檢查 "All of the above"（非 DSE 格式）
      if (/all\s*of\s*the\s*above/i.test(choice)) {
        warnings.push(`Q${index}: choice ${MCQ_LETTERS[ci]} "All of the above" is not DSE-compatible`);
      }
    }
  }

  // 2. 聆聽題：答案文字必須出現在 listeningContent 中（MC 和非 MC 皆檢查）
  if (fixed.listeningContent && fixed.answer) {
    const answerToCheck = fixed.choices && fixed.choices.length > 0
      ? (() => {
          const letterIndex = MCQ_LETTERS.indexOf(fixed.answer.trim().toUpperCase() as typeof MCQ_LETTERS[number]);
          return letterIndex >= 0 && letterIndex < fixed.choices.length ? fixed.choices[letterIndex] : fixed.answer;
        })()
      : fixed.answer;

    const normListening = normalizeAnswer(fixed.listeningContent);
    const normAnswer = normalizeAnswer(answerToCheck);

    if (!normListening.includes(normAnswer)) {
      const words = normAnswer.split(' ');
      const lastTwo = words.slice(-2).join(' ');
      const lastThree = words.slice(-3).join(' ');
      if (!normListening.includes(lastThree) && !normListening.includes(lastTwo)) {
        // v2.1: 聆聽題不再因 exact text match 失敗而拒絕題目。
        // 自然對話中答案可能以同義詞/改寫方式呈現，exact match 過於嚴格。
        // AI prompt 中已有 Self-Check 指令確保答案存在於 listeningContent，
        // 此處降級為 warning 而非 rejection。
        const warnMsg = `[Listening Consistency] Q${index}: answer "${answerToCheck}" not found verbatim in listeningContent — kept with warning (synonyms/paraphrase may be used)`;
        logger.warn({ module: 'ai-service' }, warnMsg);
        warnings.push(warnMsg);
        // rejected = true;  // v2.1: 不再因 listening exact match 失敗而拒絕
      }
    }
  }

  // 3. 閱讀題：關鍵詞檢查（MC 和非 MC 皆檢查）
  if (fixed.readingContent && fixed.answer) {
    const answerToCheck = fixed.choices && fixed.choices.length > 0
      ? (() => {
          const letterIndex = MCQ_LETTERS.indexOf(fixed.answer.trim().toUpperCase() as typeof MCQ_LETTERS[number]);
          return letterIndex >= 0 && letterIndex < fixed.choices.length ? fixed.choices[letterIndex] : fixed.answer;
        })()
      : fixed.answer;

    const normReading = normalizeAnswer(fixed.readingContent);
    const normAnswer = normalizeAnswer(answerToCheck);
    const keyWords = normAnswer.split(' ').filter(w => w.length > 3);
    const missing = keyWords.filter(kw => !normReading.includes(kw));
    if (missing.length === keyWords.length && keyWords.length > 0) {
      logger.warn({ module: 'ai-service', questionIndex: index }, `no keywords from answer in readingContent`);
    }
  }

  return { fixed, warnings, rejected };
}

export function normalizeGeneratedQuestions(questions: GeneratedQuestion[]): GeneratedQuestion[] {
  const results: GeneratedQuestion[] = [];
  let rejectedCount = 0;

  for (const q of questions) {
    const base: GeneratedQuestion = {
      ...q,
      type: (q.type || 'mc').trim(),
      prompt: (q.prompt || '').trim(),
      promptZh: q.promptZh?.trim(),
      answer: (q.answer || '').trim(),
      explanationZh: (q.explanationZh || '').trim(),
      explanationEn: (q.explanationEn || '').trim(),
      commonMistake: (q.commonMistake || '').trim(),
      grammarPoint: q.grammarPoint?.trim(),
      listeningContent: normalizeListeningContent(q.listeningContent?.trim() || ''),
      listeningContentZh: q.listeningContentZh?.trim(),
      readingContent: q.readingContent?.trim(),
      readingContentZh: q.readingContentZh?.trim(),
      choices: Array.isArray(q.choices) ? q.choices.map(c => String(c)) : [],
    };

    if (base.type !== 'mc') {
      const { warnings, rejected } = validateAndFixQuestion(base, results.length);
      if (rejected) { rejectedCount++; continue; }
      if (warnings.length > 0) logger.warn({ module: 'ai-service', warnings }, 'Non-MC answer consistency issues');
      // Non-MC 題型答案也做基本驗證：answer 不能為空
      if (!base.answer || base.answer.trim().length === 0) {
        logger.warn({ module: 'ai-service', questionIndex: results.length }, 'Non-MC question has empty answer — rejected');
        rejectedCount++;
        continue;
      }
      // 改錯題保留 choices（若有），以便 UI 渲染 MC 選項
      const keepChoices = base.type === 'error-correction' && base.choices && base.choices.length > 0;
      results.push({ ...base, choices: keepChoices ? base.choices : [] });
      continue;
    }

    const cleanedChoices = Array.from(new Set(
      (base.choices || [])
        .map(stripMcqPrefix)
        .map(c => c.trim())
        .filter(Boolean)
    ));

    // === Fix: ensure sentence-length choices have proper ending punctuation ===
    const punctuatedChoices = cleanedChoices.map(c => {
      // Only add punctuation if the choice looks like a complete sentence
      // (starts with capital letter, has a subject+verb, >20 chars)
      const isLikelySentence =
        /^[A-Z]/.test(c) &&                     // starts with capital
        c.length > 20 &&                         // long enough to be a sentence
        /\s+(is|are|was|were|has|have|had|will|would|can|could|should|may|might|do|does|did)\s+/i.test(c) && // contains a verb
        !/[.!?]$/.test(c) &&                     // doesn't already have ending punctuation
        !/^(?:Yes|No|True|False)$/i.test(c);     // not a one-word answer

      // Don't add periods to short phrases, dates, names, etc.
      const isFragment =
        c.length < 20 ||
        /^(?:The |A |An )?\d/.test(c) ||         // starts with number
        /^\d{1,2}[:\s]/.test(c) ||               // time expression
        /^[A-Z][a-z]+(?:\s+[a-z]+){0,2}$/.test(c); // short phrase (1-3 words)

      if (isLikelySentence && !isFragment) {
        return c + '.';
      }
      return c;
    });

    // 過濾掉 DSE 不相容的選項（現在從 mcq-filters.ts 匯入）
    const isListening = !!base.listeningContent;
    const isReading = !!base.readingContent;

    const validChoices = punctuatedChoices.filter(c => {
      if (c.length < 3) return false; // 太短→碎片
      if (/^[\d:.\s]+$/.test(c) && c.length < 6) return false; // 純數字碎片
      if (BANNED_PATTERNS.some(p => p.test(c))) {
        logger.warn({ module: 'ai-service', choice: c }, 'Filtered banned choice');
        return false;
      }
      // 聆聽題不過濾時間格式選項（對話中時間是常見答案）
      if (!isListening && TIME_FRAGMENT_PATTERNS.some(p => p.test(c))) {
        logger.warn({ module: 'ai-service', choice: c }, 'Filtered time fragment choice');
        return false;
      }
      return true;
    });

    // 若過濾後不足 2 個有效選項，使用 context-aware fallback fillers
    if (validChoices.length < 2) {
      logger.error({ module: 'ai-service', validChoiceCount: validChoices.length, choices: validChoices }, 'Question has insufficient valid choices after filtering');
      const fallbackFillers = getFallbackFillers(isListening, isReading);
      while (validChoices.length < 4) {
        const filler = fallbackFillers[validChoices.length] || `Option ${validChoices.length + 1}`;
        if (!validChoices.some(c => c.toLowerCase() === filler.toLowerCase())) {
          validChoices.push(filler);
        } else {
          break;
        }
      }
    }

    const finalChoices = validChoices.slice(0, 4);
    const finalAnswer = normalizeMcqAnswer(base.answer, finalChoices);

    // 答案一致性自動修正
    const tempQuestion: GeneratedQuestion = {
      ...base,
      choices: finalChoices,
      answer: finalAnswer,
    };
    const { fixed, warnings, rejected } = validateAndFixQuestion(tempQuestion, results.length);
    if (rejected) {
      rejectedCount++;
      logger.warn({ module: 'ai-service', questionIndex: results.length }, 'Question rejected — answer not found in listeningContent');
      continue;
    }
    if (warnings.length > 0) logger.warn({ module: 'ai-service', warnings }, 'Answer auto-fix applied');

    results.push({
      ...base,
      choices: finalChoices,
      answer: fixed.answer,
    });
  }

  if (rejectedCount > 0) {
    logger.warn({ module: 'ai-service', rejectedCount, totalQuestions: questions.length }, 'Questions rejected due to answer-content mismatch');
  }

  return results;
}

// ============================================
// Listening Content 正規化（生成端安全網）
// ============================================

/** 角色標籤白名單 */
const VALID_SPEAKERS = ['Woman', 'Man', 'Boy', 'Girl'] as const;
const VALID_SPEAKER_SET = new Set<string>(VALID_SPEAKERS);
const SPEAKER_LINE_RE_STRICT = /^(Woman|Man|Boy|Girl)\s*:\s*(.+)$/i;

/** 修正單行 speaker label 格式（只做格式正規化，不改 speaker 身分） */
function sanitizeListeningLine(line: string): string {
  if (!line.trim()) return '';

  // 移除行首/行尾空白和包裹引號
  const cleaned = line.trim().replace(/^["'「『\[]+|["'」』\]]+$/g, '');

  // 嘗試匹配 speaker label 格式
  const looseMatch = cleaned.match(/^["'\[]?\s*([A-Za-z]+(?:\s+[A-Za-z0-9]+)?)\s*["'\]]?\s*[:：\-–—]\s*/);
  if (!looseMatch) return cleaned; // 無 speaker label，保留原文

  const rawSpeaker = looseMatch[1];
  const rest = cleaned.slice(looseMatch[0].length);

  // 只標準化格式，保留原始 speaker 身分
  // 正規化大小寫：Man/man/MAN → Man
  const normalized = rawSpeaker.charAt(0).toUpperCase() + rawSpeaker.slice(1).toLowerCase();

  if (!rest.trim()) return ''; // 空台詞 → 移除該行
  return `${normalized}: ${rest.trim()}`;
}

/**
 * 驗證 listeningContent 格式
 * @returns { valid: boolean; errors: string[] }
 */
function validateListeningContent(content: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!content || !content.trim()) {
    return { valid: false, errors: ['listeningContent is empty'] };
  }

  const lines = content.split(/\n/).filter(l => l.trim());
  if (lines.length < 2) {
    errors.push('對話行數過少 (<2)，無法構成有效對話');
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // 檢查是否以有效 speaker 開頭
    const match = line.match(SPEAKER_LINE_RE_STRICT);
    if (!match) {
      errors.push(`第 ${i + 1} 行格式不符：必須以 Woman:/Man:/Boy:/Girl: 開頭 → "${line.slice(0, 40)}"`);
      continue;
    }
    const speaker = match[1];
    if (!VALID_SPEAKER_SET.has(speaker)) {
      errors.push(`第 ${i + 1} 行角色標籤無效：「${speaker}」，僅允許 Woman/Man/Boy/Girl`);
    }
    // 檢查引號
    if (/[""'']/.test(line)) {
      errors.push(`第 ${i + 1} 行含引號字元：${line.slice(0, 40)}`);
    }
    // 檢查冒號後是否有內容
    if (!match[2].trim()) {
      errors.push(`第 ${i + 1} 行角色 "${speaker}" 後無台詞內容`);
    }
  }

  // 檢查是否有過多空白行
  const blankCount = content.split(/\n/).filter(l => !l.trim()).length;
  if (blankCount > lines.length) {
    errors.push(`空白行過多 (${blankCount})，可能格式異常`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * 正規化 AI 生成的 listeningContent（增強版）
 * - sanitizeListeningLine: 逐行修正 speaker 格式
 * - validateListeningContent: 輸出前驗證
 * - 記錄 warning log 供開發調試
 */
function normalizeListeningContent(raw: string): string {
  if (!raw) return '';

  // Step 1: 拆分一行內的多角色
  let content = raw
    .replace(/([^\n])\b(Woman|Man|Boy|Girl)\s*:/gi, '$1\n$2:')
    .replace(/([^\n])(Speaker\s*[AB12]?)\s*:/gi, '$1\n$2:');

  // Step 2: 逐行 sanitize
  const lines = content.split(/\n/);
  const sanitized = lines
    .map(sanitizeListeningLine)
    .filter(l => l.trim());

  // Step 3: 去除重複連續空白行
  content = sanitized.join('\n').replace(/\n{3,}/g, '\n\n').trim();

  // Step 4: 開發模式驗證
  if (process.env.NODE_ENV === 'development') {
    const validation = validateListeningContent(content);
    if (!validation.valid) {
      logger.warn({ module: 'ai-service', errors: validation.errors }, 'listeningContent validation warnings');
    }
    logger.debug({ module: 'ai-service', lines: sanitized.length, chars: content.length, preview: content.slice(0, 80) }, 'listeningContent normalized');
  }

  return content;
}

// ============================================
// 隨機題材選擇器 — 確保 AI 出題主題多元化
// ============================================

// ============================================
// DSE Validation Retry Engine + Stats
// ============================================

const _MAX_DSE_RETRIES = 2;

interface RetryStats {
  totalAttempts: number;
  retryCount: number;
  retrySuccesses: number;
  failedTopics: string[];
  lastReset: number;
}

const _retryStats: RetryStats = {
  totalAttempts: 0,
  retryCount: 0,
  retrySuccesses: 0,
  failedTopics: [],
  lastReset: Date.now(),
};

/** Reset stats (called periodically or via API) */
export function resetRetryStats(): RetryStats {
  const prev = { ..._retryStats };
  _retryStats.totalAttempts = 0;
  _retryStats.retryCount = 0;
  _retryStats.retrySuccesses = 0;
  _retryStats.failedTopics = [];
  _retryStats.lastReset = Date.now();
  return prev;
}

/** Get current retry statistics for monitoring */
export function getRetryStats(): RetryStats & { retryRate: number } {
  return {
    ..._retryStats,
    retryRate: _retryStats.totalAttempts > 0
      ? _retryStats.retryCount / _retryStats.totalAttempts
      : 0,
  };
}

/** Structured logging for validation failures */
function _logValidationFailure(
  event: string,
  skill: string,
  data: { score?: number; attempts?: number; errors?: string[]; topic?: string; grade?: string }
): void {
  logger.info({ module: 'ai-validation', event, skill, ...data }, event);
}

// ============================================
// Listening 一致性驗證器 v2.0 — post-generation QA
// ============================================

/**
 * Validate that listening questions have consistent answers, proper time formats,
 * and DSE-compliant choices. Returns a detailed report for retry decisions.
 */
export function validateListeningConsistency(questions: GeneratedQuestion[]): {
  passed: boolean;
  errors: string[];
  warnings: string[];
  questionIndices: number[]; // indices of questions that need regeneration (CRITICAL only)
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  const retryIndices: number[] = [];

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    if (!q.listeningContent) continue;

    const prefix = `[L-Listening Q${i + 1}]`;

    // 1. CRITICAL: Check listeningContent has valid dialogue structure
    const lines = q.listeningContent.split('\n').filter(l => l.trim());
    if (lines.length < 2) {
      errors.push(`${prefix} dialogue too short (<2 lines)`);
      retryIndices.push(i);
      continue;
    }

    // 2. CRITICAL: Check answer is verbatim in listeningContent
    if (q.choices && q.choices.length > 0 && q.type === 'mc') {
      const letterMatch = q.answer.trim().match(/^[A-D]$/i);
      if (letterMatch) {
        const idx = letterMatch[0].toUpperCase().charCodeAt(0) - 65;
        const answerText = q.choices[idx] || '';
        const normContent = q.listeningContent.toLowerCase().replace(/\s+/g, ' ');
        const normAnswer = answerText.toLowerCase().replace(/\s+/g, ' ').replace(/^[a-d][.)]\s*/i, '');

        if (!normContent.includes(normAnswer)) {
          errors.push(`${prefix} answer "${answerText}" NOT found verbatim in listeningContent`);
          retryIndices.push(i);
        }
      }
    }

    // 3. WARNING (not rejection): Numeric time formats — AI prompt prefers words but numbers are still valid
    const timeFragPattern = /\b\d{1,2}:\d{2}\b/g;
    const timeMatches = q.listeningContent.match(timeFragPattern);
    if (timeMatches && timeMatches.length > 0) {
      warnings.push(`${prefix} numeric time format found: ${timeMatches.join(', ')} — prefer words (e.g. 'three o'clock')`);
    }

    // 4. WARNING (not rejection): Choice format checks — informational only
    if (q.choices && q.choices.length > 0) {
      for (let ci = 0; ci < q.choices.length; ci++) {
        const choice = stripMcqPrefix(q.choices[ci] || '');
        if (/^\d{1,2}:\d{2}\s*(?:AM|PM)?$/i.test(choice)) {
          warnings.push(`${prefix} choice ${String.fromCharCode(65 + ci)} "${choice}" is numeric time format`);
        }
        if (choice.length < 3) {
          warnings.push(`${prefix} choice ${String.fromCharCode(65 + ci)} "${choice}" too short (<3 chars)`);
        }
        if (/^o'?clock$/i.test(choice)) {
          warnings.push(`${prefix} choice ${String.fromCharCode(65 + ci)} "${choice}" bare clock word`);
        }
      }
    }

    // 5. WARNING: Mixed digit+word time in listeningContent
    const mixedTimePattern = /\b\d+\s+o'?clock\b/i;
    if (mixedTimePattern.test(q.listeningContent)) {
      warnings.push(`${prefix} mixed digit+word time detected (e.g. "3 o'clock")`);
    }
  }

  return {
    passed: errors.length === 0,
    errors,
    warnings,
    questionIndices: [...new Set(retryIndices)],
  };
}

// (Topic Selection Engine extracted to src/lib/ai/topic-selector.ts)

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

  const systemPrompt = `你是一位香港中學英文科教師，熟悉 ELE KLACG 2017 課程指引及 HKDSE English Language Level Descriptors。
請根據以下要求生成英語練習題目，題目必須對齊 HKDSE 各卷別（Reading / Writing / Listening / Speaking）的能力要求。
請以純 JSON 陣列格式回覆（不要用 Markdown 代碼塊包裝）。

═══════════════════════════════════════
DSE EMPIRICAL TOPIC DATABASE — MANDATORY REFERENCE
═══════════════════════════════════════

⚠️ CRITICAL: Strictly base your topics on the DSE Empirical Topic Database derived from 2012-2024 real past papers (Paper 1/2/3).
DO NOT invent new topics not found in real DSE exams. Mimic actual DSE format, language difficulty, and task requirements.

${isListening ? `Listening reference topics (from real DSE Paper 3 past papers):
${getDSEEmpiricalTopics('listening', undefined, 5).map(t => `  • ${t}`).join('\n')}
` : ''}${isReading ? `Reading reference topics (from real DSE Paper 1 past papers):
${getDSEEmpiricalTopics('reading', undefined, 5).map(t => `  • ${t}`).join('\n')}
` : ''}${isWriting ? `Writing reference topics (from real DSE Paper 2 past papers):
${getDSEEmpiricalTopics('writing', undefined, 5).map(t => `  • ${t}`).join('\n')}
` : ''}${isSpeaking ? `Speaking reference topics (from real DSE Paper 4 past papers):
${getDSEEmpiricalTopics('listening', undefined, 3).map(t => `  • ${t}`).join('\n')}
` : ''}${!isListening && !isReading && !isWriting && !isSpeaking ? `Reference topics (from real DSE past papers):
${getDSEEmpiricalTopics('writing', undefined, 3).map(t => `  • ${t}`).join('\n')}
` : ''}

HKDSE 等級對齊指引：
- 補底(remedial) → 對應 HKDSE Level 1-2：基礎詞彙、簡單句型、明示信息提取、字面理解
- 核心(core) → 對應 HKDSE Level 3：中級詞彙、複合句、直接推論、辨識明確觀點
- 挑戰(challenge) → 對應 HKDSE Level 4-5：進階詞彙、複雜句型、深層推論、評價觀點態度、理解比喻語言

要求：
- 題目數量：${count} 題
- 技能範疇：${skillDesc}
- 難度：${diffMap[input.difficulty]}
- 年級：${input.gradeLevel}
- 題型：${effectiveQuestionType}
- ⚠️ 題材強制多樣化：你必須使用以下隨機選定的情境主題來設計題目 — "${getRandomTopicV2(isListening, isReading || isWriting || isSpeaking, input.gradeLevel)}"
  禁止使用你慣用的預設主題（如籃球選拔/蜜蜂/電影時間）。每題需有不同的對話場景。
${input.topic ? `- 主題：${input.topic}` : ''}
${isListening ? `
【DSE Paper 3 Listening 聆聽題 — v3.0 自然語速 + Intonation 強化版】

⚠️ 原創性強制要求：你必須生成 100% 原創的聽力材料。嚴禁複製、改寫、或參照任何真實 HKDSE 歷屆試題內容（含原文、答案、結構）。只能模仿 DSE 的題型風格、難度水平、語言要求。

DSE English Paper 3 佔英文科總分 30%，是四卷中比重最高的分卷。

═══════════════════════════════════════
零、內容多樣性規則（CRITICAL — 防止千篇一律）
═══════════════════════════════════════

⚠️ 嚴禁反覆使用電影/3:30/4:00 這類場景。以下是各年級題材對照表，你必須從中選取多樣化主題：

【題材對照表 — 每題必須從不同類別選取】
- S1-S3（生活化）：校園生活（學會選舉、校隊選拔、課外活動報名、功課討論）、家庭（週末計劃、家庭聚會、購物）、興趣（運動、音樂、閱讀）、日常（餐廳點餐、問路、失物報失）
- S4-S6（社會化）：兼職面試、社區服務計劃、大學開放日、文化交流活動、職場實習、環保項目、科技新聞討論、旅行計劃、選科諮詢、社會議題辯論、香港本地文化

【主題多樣性強制規則 v2.0 — CRITICAL】
1. 每道聆聽題必須使用「題材強制多樣化」參數指定的情境主題，嚴禁使用你自己的預設主題
2. 禁止連續使用相同類別的主題（校園→校園→校園），必須輪換
3. 主題必須涵蓋以下領域（輪流使用）：
   - 校園生活 (school): 學會招募、小組項目、校隊選拔、功課討論
   - 社會議題 (society): 社交媒體、網絡欺凌、心理健康、慈善籌款
   - 科技 (technology): AI 應用、智能手機、STEM 比賽、線上學習
   - 環境 (environment): 環保倡議、塑膠禁令、沙灘清潔、噪音污染
   - 文化 (culture): 節日慶祝、海外交流、多元文化日、傳統工藝
   - 健康 (health): 飲食習慣、睡眠問題、看醫生、心理健康
   - 就業 (career): 兼職面試、暑期實習、大學選科、工作假期
   - 科學 (science): 科學展、基因工程、太空探索、睡眠科學
   - 香港本地 (hk-local): 行山、博物館、飲食文化、粵語保育
   - 日常生活 (daily-life): 餐廳點餐、運動場地預訂、生日派對、客服投訴
4. 聆聽內容必須嵌入至少 3 個「內容信號詞」以提高出題品質：
   - 數據型: "statistics show", "research indicates", "according to"
   - 觀點型: "experts argue", "critics claim", "many students feel"
   - 建議型: "we should", "it is recommended", "one solution is"
   - 對比型: "on the other hand", "in contrast", "compared to"

【時間/數字以外的資訊點類型 — 必須包含至少 3 種】
1. 地點變更（例：原本在 Room 201，改到 Hall）
2. 人物/身份（例：新老師的名字、負責人是誰）
3. 原因/理由（例：為什麼活動延期）
4. 條件/限制（例：只有 S4 以上可參加、需家長同意）
5. 順序/步驟（例：先報名再繳費、先做 A 再做 B）
6. 對比/選擇（例：方案 A vs 方案 B 的優缺點）
7. 情感/態度轉變（例：從抗拒到接受、從興奮到失望）

⚠️ 若你的 listeningContent 只包含時間和數字資訊，請重新設計對話加入上述資訊點。

═══════════════════════════════════════
一、自然語速與 Intonation 控制
═══════════════════════════════════════

真實口語的語速與 intonation 受以下因素控制，你必須在 listeningContent 中自然體現：

【語速變化的觸發因素】
1. 情緒波動 → 語速變化：
   - 興奮/急切 → 加快："Wait, wait — I just remembered! The deadline is actually this Friday, not next Monday!"
   - 猶豫/不確定 → 放慢 + hesitation："Um... I'm not entirely sure, but I think it was... around 200 dollars?"
   - 緊張/壓力 → 破碎短句："Look. We need to act. Now. If we don't submit by 5pm..."
2. 語境正式度 → 整體語速：
   - 正式場合 (會議/訪問) → 清晰、中等語速、完整發音
   - 非正式場合 (朋友聊天) → 較快、多 linking/reduction
3. 重點強調 → 刻意放慢：
   - "And this is the KEY point — we MUST arrive before eight."
   - "Let me repeat: forty. Four-zero. Not fourteen."

【自然口語特徵 — 必須嵌入】
1. Linking (連音)：
   - "gonna" (going to), "wanna" (want to), "gotta" (got to)
   - "kinda" (kind of), "sorta" (sort of), "lemme" (let me)
   - 僅在非正式對話中適度使用（挑戰模式可用，補底模式減少）
2. Reduction (弱化)：
   - "d'you" (do you), "whatcha" (what are you), "don'tcha" (don't you)
   - 挑戰模式可適度使用，模擬真實自然語速
3. Hesitation (停頓/猶豫)：
   - "Um..." / "Er..." / "Well..." / "You know..." / "I mean..."
   - "Let me think... Actually, wait — it was..."
4. 重複與自我修正 (Repetition + Self-correction)：
   - "The meeting is at three — no, wait, actually at four. They changed it."
   - "It was really, really important. Like, the most important thing."
5. 填充詞 (Fillers)：
   - "like", "you know", "I mean", "sort of", "kind of", "basically", "right?"
   - 適度使用使對話自然，但不可過度
6. 情感表達 (Emotion cues)：
   - 驚喜："Oh wow! That's... that's amazing! I didn't expect that at all."
   - 失望："Oh. Right. Yeah, no, I understand. That's... that's fine."
   - 不耐煩："Look, I've told you three times already — it's on the second floor."

═══════════════════════════════════════
二、難度分層系統 (依 difficulty + gradeLevel)
═══════════════════════════════════════

【補底 (remedial) — Level 1-2】
- 語速: 偏慢 (~70% 自然語速的感覺)
- Intonation: 平穩、清晰，一個句子一個語調輪廓
- 詞彙: ~1000 詞水平，高頻詞為主，極少 idiom/phrasal verb
- 句型: 簡單句 + 少量 and/but 複合句
- 陷阱: 0-1 個（僅簡單 distraction — 說了立刻更正）
- 對話結構: 線性、可預測、單一主題
- 口語特徵: 極少 linking/reduction，不用 fillers
- 長度: 1 段對話 (至少 12 行，確保足夠內容點支撐所有題目)，2-3 位說話者
- S1-S3: 校園生活、家庭、興趣
- S4-S6: 簡單社會話題、基礎工作情境

【核心 (core) — Level 3】
- 語速: 中等 (~85% 自然語速的感覺)
- Intonation: 有變化，含疑問/確定/驚訝的語調對比
- 詞彙: ~2000 詞水平，含常見 phrasal verb、collocation
- 句型: 複合句 (if/when/although/because)、被動語態
- 陷阱: 1-2 個 (distraction + synonym replacement)
- 對話結構: 有轉折、短暫離題後回正軌
- 口語特徵: 適度 linking ("gonna", "wanna")，少量 hesitation
- 長度: 1 段對話 (至少 16 行，含 5+ 個可出題的內容點)，2-3 位說話者
- 題材: 校園活動、社區服務、文化交流、兼職工作

【挑戰 (challenge) — Level 4-5】
- 語速: 自然語速 (~100%)
- Intonation: 豐富多變，含 sarcasm、含蓄反對、enthusiasm、disappointment 等情緒層次
- 詞彙: ~3000+ 詞水平，含 idiom、進階 phrasal verb、formal/informal register 切換
- 句型: 複雜句 (倒裝、強調、分裂句)、條件句混合型
- 陷阱: 2-3 個 (distraction + synonym + speaker attitude + numerical/spelling)
- 對話結構: 多主題交錯、自然打斷、插話、修正
- 口語特徵: 自然 linking/reduction/hesitation/fillers，母語人士真實對話感
- 長度: 1 段長對話 (至少 20 行，含 6+ 個可出題的內容點) 或 2 段相關短對話（各至少 10 行），2-3 位說話者
- 題材: 社會議題、科技發展、環境保護、職業規劃、全球化

═══════════════════════════════════════
三、DSE 常見陷阱設計規範
═══════════════════════════════════════

1. Distraction (說了又改) — 必備：
   "It's at 3pm. No, sorry — 4pm. They moved it."
   題目陷阱: question asks for final time, 3pm appears as a choice

2. Synonym Replacement (同義詞替換) — 必備：
   對話說: "The project was postponed."
   題目問: "What happened to the project?" → 正確答案含 "delayed"
   選項中同時出現 "postponed" 和 "delayed" 測試學生是否理解同義關係

3. Speaker Attitude (說話者態度) — 挑戰必備：
   Woman: "Well, that's certainly... one approach. Have you considered other options?"
   → 暗示不認同但不直接說 (含蓄反對)
   題目: "How does the woman feel about the man's suggestion?"
   答案不從單句提取，需綜合語氣判斷

4. Numerical Precision (數字精準) — 必備：
   - 相似數字: thirteen vs thirty, 14 vs 40
   - 時間變化: 3:15 → "quarter past three" vs "three fifteen"
   - 價格格式: "$2.50" vs "two dollars fifty" vs "two fifty"

5. Name/Spelling (名字串法) — 可選：
   對話中清晰串出名字: "It's T-A-N-G, Tang."

6. Inference (推論) — 挑戰必備：
   不直接給答案，學生需從上下文推論。
   "I've been hitting the books every night this week." → 推論此人正在準備考試
   ⚠️ 推論題關鍵規則：對話必須提供足夠線索使正確答案成為唯一合理推論。
   若對話中沒有線索能排除其他選項（例如對話只說 "Let's meet at 3:30" 就問原因），
   這種題目不可出 — 改為事實提取題。

═══════════════════════════════════════
四、題型設計規範
═══════════════════════════════════════

依難度自動組合題型：
- remedial:  2 MCQ + 2 fill-blank + 1 short answer
- core:      2 MCQ + 1 fill-blank + 1 form-filling + 1 matching
- challenge: 1 MCQ + 1 fill-blank + 1 inference + 1 speaker attitude + 1 summary completion

每種題型的設計要點：
1. MCQ: 4 個 plausible options，distractor 必須看似合理。挑戰模式選項用 synonym 測試同義理解。
   - ⚠️ MCQ 選項格式強制規則：
     - 時間答案必須是完整時間格式（如 "4:00 PM"、"4 o'clock"、"four o'clock"），嚴禁只輸出 "00" 或 "30" 等碎片
     - 數字答案必須帶單位或上下文（如 "$50"、"15 minutes"、"3 times"），嚴禁裸數字
     - 每個選項必須是完整的、可直接理解的答案，學生看到就能判斷對錯
     - 禁止使用 "All of the above" 作為選項（DSE 不採用此格式）
     - distractor 必須與正確答案屬同一語義類別（時間題的 distractor 必須是其他時間，不可混入不相關內容）
2. Fill-blank: 答案 verbatim 來自 listeningContent。可能是數字/日期/名稱/關鍵詞。
3. Form-filling: 模擬表格填寫，提供欄位標題，答案從對話中提取。
4. Matching: 提供 4-5 個選項配對到 3-4 個問題。
5. Inference: "What can we infer about...?" / "What does X imply when saying...?"
6. Speaker Attitude: "How does the woman feel about...?" / "What is the man's attitude towards...?"
7. Summary Completion: 提供一段有缺漏的摘要，學生從聽力中補全。

═══════════════════════════════════════
五、答案精準度規則 (STRICT)
═══════════════════════════════════════

1. MCQ answer = "A"/"B"/"C"/"D" 之一
2. 所有非 MC 答案必須 100% verbatim 出現在 listeningContent 中
3. 生成完成後必須 Self-Check：逐一核對每個 answer 是否能在 listeningContent 逐字找到
4. 若 answer 是數字或日期，確保 listeningContent 中該數字/日期的形式與答案一致
5. 若題目要求語法轉換 (singular→plural)，答案仍用 listeningContent 原形

═══════════════════════════════════════
六、DSE Listening 應試策略注入
═══════════════════════════════════════

以下策略既是給學生的技巧，也是你出題時應體現的設計原則：
- 重複即答案：重要資訊在對話中至少出現 2 次
- 轉折詞後是重點：but, however, actually, in fact, the thing is, the real issue is
- 強調詞引導答案：importantly, notably, the key point, above all, most critically
- 語氣轉變處有考點：當說話者語調明顯改變時，通常有題目
- 數字/時間/名字必須精準捕捉，這些是最常見的得分點

═══════════════════════════════════════
七、輸出格式（聆聽題特別重要！）
═══════════════════════════════════════

- listeningContent: 完整對話，每個角色一行，用真實換行 \n 分隔
  - 格式範例（每行獨立，不可擠在同一行）：
    "Boy: What time does the movie start?\nGirl: It's at 3 o'clock.\nBoy: Are you sure?\nGirl: Yes, I checked."
  - ⚠️ 嚴禁將多個角色對話擠在一行（如 "Boy: ... Girl: ... Boy: ..."），這會導致 TTS 無法區分角色
  - 每個對話行格式：角色標籤 + 半形冒號 + 空格 + 台詞
- listeningContentZh: 繁體中文情境說明
- ⚠️ 聆聽題關鍵規則（v4.0 — 每題獨立錄音）：
  - **每道題目必須有自己獨立的 listeningContent**（不再共用長錄音）
  - 每題的 listeningContent 是一段簡短獨立對話，只包含該題所需的資訊
  - 這種設計的好處：TTS 合成更快、更穩定、學生可針對單題重聽
  - 每題 listeningContent 必須是自給自足（self-contained）的迷你對話
  - 同一批題目可使用相似主題/角色，但每題的對話內容獨立
- ⚠️ 對話長度控制（CRITICAL — 確保 TTS 穩定）：
  - 每題獨立 listeningContent，含 1-3 個獨立資訊點
  - 每行 5-20 個單詞，總對話長度控制在 40-120 詞
  - 這樣確保 Google Cloud TTS 合成快速（<3 秒）且不會觸發長文本錯誤
- ⚠️ 題目相關性規則：每個 prompt 必須能從其對應的 listeningContent 中找到答案
  - 不可出與對話內容無關的題目
  - 每個 prompt 的正確答案必須在 listeningContent 中有明確依據
  - ⚠️ 推論題（Inference）特別規範：
    - 推論題僅限挑戰（challenge）難度使用
    - 對話中必須有足夠的上下文線索，使正確答案是唯一合理的推論
    - 反例（BAD）：對話只說 "Let's meet at 3:30"，就問 "Why does she suggest 3:30?" 
      → 對話沒有給出原因，任何推論都是猜測，這種題目不可出
    - 正例（GOOD）：對話說 "The movie starts at 4. It takes about 30 minutes to get there."
      女孩說 "Let's meet at 3:30 then." → 可以合理推論原因是 "To have enough time"
    - 驗證方法：出完推論題後自問：「對話中是否有線索能排除其他所有選項？」
      若答案為否 → 該題必須改為事實提取題（答案直接在對話中明示）
  - 出題前先確認：這條題目的答案真的在對話裡嗎？
- ⚠️ 聆聽題 Self-Check（輸出前逐題驗證）：
  - Q1 出完後，Q2-Q5 的每個 prompt 必須重新對照 listeningContent 確認答案確實存在
  - 若某題的答案在 listeningContent 中找不到 → 該題必須重出，不可輸出無關題目
  - 嚴禁出現「對話內容是講電影時間，題目卻問放學去哪裡」這類不相關題目
- 所有中文使用繁體中文
- 嚴禁使用 A/B/Speaker A/Speaker B 等字母標籤 — 只用性別+年齡角色標籤
- ⚠️ 角色標籤白名單（TTS 朗讀相容性 — 只可使用以下四種，其他一律禁止）：
  - 只允許：Boy / Girl / Man / Woman
  - 嚴禁：Librarian、Student、Teacher、Customer、Waiter、Doctor、Nurse、Interviewer、Host、Presenter、Announcer、Operator 等任何職業/身份標籤
  - 原因：TTS 引擎只認得 Boy/Girl/Man/Woman 四種角色標籤來選擇不同語音。使用其他標籤（如 Librarian、Student）會被 TTS 當作台詞朗讀出來，嚴重影響聆聽體驗。
  - 請根據對話情境，將所有角色映射到 Boy/Girl（青少年/學生）或 Man/Woman（成人）

【對話長度統一規範 — 每題獨立 listeningContent】
每題 listeningContent 是一段獨立自足的對話，不與其他題共用。
行數要求（按難度）：
- 補底 (remedial)：6-8 行（答案明示，角色清晰）
- 核心 (core)：8-12 行（含 1 個干擾資訊點）
- 挑戰 (challenge)：12-16 行（需推論，多個資訊點）

⚠️ 角色標籤格式（TTS CRITICAL — 必須 100% 符合）：
每行必須嚴格符合以下格式，否則 TTS 會朗讀出標籤文字：
  ✅ Woman: This is the correct format.
  ✅ Man: Only these four roles are allowed.
  ✅ Boy: No quotes, no brackets, no full-width colon.
  ✅ Girl: One space after the colon.
  ❌ "Woman": ...     （有引號）
  ❌ Woman : ...      （冒號前有空格）
  ❌ WOMAN: ...       （全大寫）
  ❌ [Woman]: ...     （有括號）
  ❌ Librarian: ...   （職業標籤）
  ❌ Student: ...     （身份標籤）

生成後自我檢查（輸出前必做）：
1. 每行是否以 Woman/Man/Boy/Girl 開頭？
2. 冒號後是否只有一個空格，無引號無括號？
3. 每題行數是否符合難度要求？
若有不符 → 立即修正再輸出。` : ''}
${isWriting ? `
【DSE Paper 2 Writing 寫作題 — 短文寫作】

⚠️ 必須生成原創寫作提示，嚴禁複製真實 DSE 歷屆試題。

要求：
- prompt 欄位：一個具體的短文寫作題目（30-80字），包含情境、角色、任務、具體要求
- answer 欄位：提供一個範例答案（80-150字），展示如何回應題目要求
- 題目必須貼近香港中學生的生活經驗（校園、家庭、社會議題、個人成長等）
- 根據年級調整題目複雜度：S1-S3 較簡單主題，S4-S6 DSE程度
- choices 欄位設為空陣列 []
- 所有中文使用繁體中文
` : ''}${isSpeaking ? `
【DSE Paper 4 Speaking 口語練習題】

⚠️ 必須生成原創口語練習題目，模擬 DSE Group Discussion 或 Individual Response 格式。

要求：
- prompt 欄位：一個口語討論題目或個人回應題目（20-50字）
  - Group Discussion 格式：提供一個爭議性話題，要求學生表達立場並給理由
  - Individual Response 格式：提供一個情境問題，要求學生在1分鐘內回應
- answer 欄位：提供範例回應要點（3-5個 bullet points），不是完整答案
- choices 欄位設為空陣列 []
- 題目應適合口語表達，避免需要計算或書面推理的題目
- 根據年級調整：S1-S3 生活化話題，S4-S6 社會議題
- 所有中文使用繁體中文
` : ''}
${isReading ? `
【閱讀理解題特別要求 — 極重要！】
- readingContent: 一段完整的英文閱讀篇章（80-200字），必須在題目之前提供給學生閱讀
- 所有題目必須基於此閱讀篇章，不可無中生有
- 篇章類型根據年級調整：
  - S1-S3：故事、書信、校園海報、簡單說明文
  - S4-S6：新聞報導、議論文、社論、資訊性文章
- 篇章必須有清晰的主旨、細節、隱含信息，以便出推論題
- readingContentZh: 中文簡短篇章主題說明（例如：「一篇關於環保的新聞報導」）
- prompt: 必須是針對閱讀篇章的題目（例如："According to the passage, what is the main reason..."）

【閱讀題 JSON 輸出示例】
{
  "type": "mc",
  "prompt": "According to the passage, what is the main cause of air pollution in the city?",
  "promptZh": "根據文章，城市空氣污染的主要原因是什麼？",
  "readingContent": "Air pollution has become a serious problem in many cities around the world. In Hong Kong, the main sources of air pollution include vehicle emissions, power plants, and marine vessels. According to a 2024 government report, vehicle emissions account for approximately 40% of the city's air pollutants. The government has introduced several measures to tackle this issue, including promoting electric vehicles and improving public transportation.",
  "readingContentZh": "一篇關於香港空氣污染的短篇文章",
  "choices": ["Vehicle emissions", "Factory smoke", "Volcanic activity", "Forest fires"],
  "answer": "A",
  "explanationZh": "文章明確指出車輛排放佔城市空氣污染物的約40%，是主要來源。",
  "explanationEn": "The passage clearly states that vehicle emissions account for approximately 40% of the city's air pollutants.",
  "commonMistake": "學生可能被干擾選項誤導，應訓練直接從文本中尋找證據。",
  "grammarPoint": "Reading comprehension — identifying explicit information"
}

【聆聽題 JSON 輸出示例 — v4.0 每題獨立短對話 + 完整選項格式】
⚠️ 每題都有自己獨立的 listeningContent！以下展示 2 題的輸出結構：
[
  {
    "type": "mc",
    "prompt": "What time does the meeting start?",
    "promptZh": "會議幾點開始？",
    "listeningContent": "Boy: Do you know when the meeting starts?\nGirl: It's at 2 o'clock in the afternoon.\nBoy: Are you sure? I thought it was at 3.\nGirl: No, they changed it to 2 o'clock. I got the email this morning.",
    "listeningContentZh": "兩個學生討論會議時間。",
    "choices": ["2 o'clock in the afternoon", "3 o'clock in the afternoon", "2:30 in the afternoon", "The speaker did not say"],
    "answer": "A",
    "explanationZh": "女孩明確說會議改為2點，並收到電郵確認。",
    "explanationEn": "The girl clearly states the meeting was changed to 2 o'clock.",
    "commonMistake": "學生可能只聽到第一次提到的3點，忽略了後來的更正。",
    "grammarPoint": "Listening — identifying corrected information"
  },
  {
    "type": "mc",
    "prompt": "Where will the meeting take place?",
    "promptZh": "會議在哪裡舉行？",
    "listeningContent": "Girl: Do you remember which room we're using?\nBoy: I think it's in Room 301.\nGirl: Are you sure? Last time it was in the hall.\nBoy: Actually, they moved it to Room 401. Check the notice board.",
    "listeningContentZh": "兩個學生討論會議地點。",
    "choices": ["Room 401", "Room 301", "The hall", "The library"],
    "answer": "A",
    "explanationZh": "男孩最後更正說會議改到Room 401。",
    "explanationEn": "The boy corrected himself and confirmed Room 401.",
    "commonMistake": "學生可能記住第一次提到的Room 301，忽略了後來的更正。",
    "grammarPoint": "Listening — identifying corrected information"
  }
]
⚠️ 注意上述格式要點：
- 每題都有獨立 listeningContent（不再共用）
- 每個時間選項都是完整片語（如 "2 o'clock in the afternoon"），不是碎片
- 若你的 choices 包含碎片（"00 PM"、"30 PM"），輸出前修正。` : ''}

每題必須包含以下欄位（全部為必填）：
- type: 題型 ("mc" / "fill-blank" / "error-correction" / "short-writing")
- prompt: 英文題目問題${isListening ? '（針對聆聽內容的提問）' : isReading ? '（針對閱讀篇章的提問）' : ''}
- promptZh: 中文輔助說明
${isListening ? '- listeningContent: 英文聆聽材料（對話/獨白，50-100字）\n- listeningContentZh: 中文簡短情境說明\n' : ''}${isReading || isErrorCorrection ? `- readingContent: ${isErrorCorrection ? '含錯誤的英文句子/段落（50-150字）' : '英文閱讀篇章（80-200字）'}\n- readingContentZh: 中文簡短篇章主題說明\n` : ''}- choices: 選項陣列（MC題4個選項；其他題型給空陣列 []）
- answer: 正確答案（MC題只能是 "A" / "B" / "C" / "D" 其中之一；填充題給單詞）
- explanationZh: 繁體中文解釋（簡短）
- explanationEn: 英文解釋（簡短）
- commonMistake: 常犯錯誤（繁體中文，簡短）
- grammarPoint: 相關文法點

【難度與年級自動調節】
- 補底(remedial)：使用基礎詞彙（~1000詞水平）、簡單句型、明顯的錯誤選項
- 核心(core)：使用中級詞彙（~2000詞水平）、複合句、需要思考的干擾選項
- 挑戰(challenge)：使用進階詞彙（~3000詞水平）、複雜句型、陷阱選項
- S1-S3：題目語境以校園、家庭、興趣為主；詞彙量控制在1500以內
- S4-S6：題目語境可包含社會議題、學術話題；可使用DSE程度詞彙
${input.difficulty === 'challenge' ? '- 挑戰模式：可包含DSE歷屆題型、推論題、較長文本' : ''}
${input.difficulty === 'remedial' ? '- 補底模式：每個選項的錯誤應明顯，幫助學生建立信心' : ''}

注意：
- 題目必須貼近香港中學生的生活經驗
- 全部中文使用繁體中文
- MC題必須有恰好4個選項（A/B/C/D）
- MC題 choices 只放「選項內容文字」，不要加上 "A."、"B."、"(C)"、"T/F" 之類前綴
- 回覆必須是有效的 JSON 陣列，以 [ 開頭，以 ] 結尾

【MCQ 選項品質要求（極重要）】
- 每個選項必須是完整、有意義的英文句子或片語（至少3個單詞），不可只有單個單詞或字母
- 嚴禁使用 True/False 題型格式（例如 "T: ..." / "F: ..." / "True ..." / "False ..."）
- 所有選項必須屬於同一語法形式（如全部名詞片語、全部完整句子、全部動詞片語）
- 干擾選項必須看起來合理（plausible distractor），不可明顯荒謬
- 選項長度應大致相近，不可有某個選項明顯過長或過短
- 選項之間不可有重疊或包含關係
- ⚠️ 時間/數字答案 — 完整格式強制規則（CRITICAL）：
  - 時間：必須是 "4:00 PM" / "4 o'clock" / "four o'clock" / "4 o'clock in the afternoon" 這種完整格式
  - 數字：必須帶單位或上下文，如 "$50" / "15 minutes" / "3 times"
  - ❌ 嚴禁碎片： "00" / "30" / "00 PM" / "30 PM" / "5:00"（無 AM/PM）/ 任何裸數字
  - ❌ 嚴禁輸出片段時間文字如 "30 PM"（這種文字沒有意義，會被系統過濾掉導致題目失效）
  - 每個時間選項必須能獨立閱讀理解（例如學生看到 "4:00 PM" 就能判斷對錯，不需要看其他選項補全）
- ⚠️ 禁止 "All of the above" / "None of the above" / "Not mentioned" — DSE 不使用此格式
  - 若 AI 輸出包含這些文字，整個選項會被系統自動過濾，可能導致題目無法使用
- ⚠️ distractor 必須與正確答案屬同一類別（時間題全部是時間、地點題全部是地點）
- ⚠️ MC 題 choices 陣列必須恰好 4 個選項，不可多也不可少
  - 生成後請自我檢查：choices.length === 4?

${STRICT_ANSWER_RULES}

${HALLUCINATION_GUARD}

【正確 JSON 輸出範例】
[
  {
    "type": "mc",
    "prompt": "Choose the correct word to complete the sentence: If I ___ rich, I would travel around the world.",
    "promptZh": "選擇正確的詞語完成句子",
    "choices": ["am", "was", "were", "will be"],
    "answer": "C",
    "explanationZh": "在第二類條件句中，if 子句使用過去式，be 動詞一律用 were。",
    "explanationEn": "In Type 2 conditionals, we use past tense in the if-clause, and 'were' is used for all persons of 'be'.",
    "commonMistake": "學生常誤用 was 代替 were，忽略了條件句中 were 的特殊用法。",
    "grammarPoint": "Type 2 Conditional (Subjunctive)"
https://afterschool.com.hk/blog/242-dse-english-paper-3-listening/  },
  {
    "type": "error-correction",
    "prompt": "The passage below contains ONE grammatical error. Which underlined part is incorrect?",
    "promptZh": "以下段落包含一個文法錯誤，哪個劃線部分是錯誤的？",
    "readingContent": "She has been making pottery since she was a child, and she still enjoys to create new pieces. Her works are inspired by traditional Chinese designs.",
    "readingContentZh": "她從小就開始製作陶器，至今仍然享受創作新作品。她的作品靈感來自中國傳統設計。",
    "choices": ["has been making", "since she was a child", "enjoys to create", "are inspired by"],
    "answer": "C",
    "explanationZh": "「enjoys to create」錯誤，'enjoy' 後應接動名詞（gerund），正確為「enjoys creating」。",
    "explanationEn": "'enjoys to create' is incorrect. After 'enjoy', always use a gerund: 'enjoys creating'.",
    "commonMistake": "學生常混淆動名詞與不定詞的用法，例如 'enjoy to do'、'suggest to go' 是常見錯誤。",
    "grammarPoint": "Gerunds vs Infinitives"
  }
]`;

  const userPrompt = `請生成 ${count} 道 ${skillDesc}（${diffMap[input.difficulty]}程度，${input.gradeLevel}）的${effectiveQuestionType === 'mc' ? '選擇題' : effectiveQuestionType === 'fill-blank' ? '填充題' : effectiveQuestionType === 'error-correction' ? '改錯題' : effectiveQuestionType === 'short-writing' ? '短文寫作題' : '練習題'}。`;

  // 注入 DSE RAG context（若有）
  const finalSystemPrompt = systemPrompt + dseContextPrompt;

  // ============================================
  // Generation with retry — ensure question count + quality
  // ============================================
  const MAX_RETRIES = 2;
  let lastError = '';
  
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    // On retry: force different topic and slightly lower temperature
    const retryTopic = attempt > 0 ? getRandomTopicV2(isListening, isReading, input.gradeLevel) : undefined;
    const retryPrompt = attempt > 0
      ? `\n\n⚠️ RETRY INSTRUCTION: Previous attempt produced insufficient or low-quality questions. Please generate EXACTLY ${count} questions with COMPLETE fields. Use topic: "${retryTopic}". Ensure every question has a valid answer that appears verbatim in the listening/reading content.\n\nDO NOT use the same scenarios or topics as before.`
      : '';
    
    const effectiveSystemPrompt = finalSystemPrompt + retryPrompt;

  const result = await callLLM(
    [
      { role: 'system', content: effectiveSystemPrompt },
      { role: 'user', content: userPrompt },
    ],
    { temperature: attempt > 0 ? Math.max(0.3, qTemperature - 0.15) : qTemperature, maxTokens: isListening ? 4096 : 2048, jsonMode: true, timeoutMs: 25000, userId: input.userId }
  );

  const tryValidate = (rawText: string) => {
    const parsed = parseGeneratedQuestions(rawText);
    const normalized = normalizeGeneratedQuestions(parsed);
    const validated = validateAIResponse(GeneratedQuestionsArraySchema, normalized);
    if (!validated.success) {
      throw new Error(validated.error);
    }
    return validated.data;
  };

  try {
    const questions = tryValidate(result);
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

    return tryValidate(repaired);
  }
  } // end retry loop

  // Fallback (shouldn't normally be reached)
  return [];
}

/**
 * 穩健地解析 AI 生成的題目 JSON
 */
function parseGeneratedQuestions(raw: string): GeneratedQuestion[] {
  const parsed = parseAIJSON<GeneratedQuestion[] | { questions: GeneratedQuestion[] }>(raw);
  return Array.isArray(parsed) ? parsed : (parsed.questions || []);
}

/** 嘗試修復被截斷的 JSON */
export function repairTruncatedJSON(json: string): string | null {
  let depth = 0;
  let lastComplete = -1;

  for (let i = 0; i < json.length; i++) {
    if (json[i] === '{') depth++;
    else if (json[i] === '}') {
      depth--;
      if (depth === 0) lastComplete = i;
    }
  }

  if (lastComplete > 0) {
    const truncated = json.substring(0, lastComplete + 1);
    const openBrackets = (truncated.match(/\[/g) || []).length;
    const closeBrackets = (truncated.match(/\]/g) || []).length;
    return truncated + ']'.repeat(Math.max(0, openBrackets - closeBrackets));
  }
  return null;
}

function extractBalancedJson(raw: string): string | null {
  const startIndex = raw.search(/[\[{]/);
  if (startIndex < 0) return null;

  const openChar = raw[startIndex];
  const closeChar = openChar === '{' ? '}' : ']';
  const stack: string[] = [];
  let inString = false;
  let escaped = false;

  for (let i = startIndex; i < raw.length; i++) {
    const char = raw[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{' || char === '[') {
      stack.push(char);
      continue;
    }

    if (char === '}' || char === ']') {
      const last = stack[stack.length - 1];
      if (!last) return null;
      if ((last === '{' && char !== '}') || (last === '[' && char !== ']')) {
        return null;
      }
      stack.pop();
      if (stack.length === 0 && char === closeChar) {
        return raw.slice(startIndex, i + 1);
      }
    }
  }

  return null;
}

/** 穩健解析 AI 回傳的 JSON，處理 markdown 代碼塊、截斷等常見問題 */
export function parseAIJSON<T>(raw: string): T {
  const cleaned = raw
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();

  // 嘗試直接解析
  try { return JSON.parse(cleaned) as T; } catch { logger.debug({ module: 'ai-json' }, 'parseAIJSON: direct parse failed, trying balanced extraction'); }

  // 嘗試擷取第一段完整 JSON 區塊（可容忍前後雜訊）
  const balanced = extractBalancedJson(cleaned);
  if (balanced) {
    try { return JSON.parse(balanced) as T; } catch { logger.debug({ module: 'ai-json' }, 'parseAIJSON: balanced extraction failed, trying object extraction'); }
  }

  // 嘗試提取 JSON 物件
  const objMatch = cleaned.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try { return JSON.parse(objMatch[0]) as T; } catch { logger.debug({ module: 'ai-json' }, 'parseAIJSON: object extraction failed, trying array extraction'); }
  }

  // 嘗試提取 JSON 陣列
  const arrMatch = cleaned.match(/\[[\s\S]*\]/);
  if (arrMatch) {
    try { return JSON.parse(arrMatch[0]) as T; } catch { logger.debug({ module: 'ai-json' }, 'parseAIJSON: array extraction failed, trying repair'); }
  }

  // 嘗試修復截斷
  const repaired = repairTruncatedJSON(cleaned);
  if (repaired) {
    try { return JSON.parse(repaired) as T; } catch { logger.debug({ module: 'ai-json' }, 'parseAIJSON: repair failed, throwing'); }
  }

  throw new Error('AI 回傳格式無法解析，請重試。');
}

// ============================================
// 二、學生答案分析與批改
// ============================================

export interface AnalyzeAnswerInput {
  userId?: string;
  question: string;
  questionType: string;
  correctAnswer: string;
  studentAnswer: string;
  /** MCQ 選項列表（含完整文字，用於 AI 分析時引用實際內容） */
  choices?: string[];
  /** 聆聽題的聆聽內容（對話/段落） */
  listeningContent?: string;
  /** 閱讀題的閱讀篇章 */
  readingContent?: string;
  grammarItem?: string;
  grammarItemZh?: string;
  studentLevel?: string;
}

export interface AnswerAnalysis {
  isCorrect: boolean;
  score: number; // 0-100
  feedbackZh: string;
  feedbackEn: string;
  mistakeType: 'grammar' | 'vocabulary' | 'comprehension' | 'careless' | 'time-management' | 'chinglish' | 'none';
  explanation: string;
  improvementTip: string;
  relatedGrammarPoint?: string;
}

export async function analyzeAnswer(input: AnalyzeAnswerInput): Promise<AnswerAnalysis> {
  // ============================================
  // DSE RAG：檢索對應 Marking Scheme
  // ============================================
  let msContextPrompt = '';
  try {
    if (isDSERAGEnabled()) {
      const dseSkill: DSESkill =
        input.questionType === 'short-writing' ? 'Writing' : 'Reading';

      const msChunks = await retrieveMarkingScheme(dseSkill, 2);

      msContextPrompt = buildDSEContextPrompt(
        [],
        msChunks.map(r => ({ content: r.chunk.content, title: r.materialTitle, score: r.score })),
        'analyze_answer'
      );

      if (msContextPrompt) {
        logger.info({ module: 'dse-rag', msChunks: msChunks.length }, 'analyzeAnswer: Retrieved marking scheme chunks');
      }
    }
  } catch (err) {
    logger.warn({ module: 'dse-rag', error: err instanceof Error ? err.message : String(err) }, 'analyzeAnswer MS retrieval failed, fallback');
    msContextPrompt = '';
  }

  const systemPrompt = `${HALLUCINATION_GUARD}
你是一位香港中學英文科教師兼 HKDSE 評卷員。
請嚴格依據以下官方 HKDSE Level Descriptors 進行批改。
請以繁體中文提供詳細分析，並以純 JSON 格式回覆（以 { 開頭，以 } 結尾，不要用 Markdown 代碼塊包裝）。

⚠️ 解釋品質強制要求 (CRITICAL — 嚴禁敷衍)：
- 嚴禁只說「答案係 X 而你揀咗 Y 所以你錯」這種廢話。這類解釋 0 分。
- 必須具體解釋：正確答案 X 為什麼正確（語法規則、文意脈絡、推理過程）。
- 必須具體解釋：學生選的 Y 為什麼錯誤（犯了什麼具體錯誤、誤解了什麼）。
- 必須引用題目中的具體文字或情境來佐證你的解釋。
- 對於 MC 題，必須逐一分析每個選項為什麼對或錯（至少解釋正確答案 + 學生選的錯誤答案）。
- 解釋長度至少 80 字，不可用一句話敷衍。
- 錯誤類型 (mistakeType) 必須精準判斷，不可一律標為 "none" 或 "careless"。
  若學生真的理解錯誤，標為 "comprehension"；若語法錯誤，標為 "grammar"。

HKDSE Reading Descriptors 參考：
Level 5: 辨識複雜文本主旨/子題；評價觀點態度；追蹤論點發展並完全理解原因；在廣泛複雜文本中推論；理解隱含及比喻語言；解讀語調語氣。
Level 4: 辨識較複雜文本主旨；辨識觀點態度、追蹤論點發展；在較複雜文本中做明顯推論；從上下文推斷詞義。
Level 3: 辨識直接段落主旨；辨識明確表達的觀點；理解熟悉主題較複雜文本中的明示信息；做直接推論；從熟悉語境推斷詞義。
Level 2: 理解簡單段落主旨（有明確信號時）；區分簡單文本中的事實與意見；理解簡單文本中的明示信息；從簡單熟悉語境推斷詞義。

HKDSE Listening Descriptors 參考：
Level 5: 辨識複雜口語文本主旨/子題；評價觀點態度；在近自然語速下推論；提取明示及隱含信息；理解比喻語言；從重音語調辨識態度意圖。
Level 4: 辨識口語文本主旨；評價熟悉主題中較複雜文本的觀點；在中等語速下做明顯推論；提取明示及部分隱含信息。
Level 3: 辨識直接口語文本主旨；辨識明確表達觀點；在中等語速熟悉情境下理解明示信息；從字面語言做直接推論。

分析要點：
1. isCorrect: boolean
2. score: number (MC: 100/0; short-writing: 0-100 含任務完成度)
3. feedbackZh: string — 詳細繁體中文回饋（至少 80 字，含正確答案解釋 + 錯誤分析）
4. feedbackEn: string — 英文回饋
5. mistakeType: grammar/vocabulary/comprehension/careless/time-management/chinglish/none
6. explanation: string — 為什麼對/錯的教學說明（繁體中文，至少 80 字）
7. improvementTip: string — 具體改進建議
8. relatedGrammarPoint: string (optional)

HKDSE 對齊規則：
- MC: score 必須 100 或 0，無中間分數。
- fill-blank/error-correction: 完全正確 ≥90，部分理解 ≤70。改錯題中，數字格式（15 vs fifteen）、完整句子 vs 關鍵詞等格式差異不應扣分。內容正確即為正確。
- 改錯題 CRITICAL：學生常會寫出完整的改正後句子（如 "The meeting is next Tuesday at 3:30."），而非只寫改正的部分（如 "Tuesday"）。只要學生的完整句子中包含了正確的改正，就判定 isCorrect=true、score≥90。不要在 isCorrect 或 score 上因格式（完整句子 vs 關鍵詞）而扣分。逐字比對學生答案與正確答案是錯誤的做法。
- short-writing: 需同時考慮內容、組織、語言，不可只看文法。少於 8 詞且未回應題目者 ≤35。
- 離題或答非所問 → mistakeType=comprehension，分數 ≤30。

注意：使用繁體中文，避免簡體字。解釋要具體、適合中學生閱讀。`;

  const studentWordCount = (input.studentAnswer.match(/[A-Za-z0-9][A-Za-z0-9'\-]*/g) || []).length;

  // Build context: include choices with full text and listening/reading content
  let contextBlock = '';
  if (input.listeningContent) {
    contextBlock += `\n【聆聽內容】\n${input.listeningContent.slice(0, 2000)}\n`;
  }
  if (input.readingContent) {
    contextBlock += `\n【閱讀篇章】\n${input.readingContent.slice(0, 2000)}\n`;
  }
  if (input.choices && input.choices.length > 0) {
    const choiceLetters = ['A', 'B', 'C', 'D', 'E', 'F'];
    contextBlock += `\n【選項內容】\n${input.choices.map((c, i) => `${choiceLetters[i] || i + 1}. ${c}`).join('\n')}\n`;
  }

  const userPrompt = `題目：${sanitizeForAI(input.question)}
題型：${input.questionType}
正確答案：${sanitizeForAI(input.correctAnswer)}
學生答案：${sanitizeForAI(input.studentAnswer)}
學生答案詞數（系統計算）：${studentWordCount}
${input.grammarItemZh ? `文法項目：${input.grammarItemZh}` : ''}
${input.studentLevel ? `學生年級：${input.studentLevel}` : ''}
${contextBlock}
${input.questionType === 'error-correction' ? `⚠️ 改錯題特別說明：學生可能寫出了完整的改正後句子，而非只寫修改的部分。請檢查學生答案中是否包含了正確的改正（例如原句 "families gets" 應改為 "families get"），即使學生寫了整句也要判定為正確。` : ''}
⚠️ CRITICAL: 你的解釋必須引用上述【聆聽內容】/【閱讀篇章】/【選項內容】中的實際文字，嚴禁編造不存在於上述內容中的資訊（如虛構的「漢堡」、「薯條」等）。若正確答案是字母（如 B），請對照【選項內容】找出對應的實際選項文字（如 "the grilled chicken salad"），並在解釋中使用該文字。

請分析學生的答案。`;

  const result = await callLLM(
    [
      { role: 'system', content: systemPrompt + msContextPrompt },
      { role: 'user', content: userPrompt },
    ],
    { temperature: 0.3, maxTokens: 2048, jsonMode: true, userId: input.userId }
  );

  const analysis = parseAIJSON<AnswerAnalysis>(result);
  const validated = validateAIResponse(AnswerAnalysisSchema, analysis);
  if (!validated.success) throw new Error(validated.error);

  // MC 題強制二元分數：只有 100（正確）或 0（錯誤），AI 不可給予中間分數
  if (input.questionType === 'mc') {
    validated.data.score = validated.data.isCorrect ? 100 : 0;
  }

  return validated.data;
}

// ============================================
// 三、寫作批改與建議
// ============================================

export interface AnalyzeWritingInput {
  userId?: string;
  title: string;
  prompt: string;
  studentDraft: string;
  studentLevel?: string;
  difficulty?: string;
  textType?: string;
}

export interface WritingAnalysis {
  overallScore: number; // 0-100
  contentScore?: number;   // CLO Content 0-7
  languageScore?: number;   // CLO Language 0-7
  organizationScore?: number; // CLO Organization 0-7
  cloTotalScore?: number;   // CLO 總分 0-21
  dseLevel?: string;        // 對應 DSE Level (e.g. "5**", "4", "3")
  strengths: string[];
  weaknesses: string[];
  grammarErrors: { original: string; correction: string; explanation: string }[];
  chinglishWarnings: { original: string; suggestion: string; explanation: string }[];
  vocabularySuggestions: { original: string; suggestion: string; reason: string }[];
  structureFeedback: string;
  revisedVersion?: string;
  generalComment: string;
}

export async function analyzeWriting(input: AnalyzeWritingInput): Promise<WritingAnalysis> {
  const essayContent = sanitizeForAI(input.studentDraft);
  const countWords = (text: string): number => {
    const tokens = text
      .replace(/[\r\n]+/g, ' ')
      .trim()
      .match(/[A-Za-z0-9][A-Za-z0-9'\-]*/g);
    return tokens?.length || 0;
  };

  // ============================================
  // DSE RAG：檢索 Paper 2 Writing Marking Scheme
  // ============================================
  let writingMSContext = '';
  try {
    if (isDSERAGEnabled()) {
      const msChunks = await retrieveMarkingScheme('Writing', 3);
      writingMSContext = buildDSEContextPrompt(
        [],
        msChunks.map(r => ({ content: r.chunk.content, title: r.materialTitle, score: r.score })),
        'analyze_writing'
      );
      if (writingMSContext) {
        logger.info({ module: 'dse-rag', msChunks: msChunks.length }, 'analyzeWriting: Retrieved Writing MS chunks');
      }
    }
  } catch (err) {
    logger.warn({ module: 'dse-rag', error: err instanceof Error ? err.message : String(err) }, 'analyzeWriting MS retrieval failed, fallback');
    writingMSContext = '';
  }

  const extractTargetWords = (...texts: string[]): number | null => {
    for (const text of texts) {
      if (!text) continue;
      const m = text.match(/(?:about|around|approximately|at least)?\s*(\d{2,4})\s*words?/i);
      if (m) return Number(m[1]);
    }
    return null;
  };

  const studentWordCount = countWords(essayContent);
  const targetWords = extractTargetWords(input.prompt, input.title);

  const context = `作文題目：${input.title}
寫作要求：${input.prompt}
${input.textType ? `文本類型：${input.textType}` : ''}
${input.studentLevel ? `學生年級：${input.studentLevel}` : ''}
${targetWords ? `建議字數：${targetWords} words` : ''}
實際字數（系統計算）：${studentWordCount} words

學生作文內容：
"""
${essayContent}
"""`;

  // === Call 1：文法 + Chinglish + 總分 + 總評 + CLO 三維子分數（語言準確性） ===
  const grammarPrompt = `你是一位香港中學英文科教師兼 HKDSE English Paper 2 評卷員，擁有多年 DSE 評卷經驗。
請嚴格依據以下官方 HKDSE Paper 2 Writing 評分框架（Content / Language / Organization，簡稱 CLO）進行評分，每卷滿分 21 分（C:7 + L:7 + O:7），每卷經 2 位評卷員獨立評審。
請以純 JSON 格式回覆（以 { 開頭，以 } 結尾）。${writingMSContext}

【HKDSE Paper 2 Writing 官方評分框架 — 必須以此為唯一評分基準】

═══════════════════════════════════════
🔴 C: Content（內容）— 滿分 7 分
═══════════════════════════════════════

7 分 (Level 5**):
• 內容完全符合題目要求，貼題不離題
• 內容豐富且全面，所有觀點充分拓展（有具體 Examples、有深入闡述）
• 展現高度創意與想像力（記敘文有 twist/高潮位；議論文有獨到見解）
• 高度受眾意識（清楚讀者是誰、寫作目的為何）
• 能引起讀者興趣，展現 critical thinking / sensible 思維
• 五大鋪墊法俱全：現況切入 → 他人意見 → 表達立場 → 理據支持 → 讓步反駁

6 分 (Level 5):
• 內容完全符合題目要求
• 幾乎全部相關，大部分觀點充分拓展
• 適時展現創意與想像力
• 展現良好受眾意識

5 分 (Level 4):
• 內容符合題目要求
• 大部分相關，多數觀點有拓展
• 大部分展現創意與想像力
• 展現一般受眾意識

4 分 (Level 3):
• 內容大致符合題目要求
• 大部分相關，部分觀點有拓展
• 有數處創意與想像力
• 間中展現受眾意識

3 分 (Level 2):
• 內容僅部分滿足題目要求
• 有相關內容但存在缺口或重複資訊
• 部分觀點但未充分拓展
• 偶有受眾意識

2 分 (Level 1):
• 內容僅勉強滿足題目要求
• 間歇性相關，少數觀點且未拓展
• 可能曲解題目或包含錯誤資訊
• 幾乎缺乏受眾意識

1 分:
• 內容不足，高度依賴題目提示字眼
• 極少觀點且全未拓展，部分照抄題目
• 幾乎完全缺乏受眾意識

0 分:
• 完全不充分：完全離題/背誦/全抄題目、無法辨識為完整文章

═══════════════════════════════════════
🟡 L: Language（語言）— 滿分 7 分
═══════════════════════════════════════

7 分 (Level 5**):
• 句型極多變（very wide range of sentence structures），能純熟駕馭複雜句式
• 文法極精準，僅有極輕微偶然失誤
• 選詞細膩精準（well-chosen vocabulary），能表達微妙含義（subtleties of meaning）
• 串字及標點近乎完美
• 語域、語氣、風格（Register, Tone, Style）完全配合文體類型與目標受眾
• 語感極強，非死記硬套句型

6 分 (Level 5):
• 廣泛句式準確恰當，掌握簡單句及複雜句
• 文法大致精準，偶有常見錯誤但不影響整體清晰度
• 詞彙廣泛，有多處進階/精緻用語
• 串字及標點大部分正確
• 語域、語氣、風格配合文體類型

5 分 (Level 4):
• 多種句式準確恰當，嘗試使用複雜句
• 文法大致準確，複雜結構中偶有錯誤但不影響清晰度
• 詞彙適度廣泛且恰當
• 串字及標點足夠準確傳意
• 語域、語氣、風格大部分配合文體

4 分 (Level 3):
• 簡單句結構大致良好，偶有嘗試複雜句
• 結構傾向重複，文法錯誤有時影響理解
• 常用詞彙大致恰當
• 基本標點準確，大部分常用字拼寫正確
• 有部分語域、語氣、風格配合文體的證據

3 分 (Level 2):
• 簡短簡單句大致準確，僅零星嘗試長句/複雜句
• 文法錯誤經常影響理解
• 簡單詞彙恰當
• 常用字拼寫正確，基本標點大部分準確

2 分 (Level 1):
• 部分簡短簡單句結構準確
• 文法錯誤頻繁影響理解
• 非常簡單的詞彙，範圍有限，多依賴題目提示字眼
• 少數字拼寫正確，基本標點偶爾準確

1 分:
• 句子結構、串字及/或用詞多方面錯誤致使無法理解

0 分:
• 語言不足以評估：主要由不連貫單詞、簡短筆記式短語或不完整句子組成

═══════════════════════════════════════
🟢 O: Organization（組織）— 滿分 7 分
═══════════════════════════════════════

7 分 (Level 5**):
• 結構極度有效，觀點有邏輯地層層展開
• 段與段之間的連貫性（cohesion）極強
• Cohesive ties（連接手段）運用精妙且多樣化
• 整體結構嚴謹、精緻、完全符合文體類型要求
• Intro → Body → Conclusion 層次分明

6 分 (Level 5):
• 結構組織有效，觀點有邏輯地展開
• 大部分段落連貫清晰
• 全文 cohesive ties 運用穩健
• 整體結構連貫、精緻、配合文體類型

5 分 (Level 4):
• 結構大致組織有效，觀點有邏輯展開
• 大部分段落連貫清晰
• 全文 cohesive ties 合理
• 整體結構連貫，配合文體類型

4 分 (Level 3):
• 部分段落有明確主題
• 部分段落連貫清晰
• 部分段落有 cohesive ties
• 整體結構大致連貫，配合文體類型

3 分 (Level 2):
• 部分段落大致有明確主題
• 部分段落有簡單 cohesive ties，但連貫性有時模糊
• Cohesive devices 使用範圍有限

2 分 (Level 1):
• 部分段落反映組織主題的嘗試
• 有限度使用 cohesive devices 連結觀點

1 分:
• 嘗試組織文章結構
• 極有限度使用 cohesive devices

0 分:
• Cohesive devices 幾乎完全欠缺

═══════════════════════════════════════
📋 評卷員評分流程（Marker's Two Gates）
═══════════════════════════════════════
第一關 — Layout & Clarity（佔約一半印象分）：
1. 字體清晰度（電腦掃描本上清晰可讀）
2. Layout 是否正確 — 文體格式（Letter 有上下款/標題？Speech 有像樣的 intro/conclusion？）
3. Paragraphing — 有清楚的 intro/body/conclusion 層次；開新段建議隔一行

第二關 — Body 的 CLO 三維評分（Content / Language / Organization）

═══════════════════════════════════════
🧭 內容五大鋪墊法（"現、他、表、理、讓"）
═══════════════════════════════════════
1. 現況切入（Context）— 描述現狀引入話題
2. 他人意見（Others' Views）— 引用他人觀點/社會討論
3. 表達立場（Position）— 清晰表明自己立場/Thesis Statement
4. 理據支持（Reasons + Examples）— 提出 supporting reasons 及具體例子
5. 讓步反駁（Concession + Rebuttal）— 先承認反方論點，再逐一反駁（展現批判思維）

═══════════════════════════════════════
🚫 DSE Writing 十大常見錯誤 — 請逐項檢查
═══════════════════════════════════════
1. 審題不清/離題 → check if the essay addresses ALL parts of the writing prompt
2. 文體格式混淆 → check if the essay follows the correct text type conventions (letter format, speech structure, etc.)
3. 內容空洞，缺乏具體例子 → check if each argument has at least one specific example
4. 文法錯誤（主謂不一致、時態混亂、冠詞錯誤）
5. 用詞重複，詞彙貧乏 → check for repeated words; suggest vocabulary upgrades
6. 句式單調，全是簡單句 → check sentence variety; suggest complex structures
7. 段落結構混亂 → check if each paragraph has ONE clear topic and follows PEEL
8. 缺乏過渡詞 → check for connectors between sentences and paragraphs
9. 開頭結尾公式化 → check if intro has a hook; check if conclusion is more than "In conclusion, I have discussed..."
10. 中式英文 (Chinglish) → specific checks below

═══════════════════════════════════════
🚫 中式英文 (Chinglish) 特別檢查清單
═══════════════════════════════════════
- ❌ "Although... but..." → 英文中 although 和 but 不可並用
- ❌ "Because... so..." → 英文中 because 和 so 不可並用
- ❌ "I very like it" → 應為 "I really like it" 或 "I like it very much"
- ❌ "There have many people" → 應為 "There are many people"
- ❌ "I am agree" → 應為 "I agree"
- ❌ "Discuss about" → 應為 "discuss"（及物動詞，不需要 about）
- ❌ "According to my opinion" → 應為 "In my opinion"
- ❌ "Every coin has two sides" → cliché！用更有創意的表達
- ❌ "Last but not least" → cliché！改用 "Finally" 或 "Most importantly"
- ❌ "More and more important" → 改為 "increasingly important"

═══════════════════════════════════════
✅ 高分技巧檢查 — 學生文章是否具備
═══════════════════════════════════════
- ✅ Show, Don't Tell: 用具體描寫代替抽象陳述
- ✅ PEEL 結構: Point → Explain → Example → Link
- ✅ 讓步反駁 (Concession + Rebuttal): 先承認對方論點再反駁
- ✅ 詞彙多樣化: 避免重複基本詞彙（important → crucial/vital/paramount）
- ✅ 句式變化: 混合簡單句/複合句/倒裝句/強調句
- ✅ 首尾呼應: 結論與引言互相呼應但用詞有變化

═══════════════════════════════════════
📊 JSON 回覆格式（必須嚴格遵守）
═══════════════════════════════════════

{
  "overallScore": 52,
  "contentScore": 3,
  "languageScore": 2,
  "organizationScore": 3,
  "lengthPenalty": -15,
  "offTopicPenalty": -10,
  "grammarErrors": [
    { "original": "錯誤原文", "correction": "修正後", "explanation": "原因（繁體中文）" }
  ],
  "chinglishWarnings": [
    { "original": "中式英文原文", "suggestion": "建議改法", "explanation": "為何是中式英文（繁體中文）" }
  ],
  "generalComment": "語言準確性總評（繁體中文，50-80字）"
}

═══════════════════════════════════════
📏 評分規則（嚴格執行）
═══════════════════════════════════════
- 子分數定義：contentScore / languageScore / organizationScore 皆為 0-7 分（可用半分），必須對照上方官方 CLO 七級描述給予。
- overallScore 必須根據上述 CLO 子分數按 DSE 21 分制比例換算為 0-100，並加上 lengthPenalty 與 offTopicPenalty。換算公式：overallScore = round((contentScore + languageScore + organizationScore) / 21 * 100) + lengthPenalty + offTopicPenalty。
- Level 5** 門檻：CLO 總分 ≥ 19/21（overallScore ≥ 90）。
- Level 5 門檻：CLO 總分 ≥ 16/21（overallScore ≥ 76）。
- Level 4 門檻：CLO 總分 ≥ 12/21（overallScore ≥ 57）。
- Level 3 門檻：CLO 總分 ≥ 9/21（overallScore ≥ 43）。
- Level 2 門檻：CLO 總分 ≥ 6/21（overallScore ≥ 29）。
- Level 1 門檻：CLO 總分 ≥ 3/21（overallScore ≥ 14）。
- 若明顯離題、只寫一兩句、未回應題目要求重點，所有 CLO 子分數不可高於 2，overallScore 不可高於 30（對應 Level 1 或以下）。
- 若字數少於建議字數 50%，lengthPenalty 至少 -15；少於 30% 時至少 -25。
- 不可僅因文法正確而給高分；內容空泛、論點不足、未展開支持細節，contentScore 必須偏低（最多 3，對應 Level 2）。
- 請明確對照官方 CLO 七級描述，在 generalComment 中指出學生文章最接近哪個 HKDSE Level（1-5**），並說明原因。
- 若學生文字極短（少於 30 詞），必須在 generalComment 清楚說明扣分原因，且 overallScore 不得高於 20。
- Organization 分數尤其反映運用「複合句」的能力（主句 + 形容語 + 修飾語的混合應用），這是 Level 4 和 Level 5** 的關鍵分野。

注意：本回合重點是「嚴格 CLO 評分校準 + 語言準確性問題（文法+Chinglish）」。`.trim();

  const grammarUserPrompt = `${context}\n\n請只分析語言準確性（文法錯誤+中式英文+總分+總評）。`;

  // === Call 2：詞彙 + 結構 + 優缺點 + 修改版（寫作技巧） ===
  const stylePrompt = `你是一位香港中學英文科教師兼 HKDSE English Paper 2 評卷員，專注批改寫作技巧並提供修改範例。
請嚴格依據以下 HKDSE Paper 2 Writing 官方 CLO 評分框架（Content / Language / Organization，每項 0-7 分，滿分 21 分）進行判斷。
請以純 JSON 格式回覆（以 { 開頭，以 } 結尾）。${writingMSContext}

═══════════════════════════════════════
📋 CLO 評分基準回顧（0-7 分等級）
═══════════════════════════════════════

Content (C) 7 分制：
7 — 內容完全貼題、豐富全面、觀點充分拓展、具創意想像力、高度受眾意識
6 — 內容符合題目要求、幾乎全部相關、大部分觀點拓展、適時創意
5 — 內容符合要求、大部分相關、多數觀點拓展、大部分創意
4 — 內容大致符合、大部分相關、部分觀點拓展、數處創意
3 — 內容僅部分滿足、有缺口/重複、部分觀點未充分拓展
2 — 內容勉強滿足、間歇相關、少數觀點且未拓展
1 — 內容不足、高度依賴提示字眼、極少觀點全未拓展
0 — 完全不充分：離題/背誦/全抄

Language (L) 7 分制：
7 — 句型極多變、文法極精準（僅極輕微失誤）、選詞細膩精準、串字標點近乎完美、語域語氣風格完全配合文體
6 — 廣泛句式準確、文法大致精準、詞彙廣泛且有進階用語、語域語氣風格配合文體
5 — 多種句式準確、文法大致準確（錯誤不影響清晰）、詞彙適度廣泛恰當
4 — 簡單句大致良好、偶有複雜句、結構傾向重複、文法錯誤有時影響理解、常用詞彙恰當
3 — 簡短簡單句大致準確、零星嘗試複雜句、文法錯誤經常影響理解、簡單詞彙恰當
2 — 部分簡短句準確、文法錯誤頻繁影響理解、非常簡單詞彙範圍有限
1 — 多方面錯誤致使無法理解
0 — 語言不足以評估

Organization (O) 7 分制：
7 — 結構極度有效、觀點邏輯層層展開、段落連貫性極強、cohesive ties 精妙多樣、完全符合文體
6 — 結構有效、觀點邏輯展開、大部分連貫清晰、cohesive ties 穩健、配合文體
5 — 結構大致有效、觀點邏輯展開、大部分連貫、cohesive ties 合理
4 — 部分段落明確、部分連貫、部分 cohesive ties、大致連貫配合文體
3 — 部分段落大致明確、簡單 cohesive ties、連貫性有時模糊
2 — 部分段落反映組織嘗試、有限度 cohesive devices
1 — 嘗試組織、極有限度 cohesive devices
0 — Cohesive devices 幾乎完全欠缺

═══════════════════════════════════════
🧭 內容五大鋪墊法（Content 高分框架）
═══════════════════════════════════════
1. 現況切入（Context）— 描述現狀引入話題
2. 他人意見（Others' Views）— 引用他人觀點/社會討論
3. 表達立場（Position）— 清晰表明自己立場/Thesis Statement
4. 理據支持（Reasons + Examples）— 提出 supporting reasons 及具體例子
5. 讓步反駁（Concession + Rebuttal）— 先承認反方論點再逐一反駁

═══════════════════════════════════════
📝 DSE Writing 高分寫作策略
═══════════════════════════════════════
1. PEEL 結構: 每段 Point（論點）→ Explain（解釋）→ Example（例子）→ Link（連結下一段）
2. Show, Don't Tell: 用具體描寫代替抽象陳述（❌"He was nervous" → ✅"His palms were sweaty and his heart raced"）
3. 讓步反駁 (Concession + Rebuttal): 先承認反方觀點再反駁（"Admittedly... However..."），展現批判思維
4. 詞彙多樣化: 避免重複 basic words，使用精確的進階詞彙
5. 句式變化: 混合簡單句/複合句/倒裝句/強調句/分裂句
   - 倒裝句: "Not only does this benefit students, but it also..."
   - 強調句: "It is precisely because of this that..."
   - 分裂句: "What concerns me most is..."
6. 連接詞豐富化: Furthermore / Moreover / Nevertheless / Consequently / In stark contrast
7. 首尾呼應: 開頭的 hook 與結尾互相呼應，但用詞有變化
8. 強而有力的結論: 總結 → 擴展視野至更廣泛含義 → 留下深刻印象的最後一句

═══════════════════════════════════════
📊 詞彙升級建議清單
═══════════════════════════════════════
Important → crucial / vital / essential / paramount
Good → beneficial / advantageous / favorable / commendable
Bad → detrimental / harmful / adverse / undesirable
Show → demonstrate / illustrate / reveal / indicate
Many → numerous / a multitude of / a plethora of
Big → substantial / considerable / significant / immense
Because → due to / owing to / as a result of
But → however / nevertheless / nonetheless
So → consequently / therefore / thus / hence
Very → exceedingly / remarkably / exceptionally

═══════════════════════════════════════
📄 文本類型特定格式檢查
═══════════════════════════════════════
- Formal Letter: 上款與下款配對（Dear Sir/Madam → Yours faithfully；Dear Mr. X → Yours sincerely）？無縮寫？地址格式？
- Informal Letter: 語氣親切？有個人經歷分享？可用 short form？
- Speech: 有開場問候（Good morning/afternoon）？有修辭問句？有 audience engagement？結尾有 Thank you？
- Article: 有吸引標題？段落簡短？有個人風格？
- Report: 有 Title/Introduction/Findings/Conclusion/Recommendations？用被動語態？客觀語氣？
- Proposal: 有 Title/Background/Problem Analysis/Suggested Solution/Implementation Plan？SMART 目標？
- Argumentative Essay: 有 thesis statement？3 reasons + counter-argument + rebuttal？PEEL？
- Review: 有介紹 + 正反評價 + 總結推薦？informal/chatty style？

═══════════════════════════════════════
📊 JSON 回覆格式（必須嚴格遵守）
═══════════════════════════════════════

{
  "strengths": ["優點1（繁體中文，對照 CLO 7 分制描述）", "優點2"],
  "weaknesses": ["弱點1（繁體中文，對照 CLO 7 分制描述）", "弱點2"],
  "vocabularySuggestions": [
    { "original": "原詞", "suggestion": "建議詞", "reason": "原因（繁體中文）" }
  ],
  "structureFeedback": "文章結構評語（繁體中文，50-100字，須指出 Organization 在 CLO 7 分制中的對應等級）",
  "revisedVersion": "修正後的完整文章（保留原意，修正文法錯誤及 Chinglish，優化詞彙與句型，補足內容與細節以提升至更高 DSE Level，不可只做表面文法潤飾）"
}

═══════════════════════════════════════
📏 規則（嚴格執行）
═══════════════════════════════════════
- 若文章離題、欠缺內容重點、只列點無展開，weaknesses 必須明確指出「Content 任務完成不足（對應 CLO 1-3 分）」，不可僅評「文法可改善」。
- strengths 最多 3 點，且必須對照上方 CLO 7 分制描述，不可虛高（例如 Level 1-2 文章不可稱「詞彙豐富」或「組織精緻」）。
- revisedVersion 必須示範如何補足內容與細節以提升至更高 HKDSE Level（例如從 Level 3 提升至 Level 4-5），不可只做表面文法潤飾。
- structureFeedback 必須明確指出文章在 Organization 向度的 CLO 等級及具體改善建議。
- 文本類型格式錯誤（如 Letter 缺上下款、Speech 缺開場白）必須在 weaknesses 中明確指出。

注意：只專注詞彙選擇、句子變化、段落結構、論點組織等寫作技巧，並提供一個流暢的修改版本。不需重複文法錯誤清單（已由另一分析處理）。`.trim();

  const styleUserPrompt = `${context}\n\n請分析寫作技巧並提供修改版（詞彙建議+結構評語+優點+弱點+修改版全文）。`;

  // 並行執行兩個分析（grammar call 加入重試以提升穩定性）
  const [grammarResult, styleResult] = await Promise.all([
    (async () => {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          return await callLLM(
            [
              { role: 'system', content: grammarPrompt + writingMSContext },
              { role: 'user', content: grammarUserPrompt },
            ],
            { temperature: attempt === 0 ? 0.3 : 0.5, maxTokens: 4096, jsonMode: true, timeoutMs: 35000, userId: input.userId }
          );
        } catch (e) {
          if (attempt === 1) throw e;
          logger.warn({ module: 'analyzeWriting', error: (e as Error).message }, 'Grammar call retry after failure');
        }
      }
      throw new Error('Grammar analysis failed after retry');
    })(),
    callLLM(
      [
        { role: 'system', content: stylePrompt + writingMSContext },
        { role: 'user', content: styleUserPrompt },
      ],
      { temperature: 0.3, maxTokens: 6144, jsonMode: true, timeoutMs: 35000, userId: input.userId }
    ),
  ]);

  // 各自獨立解析，允許部分失敗
  let grammarAnalysis: {
    overallScore?: number;
    contentScore?: number;
    organizationScore?: number;
    languageScore?: number;
    lengthPenalty?: number;
    offTopicPenalty?: number;
    grammarErrors?: { original: string; correction: string; explanation: string }[];
    chinglishWarnings?: { original: string; suggestion: string; explanation: string }[];
    generalComment?: string;
  } = {};
  let styleAnalysis: {
    strengths?: string[];
    weaknesses?: string[];
    vocabularySuggestions?: { original: string; suggestion: string; reason: string }[];
    structureFeedback?: string;
    revisedVersion?: string;
  } = {};
  let grammarFailed = false;
  let styleFailed = false;

  try {
    grammarAnalysis = parseAIJSON<typeof grammarAnalysis>(grammarResult);
  } catch (e) {
    grammarFailed = true;
    logger.error({ module: 'analyzeWriting', error: (e as Error).message }, 'Grammar call JSON parse failed');
  }

  try {
    styleAnalysis = parseAIJSON<typeof styleAnalysis>(styleResult);
  } catch (e) {
    styleFailed = true;
    logger.error({ module: 'analyzeWriting', error: (e as Error).message }, 'Style call JSON parse failed');
  }

  // 兩者都失敗才拋錯
  if (grammarFailed && styleFailed) {
    throw new Error('AI 回傳格式無法解析（文法分析與寫作技巧分析皆失敗）。請縮短文章後重試。');
  }

  const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
  const ratio = targetWords && targetWords > 0 ? studentWordCount / targetWords : null;
  const deterministicLengthPenalty = ratio === null
    ? 0
    : ratio < 0.3
      ? -25
      : ratio < 0.5
        ? -15
        : ratio < 0.7
          ? -8
          : 0;

  const llmBaseScore = typeof grammarAnalysis.overallScore === 'number' ? grammarAnalysis.overallScore : 70;
  const llmLengthPenalty = typeof grammarAnalysis.lengthPenalty === 'number' ? grammarAnalysis.lengthPenalty : 0;
  const llmOffTopicPenalty = typeof grammarAnalysis.offTopicPenalty === 'number' ? grammarAnalysis.offTopicPenalty : 0;
  const contentScore = typeof grammarAnalysis.contentScore === 'number' ? grammarAnalysis.contentScore : undefined;
  const languageScore = typeof grammarAnalysis.languageScore === 'number' ? grammarAnalysis.languageScore : undefined;
  const organizationScore = typeof grammarAnalysis.organizationScore === 'number' ? grammarAnalysis.organizationScore : undefined;
  const cloTotalScore = (contentScore != null && languageScore != null && organizationScore != null)
    ? contentScore + languageScore + organizationScore
    : undefined;
  const dseLevel = cloTotalScore != null
    ? cloTotalScore >= 19 ? '5**'
    : cloTotalScore >= 16 ? '5*'
    : cloTotalScore >= 13 ? '5'
    : cloTotalScore >= 10 ? '4'
    : cloTotalScore >= 7 ? '3'
    : cloTotalScore >= 4 ? '2'
    : cloTotalScore >= 1 ? '1'
    : 'U'
    : undefined;
  const normalizedOverall = clamp(
    Math.round(llmBaseScore + Math.min(llmLengthPenalty, deterministicLengthPenalty) + llmOffTopicPenalty),
    0,
    100
  );

  // 合併結果（失敗的部分用 fallback）
  // === Rule-based Chinglish detection (supplements AI detection) ===
  const ruleChinglish = detectChinglish(essayContent);
  const ruleChinglishWarnings = ruleChinglish.map(c => ({
    original: c.found,
    suggestion: c.suggestion,
    explanation: c.pattern,
  }));
  const mergedChinglish = [
    ...(grammarAnalysis.chinglishWarnings || []),
    ...ruleChinglishWarnings.filter(
      rw => !(grammarAnalysis.chinglishWarnings || []).some(
        gw => gw.original?.toLowerCase() === rw.original?.toLowerCase()
      )
    ),
  ];

  const combined: WritingAnalysis = {
    overallScore: normalizedOverall,
    contentScore,
    languageScore,
    organizationScore,
    cloTotalScore,
    dseLevel,
    strengths: styleAnalysis.strengths || [],
    weaknesses: styleAnalysis.weaknesses || [],
    grammarErrors: grammarAnalysis.grammarErrors || [],
    chinglishWarnings: mergedChinglish,
    vocabularySuggestions: styleAnalysis.vocabularySuggestions || [],
    structureFeedback: styleAnalysis.structureFeedback || (styleFailed ? '⚠️ 寫作技巧分析暫時無法生成，請重試。' : ''),
    revisedVersion: styleAnalysis.revisedVersion || undefined,
    generalComment: grammarAnalysis.generalComment || (grammarFailed ? '⚠️ 語言準確性分析暫時無法生成，請重試。' : ''),
  };

  // 記錄部分失敗供前端顯示
  if (grammarFailed || styleFailed) {
    const failedParts = [
      grammarFailed ? '文法分析' : '',
      styleFailed ? '寫作技巧分析' : '',
    ].filter(Boolean).join('、');
    logger.warn({ module: 'analyzeWriting', failedParts }, 'Partial analysis failure');
  }

  const validated = validateAIResponse(WritingAnalysisSchema, combined);
  if (!validated.success) throw new Error(validated.error);
  return validated.data;
}

// ============================================
// 四、錯題 AI 解說
// ============================================

export interface ExplainMistakeInput {
  userId?: string;
  question: string;
  correctAnswer: string;
  studentAnswer: string;
  grammarItemZh?: string;
  studentLevel?: string;
  questionType?: string;
}

export interface MistakeExplanation {
  reasonZh: string;
  reasonEn: string;
  ruleExplanation: string;
  examples: { wrong: string; correct: string }[];
  memoryTip: string;
  relatedTopics: string[];
}

export async function explainMistake(input: ExplainMistakeInput): Promise<MistakeExplanation> {
  // ============================================
  // DSE RAG：檢索相關 Marking Scheme 以解釋錯題
  // ============================================
  let msContextPrompt = '';
  try {
    if (isDSERAGEnabled()) {
      // 根據題型判斷技能範疇
      const skillForMS: DSESkill =
        input.questionType === 'short-writing' ? 'Writing' : 'Reading';
      const msChunks = await retrieveMarkingScheme(skillForMS, 2);
      msContextPrompt = buildDSEContextPrompt(
        [],
        msChunks.map(r => ({ content: r.chunk.content, title: r.materialTitle, score: r.score })),
        'explain_mistake'
      );
      if (msContextPrompt) {
        logger.info({ module: 'dse-rag', msChunks: msChunks.length }, 'explainMistake: Retrieved MS chunks');
      }
    }
  } catch (err) {
    logger.warn({ module: 'dse-rag', error: err instanceof Error ? err.message : String(err) }, 'explainMistake MS retrieval failed, fallback');
    msContextPrompt = '';
  }
  const systemPrompt = getExplainMistakeSystemPrompt();

  const userPrompt = buildExplainMistakeUserPrompt({
    question: sanitizeForAI(input.question),
    correctAnswer: sanitizeForAI(input.correctAnswer),
    studentAnswer: sanitizeForAI(input.studentAnswer),
    grammarItemZh: input.grammarItemZh,
    studentLevel: input.studentLevel,
  });

  const result = await callLLM(
    [
      { role: 'system', content: systemPrompt + msContextPrompt },
      { role: 'user', content: userPrompt },
    ],
    { temperature: 0.5, maxTokens: 2048, jsonMode: true, userId: input.userId }
  );

  const explanation = parseAIJSON<MistakeExplanation>(result);
  const validated = validateAIResponse(MistakeExplanationSchema, explanation);
  if (!validated.success) throw new Error(validated.error);
  return validated.data;
}

// ============================================
// 四點五、AI 單字分析
// ============================================

export interface AnalyzeWordInput {
  userId?: string;
  word: string;
  gradeLevel?: string;
}

/**
 * Analyze an English word and return comprehensive vocabulary data.
 * Used by the QuickAddVocab component for automatic word analysis.
 */
export async function analyzeWord(input: AnalyzeWordInput): Promise<import('@/modules/ai/schemas/ai-schema').WordAnalysis> {
  const { WordAnalysisSchema } = await import('@/modules/ai/schemas/ai-schema');
  const word = sanitizeForAI(input.word.trim());
  const gradeLevel = input.gradeLevel || 'S4';

  const systemPrompt = `${HALLUCINATION_GUARD}
你是香港中學英語教學專家，專門幫助 S1-S6 學生建立個人化生字簿。

分析英文單字，以 JSON 格式回傳完整詞彙資料。

## 輸出格式
{
  "word": "單字",
  "partOfSpeech": "主要詞性 (noun/verb/adjective/adverb/preposition/conjunction/pronoun/phrase)",
  "allPartOfSpeech": ["所有常見詞性"],
  "meaningZh": "主要中文意思（繁體中文）",
  "secondaryMeaningZh": "次要中文意思（如有，否則 null）",
  "exampleSentence": "英文例句",
  "exampleZh": "例句中文翻譯（繁體中文）",
  "synonyms": ["同義字"],
  "antonyms": ["反義字"],
  "collocations": ["搭配詞，格式如 make a decision"]
}

## 規則
- meaningZh 使用繁體中文
- 例句難度適應 ${gradeLevel} 年級：
  S1-S2: 簡單句、基礎詞彙
  S3-S4: 中等複雜度、加入從句
  S5-S6: DSE 程度、複雜句式
- collocations 格式: "動詞 + 名詞" 或常見片語
- 不要輸出 markdown，只輸出純 JSON`;

  const result = await callLLM(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `請分析以下英文單字：${word}\n學生年級：${gradeLevel}` },
    ],
    { temperature: 0.3, maxTokens: 1024, jsonMode: true, timeoutMs: 15000, userId: input.userId }
  );

  const data = parseAIJSON(result);
  const validated = validateAIResponse(WordAnalysisSchema, data);
  if (!validated.success) throw new Error(validated.error);
  return validated.data;
}

// ============================================
// 五、學習進度分析與建議
// ============================================

export interface AnalyzeProgressInput {
  userId?: string;
  studentLevel: string;
  overallAccuracy: number;
  weakSkills: { name: string; nameZh: string; accuracy: number }[];
  recentPerformance: { date: string; accuracy: number; questionsDone: number }[];
  streakDays: number;
}

export interface ProgressAnalysis {
  summary: string;
  strengthsAreas: string[];
  urgentAreas: string[];
  recommendedFocus: { skill: string; reason: string; priority: 'high' | 'medium' | 'low' }[];
  studyPlan: string;
  encouragementMessage: string;
  estimatedTimeToImprove: string;
}

export async function analyzeProgress(input: AnalyzeProgressInput): Promise<ProgressAnalysis> {
  // ============================================
  // DSE RAG：檢索相關歷屆試題與 Marking Scheme
  // ============================================
  let dseContextPrompt = '';
  try {
    if (isDSERAGEnabled()) {
      // 根據弱項技能判斷需要檢索的 DSE 卷別
      const weakSkillNames = input.weakSkills.map(s => s.nameZh);
      const needsWriting = weakSkillNames.some(s => s.includes('寫作') || s.includes('Writing'));
      const needsReading = weakSkillNames.some(s => s.includes('閱讀') || s.includes('Reading'));
      const needsListening = weakSkillNames.some(s => s.includes('聆聽') || s.includes('Listening'));

      const skills: DSESkill[] = [];
      if (needsWriting) skills.push('Writing');
      if (needsReading) skills.push('Reading');
      if (needsListening) skills.push('Listening');
      if (skills.length === 0) skills.push('Reading', 'Writing'); // default

      const [pastPaperChunks, msChunks] = await Promise.all([
        retrievePastPaperContent(skills[0], undefined, input.overallAccuracy < 60 ? 'remedial' : 'core', undefined, 3),
        retrieveMarkingScheme(skills[0], 2),
      ]);

      dseContextPrompt = buildDSEContextPrompt(
        pastPaperChunks.map(r => ({ content: r.chunk.content, title: r.materialTitle, score: r.score })),
        msChunks.map(r => ({ content: r.chunk.content, title: r.materialTitle, score: r.score })),
        'study_help'
      );

      if (dseContextPrompt) {
        logger.info({ module: 'dse-rag', pastPaperChunks: pastPaperChunks.length, msChunks: msChunks.length }, 'analyzeProgress: Retrieved past papers + MS');
      }
    }
  } catch (err) {
    logger.warn({ module: 'dse-rag', error: err instanceof Error ? err.message : String(err) }, 'analyzeProgress RAG failed, fallback');
  }

  const systemPrompt = getProgressAnalysisSystemPrompt(dseContextPrompt);

  const weakSkillsDesc = input.weakSkills
    .map(s => `${s.nameZh} (正確率: ${s.accuracy}%)`)
    .join('、');

  const recentDesc = input.recentPerformance
    .map(p => `${p.date}: 正確率${p.accuracy}%, ${p.questionsDone}題`)
    .join('\n');

  const userPrompt = buildProgressAnalysisUserPrompt({
    studentLevel: input.studentLevel,
    overallAccuracy: input.overallAccuracy,
    streakDays: input.streakDays,
    weakSkillsDesc,
    recentDesc,
  });

  const result = await callLLM(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    { temperature: 0.6, maxTokens: 2048, jsonMode: true, timeoutMs: 15000, userId: input.userId }
  );

  const progress = parseAIJSON<ProgressAnalysis>(result);
  const validated = validateAIResponse(ProgressAnalysisSchema, progress);
  if (!validated.success) throw new Error(validated.error);
  return validated.data;
}

export interface StudyHelpInput {
  userId?: string;
  question: string;
  studentLevel: string;
  weakSkills?: { name: string; nameZh: string; accuracy: number }[];
  recentMistakes?: { mistakeType: string; questionId: string; createdAt?: string }[];
  recentPerformance?: { date: string; accuracy: number; questionsDone: number }[];
}

export interface StudyHelpResponse {
  answer: string;
  followUpTips: string[];
  recommendedFocus: string[];
}

export async function answerStudyHelp(input: StudyHelpInput): Promise<StudyHelpResponse> {
  const weakSkillsDesc = (input.weakSkills || [])
    .map(s => `${s.nameZh} (${s.accuracy}%)`)
    .join('、');

  const mistakesDesc = (input.recentMistakes || [])
    .slice(0, 5)
    .map(m => `${m.mistakeType}${m.createdAt ? ` @ ${m.createdAt}` : ''}`)
    .join('、');

  const recentDesc = (input.recentPerformance || [])
    .slice(0, 5)
    .map(p => `${p.date}: ${p.accuracy}% / ${p.questionsDone}題`)
    .join('\n');

  // ============================================
  // DSE RAG：檢索相關歷屆試題與 Marking Scheme
  // ============================================
  let dseContextPrompt = '';
  try {
    if (isDSERAGEnabled()) {
      // 根據弱項推斷主要技能
      const firstWeakSkill = (input.weakSkills || [])[0];
      const dseSkill: DSESkill = firstWeakSkill?.name
        ? (['reading', 'writing', 'listening', 'speaking'].includes(firstWeakSkill.name.toLowerCase())
            ? (firstWeakSkill.name.toLowerCase() as DSESkill)
            : 'General')
        : 'General';

      const [pastPaperChunks, msChunks] = await Promise.all([
        retrievePastPaperContent(dseSkill, input.question, undefined, input.studentLevel, 2),
        retrieveMarkingScheme(dseSkill === 'General' ? 'Reading' : dseSkill, 2),
      ]);

      dseContextPrompt = buildDSEContextPrompt(
        pastPaperChunks.map(r => ({ content: r.chunk.content, title: r.materialTitle, score: r.score })),
        msChunks.map(r => ({ content: r.chunk.content, title: r.materialTitle, score: r.score })),
        'study_help'
      );

      if (dseContextPrompt) {
        logger.info({ module: 'dse-rag', pastPaperChunks: pastPaperChunks.length, msChunks: msChunks.length }, 'studyHelp: Retrieved past papers + MS');
      }
    }
  } catch (err) {
    logger.warn({ module: 'dse-rag', error: err instanceof Error ? err.message : String(err) }, 'studyHelp RAG retrieval failed, fallback');
    dseContextPrompt = '';
  }

  const systemPrompt = `${HALLUCINATION_GUARD}
你是一位香港中學英文科私人學習顧問，熟悉 HKDSE English Language Level Descriptors（Subject / Reading / Writing / Listening / Speaking）。
請根據學生的個人背景、弱項與近期表現，對照 HKDSE 等級描述回答學生的英文學習問題。
請使用繁體中文，語氣清晰、具體、可執行。
請以純 JSON 格式回覆（以 { 開頭，以 } 結尾，不要用 Markdown 代碼塊包裝），欄位如下：
1. answer: string 直接回答學生問題（包含對照 HKDSE Level 的具體建議）
2. followUpTips: string[] 2-4個後續學習建議（對應 HKDSE 各卷別技能）
3. recommendedFocus: string[] 1-3個建議優先聚焦的技能/主題`;

  const userPrompt = `學生年級：${input.studentLevel}
弱項：${weakSkillsDesc || '暫無明顯弱項'}
近期錯題：${mistakesDesc || '暫無'}
近期表現：
${recentDesc || '暫無'}

學生問題：${sanitizeForAI(input.question)}

請根據以上學生背景，提供個人化建議。`;

  const result = await callLLM(
    [
      { role: 'system', content: systemPrompt + dseContextPrompt },
      { role: 'user', content: userPrompt },
    ],
    { temperature: 0.5, maxTokens: 2048, jsonMode: true, userId: input.userId }
  );

  const help = parseAIJSON<StudyHelpResponse>(result);
  const validated = validateAIResponse(StudyHelpResponseSchema, help);
  if (!validated.success) throw new Error(validated.error);
  return validated.data;
}

// ============================================
// 六、教材內容分析（OCR/RAG 替代方案）
// ============================================

export interface AnalyzeMaterialInput {
  userId?: string;
  title: string;
  content: string; // 教材文字內容
  gradeLevel?: string;
}

export interface MaterialAnalysis {
  summary: string;
  keyVocabulary: { word: string; meaningZh: string; exampleSentence: string }[];
  keyGrammarPoints: { point: string; explanationZh: string }[];
  suggestedQuestions: { type: string; prompt: string; answer: string }[];
  difficultyLevel: 'remedial' | 'core' | 'challenge';
  suggestedGrade: string;
}

export async function analyzeMaterial(input: AnalyzeMaterialInput): Promise<MaterialAnalysis> {
  const systemPrompt = `${HALLUCINATION_GUARD}
你是一位香港中學英文科教材分析專家。
請分析以下教材內容，以純 JSON 格式回覆（以 { 開頭，以 } 結尾，不要用 Markdown 代碼塊包裝），所有中文使用繁體中文。

回覆欄位：
1. summary: string 教材內容摘要
2. keyVocabulary: { word, meaningZh, exampleSentence }[] 關鍵詞彙（5-8個）
3. keyGrammarPoints: { point, explanationZh }[] 關鍵文法點（2-4個）
4. suggestedQuestions: { type, prompt, answer }[] 建議練習題目（3-5題）
5. difficultyLevel: remedial/core/challenge
6. suggestedGrade: string 建議適合的年級`;

  const userPrompt = `教材名稱：${input.title}
${input.gradeLevel ? `年級：${input.gradeLevel}` : ''}

教材內容：
"""
${input.content.slice(0, 8000)}
"""

請分析這份教材。`;

  const result = await callLLM(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    { temperature: 0.4, maxTokens: 4096, jsonMode: true, userId: input.userId }
  );

  const material = parseAIJSON<MaterialAnalysis>(result);
  const validated = validateAIResponse(MaterialAnalysisSchema, material);
  if (!validated.success) throw new Error(validated.error);
  return validated.data;
}

// ============================================
// 七、寫作題目生成（獨立於練習題目生成）
// ============================================

export interface GenerateWritingPromptInput {
  userId?: string;
  textType: string;
  gradeLevel: string;
  difficulty?: string;
  wordLimit: number;
  topicHint?: string;
  lang?: 'zh' | 'en';
  /** 學生弱項技能，用於針對性出題 */
  weakSkills?: string[];
}

export interface GenerateWritingOutlineInput {
  userId?: string;
  textType: string;
  gradeLevel: string;
  difficulty?: string;
  wordLimit: number;
  writingPrompt: string;
  topicHint?: string;
  lang?: 'zh' | 'en';
  /** 學生弱項技能 */
  weakSkills?: string[];
}

export interface GenerateWritingGuideInput {
  userId?: string;
  textType: string;
  gradeLevel: string;
  writingPrompt: string;
  studentDraft?: string; // 可選：學生當前草稿，提供針對性建議
  lang?: 'zh' | 'en';
}

export interface WritingGuide {
  /** 段落結構指南 */
  structureGuide: { paragraph: number; role: string; roleZh: string; tips: string; tipsZh: string }[];
  /** 實用句式 */
  usefulPhrases: { english: string; chinese: string; purpose: string }[];
  /** 常見錯誤提醒 */
  commonMistakes: { mistake: string; mistakeZh: string; correction: string; correctionZh: string }[];
  /** 詞彙升級建議 */
  vocabularyUpgrades: { basic: string; advanced: string; context: string }[];
}

/**
// (DSE_TEXT_TYPE_GUIDE / VOCAB_UPGRADES / CHINGLISH_FIXES extracted to src/lib/ai/dse-writing-data.ts)
/**
 * ✍️ 生成寫作題目 — 產出一個具體、符合 DSE 標準的作文題目
 * 整合 DSE 教學專家指引：包含情境、角色、任務、具體要求、字數
 */
export async function generateWritingPrompt(input: GenerateWritingPromptInput): Promise<string> {
  const _lang = input.lang || 'en';
  const guide = DSE_TEXT_TYPE_GUIDE[input.textType];

  const structureHint = guide
    ? `\nThis text type (${guide.name}) should include: ${guide.requiredElements.join(', ')}.\nRecommended structure: ${guide.structure.map(s => `${s.role} → ${s.keyContent}`).join(' | ')}`
    : '';

  const weakSkillHint = input.weakSkills?.length
    ? `\nThe student struggles with: ${input.weakSkills.join(', ')}. Design the prompt to specifically challenge and develop these weak areas.`
    : '';

  const systemPrompt = `You are an experienced HKDSE English Language Paper 2 examiner who has marked thousands of DSE scripts.

Create ONE complete, self-contained writing prompt that mirrors the style, complexity, and expectations of the REAL HKDSE English Paper 2 Part B.

The prompt MUST include ALL of these elements in order:
1. CONTEXT: A clear, realistic situation or background (1-2 sentences) that a Hong Kong secondary school student would relate to
2. ROLE: Who the writer is (e.g. "You are the chairperson of the Student Council", "You are the editor of your school magazine")
3. TASK: What to write, CLEARLY stating the required text type (e.g. "Write a letter to the editor...", "Write an article for your school magazine...")
4. REQUIREMENTS: 3 specific content points or guiding questions that the student MUST address. These should be concrete and checkable.
5. WORD LIMIT: "Write about ${input.wordLimit} words."

Text type: ${guide?.name || input.textType}${structureHint}
Grade: ${input.gradeLevel} (${input.gradeLevel === 'S1' || input.gradeLevel === 'S2' || input.gradeLevel === 'S3' ? 'junior secondary — school life, family, hobbies, personal experiences' : 'senior secondary — social issues, argumentative topics, DSE-level complexity'})
${input.difficulty ? `Difficulty: ${input.difficulty === 'remedial' ? '補底 (HKDSE Level 1-2) — basic vocabulary, simple sentences, explicit ideas' : input.difficulty === 'challenge' ? '挑戰 (HKDSE Level 4-5) — advanced vocabulary, complex sentence structures, deep inference, critical analysis' : '核心 (HKDSE Level 3) — intermediate vocabulary, compound sentences, direct inference'}` : ''}

═══════════════════════════════════════
DSE EMPIRICAL TOPIC DATABASE — MANDATORY REFERENCE
═══════════════════════════════════════
⚠️ CRITICAL: Strictly base the topic on real DSE Paper 2 themes from 2012-2024 past papers.
Mimic actual DSE format: situation → role → task → specific requirements → word limit.
DO NOT invent topics not found in real DSE exams.

Real DSE Paper 2 reference topics (use one as inspiration):
${getDSEEmpiricalTopics('writing', undefined, 5).map(t => `  • ${t}`).join('\n')}
${input.topicHint ? `\nTopic area: ${input.topicHint}` : ''}
For ${input.gradeLevel}${input.gradeLevel === 'S1' || input.gradeLevel === 'S2' || input.gradeLevel === 'S3' ? ' (junior), prefer topics related to school life, family, hobbies, personal experiences — avoid complex social/abstract topics' : ' (senior), prefer social issues, argumentative topics, abstract concepts at DSE complexity level'}.${weakSkillHint}

DSE QUALITY STANDARDS:
- The prompt must be SPECIFIC and ACTIONABLE — not vague. Students should know exactly what to write.
- Include 3 checkable requirements (not just "express your views")
- The context must feel REAL and RELEVANT to HK students
- The task must match the text type's genre conventions (e.g., a speech needs audience awareness; a proposal needs measurable objectives)
- Use DSE-style phrasing: "Write a letter to...", "You are...", "In your [text type], you should..."

Example of a HIGH-QUALITY DSE prompt (from real DSE 2020):
"You are the chairperson of your school's Environmental Protection Club. Your school has recently conducted a waste audit and found that 40% of campus waste comes from single-use plastics. Write a proposal to the school principal outlining a plan to make the campus plastic-free by the end of the academic year. In your proposal, you should (1) describe at least three concrete measures, (2) explain the expected benefits for the school community, and (3) address one potential challenge and how to overcome it. Write about 400 words."

CRITICAL: Output ONLY the writing prompt. No headings, no labels, no "Here is a prompt:". Just the complete, ready-to-use prompt text.`.trim();

  const userPrompt = `Create a DSE-style writing prompt. Text type: ${guide?.name || input.textType}. Grade: ${input.gradeLevel}.${input.difficulty ? ` Difficulty: ${input.difficulty}.` : ''} Word limit: ${input.wordLimit} words.${input.topicHint ? ` Topic: ${input.topicHint}.` : ''}${input.weakSkills?.length ? ` Target weak skills: ${input.weakSkills.join(', ')}.` : ''}`;

  const result = await callLLM(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    { temperature: 0.8, maxTokens: 1024, timeoutMs: 25000, userId: input.userId }
  );

  const prompt = result.trim();

  // === DSE Topic Validation (post-generation) ===
  const topicCheck = validateDSEtopicMatch(prompt, 'writing');
  if (!topicCheck.matched) {
    logger.warn({ module: 'ai-service', score: topicCheck.score.toFixed(3), matched: topicCheck.matchedKeywords }, 'Writing prompt DSE topic match LOW — may not align with real DSE Paper 2 themes.');
  } else {
    logger.info({ module: 'ai-service', score: topicCheck.score.toFixed(3), matched: topicCheck.matchedKeywords.slice(0, 5) }, 'Writing prompt DSE validation passed');
  }

  return prompt;
}

/**
 * 生成寫作大綱 — 產出中英對照、結構化的段落式大綱
 * 每個段落有獨特的具體內容，不是題目的重述
 */
export async function generateWritingOutline(input: GenerateWritingOutlineInput): Promise<string> {
  const _lang = input.lang || 'en';
  const guide = DSE_TEXT_TYPE_GUIDE[input.textType];

  // 提取文體特定的結構指引
  const structureGuide = guide
    ? guide.structure.map(s => `- Paragraph ${s.paragraph}: ${s.role} (${s.roleZh}) — ${s.keyContent}`).join('\n')
    : '';

  const commonErrors = guide
    ? guide.commonErrors.map(e => `- ❌ ${e.error} (${e.errorZh}) → ✅ ${e.fix}`).join('\n')
    : '';

  const weakSkillHint = input.weakSkills?.length
    ? `\nStudent weaknesses: ${input.weakSkills.join(', ')}. Emphasize these areas in the outline.`
    : '';

  const systemPrompt = getWritingOutlineSystemPrompt({
    gradeLevel: input.gradeLevel,
    difficulty: input.difficulty,
    textType: input.textType,
    guideName: guide?.name || input.textType,
    wordLimit: input.wordLimit,
    writingPrompt: input.writingPrompt,
    topicHint: input.topicHint,
    structureGuide,
    commonErrors,
    weakSkillHint,
  });

  const userPrompt = buildWritingOutlineUserPrompt({
    guideName: guide?.name || input.textType,
    textType: input.textType,
    gradeLevel: input.gradeLevel,
    difficulty: input.difficulty,
    wordLimit: input.wordLimit,
    writingPrompt: input.writingPrompt,
  });

  const result = await callLLM(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    { temperature: 0.7, maxTokens: 4096, timeoutMs: 25000, userId: input.userId }
  );

  return result.trim();
}

// ============================================
// 七點五、寫作即時輔助 — 結構指南 + 實用句式 + 常見錯誤
// ============================================

/**
 * ✍️ generateWritingGuide
 * 為學生提供即時寫作輔助：段落結構指南、實用句式、常見錯誤提醒、詞彙升級建議
 * 可基於學生當前草稿提供針對性建議
 */
export function generateWritingGuide(input: GenerateWritingGuideInput): WritingGuide {
  const guide = DSE_TEXT_TYPE_GUIDE[input.textType];

  // === 1. 段落結構指南 ===
  const structureGuide: WritingGuide['structureGuide'] = guide
    ? guide.structure.map(s => ({
        paragraph: s.paragraph,
        role: s.role,
        roleZh: s.roleZh,
        tips: s.keyContent,
        tipsZh: s.keyContent, // keyContent 已混合中英
      }))
    : [
        { paragraph: 1, role: 'Introduction', roleZh: '引言', tips: 'Hook + Background + Thesis/Context', tipsZh: '開首語 + 背景 + 論點/情境' },
        { paragraph: 2, role: 'Body Paragraph 1', roleZh: '主體段落一', tips: 'Topic sentence + Example + Explanation', tipsZh: '主題句 + 例子 + 解釋' },
        { paragraph: 3, role: 'Body Paragraph 2', roleZh: '主體段落二', tips: 'Topic sentence + Example + Explanation', tipsZh: '主題句 + 例子 + 解釋' },
        { paragraph: 4, role: 'Conclusion', roleZh: '結論', tips: 'Summary + Final thought + Call to action', tipsZh: '總結 + 最終觀點 + 行動呼籲' },
      ];

  // === 2. 實用句式 ===
  const usefulPhrases: WritingGuide['usefulPhrases'] = guide
    ? [
        ...guide.usefulOpeners.map(o => ({ english: o, chinese: '開首句式', purpose: 'opening' })),
        ...guide.usefulClosers.map(c => ({ english: c, chinese: '結尾句式', purpose: 'closing' })),
      ]
    : [
        { english: 'In recent years, [topic] has become a subject of considerable debate.', chinese: '近年來，[主題] 已成為廣受討論的議題。', purpose: 'opening' },
        { english: 'It is widely believed that... However, I would argue that...', chinese: '普遍認為...但我想指出...', purpose: 'opening' },
        { english: 'In conclusion, it is clear that...', chinese: '總括而言，顯然...', purpose: 'closing' },
      ];

  // === 3. 常見錯誤提醒 ===
  const commonMistakes: WritingGuide['commonMistakes'] = guide
    ? guide.commonErrors.map(e => ({
        mistake: e.error,
        mistakeZh: e.errorZh,
        correction: e.fix,
        correctionZh: e.fix,
      }))
    : [
        { mistake: 'Off-topic or not addressing all parts of the prompt', mistakeZh: '離題或未回應所有題目要求', correction: 'Circle keywords in the prompt and check off each one as you write.', correctionZh: '圈出題目關鍵詞，每寫一段就檢查是否有回應。' },
        { mistake: 'No specific examples to support arguments', mistakeZh: '缺乏具體例子支持論點', correction: 'For each argument, add at least one concrete example (data, news, personal experience).', correctionZh: '每個論點至少配一個具體例子（數據、新聞、個人經歷）。' },
        { mistake: 'Repetitive vocabulary and simple sentences only', mistakeZh: '詞彙重複、句式單調', correction: 'Use the vocabulary upgrade suggestions below. Vary sentence starters (adverbs, participle phrases, subordinate clauses).', correctionZh: '參考下方詞彙升級建議。變換句子開頭方式（副詞、分詞片語、從屬子句）。' },
      ];

  // === 4. 詞彙升級建議 ===
  const vocabularyUpgrades: WritingGuide['vocabularyUpgrades'] = VOCAB_UPGRADES.slice(0, 10);

  return {
    structureGuide,
    usefulPhrases,
    commonMistakes,
    vocabularyUpgrades,
  };
}

/**
 * ✍️ generateAdaptiveWritingGuide
 * AI 驅動的自適應寫作輔助：根據學生當前草稿提供個人化指引
 * 與 generateWritingGuide（靜態查表）互補
 */
export async function generateAdaptiveWritingGuide(
  input: GenerateWritingGuideInput
): Promise<{
  personalizedTips: string[];
  structureIssues: string[];
  suggestedNextParagraph: string;
  missingElements: string[];
}> {
  if (!input.studentDraft || input.studentDraft.trim().length < 20) {
    return {
      personalizedTips: ['開始寫作後，AI 會根據你的草稿提供個人化建議。'],
      structureIssues: [],
      suggestedNextParagraph: '先寫出你的 Introduction（Hook + Background + Thesis），然後回來查看 AI 建議。',
      missingElements: [],
    };
  }

  const guide = DSE_TEXT_TYPE_GUIDE[input.textType];
  const draftSnippet = input.studentDraft.slice(0, 2000);

  const systemPrompt = `你是一位香港 DSE English Paper 2 寫作導師，正在幫助學生即時改善他們的作文。
請根據學生的當前草稿提供簡潔、具體、可執行的建議。

文體類型：${guide?.name || input.textType}
年級：${input.gradeLevel}
${guide ? `必備元素：${guide.requiredElements.join(', ')}` : ''}

回覆純 JSON（以 { 開頭 } 結尾）：
{
  "personalizedTips": ["具體建議1", "具體建議2", "具體建議3"],
  "structureIssues": ["結構問題1", "結構問題2"],
  "suggestedNextParagraph": "建議下一段寫什麼（繁體中文，30-50字）",
  "missingElements": ["缺少的元素1", "缺少的元素2"]
}

所有中文使用繁體中文。`;

  const userPrompt = `寫作任務：${input.writingPrompt}\n\n學生當前草稿：\n"""\n${draftSnippet}\n"""\n\n請提供個人化寫作建議。`;

  try {
    const result = await callLLM(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      { temperature: 0.4, maxTokens: 1024, jsonMode: true, timeoutMs: 15000, userId: input.userId }
    );

    return parseAIJSON<{
      personalizedTips: string[];
      structureIssues: string[];
      suggestedNextParagraph: string;
      missingElements: string[];
    }>(result);
  } catch {
    logger.warn({ module: 'live-writing-coach', userId: input.userId }, 'Live writing coach failed, returning generic guidance');
    return {
      personalizedTips: ['繼續寫作，完成後可以使用 AI 批改獲得詳細分析。'],
      structureIssues: [],
      suggestedNextParagraph: '繼續發展你的下一個論點，記得使用 PEEL 結構。',
      missingElements: [],
    };
  }
}

// ============================================
// 七點六、Integrated Skills — DSE Paper 3 Part B 綜合能力訓練
// ============================================

export interface GenerateIntegratedSkillsInput {
  userId?: string;
  gradeLevel: string;
  difficulty: 'remedial' | 'core' | 'challenge';
  taskType: 'summary' | 'email-reply' | 'short-article' | 'report';
  topicHint?: string;
}

export interface IntegratedSkillsTask {
  /** 聽力材料（對話/獨白格式，供 TTS 播放） */
  listeningContent: string;
  /** 聽力主題簡介（中文） */
  listeningTopicZh: string;
  /** Note-taking 指引（告訴學生要留意什麼） */
  noteTakingGuide: { question: string; hint: string }[];
  /** 寫作任務說明（DSE 風格） */
  writingTask: string;
  /** 寫作任務類型 */
  taskType: string;
  /** 建議字數 */
  wordLimit: number;
  /** 預期內容要點（供批改時參考） */
  expectedContentPoints: string[];
  /** 聽力原文參考答案（供批改比對） */
  listeningAnswers: { question: string; answer: string }[];
}

export interface AnalyzeIntegratedSkillsInput {
  userId?: string;
  /** 原始聽力材料 */
  listeningContent: string;
  /** Note-taking 指引 */
  noteTakingGuide: { question: string; hint: string }[];
  /** 預期內容要點 */
  expectedContentPoints: string[];
  /** 寫作任務 */
  writingTask: string;
  /** 任務類型 */
  taskType: string;
  /** 學生 note-taking 內容 */
  studentNotes: string;
  /** 學生完成的寫作 */
  studentWriting: string;
  /** 學生年級 */
  gradeLevel?: string;
}

export interface IntegratedSkillsAnalysis {
  /** 總分 0-100 */
  overallScore: number;
  /** Listening 提取準確度 0-100 */
  listeningAccuracy: number;
  /** 寫作品質 0-100 */
  writingQuality: number;
  /** 內容完整度 0-100 */
  contentCompleteness: number;
  /** 語言準確度 0-100 */
  languageAccuracy: number;
  /** 組織清晰度 0-100 */
  organizationClarity: number;
  /** 已提取的要點 */
  capturedPoints: string[];
  /** 遺漏的要點 */
  missedPoints: string[];
  /** 抄襲聽力原文的段落（過度抄襲） */
  overCopyWarnings: { original: string; suggestion: string }[];
  /** 文法錯誤 */
  grammarErrors: { original: string; correction: string; explanation: string }[];
  /** 詞彙升級建議 */
  vocabularySuggestions: { original: string; suggestion: string; reason: string }[];
  /** 結構評語（繁體中文） */
  structureFeedback: string;
  /** 總評（繁體中文） */
  generalComment: string;
  /** 改進建議（繁體中文） */
  improvementTips: string[];
  /** 對應 HKDSE Level */
  estimatedLevel: string;
}

/**
 * 🎧✍️ 生成 Integrated Skills 任務
 * ⚠️ DEPRECATED inline — delegates to integrated-skills.ts
 * Import directly from '@/modules/ai/services/integrated-skills' for new code.
 */
export async function generateIntegratedSkills(
  input: GenerateIntegratedSkillsInput
): Promise<IntegratedSkillsTask> {
  const diff = INTEGRATED_SKILLS_DIFF_MAP[input.difficulty];
  const taskInfo = INTEGRATED_SKILLS_TASK_TYPE_MAP[input.taskType];

  const systemPrompt = `你是一位香港 DSE English Paper 3 評卷專家，專門設計 Integrated Skills 練習題。
⚠️ 原創性要求：必須生成 100% 原創內容，嚴禁複製或改寫任何真實 HKDSE 試題。

請生成一個完整的 Integrated Skills 任務，模擬 DSE Paper 3 Part B「聽 → 記 → 寫」的真實考試流程。

═══════════════════════════════════════
零、DSE EMPIRICAL TOPIC DATABASE — MANDATORY REFERENCE
═══════════════════════════════════════

⚠️ CRITICAL: Strictly base the listening scenario and writing task on the DSE Empirical Topic Database derived from 2012-2024 real DSE Paper 3 past papers.
Mimic actual DSE Paper 3 Part B format: listening conversation → note-taking → extended writing task.
DO NOT invent topics not found in real DSE exams.

Real DSE Paper 3 reference topics (use as inspiration for the scenario):
${getDSEEmpiricalTopics('listening', undefined, 6).map(t => `  • ${t}`).join('\n')}

═══════════════════════════════════════
一、聆聽材料 (listeningContent) 設計規則
═══════════════════════════════════════

1. 結構與長度：${diff.lines}
2. 角色標籤：Woman:/Man:/Boy/Girl:（TTS 相容，禁用 A/B/Speaker 標籤）
3. 內容密度：每 3-4 行必須包含一個可提取的 Content Point
4. 陷阱設計：${diff.traps}
5. 自然口語：linking (gonna/wanna)、reduction、hesitation (Um.../Well...)、self-correction
6. 題材多樣性（v2.1 — 每次使用不同類別，必須參考上方 Empirical Topic Database）：
   🏫 校園: 學會招募、小組項目、校隊選拔
   🌍 社會: 社區服務、網絡欺凌、心理健康
   💻 科技: AI 應用、STEM 比賽、線上學習
   🌱 環境: 環保倡議、塑膠禁令、可再生能源
   🎭 文化: 節日慶祝、海外交流、多元文化
   🇭🇰 香港: 行山計劃、博物館參觀、本地飲食文化
   💼 就業: 兼職面試、暑期實習、大學選科
7. 必須使用上方 Empirical Topic Database 中的真實主題，嚴禁重複上一題的主題類別

═══════════════════════════════════════
二、Note-taking 指引 (noteTakingGuide) — DSE 實戰技巧
═══════════════════════════════════════

提供 4-5 個引導問題，融入以下 DSE Note-taking 教學技巧：

【Note-taking 符號系統 — 請在 hint 中引導學生使用】
+ / ✓ = 優點/正面資訊
− / ✗ = 缺點/負面資訊  
→ = 導致/結果/因果
∵ = 原因/理由
∴ = 因此/所以
$ = 金錢/成本/預算
# = 數字/統計/數量
! = 重要/關鍵/必須記住
? = 不確定/需要確認
@ = 時間/日期/地點
Δ = 變化/改變/趨勢

【Content Point 信號詞 — 請在 listeningContent 中自然地使用這些信號】
- 數據型 CP: "statistics show", "research indicates", "surveys reveal", "according to"
- 觀點型 CP: "experts argue", "critics claim", "supporters believe", "many students feel"
- 建議型 CP: "we should", "it is recommended", "one solution is", "they propose"
- 問題型 CP: "the main challenge", "a key concern", "difficulties include", "issues arise"
- 對比型 CP: "on the other hand", "in contrast", "however", "compared to"

每個引導問題格式：
- question: 開放式問題 (Who/What/When/Where/Why/How/How many/How much)
- hint: 包含建議使用的符號 + 信號詞提示 (e.g. "用 $ 標記預算數字，注意 'the budget is' 之後的內容")

═══════════════════════════════════════
三、寫作任務 (writingTask) — DSE Paper 3 Part B 標準
═══════════════════════════════════════

任務類型：${taskInfo.name} (${taskInfo.nameZh})

寫作任務說明必須包含以下全部元素：
1. CONTEXT: 清楚的情境背景（1-2 句）
2. ROLE: 寫作者身份（e.g. "You are the secretary of the Student Council"）
3. AUDIENCE: 目標讀者是誰（影響 tone 和 formality）
4. TASK: 具體寫作任務（含文體格式要求）
5. REQUIREMENTS: 3-4 個具體要求（必須可檢查、可評分）
6. WORD LIMIT: "Write about ${diff.wordLimit} words."
7. FORMAT NOTES: ${taskInfo.formatHint}

${input.taskType === 'email-reply' ? 'Email 格式必須要求：subject line + salutation (Dear X) + body + closing + signature + role' : ''}
${input.taskType === 'report' ? 'Report 格式必須要求：title + introduction/background + findings (sub-headings) + recommendations + conclusion' : ''}
${input.taskType === 'summary' ? 'Summary 要求：用自己文字概括，不可直接抄襲聆聽原文。組織邏輯清晰。' : ''}

═══════════════════════════════════════
四、預期內容要點 (expectedContentPoints)
═══════════════════════════════════════

列出 5-7 個學生必須從聽力中提取並寫入文章的具體要點。
每個要點應：
- 對應 listeningContent 中的一個具體 Content Point
- 可用於逐點比對批改
- 包含關鍵資訊類型標記（數字/觀點/建議/問題等）

═══════════════════════════════════════
五、答案參考 (listeningAnswers)
═══════════════════════════════════════

為每個 note-taking 引導問題提供標準答案，答案必須 verbatim 出現在 listeningContent 中。

═══════════════════════════════════════
輸出格式（純 JSON）
═══════════════════════════════════════

{
  "listeningContent": "Woman: ...\\nMan: ...",
  "listeningTopicZh": "繁體中文主題簡介",
  "noteTakingGuide": [
    { "question": "...?", "hint": "用 $ 標記預算，注意 'the budget is' 之後..." }
  ],
  "writingTask": "完整的寫作任務說明...",
  "expectedContentPoints": ["要點1", "要點2", ...],
  "listeningAnswers": [
    { "question": "對應的引導問題", "answer": "verbatim 答案" }
  ]
}

年級：${input.gradeLevel} | 難度：${diff.label}${input.topicHint ? ` | 主題：${input.topicHint}` : ''}
所有中文使用繁體中文。`;

  const userPrompt = `生成一個 DSE Paper 3 Part B Integrated Skills 練習：
- 任務類型：${taskInfo.name}
- 年級：${input.gradeLevel}
- 難度：${input.difficulty}
- 字數要求：約 ${diff.wordLimit} words${input.topicHint ? `\n- 主題：${input.topicHint}` : ''}`;

  const result = await callLLM(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    { temperature: 0.6, maxTokens: 4096, jsonMode: true, timeoutMs: 30000, userId: input.userId }
  );

  const task = parseAIJSON<IntegratedSkillsTask>(result);

  // 驗證必要欄位
  if (!task.listeningContent || !task.writingTask) {
    throw new Error('AI 生成的 Integrated Skills 任務不完整');
  }

  return {
    listeningContent: normalizeListeningContent(task.listeningContent),
    listeningTopicZh: task.listeningTopicZh || 'Integrated Skills 聆聽任務',
    noteTakingGuide: task.noteTakingGuide || [],
    writingTask: task.writingTask,
    taskType: input.taskType,
    wordLimit: diff.wordLimit,
    expectedContentPoints: task.expectedContentPoints || [],
    listeningAnswers: task.listeningAnswers || [],
  };
}

/**
 * 🎧✍️ 批改 Integrated Skills 答案
 * 同時評估 Listening 提取準確度 + Writing 品質
 */
export async function analyzeIntegratedSkills(
  input: AnalyzeIntegratedSkillsInput
): Promise<IntegratedSkillsAnalysis> {
  const sanitizedWriting = sanitizeForAI(input.studentWriting);

  // ============================================
  // DSE RAG：檢索 Paper 3 Listening & Integrated Skills Marking Scheme
  // ============================================
  let paper3MSContext = '';
  try {
    if (isDSERAGEnabled()) {
      const msChunks = await retrieveMarkingScheme('Listening', 3);
      paper3MSContext = buildDSEContextPrompt(
        [],
        msChunks.map(r => ({ content: r.chunk.content, title: r.materialTitle, score: r.score })),
        'analyze_integrated'
      );
      if (paper3MSContext) {
        logger.info({ module: 'dse-rag', msChunks: msChunks.length }, 'analyzeIntegratedSkills: Retrieved Listening MS chunks');
      }
    }
  } catch (err) {
    logger.warn({ module: 'dse-rag', error: err instanceof Error ? err.message : String(err) }, 'analyzeIntegratedSkills MS retrieval failed, fallback');
    paper3MSContext = '';
  }

  const systemPrompt = `你是一位香港 DSE English Paper 3 評卷專家，專門批改 Integrated Skills (聆聽 + 寫作綜合) 答案。
請同時從「Listening 提取準確度」和「Writing 品質」兩個維度進行評估。
${paper3MSContext}

═══════════════════════════════════════
DSE Paper 3 官方評分標準
═══════════════════════════════════════

- Listening 理解能力 (40%)：準確提取 Content Points、理解細節與隱含意思、識別說話者態度
- Language 語言運用 (35%)：詞彙準確性與多樣性、文法正確性、Data manipulation（非直接抄襲）、Tone 與語境匹配
- Organization 組織結構 (25%)：邏輯性與連貫性、PEEL 結構、分段合理、格式正確

═══════════════════════════════════════
批改維度一：Listening 提取準確度
═══════════════════════════════════════

1. 逐點比對 expectedContentPoints：
   - capturedPoints: 已成功提取的要點
   - missedPoints: 完全遺漏的要點

2. Note-taking 品質評估：
   - 是否使用了有效的縮寫/符號系統
   - 是否抓住了關鍵資訊（數字、名稱、日期、原因、建議）
   - 在 generalComment 中給予具體的 note-taking 改善建議

3. 資訊準確度：檢查數字/名稱/日期是否精確

═══════════════════════════════════════
批改維度二：Writing 品質
═══════════════════════════════════════

1. Paraphrasing vs 過度抄襲檢測（CRITICAL）：
   ✅ 好的 paraphrasing: 換詞 + 改句式 + 保留原意
   ❌ 過度抄襲: >8 個連續詞直接照搬 listeningContent
   Data Manipulation 三層次：
   - L1 直接引用（可接受）→ L2 語法轉換（加分）→ L3 語境適應（高分）
   ⚠️ 黃金法則: 不要 paraphrase 關鍵數據！準確保留數字和專有名詞。

2. 寫作結構：PEEL、清晰分段、邏輯連接、字數達標
3. Audience Awareness：Tone 是否符合目標讀者、格式是否正確
4. 語言品質：文法錯誤 + 詞彙豐富度 + 句式變化

回覆格式（純 JSON）：
{
  "overallScore": 0-100,
  "listeningAccuracy": 0-100,
  "writingQuality": 0-100,
  "contentCompleteness": 0-100,
  "languageAccuracy": 0-100,
  "organizationClarity": 0-100,
  "capturedPoints": ["..."],
  "missedPoints": ["..."],
  "overCopyWarnings": [{ "original": "...", "suggestion": "..." }],
  "grammarErrors": [{ "original": "...", "correction": "...", "explanation": "..." }],
  "vocabularySuggestions": [{ "original": "...", "suggestion": "...", "reason": "..." }],
  "structureFeedback": "文章結構評語（繁體中文，含 PEEL 建議）",
  "generalComment": "總評（繁體中文，80-120字，指出最接近的 HKDSE Level + Note-taking 改善建議）",
  "improvementTips": ["至少包含1條 Note-taking 改善建議", "...", "..."],
  "estimatedLevel": "Level 1-5 或 Below Level 1"
}

評分規則：
- contentCompleteness 基於 capturedPoints/expectedContentPoints 的比例
- 若超過 30% 文字來自 listeningContent 直接抄襲 → writingQuality 扣 15-25 分
- 若 writing 與 listening content 完全無關 → overallScore <= 30
- improvementTips 中至少包含 1 條 Note-taking 改善建議

所有中文使用繁體中文。`;

  const expectedPointsText = input.expectedContentPoints.map((p, i) => `${i + 1}. ${p}`).join('\n');

  const userPrompt = `【聆聽材料】
${input.listeningContent.slice(0, 3000)}

【Note-taking 指引】
${input.noteTakingGuide.map(g => `- ${g.question} (提示: ${g.hint})`).join('\n')}

【預期內容要點】
${expectedPointsText}

【寫作任務】
${input.writingTask}

【學生 Note-taking】
${input.studentNotes || '(未填寫)'}

【學生寫作】
"""
${sanitizedWriting}
"""

請批改此 Integrated Skills 答案。`;

  const result = await callLLM(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    { temperature: 0.3, maxTokens: 4096, jsonMode: true, timeoutMs: 30000, userId: input.userId }
  );

  const analysis = parseAIJSON<IntegratedSkillsAnalysis>(result);

  if (!analysis.overallScore && analysis.overallScore !== 0) {
    throw new Error('AI Integrated Skills 分析不完整');
  }

  return analysis;
}

// ============================================
// 八、輔助函數
// ============================================

/** 檢查 DeepSeek API 是否已設定 */
export function isDeepSeekConfigured(): boolean {
  return isAIConfigured();
}

export function isAIConfigured(): boolean {
  const deepSeekConfigured = !!config.deepseek.apiKey && config.deepseek.apiKey !== 'sk-your-deepseek-api-key-here';
  const vertexGeminiConfigured = !!config.vertex.projectId && hasServiceAccountSource();
  const geminiApiKeyConfigured = !!config.gemini.apiKey;
  return deepSeekConfigured || vertexGeminiConfigured || geminiApiKeyConfigured;
}

export function isVertexGeminiConfigured(): boolean {
  return !!config.vertex.projectId && hasServiceAccountSource();
}

export function getAIProviders() {
  return {
    deepseek: !!config.deepseek.apiKey && config.deepseek.apiKey !== 'sk-your-deepseek-api-key-here',
    vertexGemini: isVertexGeminiConfigured(),
    geminiApiKey: !!config.gemini.apiKey,
    vertexProjectId: config.vertex.projectId || null,
    vertexLocation: config.vertex.location,
    vertexModel: config.vertex.model,
  };
}
