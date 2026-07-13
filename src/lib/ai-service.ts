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
} from './ai-schema';
import { GoogleAuth } from 'google-auth-library';
import fs from 'node:fs';
import path from 'node:path';

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
// PDPO 去識別化 — 傳送給 AI 前移除個人資料
// ============================================

/**
 * 移除文字中的個人識別資訊後再傳送給 AI API。
 * 香港 PDPO 合規要求：不可將學生真實姓名、身份證、電話、電郵等傳送給第三方 AI。
 */
export function sanitizeForAI(text: string): string {
  return text
    // 香港身份證格式 A123456(7) 或 A1234567
    .replace(/[A-Za-z]\d{6}\(\d\)/g, '[HKID_REMOVED]')
    .replace(/[A-Za-z]\d{7}/g, '[HKID_REMOVED]')
    // 香港電話 8 位數字（避免誤判年份，要求前後為邊界）
    .replace(/(?<!\d)\d{8}(?!\d)/g, '[PHONE_REMOVED]')
    // 電郵地址
    .replace(/[\w.-]+@[\w.-]+\.\w+/g, '[EMAIL_REMOVED]')
    // 常見香港學校關鍵字（選擇性，視需要啟用）
    // .replace(/Po Chiu|寶血|PCCS|pochiu/gi, '[SCHOOL]')
}

// ============================================
// 設定
// ============================================

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1';
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

const VERTEX_PROJECT_ID = process.env.GCP_PROJECT_ID || '';
const VERTEX_LOCATION = process.env.VERTEX_AI_LOCATION || 'global';
const VERTEX_GEMINI_MODEL = process.env.VERTEX_GEMINI_MODEL || process.env.GEMINI_MODEL || 'gemini-2.5-flash';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_BASE_URL = process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

// ============================================
// Provider 追蹤 — 供 API routes 通知前端目前使用的 AI
// ============================================
let lastAIProvider: 'deepseek' | 'vertex-gemini' | 'gemini-api' | 'none' = 'none';
export function getLastAIProvider(): string { return lastAIProvider; }
export function wasFallbackUsed(): boolean { return lastAIProvider !== 'deepseek' && lastAIProvider !== 'none'; }

// ============================================
// Gemini prompt 適配 — Gemini 對 system prompt 的遵循方式與 DeepSeek 不同
// 移除 responseMimeType 硬約束，改為在 prompt 中注入明確 JSON 格式指引
// 這是確保 Gemini fallback 品質與 DeepSeek 一致的關鍵機制
// ============================================
const GEMINI_JSON_INSTRUCTION = `
---
CRITICAL OUTPUT FORMAT:
- Output ONLY a valid JSON object (start with {, end with }) or JSON array (start with [, end with ]).
- Do NOT wrap in markdown code blocks (no \`\`\`json).
- Do NOT add any text, explanation, or notes before or after the JSON.
- EVERY string field must contain meaningful, complete, substantive content.
- NO empty strings "". NO placeholder values like "N/A", "todo", "TBD".
- For Chinese text, use Traditional Chinese (繁體中文), NOT Simplified.
- The response must be parseable by JSON.parse() directly.`.trim();

function adaptMessagesForGemini(messages: ChatMessage[], jsonMode: boolean): ChatMessage[] {
  if (!jsonMode) return messages;
  return messages.map(m => {
    if (m.role === 'system') {
      return { ...m, content: m.content + '\n' + GEMINI_JSON_INSTRUCTION };
    }
    return m;
  });
}

type LLMCallOptions = { temperature?: number; maxTokens?: number; jsonMode?: boolean; timeoutMs?: number };

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface DeepSeekResponse {
  id: string;
  choices: { message: { role: string; content: string }; finish_reason: string }[];
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

interface GeminiResponse {
  candidates?: {
    content?: {
      parts?: { text?: string }[];
    };
  }[];
  error?: {
    message?: string;
  };
}

let vertexAuth: GoogleAuth | null = null;

function hasServiceAccountSource(): boolean {
  if (process.env.GCP_SERVICE_ACCOUNT_JSON) return true;
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) return true;
  const localCredPath = path.join(process.cwd(), 'materials', 'gcp-service-account.json');
  return fs.existsSync(localCredPath);
}

function getVertexAuth(): GoogleAuth {
  if (vertexAuth) return vertexAuth;

  const options: ConstructorParameters<typeof GoogleAuth>[0] = {
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  };

  if (process.env.GCP_SERVICE_ACCOUNT_JSON) {
    options.credentials = JSON.parse(process.env.GCP_SERVICE_ACCOUNT_JSON);
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (!fs.existsSync(credPath)) {
      throw new Error(`GOOGLE_APPLICATION_CREDENTIALS 指向的憑證檔案不存在：${credPath}`);
    }
    options.keyFile = credPath;
  } else {
    const localCredPath = path.join(process.cwd(), 'materials', 'gcp-service-account.json');
    if (fs.existsSync(localCredPath)) {
      options.keyFile = localCredPath;
    }
  }

  vertexAuth = new GoogleAuth(options);
  return vertexAuth;
}

// ============================================
// 核心 API 調用
// ============================================

async function callDeepSeek(
  messages: ChatMessage[],
  options?: LLMCallOptions
): Promise<string> {
  if (!DEEPSEEK_API_KEY || DEEPSEEK_API_KEY === 'sk-your-deepseek-api-key-here') {
    throw new Error('AI 服務尚未設定。請在環境變數中設定 DEEPSEEK_API_KEY。');
  }

  const timeoutMs = options?.timeoutMs || 30000; // 30 秒預設（本地開發；Vercel 部署時建議設為 8000）
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages,
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens ?? 1024,
        response_format: options?.jsonMode ? { type: 'json_object' } : undefined,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`AI 服務錯誤 (${res.status})`);
    }

    const data: DeepSeekResponse = await res.json();
    return data.choices[0]?.message?.content || '';
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('AI 服務回應超時。請稍後重試，或減少題目數量。');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

function toGeminiPayload(messages: ChatMessage[]) {
  const systemMessages = messages
    .filter(m => m.role === 'system')
    .map(m => m.content)
    .join('\n\n');

  const contents = messages
    .filter(m => m.role !== 'system')
    .map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

  return { systemMessages, contents };
}

async function callGemini(
  messages: ChatMessage[],
  options?: LLMCallOptions
): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new Error('Gemini API 尚未設定。請在環境變數中設定 GEMINI_API_KEY。');
  }

  const timeoutMs = options?.timeoutMs || 30000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  // Gemini prompt 適配：jsonMode 時注入明確 JSON 格式指引，取代 responseMimeType 硬約束
  const adaptedMessages = adaptMessagesForGemini(messages, options?.jsonMode ?? false);
  const { systemMessages, contents } = toGeminiPayload(adaptedMessages);

  // jsonMode 時使用較低 temperature + 較大 maxOutputTokens 以確保內容品質
  const isJson = options?.jsonMode ?? false;

  try {
    const res = await fetch(`${GEMINI_BASE_URL}/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        systemInstruction: systemMessages
          ? {
            role: 'system',
            parts: [{ text: systemMessages }],
          }
          : undefined,
        contents,
        generationConfig: {
          temperature: isJson ? (options?.temperature ?? 0.3) : (options?.temperature ?? 0.7),
          maxOutputTokens: isJson ? Math.max(options?.maxTokens ?? 1024, 4096) : (options?.maxTokens ?? 1024),
        },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gemini 服務錯誤 (${res.status}): ${errText.slice(0, 200)}`);
    }

    const data: GeminiResponse = await res.json();
    const content = data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('')?.trim() || '';
    if (!content) {
      throw new Error(data.error?.message || 'Gemini 回傳為空');
    }
    return content;
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('Gemini 回應超時。請稍後重試。');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function callGeminiViaVertex(
  messages: ChatMessage[],
  options?: LLMCallOptions
): Promise<string> {
  if (!VERTEX_PROJECT_ID) {
    throw new Error('Vertex Gemini 尚未設定 GCP_PROJECT_ID。');
  }
  if (!hasServiceAccountSource()) {
    throw new Error('Vertex Gemini 尚未設定 service account 憑證。');
  }

  const timeoutMs = options?.timeoutMs || 30000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  // Gemini prompt 適配：jsonMode 時注入明確 JSON 格式指引，取代 responseMimeType 硬約束
  const adaptedMessages = adaptMessagesForGemini(messages, options?.jsonMode ?? false);
  const { systemMessages, contents } = toGeminiPayload(adaptedMessages);

  // jsonMode 時使用較低 temperature + 較大 maxOutputTokens 以確保內容品質
  const isJson = options?.jsonMode ?? false;

  try {
    const auth = getVertexAuth();
    const client = await auth.getClient();
    const host = VERTEX_LOCATION === 'global'
      ? 'aiplatform.googleapis.com'
      : `${VERTEX_LOCATION}-aiplatform.googleapis.com`;
    const url = `https://${host}/v1/projects/${VERTEX_PROJECT_ID}/locations/${VERTEX_LOCATION}/publishers/google/models/${VERTEX_GEMINI_MODEL}:generateContent`;
    const token = await client.getAccessToken();
    if (!token?.token) {
      throw new Error('無法取得 Vertex OAuth access token。請檢查 service account 憑證與 IAM 權限。');
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        systemInstruction: systemMessages
          ? {
            role: 'system',
            parts: [{ text: systemMessages }],
          }
          : undefined,
        contents,
        generationConfig: {
          temperature: isJson ? (options?.temperature ?? 0.3) : (options?.temperature ?? 0.7),
          maxOutputTokens: isJson ? Math.max(options?.maxTokens ?? 1024, 4096) : (options?.maxTokens ?? 1024),
        },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Vertex Gemini 錯誤 (${res.status}): ${errText.slice(0, 260)}`);
    }

    const data: GeminiResponse = await res.json();
    const content = data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('')?.trim() || '';
    if (!content) {
      throw new Error(data.error?.message || 'Vertex Gemini 回傳為空');
    }
    return content;
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('Vertex Gemini 回應超時。請稍後重試。');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ============================================
// 結構化 AI 日誌 — 供 Vercel Logs / 監控使用
// ============================================
function aiLog(event: string, data: Record<string, unknown>) {
  console.log(JSON.stringify({
    service: 'ai-service',
    event,
    timestamp: new Date().toISOString(),
    ...data,
  }));
}

export async function callLLM(
  messages: ChatMessage[],
  options?: LLMCallOptions
): Promise<string> {
  const hasDeepSeek = !!DEEPSEEK_API_KEY && DEEPSEEK_API_KEY !== 'sk-your-deepseek-api-key-here';
  const hasVertexGemini = !!VERTEX_PROJECT_ID && hasServiceAccountSource();
  const hasGemini = !!GEMINI_API_KEY;

  if (!hasDeepSeek && !hasVertexGemini && !hasGemini) {
    throw new Error('AI 服務尚未設定。請設定 DEEPSEEK_API_KEY，或設定 Vertex service account（GCP_PROJECT_ID + GCP_SERVICE_ACCOUNT_JSON/GOOGLE_APPLICATION_CREDENTIALS）。');
  }

  const errors: string[] = [];
  const startTime = Date.now();

  if (hasDeepSeek) {
    try {
      const result = await callDeepSeek(messages, options);
      lastAIProvider = 'deepseek';
      aiLog('call_success', { provider: 'deepseek', latencyMs: Date.now() - startTime });
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`DeepSeek: ${msg}`);
      if (!hasVertexGemini && !hasGemini) {
        aiLog('call_failed', { provider: 'deepseek', error: msg, latencyMs: Date.now() - startTime });
        throw new Error(`AI 服務全部不可用。\n${errors.join('\n')}`);
      }
      console.warn('[ai-service] DeepSeek 失敗，切換 Gemini fallback:', msg);
    }
  }

  if (hasVertexGemini) {
    try {
      const result = await callGeminiViaVertex(messages, options);
      lastAIProvider = 'vertex-gemini';
      aiLog('call_success', { provider: 'vertex-gemini', latencyMs: Date.now() - startTime, fallback: true });
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Vertex Gemini: ${msg}`);
      if (!hasGemini) {
        aiLog('call_failed', { provider: 'vertex-gemini', error: msg, latencyMs: Date.now() - startTime });
        throw new Error(`AI 服務全部不可用。\n${errors.join('\n')}`);
      }
      console.warn('[ai-service] Vertex Gemini 失敗，切換 Gemini API key fallback:', msg);
    }
  }

  try {
    const result = await callGemini(messages, options);
    lastAIProvider = 'gemini-api';
    aiLog('call_success', { provider: 'gemini-api', latencyMs: Date.now() - startTime, fallback: true });
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`Gemini API: ${msg}`);
    aiLog('call_failed', { provider: 'gemini-api', error: msg, latencyMs: Date.now() - startTime });
    throw new Error(`AI 服務全部不可用。\n${errors.join('\n')}`);
  }
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
  console.warn('[ai-service] normalizeMcqAnswer: could not match answer to any choice, defaulting to A. answerRaw:', answerRaw.slice(0, 80), 'choices:', normalizedChoices.join('|').slice(0, 120));
  return 'A';
}

// ============================================
// 答案準確性保障規則（注入 system prompt 結尾）
// ============================================
const STRICT_ANSWER_RULES = `
【嚴格答案一致性規則 — 必須 100% 遵守 (CRITICAL)】
- MCQ：'answer' 必須是 "A"/"B"/"C"/"D" 之一，且完整對應 choices 陣列中對應選項的文字內容。
- Listening：'answer' 指向的選項文字必須逐字 (verbatim) 出現在該題的 listeningContent 中。
  每題獨立生成 listeningContent，再據此產生問題和答案。禁止 hallucinate。
- Reading：'answer' 指向的選項文字必須可從 readingContent 直接推斷或引用。
- 時間、金錢、數字、專有名詞必須完全一致（包括標點和空格）。
  若用 "4 o'clock" 則全題統一用 "4 o'clock"，不可混用 "four o'clock" 或 "4:00"。
- ⚠️ 時間選項反例（這些格式會被系統過濾，導致題目廢棄）：
  ❌ "00 PM"、"30 PM"、"5:00"（無 AM/PM）、"00"、"30"、裸數字
  ✅ "4:00 PM"、"4 o'clock"、"four o'clock"、"3:30 PM"、"half past three"
- ⚠️ choices 陣列必須恰好 4 個元素。少於 4 個會被系統自動補位；被補位的選項可能不是 DSE 格式。
- 輸出前自我檢查 (Self-Check)：確認 answer 對應的選項文字確實存在於該題的 listeningContent/readingContent 中。
  如不一致，必須修正後再輸出。`;

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
  let fixed = { ...q };
  let rejected = false;

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
        const warnMsg = `[Listening Consistency] Q${index}: answer "${answerToCheck}" not found verbatim in listeningContent — REJECTED`;
        console.warn(warnMsg);
        warnings.push(warnMsg);
        rejected = true;
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
      console.warn(`[Reading Consistency] Q${index}: no keywords from "${answerToCheck}" in readingContent`);
    }
  }

  return { fixed, warnings, rejected };
}

function normalizeGeneratedQuestions(questions: GeneratedQuestion[]): GeneratedQuestion[] {
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
      listeningContent: q.listeningContent?.trim(),
      listeningContentZh: q.listeningContentZh?.trim(),
      readingContent: q.readingContent?.trim(),
      readingContentZh: q.readingContentZh?.trim(),
      choices: Array.isArray(q.choices) ? q.choices.map(c => String(c)) : [],
    };

    if (base.type !== 'mc') {
      const { warnings, rejected } = validateAndFixQuestion(base, results.length);
      if (rejected) { rejectedCount++; continue; }
      if (warnings.length > 0) console.warn('[ai-service] Non-MC answer consistency:', warnings);
      results.push({ ...base, choices: [] });
      continue;
    }

    const cleanedChoices = Array.from(new Set(
      (base.choices || [])
        .map(stripMcqPrefix)
        .map(c => c.trim())
        .filter(Boolean)
    ));

    // 過濾掉 DSE 不相容的選項（All/None of the above、碎片數字等）
    const BANNED_PATTERNS = [
      /^all\s*of\s*the\s*above\.?\s*$/i,
      /^none\s*of\s*the\s*above\.?\s*$/i,
      /^all\s*the\s*above\.?\s*$/i,
      /^not\s*mentioned/i,
      /^cannot\s*be\s*determined/i,
    ];
    // 時間碎片模式 — AI 常生成不完整的時間選項（如 "00 PM", "30 PM", "4:00"）
    const TIME_FRAGMENT_PATTERNS = [
      /^\d{1,2}:\d{2}\s*(?:AM|PM)?$/i,     // "4:00", "4:00 PM" 等時間格式（無上下文過於狹窄）
      /^\d{1,2}\s*(?:AM|PM)$/i,             // "4 PM", "00 PM", "30 PM" 等破碎時間
      /^\d{1,2}\s*o'?clock$/i,              // "4 oclock", "4 o'clock"
      /^(?:at\s+)?\d{1,2}(?::\d{2})?\s*(?:AM|PM|in the (?:morning|afternoon|evening))$/i, // "at 4 PM"
    ];
    const validChoices = cleanedChoices.filter(c => {
      if (c.length < 3) return false; // 太短→碎片
      if (/^[\d:.\s]+$/.test(c) && c.length < 6) return false; // 純數字碎片
      if (BANNED_PATTERNS.some(p => p.test(c))) {
        console.warn(`[ai-service] Filtered banned choice: "${c}"`);
        return false;
      }
      if (TIME_FRAGMENT_PATTERNS.some(p => p.test(c))) {
        console.warn(`[ai-service] Filtered time fragment choice: "${c}"`);
        return false;
      }
      return true;
    });

    // 若過濾後不足 2 個有效選項，標記為需重試
    if (validChoices.length < 2) {
      console.error(`[ai-service] Q has only ${validChoices.length} valid choices after filtering:`, validChoices);
      // 回退：至少保留 2 個選項讓題目可用
      const fallbackFillers = [
        'The information is not provided in the listening.',
        'The speaker changed the time.',
        'The exact time is mentioned only once.',
        'More details are needed to answer.',
      ];
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
      console.warn(`[ai-service] Q${results.length} rejected — answer not found in listeningContent`);
      continue;
    }
    if (warnings.length > 0) console.warn('[ai-service] Answer auto-fix:', warnings);

    results.push({
      ...base,
      choices: finalChoices,
      answer: fixed.answer,
    });
  }

  if (rejectedCount > 0) {
    console.warn(`[ai-service] ${rejectedCount}/${questions.length} listening/reading questions rejected due to answer-content mismatch`);
  }

  return results;
}

// ============================================
// 隨機題材選擇器 — 確保 AI 出題主題多元化
// ============================================

const LISTENING_TOPICS = [
  'school club recruitment fair（學會招募博覽）',
  'part-time job interview at a bookstore（書店兼職面試）',
  'planning a charity fundraising event（慈善籌款活動策劃）',
  'discussing a science fair project（科學展項目討論）',
  'booking a school field trip（學校戶外考察預訂）',
  'ordering food at a café with dietary restrictions（咖啡店點餐含飲食限制）',
  'asking for directions to a museum exhibition（問路去博物館展覽）',
  'reporting a lost item to the school office（向校務處報失物品）',
  'discussing a movie review for English class（討論英文課電影評論）',
  'making a doctor\'s appointment（預約看醫生）',
  'planning a surprise birthday party（策劃驚喜生日派對）',
  'debating which university to apply to（辯論申請哪所大學）',
  'calling customer service about a faulty product（致電客服關於瑕疵產品）',
  'discussing weekend hiking trip plans（討論週末行山計劃）',
  'registering for a sports competition（報名體育比賽）',
  'asking a librarian for book recommendations（向圖書館員詢問書籍推薦）',
];

const READING_TOPICS = [
  'marine life conservation and coral reefs（海洋生物保育與珊瑚礁）',
  'the history of the Olympic Games（奧運會歷史）',
  'how social media affects teenage mental health（社交媒體對青少年心理健康的影響）',
  'renewable energy solutions in Hong Kong（香港可再生能源方案）',
  'famous inventors and their accidental discoveries（著名發明家與意外發現）',
  'cultural festivals around the world（世界各地的文化節日）',
  'the science behind cooking and food chemistry（烹飪科學與食物化學）',
  'space exploration and Mars colonization（太空探索與火星殖民）',
  'the impact of fast fashion on the environment（快時尚對環境的影響）',
  'endangered species and wildlife protection（瀕危物種與野生動物保護）',
  'how artificial intelligence is changing education（人工智能如何改變教育）',
  'traditional crafts and their modern revival（傳統工藝與現代復興）',
  'the psychology of color in marketing（營銷中的色彩心理學）',
  'volunteer tourism and its pros and cons（義工旅遊的利弊）',
  'urban farming and green cities（都市農業與綠色城市）',
  'the evolution of the English language（英語的演變）',
];

function getRandomTopic(isListening: boolean, isReading: boolean, gradeLevel: string): string {
  const pool = isListening ? LISTENING_TOPICS : isReading ? READING_TOPICS : LISTENING_TOPICS;
  // Use a deterministic seed based on timestamp to ensure variety across calls
  const seed = Date.now();
  const index = (seed % 9973) % pool.length; // prime modulus for better distribution
  return pool[index];
}

export async function generateQuestions(input: GenerateQuestionsInput): Promise<GeneratedQuestion[]> {
  const count = input.count || 5;
  const skillDesc = input.grammarItemZh || input.languageSkillZh || input.grammarItem || input.languageSkill || '綜合';
  const typeDesc = input.questionType || 'mc';
  const diffMap = { remedial: '補底', core: '核心', challenge: '挑戰' };

  const isListening = input.languageSkill === 'listening';
  const isReading = input.languageSkill === 'reading';
  const isMcq = typeDesc === 'mc';

  // 聽力/閱讀題使用較低 temperature 提高準確性，但不能過低導致重複
  const qTemperature = (isListening || isReading) ? 0.45 : 0.7;

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
      console.log('[DSE-RAG] 檢索歷屆試題內容...', { dseSkill, topic: input.topic, difficulty: input.difficulty });

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
        console.log(`[DSE-RAG] 已擷取 ${pastPaperChunks.length} 個歷屆試題段落 + ${markingSchemeChunks.length} 個 MS 段落`);
      } else {
        console.log('[DSE-RAG] 無相關歷屆試題，使用純 prompt 模式');
      }
    }
  } catch (err) {
    // RAG 失敗不應中斷出題流程，fallback 到純 prompt
    console.warn('[DSE-RAG] 檢索失敗，fallback 純 prompt:', err instanceof Error ? err.message : String(err));
    dseContextPrompt = '';
  }

  const systemPrompt = `你是一位香港中學英文科教師，熟悉 ELE KLACG 2017 課程指引及 HKDSE English Language Level Descriptors。
請根據以下要求生成英語練習題目，題目必須對齊 HKDSE 各卷別（Reading / Writing / Listening / Speaking）的能力要求。
請以純 JSON 陣列格式回覆（不要用 Markdown 代碼塊包裝）。

HKDSE 等級對齊指引：
- 補底(remedial) → 對應 HKDSE Level 1-2：基礎詞彙、簡單句型、明示信息提取、字面理解
- 核心(core) → 對應 HKDSE Level 3：中級詞彙、複合句、直接推論、辨識明確觀點
- 挑戰(challenge) → 對應 HKDSE Level 4-5：進階詞彙、複雜句型、深層推論、評價觀點態度、理解比喻語言

要求：
- 題目數量：${count} 題
- 技能範疇：${skillDesc}
- 難度：${diffMap[input.difficulty]}
- 年級：${input.gradeLevel}
- 題型：${typeDesc}
- ⚠️ 題材強制多樣化：你必須使用以下隨機選定的情境主題來設計題目 — "${getRandomTopic(isListening, isReading, input.gradeLevel)}"
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
- S1-S3：校園生活（學會選舉、校隊選拔、課外活動報名、功課討論）、家庭（週末計劃、家庭聚會、購物）、興趣（運動、音樂、閱讀）
- S4-S6：兼職面試、社區服務計劃、大學開放日、文化交流活動、職場實習、環保項目、科技新聞討論、旅行計劃、選科諮詢

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
  - 每題的 listeningContent 是一段簡短獨立對話（4-8 行），只包含該題所需的資訊
  - 這種設計的好處：TTS 合成更快、更穩定、學生可針對單題重聽
  - 每題 listeningContent 必須是自給自足（self-contained）的迷你對話
  - 同一批題目可使用相似主題/角色，但每題的對話內容獨立
- ⚠️ 對話長度控制（CRITICAL — 確保 TTS 穩定）：
  - 每題獨立 listeningContent：4-8 行（含 1-3 個獨立資訊點）
  - 每行 5-20 個單詞，總對話長度控制在 40-120 詞
  - 這樣確保 Google Cloud TTS 合成快速（<3 秒）且不會觸發長文本錯誤
  - 太短的對話（<4 行）無法提供足夠上下文 → 加長
  - 太長的對話（>8 行）導致 TTS 延遲過長 → 精簡
  - 最低行數：remedial ≥12 行 / core ≥16 行 / challenge ≥20 行
  - 自我檢查：生成 listeningContent 後，數一下有多少個可出題的資訊點。若不夠 → 加長對話
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
  - 請根據對話情境，將所有角色映射到 Boy/Girl（青少年/學生）或 Man/Woman（成人）` : ''}
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
${isListening ? '- listeningContent: 英文聆聽材料（對話/獨白，50-100字）\n- listeningContentZh: 中文簡短情境說明\n' : ''}${isReading ? '- readingContent: 英文閱讀篇章（80-200字）\n- readingContentZh: 中文簡短篇章主題說明\n' : ''}- choices: 選項陣列（MC題4個選項；其他題型給空陣列 []）
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
  }
]`;

  const userPrompt = `請生成 ${count} 道 ${skillDesc}（${diffMap[input.difficulty]}程度，${input.gradeLevel}）的${typeDesc === 'mc' ? '選擇題' : typeDesc === 'fill-blank' ? '填充題' : typeDesc === 'error-correction' ? '改錯題' : '寫作題'}。`;

  // 注入 DSE RAG context（若有）
  const finalSystemPrompt = systemPrompt + dseContextPrompt;

  const result = await callLLM(
    [
      { role: 'system', content: finalSystemPrompt },
      { role: 'user', content: userPrompt },
    ],
    { temperature: qTemperature, maxTokens: 2048, jsonMode: true, timeoutMs: 25000 }
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
      return fixed;
    });
    if (allWarnings.length > 0) {
      console.warn('[ai-service] Generated questions had consistency issues (auto-fixed):', allWarnings);
    }
    return fixedQuestions;
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
      { temperature: 0, maxTokens: 4096, jsonMode: true, timeoutMs: 15000 }
    );

    return tryValidate(repaired);
  }
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
  let cleaned = raw
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();

  // 嘗試直接解析
  try { return JSON.parse(cleaned) as T; } catch { /* continue */ }

  // 嘗試擷取第一段完整 JSON 區塊（可容忍前後雜訊）
  const balanced = extractBalancedJson(cleaned);
  if (balanced) {
    try { return JSON.parse(balanced) as T; } catch { /* continue */ }
  }

  // 嘗試提取 JSON 物件
  const objMatch = cleaned.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try { return JSON.parse(objMatch[0]) as T; } catch { /* continue */ }
  }

  // 嘗試提取 JSON 陣列
  const arrMatch = cleaned.match(/\[[\s\S]*\]/);
  if (arrMatch) {
    try { return JSON.parse(arrMatch[0]) as T; } catch { /* continue */ }
  }

  // 嘗試修復截斷
  const repaired = repairTruncatedJSON(cleaned);
  if (repaired) {
    try { return JSON.parse(repaired) as T; } catch { /* continue */ }
  }

  throw new Error('AI 回傳格式無法解析，請重試。');
}

// ============================================
// 二、學生答案分析與批改
// ============================================

export interface AnalyzeAnswerInput {
  question: string;
  questionType: string;
  correctAnswer: string;
  studentAnswer: string;
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
        console.log(`[DSE-RAG] analyzeAnswer: 已擷取 ${msChunks.length} 個 MS 段落`);
      }
    }
  } catch (err) {
    console.warn('[DSE-RAG] analyzeAnswer MS 檢索失敗，fallback:', err instanceof Error ? err.message : String(err));
    msContextPrompt = '';
  }

  const systemPrompt = `你是一位香港中學英文科教師兼 HKDSE 評卷員。
請嚴格依據以下官方 HKDSE Level Descriptors 進行批改。
請以繁體中文提供詳細分析，並以純 JSON 格式回覆（以 { 開頭，以 } 結尾，不要用 Markdown 代碼塊包裝）。

【HKDSE Reading Descriptors 參考】
Level 5: 辨識複雜文本主旨/子題；評價觀點態度；追蹤論點發展並完全理解原因；在廣泛複雜文本中推論；理解隱含及比喻語言；解讀語調語氣。
Level 4: 辨識較複雜文本主旨；辨識觀點態度、追蹤論點發展；在較複雜文本中做明顯推論；從上下文推斷詞義。
Level 3: 辨識直接段落主旨；辨識明確表達的觀點；理解熟悉主題較複雜文本中的明示信息；做直接推論；從熟悉語境推斷詞義。
Level 2: 理解簡單段落主旨（有明確信號時）；區分簡單文本中的事實與意見；理解簡單文本中的明示信息；從簡單熟悉語境推斷詞義。
Level 1: 辨識簡單結構文本中的事件順序；理解含熟悉詞彙的簡單文本中的明示事實信息；能用標題等定位相關信息。

【HKDSE Listening Descriptors 參考】
Level 5: 辨識複雜口語文本主旨/子題；評價觀點態度；在近自然語速下推論；提取明示及隱含信息；理解比喻語言；從重音語調辨識態度意圖。
Level 4: 辨識口語文本主旨；評價熟悉主題中較複雜文本的觀點；在中等語速下做明顯推論；提取明示及部分隱含信息。
Level 3: 辨識直接口語文本主旨；辨識明確表達觀點；在中等語速熟悉情境下理解明示信息；從字面語言做直接推論。
Level 2: 辨識簡單口語文本主旨（有明確信號時）；區分簡單文本中事實與意見；在中等語速下理解明示信息。
Level 1: 理解簡短簡單口語文本中的簡單可預測事實信息；辨識線性結構口語文本中的事件順序。

分析要點：
1. 判斷答案是否正確（isCorrect: boolean）
2. 給予分數 0-100（score: number），必須對照上方等級描述
3. 提供繁體中文回饋（feedbackZh: string）
4. 提供英文回饋（feedbackEn: string）
5. 判斷錯誤類型（mistakeType: grammar/vocabulary/comprehension/careless/time-management/chinglish/none）
6. 詳細解釋（explanation: string，繁體中文）
7. 改進建議（improvementTip: string，繁體中文）
8. 相關文法點（relatedGrammarPoint: string，可選）

HKDSE 對齊規則（務必執行）：
- 若題型是 mc / fill-blank / error-correction（偏 Reading/Listening/Language use）：
  - 以「理解準確度、語境判斷、語言知識運用」評分。
  - 完全正確才可 85 分以上；部分理解但關鍵資訊錯誤不得高於 60。
- 若題型是 short-writing（偏 Writing）：
  - 以 HKDSE Writing Descriptors「內容與任務完成度、組織、語言」評分，不可只看文法。
  - 若只寫一兩句、內容空泛、未回應題目要求，分數不得高於 40。
- 若學生答案極短（少於 8 個英文詞）且題目需要解釋/發展內容，分數不得高於 35。
- 若離題或答非所問，mistakeType 優先標為 comprehension，且分數不得高於 30。
- 嚴禁「文法正確就高分」；需同時考慮任務完成度與內容相關性。
- 請在 explanation 中指出學生表現最接近哪個 HKDSE Level。

注意：
- 對香港學生的常見中式英文錯誤要特別標註
- 解釋要具體、易懂，適合中學生閱讀
- 使用繁體中文，避免簡體字`;

  const studentWordCount = (input.studentAnswer.match(/[A-Za-z0-9][A-Za-z0-9'\-]*/g) || []).length;

  const userPrompt = `題目：${input.question}
題型：${input.questionType}
正確答案：${input.correctAnswer}
學生答案：${input.studentAnswer}
學生答案詞數（系統計算）：${studentWordCount}
${input.grammarItemZh ? `文法項目：${input.grammarItemZh}` : ''}
${input.studentLevel ? `學生年級：${input.studentLevel}` : ''}

請分析學生的答案。`;

  const result = await callLLM(
    [
      { role: 'system', content: systemPrompt + msContextPrompt },
      { role: 'user', content: userPrompt },
    ],
    { temperature: 0.3, maxTokens: 2048, jsonMode: true }
  );

  const analysis = parseAIJSON<AnswerAnalysis>(result);
  const validated = validateAIResponse(AnswerAnalysisSchema, analysis);
  if (!validated.success) throw new Error(validated.error);
  return validated.data;
}

// ============================================
// 三、寫作批改與建議
// ============================================

export interface AnalyzeWritingInput {
  title: string;
  prompt: string;
  studentDraft: string;
  studentLevel?: string;
  textType?: string;
}

export interface WritingAnalysis {
  overallScore: number; // 0-100
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
        console.log(`[DSE-RAG] analyzeWriting: 已擷取 ${msChunks.length} 個 Writing MS 段落`);
      }
    }
  } catch (err) {
    console.warn('[DSE-RAG] analyzeWriting MS 檢索失敗，fallback:', err instanceof Error ? err.message : String(err));
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

  // === Call 1：文法 + Chinglish + 總分 + 總評（語言準確性） ===
  const grammarPrompt = `你是一位香港中學英文科教師兼 HKDSE English Paper 2 評卷員，擁有多年 DSE 評卷經驗。
請嚴格依據以下官方 HKDSE Writing Level Descriptors（Content / Language / Organization，簡稱 CLO）進行評分。
請以純 JSON 格式回覆（以 { 開頭，以 } 結尾）。${writingMSContext}

【HKDSE Writing 官方等級描述 — 必須以此為評分基準】

Level 5:
- Content: 內容相關且廣泛，展現目的意識，能引起讀者興趣；適當時展現創意與想像力。
- Language & Style: 廣泛句式準確恰當；標點文法準確傳意；詞彙廣泛恰當且有較進階/精緻用語；語域、語調、風格與文體匹配。
- Organization: 結構完全連貫、與文體匹配；分段有效；句段間銜接精緻。

Level 4:
- Content: 內容相關、部分詳細、能引起讀者興趣；大部分展現創意與想像力。
- Language & Style: 多種句式準確恰當；標點文法足夠準確，錯誤不影響整體清晰度；詞彙適度廣泛恰當、大部分拼寫正確；語域語調風格大部分與文體匹配。
- Organization: 大部分連貫、與文體匹配；分段足夠有效維持整體連貫；多數句段銜接成功。

Level 3:
- Content: 大部分內容相關；有數處創意與想像力。
- Language & Style: 簡單句及部分複合句結構良好；基本標點及基本文法結構準確；常用詞彙恰當、拼寫正確；有部分語域語調風格與文體匹配的證據。
- Organization: 部分段落連貫、與文體匹配；分段在部分有效；部分句段銜接成功。

Level 2:
- Content: 有部分相關內容；使用了熟悉文體的部分特徵。
- Language & Style: 簡單句結構良好；大部分基本標點正確，文法準確度足以使部分句子可理解；簡單詞彙恰當、大部分拼寫正確。
- Organization: 當文體簡單熟悉時可辨識結構；有部分分段證據；句段間有簡單連結。

Level 1:
- Content: 少數內容點相關。
- Language: 有數句簡單可理解的句子；有數個簡單詞彙使用恰當。
- Organization: 句子間有少量連結。

【低於 Level 1 / 無法評級】
- 內容與題目完全無關、只寫一兩句、或無法辨識為完整文章。
- 此類文章 overallScore 不得高於 25。

【DSE Writing 十大常見錯誤 — 請逐項檢查學生文章】
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

【中式英文 (Chinglish) 特別檢查清單】
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

【高分技巧檢查 — 學生文章是否具備】
- ✅ Show, Don't Tell: 用具體描寫代替抽象陳述
- ✅ PEEL 結構: Point → Explain → Example → Link
- ✅ 讓步反駁 (Concession + Rebuttal): 先承認對方論點再反駁
- ✅ 詞彙多樣化: 避免重複基本詞彙（important → crucial/vital/paramount）
- ✅ 句式變化: 混合簡單句/複合句/倒裝句/強調句
- ✅ 首尾呼應: 結論與引言互相呼應但用詞有變化

{
  "overallScore": 52,
  "contentTaskScore": 2,
  "organizationScore": 2,
  "languageScore": 3,
  "taskCompletionScore": 2,
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

評分規則（嚴格執行）：
- 子分數定義：contentTaskScore / organizationScore / languageScore / taskCompletionScore 皆為 0-5 分（可用半分），必須對照上方官方等級描述給予。
- overallScore 必須根據上述子分數換算為 0-100，並加上 lengthPenalty 與 offTopicPenalty。
- 若明顯離題、只寫一兩句、未回應題目要求重點，taskCompletionScore 不可高於 2，overallScore 不可高於 40（對應 Level 1 或以下）。
- 若字數少於建議字數 50%，lengthPenalty 至少 -15；少於 30% 時至少 -25。
- 不可僅因文法正確而給高分；內容空泛、論點不足、未展開支持細節，contentTaskScore 必須偏低（最多 2，對應 Level 2）。
- 請明確對照官方等級描述，在 generalComment 中指出學生文章最接近哪個 HKDSE Level，並說明原因。
- 若學生文字極短（少於 30 詞），必須在 generalComment 清楚說明扣分原因，且 overallScore 不得高於 25。

注意：本回合重點是「嚴格評分校準 + 語言準確性問題」，仍可簡述內容與任務完成度不足。`.trim();

  const grammarUserPrompt = `${context}\n\n請只分析語言準確性（文法錯誤+中式英文+總分+總評）。`;

  // === Call 2：詞彙 + 結構 + 優缺點 + 修改版（寫作技巧） ===
  const stylePrompt = `你是一位香港中學英文科教師兼 HKDSE English Paper 2 評卷員，專注批改寫作技巧並提供修改範例。
請嚴格依據 HKDSE Writing Level Descriptors（Content / Language & Style / Organization 三大向度，Level 5 至 Level 1）進行判斷。
請以純 JSON 格式回覆（以 { 開頭，以 } 結尾）。${writingMSContext}

評分基準回顧：
- Level 5: Content 廣泛相關有創意；Language 句式廣泛準確、詞彙進階、語域恰當；Organization 完全連貫、分段有效。
- Level 4: Content 大部分詳細；Language 多種句式準確、錯誤不影響清晰；Organization 大部分連貫。
- Level 3: Content 大部分相關、有創意；Language 簡單及部分複合句準確、常用詞彙恰當；Organization 部分連貫。
- Level 2: Content 部分相關、使用熟悉文體特徵；Language 簡單句良好、基本標點正確；Organization 可辨識結構。
- Level 1: Content 少數相關點；Language 數句簡單可理解句子；Organization 句間少量連結。
- 低於 Level 1: 內容完全無關、只寫一兩句、無法辨識為完整文章。

【DSE Writing 高分寫作策略 — 請在分析時參照】
1. PEEL 結構: 每段應有 Point（論點）→ Explain（解釋）→ Example（例子）→ Link（連結下一段）
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

【詞彙升級建議清單 — 請檢查學生是否使用了 basic words，並提供進階替代】
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

【文本類型特定檢查 — 請根據文體檢查格式要求】
- Formal Letter: 稱呼與結尾敬語配對？無縮寫？地址格式？
- Informal Letter: 語氣親切？有個人經歷分享？
- Speech: 有開場問候？有修辭問句？有 audience engagement？有感謝聽眾？
- Article: 有吸引標題？段落簡短？有個人風格？
- Report: 有 sub-headings？用被動語態？數據具體？客觀語氣？
- Proposal: 有 SMART 目標？時間表？預算？預期成果？
- Argumentative Essay: 有 thesis statement？3 reasons + counter-argument + rebuttal？PEEL？

{
  "strengths": ["優點1（繁體中文）", "優點2"],
  "weaknesses": ["弱點1（繁體中文）", "弱點2"],
  "vocabularySuggestions": [
    { "original": "原詞", "suggestion": "建議詞", "reason": "原因（繁體中文）" }
  ],
  "structureFeedback": "文章結構評語（繁體中文，50-100字）",
  "revisedVersion": "修正後的完整文章（保留原意，修正文法錯誤及 Chinglish，優化詞彙與句型，不改變原文字數過多）"
}

規則：
- 若文章離題、欠缺內容重點、只列點無展開，weaknesses 必須明確指出「任務完成不足」，不可僅評「文法可改善」。
- strengths 最多 3 點，且必須對照上方等級描述，不可虛高（例如 Level 1-2 文章不可稱「詞彙豐富」）。
- revisedVersion 必須示範如何補足內容與細節以提升至更高 HKDSE Level，不可只做表面文法潤飾。

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
            { temperature: attempt === 0 ? 0.3 : 0.5, maxTokens: 4096, jsonMode: true, timeoutMs: 35000 }
          );
        } catch (e) {
          if (attempt === 1) throw e;
          console.warn('[analyzeWriting] Grammar call retry after failure:', e);
        }
      }
      throw new Error('Grammar analysis failed after retry');
    })(),
    callLLM(
      [
        { role: 'system', content: stylePrompt + writingMSContext },
        { role: 'user', content: styleUserPrompt },
      ],
      { temperature: 0.3, maxTokens: 6144, jsonMode: true, timeoutMs: 35000 }
    ),
  ]);

  // 各自獨立解析，允許部分失敗
  let grammarAnalysis: {
    overallScore?: number;
    contentTaskScore?: number;
    organizationScore?: number;
    languageScore?: number;
    taskCompletionScore?: number;
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
    console.error('[analyzeWriting] Grammar call JSON parse failed:', e);
  }

  try {
    styleAnalysis = parseAIJSON<typeof styleAnalysis>(styleResult);
  } catch (e) {
    styleFailed = true;
    console.error('[analyzeWriting] Style call JSON parse failed:', e);
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
  const taskCompletionScore = typeof grammarAnalysis.taskCompletionScore === 'number' ? grammarAnalysis.taskCompletionScore : 3;
  const normalizedOverall = clamp(
    Math.round(llmBaseScore + Math.min(llmLengthPenalty, deterministicLengthPenalty) + llmOffTopicPenalty),
    0,
    100
  );
  const cappedOverall = taskCompletionScore <= 2 ? Math.min(normalizedOverall, 40) : normalizedOverall;

  // 合併結果（失敗的部分用 fallback）
  const combined: WritingAnalysis = {
    overallScore: cappedOverall,
    strengths: styleAnalysis.strengths || [],
    weaknesses: styleAnalysis.weaknesses || [],
    grammarErrors: grammarAnalysis.grammarErrors || [],
    chinglishWarnings: grammarAnalysis.chinglishWarnings || [],
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
    console.warn(`[analyzeWriting] 部分分析失敗: ${failedParts}`);
  }

  const validated = validateAIResponse(WritingAnalysisSchema, combined);
  if (!validated.success) throw new Error(validated.error);
  return validated.data;
}

// ============================================
// 四、錯題 AI 解說
// ============================================

export interface ExplainMistakeInput {
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
        console.log(`[DSE-RAG] explainMistake: 已擷取 ${msChunks.length} 個 MS 段落`);
      }
    }
  } catch (err) {
    console.warn('[DSE-RAG] explainMistake MS 檢索失敗，fallback:', err instanceof Error ? err.message : String(err));
    msContextPrompt = '';
  }
  const systemPrompt = `你是一位香港中學英文科教師，專門為學生解釋錯題。
請參考 HKDSE English Language Level Descriptors（Subject / Reading / Writing / Listening）來判斷學生錯誤對應的能力水平。
請以純 JSON 格式回覆（以 { 開頭，以 } 結尾，不要用 Markdown 代碼塊包裝），所有中文使用繁體中文。

HKDSE 常見錯誤類型與對應等級：
- 詞義推斷失敗 / 無法追蹤論點 → Reading Level 2-3 典型弱項
- 未能辨識說話者態度意圖 / 不懂重音語調提示 → Listening Level 2-3 典型弱項
- 中式英文 / 基本文法錯誤 → Writing Level 1-2 典型弱項
- 理解錯誤 / 答非所問 → 跨卷別共通弱項（comprehension）

回覆欄位：
1. reasonZh: string 為什麼答錯（繁體中文，簡潔易懂，並指出對應 HKDSE 哪個等級能力不足）
2. reasonEn: string 為什麼答錯（英文版）
3. ruleExplanation: string 相關文法/語言規則的詳細說明（繁體中文）
4. examples: { wrong: string, correct: string }[] 2-3組對比例句
5. memoryTip: string 記憶口訣或技巧（繁體中文）
6. relatedTopics: string[] 相關學習主題建議`;

  const userPrompt = `題目：${input.question}
正確答案：${input.correctAnswer}
學生答案：${input.studentAnswer}
${input.grammarItemZh ? `文法項目：${input.grammarItemZh}` : ''}
${input.studentLevel ? `學生年級：${input.studentLevel}` : ''}

請幫學生解釋為什麼答錯了，以及如何避免再犯。`;

  const result = await callLLM(
    [
      { role: 'system', content: systemPrompt + msContextPrompt },
      { role: 'user', content: userPrompt },
    ],
    { temperature: 0.5, maxTokens: 2048, jsonMode: true }
  );

  const explanation = parseAIJSON<MistakeExplanation>(result);
  const validated = validateAIResponse(MistakeExplanationSchema, explanation);
  if (!validated.success) throw new Error(validated.error);
  return validated.data;
}

// ============================================
// 五、學習進度分析與建議
// ============================================

export interface AnalyzeProgressInput {
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
        console.log(`[DSE-RAG] analyzeProgress: 已擷取 ${pastPaperChunks.length} 試題 + ${msChunks.length} MS`);
      }
    }
  } catch (err) {
    console.warn('[DSE-RAG] analyzeProgress RAG 失敗，fallback:', err instanceof Error ? err.message : String(err));
  }

  const systemPrompt = `${dseContextPrompt}你是一位香港中學英文科的學習顧問，熟悉 HKDSE English Language Level Descriptors。
請根據學生的學習數據，對照 HKDSE 等級描述提供個人化分析與建議。
以純 JSON 格式回覆（以 { 開頭，以 } 結尾，不要用 Markdown 代碼塊包裝），所有中文使用繁體中文。

HKDSE Subject Descriptors 參考：
- Level 5: 理解近自然語速口語（含比喻）、評價觀點、從語調辨識態度；理解複雜文本、追蹤論點、推論詞義；寫作有趣相關有組織、廣泛句式準確、語域恰當；表達流暢準確、持續互動。
- Level 3: 理解中等語速字面口語、辨識明確觀點；理解簡單文本、做直接推論；寫作相關有組織（熟悉語境）、部分複合句準確、基本語域；使用簡單常用表達、回應他人。
- Level 1: 理解簡短簡單口語、提取可預測信息；理解部分簡單文本、辨識基本事實；寫作一兩個相關點、數句簡單可理解句子；使用少數簡短表達、在被提示時回應。

回覆欄位：
1. summary: string 整體學習狀況摘要（對照 HKDSE Level）
2. strengthsAreas: string[] 學生做得好的方面
3. urgentAreas: string[] 急需改善的弱項（標明對應 HKDSE 卷別與等級）
4. recommendedFocus: { skill, reason, priority }[] 建議優先學習的技能
5. studyPlan: string 未來一週學習計劃建議
6. encouragementMessage: string 鼓勵訊息（正向、具體）
7. estimatedTimeToImprove: string 預計改善所需時間`;

  const weakSkillsDesc = input.weakSkills
    .map(s => `${s.nameZh} (正確率: ${s.accuracy}%)`)
    .join('、');

  const recentDesc = input.recentPerformance
    .map(p => `${p.date}: 正確率${p.accuracy}%, ${p.questionsDone}題`)
    .join('\n');

  const userPrompt = `學生資料：
- 年級：${input.studentLevel}
- 整體正確率：${input.overallAccuracy}%
- 連續學習天數：${input.streakDays} 天
- 弱項技能：${weakSkillsDesc || '無明顯弱項'}

近期表現：
${recentDesc}

請提供個人化學習建議。`;

  const result = await callLLM(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    { temperature: 0.6, maxTokens: 2048, jsonMode: true }
  );

  const progress = parseAIJSON<ProgressAnalysis>(result);
  const validated = validateAIResponse(ProgressAnalysisSchema, progress);
  if (!validated.success) throw new Error(validated.error);
  return validated.data;
}

export interface StudyHelpInput {
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
        console.log(`[DSE-RAG] studyHelp: 已擷取 ${pastPaperChunks.length} 歷屆試題 + ${msChunks.length} MS 段落`);
      }
    }
  } catch (err) {
    console.warn('[DSE-RAG] studyHelp RAG 檢索失敗，fallback:', err instanceof Error ? err.message : String(err));
    dseContextPrompt = '';
  }

  const systemPrompt = `你是一位香港中學英文科私人學習顧問，熟悉 HKDSE English Language Level Descriptors（Subject / Reading / Writing / Listening / Speaking）。
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
    { temperature: 0.5, maxTokens: 2048, jsonMode: true }
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
  const systemPrompt = `你是一位香港中學英文科教材分析專家。
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
    { temperature: 0.4, maxTokens: 4096, jsonMode: true }
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
  textType: string;
  gradeLevel: string;
  wordLimit: number;
  topicHint?: string;
  lang?: 'zh' | 'en';
  /** 學生弱項技能，用於針對性出題 */
  weakSkills?: string[];
}

export interface GenerateWritingOutlineInput {
  textType: string;
  gradeLevel: string;
  wordLimit: number;
  writingPrompt: string;
  topicHint?: string;
  lang?: 'zh' | 'en';
  /** 學生弱項技能 */
  weakSkills?: string[];
}

export interface GenerateWritingGuideInput {
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
 * ✍️ DSE Writing 文體結構知識庫
 * 整合自 DSE Writing 教學專家的文體結構指引
 */
const DSE_TEXT_TYPE_GUIDE: Record<string, {
  name: string;
  nameZh: string;
  requiredElements: string[];
  structure: { paragraph: number; role: string; roleZh: string; keyContent: string }[];
  commonErrors: { error: string; errorZh: string; fix: string }[];
  usefulOpeners: string[];
  usefulClosers: string[];
}> = {
  'argumentative-essay': {
    name: 'Argumentative Essay',
    nameZh: '議論文',
    requiredElements: ['Thesis statement', '3 supporting arguments', '1 counter-argument', '1 rebuttal', 'PEEL structure per paragraph'],
    structure: [
      { paragraph: 1, role: 'Introduction', roleZh: '引言', keyContent: 'Hook + Background + Clear thesis statement (your stance)' },
      { paragraph: 2, role: 'Body — Reason 1', roleZh: '主體 — 理由一', keyContent: 'PEEL: Point → Explain → Example → Link. Use "Firstly / To begin with"' },
      { paragraph: 3, role: 'Body — Reason 2', roleZh: '主體 — 理由二', keyContent: 'PEEL. Use "Secondly / Furthermore / Moreover". Provide specific real-world example.' },
      { paragraph: 4, role: 'Body — Reason 3', roleZh: '主體 — 理由三', keyContent: 'PEEL. Use "Most importantly / Thirdly". This should be your STRONGEST argument.' },
      { paragraph: 5, role: 'Counter-argument', roleZh: '反方論點', keyContent: '"Admittedly / Some may argue that..." Present the opposing view fairly.' },
      { paragraph: 6, role: 'Rebuttal', roleZh: '駁論', keyContent: '"However / Nevertheless..." Dismantle the counter-argument. This is the HIGHEST-SCORING part.' },
      { paragraph: 7, role: 'Conclusion', roleZh: '結論', keyContent: 'Restate thesis (using different words) + Summarize main points + Call to action or future outlook' },
    ],
    commonErrors: [
      { error: 'Thesis statement unclear or absent', errorZh: '論點陳述模糊或缺失', fix: 'Write ONE clear sentence stating your position at the end of the introduction' },
      { error: 'No counter-argument and rebuttal', errorZh: '缺乏反方論點與駁論', fix: 'Always include at least 1 counter-argument + rebuttal — this is what separates Level 3 from Level 5' },
      { error: 'Arguments are repetitive (saying the same thing 3 ways)', errorZh: '三個論點實質重複', fix: 'Ensure each reason addresses a DIFFERENT angle (e.g., economic, social, environmental)' },
      { error: 'New argument introduced in conclusion', errorZh: '結論段引入新論點', fix: 'Conclusion should ONLY summarize, never introduce new ideas' },
      { error: 'Overuse of "I think / I believe"', errorZh: '過度使用 I think / I believe', fix: 'Replace with objective phrasing: "It is evident that...", "Research demonstrates that..."' },
    ],
    usefulOpeners: [
      'In today\'s society, the debate over [topic] has become increasingly prominent.',
      'Few issues are as contentious as [topic]. While some argue that..., I firmly believe that...',
      'As [topic] continues to dominate headlines, it is time we examined this issue critically.',
    ],
    usefulClosers: [
      'In conclusion, while [counter-view] has its merits, the evidence overwhelmingly supports [your view].',
      'Ultimately, the path forward is clear: [your main recommendation]. The time to act is now.',
      'Let us not be paralyzed by indecision. By [action], we can ensure a brighter future for all.',
    ],
  },
  'letter-formal': {
    name: 'Formal Letter',
    nameZh: '正式書信',
    requiredElements: ['Sender\'s address', 'Date', 'Recipient\'s name and address', 'Appropriate salutation (Dear Mr./Ms./Dr. X or Dear Sir/Madam)', 'Matching closing (Yours sincerely / Yours faithfully)', 'No contractions', 'Formal tone'],
    structure: [
      { paragraph: 1, role: 'Sender Info + Salutation', roleZh: '寄件人資料 + 稱呼', keyContent: 'Address (top-right) → Date → Recipient address (left) → Dear [Title] [Surname],' },
      { paragraph: 2, role: 'Opening — Purpose', roleZh: '開首 — 目的', keyContent: '"I am writing to express my concern regarding..." / "I am writing to apply for..." — State purpose clearly in the FIRST sentence' },
      { paragraph: 3, role: 'Body — Point 1', roleZh: '主體 — 要點一', keyContent: 'Elaborate first reason/concern with specific examples. Use formal connecting phrases: "Furthermore / Moreover / In addition"' },
      { paragraph: 4, role: 'Body — Point 2', roleZh: '主體 — 要點二', keyContent: 'Second point with evidence. "It is also worth noting that..." / "Another pressing concern is..."' },
      { paragraph: 5, role: 'Closing — Call to Action', roleZh: '結尾 — 行動呼籲', keyContent: '"I would be grateful if you could..." / "I urge you to consider..." — Be polite but firm' },
      { paragraph: 6, role: 'Sign-off', roleZh: '結尾敬語', keyContent: 'Yours sincerely, (if you know the name) OR Yours faithfully, (if Dear Sir/Madam) → Signature → Printed Name' },
    ],
    commonErrors: [
      { error: 'Wrong salutation-closing pairing', errorZh: '稱呼與結尾敬語配對錯誤', fix: 'Dear Mr. Chan → Yours sincerely / Dear Sir/Madam → Yours faithfully (記憶法：不知對方名字 = "非"親"非"故 → faith-fully)' },
      { error: 'Using contractions in formal letter', errorZh: '正式信中使用縮寫', fix: 'don\'t → do not, can\'t → cannot, I\'m → I am — NEVER use contractions in formal letters' },
      { error: 'Missing address or date', errorZh: '遺漏地址或日期', fix: 'Always include your address (top-right) and the date below it' },
      { error: 'Tone too casual or aggressive', errorZh: '語氣過於隨便或激進', fix: 'Use polite, measured language: "I would appreciate it if..." NOT "You should..."' },
    ],
    usefulOpeners: [
      'I am writing to express my concern regarding...',
      'I am writing to apply for the position of...',
      'I am writing on behalf of [organization] to bring to your attention...',
    ],
    usefulClosers: [
      'I would be grateful if you could address this matter at your earliest convenience.',
      'I look forward to hearing from you.',
      'Thank you for your time and consideration.',
    ],
  },
  'letter-informal': {
    name: 'Informal Letter / Letter of Advice',
    nameZh: '非正式書信 / 建議信',
    requiredElements: ['Date', 'Dear [First Name],', 'Friendly, conversational tone', 'Contractions allowed', 'Personal anecdotes welcome', 'Appropriate closing (Best wishes / Love / Take care)'],
    structure: [
      { paragraph: 1, role: 'Opening — Greeting & Context', roleZh: '開首 — 問候與背景', keyContent: '"How have you been?" / "I hope this letter finds you well." / "I heard about [situation] and wanted to share some thoughts."' },
      { paragraph: 2, role: 'Body — Advice Point 1', roleZh: '主體 — 建議一', keyContent: '"First of all, I think you should..." — Use empathetic language: "I understand how you feel..."' },
      { paragraph: 3, role: 'Body — Advice Point 2', roleZh: '主體 — 建議二', keyContent: '"Another thing you could try is..." — Share personal experience if relevant: "When I was in a similar situation..."' },
      { paragraph: 4, role: 'Closing — Encouragement', roleZh: '結尾 — 鼓勵', keyContent: '"I\'m always here if you need to talk." / "Don\'t worry — things will get better!" — End on a positive, supportive note' },
    ],
    commonErrors: [
      { error: 'Tone too formal for a friend', errorZh: '對朋友語氣過於正式', fix: 'Use contractions, casual expressions, and personal anecdotes' },
      { error: 'Advice too vague ("just be positive")', errorZh: '建議太空泛', fix: 'Give CONCRETE, actionable suggestions with specific steps' },
      { error: 'Forgetting to show empathy', errorZh: '缺乏同理心表達', fix: 'Start with "I understand how difficult this must be..." before giving advice' },
    ],
    usefulOpeners: [
      'How have you been? I was so happy to receive your letter!',
      'I heard about what happened and I wanted to reach out.',
      'It\'s been ages since we last caught up! I hope everything is going well.',
    ],
    usefulClosers: [
      'Take care and write back soon!',
      'I\'m always just a phone call away if you need anything.',
      'Best wishes and stay strong!',
    ],
  },
  'speech': {
    name: 'Speech',
    nameZh: '演講辭',
    requiredElements: ['Greeting to audience', 'Self-introduction (if needed)', 'Clear topic statement', 'Rhetorical devices (rhetorical questions, repetition, tripling)', 'Audience engagement', 'Call to action', 'Thank you'],
    structure: [
      { paragraph: 1, role: 'Opening — Greeting + Hook', roleZh: '開場 — 問候 + 引入', keyContent: '"Good morning, fellow students and teachers." / "Have you ever wondered why...?" — Start with a rhetorical question, anecdote, or shocking statistic' },
      { paragraph: 2, role: 'Body — Point 1 with Example', roleZh: '主體 — 要點一 + 例子', keyContent: 'Use personal stories or vivid examples. "Let me share a story..." / "Imagine a world where..."' },
      { paragraph: 3, role: 'Body — Point 2 with Example', roleZh: '主體 — 要點二 + 例子', keyContent: 'Use rhetorical devices: repetition ("We must act. We must change. We must..."), tripling, emotive language' },
      { paragraph: 4, role: 'Closing — Call to Action + Thanks', roleZh: '結尾 — 行動呼籲 + 致謝', keyContent: '"Let us work together to..." / "The time to act is now!" / "Thank you for your attention."' },
    ],
    commonErrors: [
      { error: 'Forgetting the greeting', errorZh: '忘記開場問候', fix: 'Always start with "Good morning/afternoon, [audience]" — this is a basic format requirement' },
      { error: 'Tone too written/formal — reads like an essay', errorZh: '語氣太書面化，不像演講', fix: 'Use contractions, direct address ("you"), rhetorical questions, and shorter sentences' },
      { error: 'No audience engagement', errorZh: '缺乏與聽眾的互動', fix: 'Use "As we all know...", "You may have experienced...", "Raise your hand if..."' },
      { error: 'Weak ending', errorZh: '結尾平淡無力', fix: 'End with a powerful call to action and thank the audience. Make the last sentence MEMORABLE.' },
    ],
    usefulOpeners: [
      'Good morning, fellow students and teachers. Have you ever stopped to think about [topic]?',
      'Good afternoon, everyone. Today, I want to talk about something that affects every single one of us: [topic].',
      'Good morning. Imagine waking up one day to find that [scenario]. This is not a distant fantasy — it is a reality that...',
    ],
    usefulClosers: [
      'Let us not wait until it is too late. The time to act is now — together, we can make a difference. Thank you.',
      'So I leave you with this question: what kind of future do you want to create? Thank you for your attention.',
      'Remember, change begins with each and every one of us. Let\'s start today. Thank you.',
    ],
  },
  'article': {
    name: 'Article',
    nameZh: '文章',
    requiredElements: ['Catchy headline/title', 'Engaging lead paragraph', 'Clear sub-topics (may use sub-headings)', 'Personal voice and style', 'Short paragraphs for readability', 'Memorable conclusion'],
    structure: [
      { paragraph: 1, role: 'Headline + Lead', roleZh: '標題 + 導言', keyContent: 'Write a catchy title (can be a question). Lead paragraph: hook the reader — use a surprising fact, anecdote, or provocative question' },
      { paragraph: 2, role: 'Body — Angle 1', roleZh: '主體 — 角度一', keyContent: 'Develop the first angle with examples, quotes, or data. Keep paragraphs SHORT (3-4 sentences max for readability)' },
      { paragraph: 3, role: 'Body — Angle 2', roleZh: '主體 — 角度二', keyContent: 'Contrasting or complementary angle. Use sub-headings if appropriate. Maintain an engaging, personal tone' },
      { paragraph: 4, role: 'Conclusion — Takeaway', roleZh: '結論 — 要點', keyContent: 'Leave the reader with something to think about. End with a powerful statement or question.' },
    ],
    commonErrors: [
      { error: 'Boring or generic title', errorZh: '標題平淡無奇', fix: 'Use a question: "Is Social Media Destroying Our Society?" or a provocative statement' },
      { error: 'Paragraphs too long (wall of text)', errorZh: '段落過長，不易閱讀', fix: 'Keep paragraphs to 3-4 sentences. Use short sentences for impact. Vary paragraph length.' },
      { error: 'Lack of personal voice — reads like a textbook', errorZh: '缺乏個人風格', fix: 'Inject your personality — use vivid descriptions, personal observations, and unique perspectives' },
    ],
    usefulOpeners: [
      'Did you know that [shocking statistic]? This little-known fact reveals a much larger problem: [topic].',
      'It was 7:30 am on a Monday when I first realized that [topic] was about to change my life.',
      'Walk down any street in Hong Kong and you\'ll see it — [observation]. But what does this mean for us?',
    ],
    usefulClosers: [
      'So the next time you [action], remember: [takeaway message].',
      'The question is no longer whether we should act, but how soon we can start.',
      'Perhaps it\'s time we all asked ourselves: [provocative question]?',
    ],
  },
  'report': {
    name: 'Report',
    nameZh: '報告',
    requiredElements: ['Title', 'Introduction (purpose + scope)', 'Findings (with sub-headings)', 'Data presentation', 'Recommendations (if applicable)', 'Conclusion', 'Objective, impersonal tone'],
    structure: [
      { paragraph: 1, role: 'Title + Introduction', roleZh: '標題 + 引言', keyContent: 'Title: "Report on [Topic]". Introduction: state purpose, scope, and methodology. "This report aims to..."' },
      { paragraph: 2, role: 'Findings — Sub-heading 1', roleZh: '調查結果 — 副標題一', keyContent: 'Use sub-headings. Present data clearly. "According to the survey..." / "The data shows that..." Use passive voice for objectivity.' },
      { paragraph: 3, role: 'Findings — Sub-heading 2', roleZh: '調查結果 — 副標題二', keyContent: 'Second finding. Use specific numbers: "65% of respondents indicated..." NOT "Most people think..."' },
      { paragraph: 4, role: 'Recommendations', roleZh: '建議', keyContent: '"Based on the findings, the following recommendations are proposed:..." Use bullet points if appropriate. Each recommendation should link to findings.' },
      { paragraph: 5, role: 'Conclusion', roleZh: '結論', keyContent: 'Summarize key findings and reiterate main recommendation. Keep it concise and professional.' },
    ],
    commonErrors: [
      { error: 'Using first person (I, we) too much', errorZh: '過度使用第一人稱', fix: 'Use passive voice: "It was found that..." / "It is recommended that..." NOT "I found that..."' },
      { error: 'Vague data ("many people", "a lot")', errorZh: '數據含糊', fix: 'Use specific numbers: "65% of respondents", "three out of five students"' },
      { error: 'No sub-headings — wall of text', errorZh: '缺乏副標題，結構混亂', fix: 'Use clear sub-headings to organize findings. Each sub-section should address ONE topic.' },
      { error: 'Recommendations not linked to findings', errorZh: '建議與調查結果脫節', fix: 'Each recommendation should directly follow from a finding. Reference the data.' },
    ],
    usefulOpeners: [
      'This report aims to investigate [topic] and provide recommendations based on the findings.',
      'The purpose of this report is to examine [topic] following [context/event].',
      'This report presents the findings of a survey conducted among [group] regarding [topic].',
    ],
    usefulClosers: [
      'In conclusion, the findings indicate that [summary]. It is recommended that [action] be implemented.',
      'Based on the evidence presented, it is clear that [conclusion]. The proposed recommendations should be considered for immediate action.',
    ],
  },
  'proposal': {
    name: 'Proposal',
    nameZh: '計劃書',
    requiredElements: ['Title', 'Introduction (background + problem)', 'Objectives (SMART)', 'Proposed Activities/Methods', 'Timeline and resources', 'Expected outcomes', 'Conclusion'],
    structure: [
      { paragraph: 1, role: 'Title + Introduction', roleZh: '標題 + 引言', keyContent: 'Title: "A Proposal for [Project]". Introduction: describe the background, current situation, and the problem you aim to solve.' },
      { paragraph: 2, role: 'Objectives', roleZh: '目標', keyContent: 'List 2-3 SMART objectives (Specific, Measurable, Achievable, Relevant, Time-bound). "The objectives of this proposal are: 1)..."' },
      { paragraph: 3, role: 'Proposed Activities', roleZh: '建議活動', keyContent: 'Describe activities in detail. Include timeline, venue, resources needed. "The campaign will run for 3 weeks, from [date] to [date]..."' },
      { paragraph: 4, role: 'Budget & Resources', roleZh: '預算與資源', keyContent: 'Estimated costs, personnel needed (Person-In-Charge), equipment. Be realistic and detailed.' },
      { paragraph: 5, role: 'Expected Outcomes', roleZh: '預期成果', keyContent: 'What will success look like? "It is expected that..." / "This initiative will result in..." Be specific and measurable.' },
      { paragraph: 6, role: 'Conclusion', roleZh: '結論', keyContent: 'Summarize why this proposal should be accepted. End with a persuasive call to approve.' },
    ],
    commonErrors: [
      { error: 'Objectives too vague and unmeasurable', errorZh: '目標空泛，缺乏可衡量性', fix: 'Make objectives SMART: "Increase participation by 30%" NOT "Get more people involved"' },
      { error: 'No timeline or resource plan', errorZh: '缺乏時間表和資源規劃', fix: 'Always include specific dates, duration, venue, and estimated budget' },
      { error: 'Ignoring potential challenges', errorZh: '忽略潛在困難', fix: 'Address 1-2 potential challenges and how you plan to overcome them — shows critical thinking' },
      { error: 'Expected outcomes unrealistic', errorZh: '預期成效過於理想化', fix: 'Be realistic. "Raise awareness among 200 students" is better than "Solve the problem entirely"' },
    ],
    usefulOpeners: [
      'This proposal outlines a plan to address [problem] at [context/school/organization].',
      'In response to [situation], this proposal presents a comprehensive plan for [solution].',
    ],
    usefulClosers: [
      'I believe this proposal represents a practical and effective solution. I look forward to your approval.',
      'With the support of [stakeholders], this initiative has the potential to create lasting positive change.',
    ],
  },
};

/**
 * ✍️ DSE Writing 詞彙升級對照表
 */
const VOCAB_UPGRADES: { basic: string; advanced: string; context: string }[] = [
  { basic: 'important', advanced: 'crucial / vital / essential / paramount', context: '強調重要性' },
  { basic: 'good', advanced: 'beneficial / advantageous / favorable / commendable', context: '正面評價' },
  { basic: 'bad', advanced: 'detrimental / harmful / adverse / undesirable', context: '負面評價' },
  { basic: 'show', advanced: 'demonstrate / illustrate / reveal / indicate', context: '呈現/展示' },
  { basic: 'think', advanced: 'believe / contend / argue / assert / maintain', context: '表達觀點' },
  { basic: 'many', advanced: 'numerous / a multitude of / a plethora of / countless', context: '數量多' },
  { basic: 'big', advanced: 'substantial / considerable / significant / immense', context: '形容大小/程度' },
  { basic: 'get', advanced: 'obtain / acquire / attain / secure', context: '獲得' },
  { basic: 'say', advanced: 'claim / assert / contend / emphasize / highlight', context: '表達/說話' },
  { basic: 'because', advanced: 'due to / owing to / as a result of / on account of', context: '因果關係' },
  { basic: 'but', advanced: 'however / nevertheless / nonetheless / on the contrary', context: '對比轉折' },
  { basic: 'so', advanced: 'consequently / therefore / thus / hence / as a result', context: '因果結論' },
  { basic: 'very', advanced: 'exceedingly / remarkably / exceptionally / profoundly', context: '程度加強' },
  { basic: 'problem', advanced: 'issue / concern / challenge / dilemma / predicament', context: '問題/困境' },
  { basic: 'solve', advanced: 'resolve / address / tackle / remedy / alleviate', context: '解決' },
];

/**
 * ✍️ DSE Writing 常見中式英文修正
 */
const CHINGLISH_FIXES: { chinglish: string; correct: string; explanationZh: string }[] = [
  { chinglish: 'According to my opinion', correct: 'In my opinion / From my perspective', explanationZh: '"According to" 後接客觀來源（如研究、報告），不可接個人意見。' },
  { chinglish: 'Although... but...', correct: 'Although... (no "but")...', explanationZh: '英文中 although 和 but 不可並用，選其一即可。' },
  { chinglish: 'Because... so...', correct: 'Because... (no "so")...', explanationZh: '英文中 because 和 so 不可並用，如同 although 和 but。' },
  { chinglish: 'I very like it', correct: 'I really like it / I like it very much', explanationZh: '"Very" 修飾形容詞/副詞，不可直接修飾動詞。' },
  { chinglish: 'There have many people', correct: 'There are many people', explanationZh: '"There have" 是中式直譯，應用 "There is/are"。' },
  { chinglish: 'I am agree', correct: 'I agree', explanationZh: '"Agree" 是動詞，前面不需要 be 動詞。' },
  { chinglish: 'Discuss about', correct: 'Discuss (no "about")', explanationZh: '"Discuss" 是及物動詞，直接接賓語，不需要 about。' },
  { chinglish: 'More and more + adjective', correct: 'increasingly + adjective', explanationZh: '"More and more important" → "increasingly important" 更正式、更地道。' },
  { chinglish: 'Every coin has two sides', correct: 'There are two sides to every issue / The issue is double-edged', explanationZh: '"Every coin has two sides" 是中式英語 cliché，評卷員已看膩。' },
  { chinglish: 'Last but not least', correct: 'Finally / Most importantly', explanationZh: '"Last but not least" 過度使用已成為 cliché，用更簡潔的替代。' },
];

/**
 * ✍️ 生成寫作題目 — 產出一個具體、符合 DSE 標準的作文題目
 * 整合 DSE 教學專家指引：包含情境、角色、任務、具體要求、字數
 */
export async function generateWritingPrompt(input: GenerateWritingPromptInput): Promise<string> {
  const lang = input.lang || 'en';
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
${input.topicHint ? `Topic area: ${input.topicHint}` : 'Pick an engaging, DSE-relevant topic (education, technology, environment, social issues, youth culture).'}${weakSkillHint}

DSE QUALITY STANDARDS:
- The prompt must be SPECIFIC and ACTIONABLE — not vague. Students should know exactly what to write.
- Include 3 checkable requirements (not just "express your views")
- The context must feel REAL and RELEVANT to HK students
- The task must match the text type's genre conventions (e.g., a speech needs audience awareness; a proposal needs measurable objectives)
- Use DSE-style phrasing: "Write a letter to...", "You are...", "In your [text type], you should..."

Example of a HIGH-QUALITY DSE prompt:
"You are the chairperson of your school's Environmental Protection Club. Your school has recently conducted a waste audit and found that 40% of campus waste comes from single-use plastics. Write a proposal to the school principal outlining a plan to make the campus plastic-free by the end of the academic year. In your proposal, you should (1) describe at least three concrete measures, (2) explain the expected benefits for the school community, and (3) address one potential challenge and how to overcome it. Write about 400 words."

CRITICAL: Output ONLY the writing prompt. No headings, no labels, no "Here is a prompt:". Just the complete, ready-to-use prompt text.`.trim();

  const userPrompt = `Create a DSE-style writing prompt. Text type: ${guide?.name || input.textType}. Grade: ${input.gradeLevel}. Word limit: ${input.wordLimit} words.${input.topicHint ? ` Topic: ${input.topicHint}.` : ''}${input.weakSkills?.length ? ` Target weak skills: ${input.weakSkills.join(', ')}.` : ''}`;

  const result = await callLLM(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    { temperature: 0.8, maxTokens: 1024, timeoutMs: 25000 }
  );

  return result.trim();
}

/**
 * 生成寫作大綱 — 產出中英對照、結構化的段落式大綱
 * 每個段落有獨特的具體內容，不是題目的重述
 */
export async function generateWritingOutline(input: GenerateWritingOutlineInput): Promise<string> {
  const lang = input.lang || 'en';
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

  const systemPrompt = `You are an experienced HKDSE English writing tutor who has trained hundreds of DSE students. Your job is to create a DETAILED, STRUCTURED, BILINGUAL (Chinese + English) writing outline that helps a ${input.gradeLevel} student plan their essay to DSE Paper 2 standards.

⚠️ THE OUTLINE MUST BE COMPLETELY DIFFERENT FROM THE WRITING PROMPT. The prompt tells WHAT to write. The outline tells HOW to write — paragraph by paragraph, with concrete, specific content ideas.

═══════════════════════════════════════
DSE WRITING STRUCTURE KNOWLEDGE
═══════════════════════════════════════

Target text type structure:
${structureGuide || '- Introduction (Hook + Background + Thesis), Body × 2-3 (PEEL), Counter-argument + Rebuttal (if argumentative), Conclusion'}

Common mistakes to avoid for this text type:
${commonErrors || '- Off-topic, no specific examples, weak thesis, no counter-argument, formulaic conclusion'}

═══════════════════════════════════════
DSE HIGH-SCORE TECHNIQUES TO EMBED
═══════════════════════════════════════

1. PEEL per paragraph: Point → Explain (elaborate) → Example (concrete) → Link (to next paragraph)
2. Show Don't Tell: "His palms were sweaty" NOT "He was nervous"
3. Concession + Rebuttal (argumentative): "Admittedly, some may argue... However..."
4. Vocab variety: Replace basic words with advanced (important→crucial/vital/paramount)
5. Sentence variety: Mix simple + compound + complex; use inversions ("Not only does this...")
6. Connector richness: Furthermore / Moreover / Nevertheless / Consequently / In stark contrast
7. Opening-closing echo: Conclusion echoes introduction but with different wording
8. Powerful conclusion: Summary → broader implications → memorable final line

═══════════════════════════════════════
OUTPUT FORMAT (STRICT)
═══════════════════════════════════════

Every section MUST be in BOTH Chinese (繁體中文) AND English:

---
## Paragraph N — [Paragraph Role] / [中文角色]
**Topic sentence / 主題句**:
- EN: [one clear topic sentence]
- ZH: [對應中文]

**Content points / 內容要點** (SHORT PHRASES only, 3-8 words English, NOT full sentences):
- EN: [short phrase] / ZH: [中文短語]

**Useful phrases / 實用句式**:
- EN: [linking phrase or sentence starter] / ZH: [中文]
---

CRITICAL RULES:
1. Content points MUST be SHORT PHRASES (3-8 English words, 4-10 Chinese characters) — NOT complete sentences.
2. Every section MUST have BOTH Chinese and English side by side.
3. Every paragraph MUST have COMPLETELY DIFFERENT content — no repetition.
4. Be CONCRETE and TOPIC-SPECIFIC — use real facts, places, policies, examples relevant to the topic.
5. Useful phrases should include DSE-level connectors appropriate to the paragraph's function.
6. Return ONLY the outline. No introductory/concluding remarks. No JSON. No "Here is an outline".

Text type: ${guide?.name || input.textType}
Grade: ${input.gradeLevel}
Word limit: ~${input.wordLimit} words${weakSkillHint}
Prompt: ${input.writingPrompt}
${input.topicHint ? `Topic context: ${input.topicHint}` : ''}`;

  const userPrompt = `Create a detailed bilingual (ZH+EN) paragraph-by-paragraph DSE writing outline.
Text type: ${guide?.name || input.textType}
Grade: ${input.gradeLevel}
Words: ~${input.wordLimit}
Prompt: ${input.writingPrompt}`;

  const result = await callLLM(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    { temperature: 0.7, maxTokens: 4096, timeoutMs: 25000 }
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
      { temperature: 0.4, maxTokens: 1024, jsonMode: true, timeoutMs: 15000 }
    );

    return parseAIJSON<{
      personalizedTips: string[];
      structureIssues: string[];
      suggestedNextParagraph: string;
      missingElements: string[];
    }>(result);
  } catch {
    // Fallback: return generic guidance
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
 * 先提供聆聽材料 → Note-taking 指引 → 寫作任務
 * 模擬 DSE Paper 3 Part B 的真實考試流程
 */
export async function generateIntegratedSkills(
  input: GenerateIntegratedSkillsInput
): Promise<IntegratedSkillsTask> {
  const diffMap: Record<string, { label: string; lines: string; traps: string; wordLimit: number }> = {
    remedial: {
      label: '補底 (Level 1-2)',
      lines: '一段短對話，8-12 行，2 位說話者',
      traps: '無需刻意加入陷阱',
      wordLimit: 80,
    },
    core: {
      label: '核心 (Level 3)',
      lines: '一段中等對話，12-18 行，2-3 位說話者，含 1-2 個 distraction',
      traps: '必須包含 1 個 distraction (說了又改) + 1 個 synonym replacement',
      wordLimit: 120,
    },
    challenge: {
      label: '挑戰 (Level 4-5)',
      lines: '一段長對話或 2 段相關對話，18-30 行，2-3 位說話者',
      traps: '必須包含 2+ 個陷阱：distraction + synonym + speaker attitude + numerical precision',
      wordLimit: 180,
    },
  };

  const diff = diffMap[input.difficulty];
  const taskTypeMap: Record<string, { name: string; nameZh: string; formatHint: string }> = {
    'summary': {
      name: 'Summary',
      nameZh: '摘要寫作',
      formatHint: 'Write a concise summary. Use your own words — do NOT copy directly from the listening. Organize points logically.',
    },
    'email-reply': {
      name: 'Email Reply',
      nameZh: '電郵回覆',
      formatHint: 'Write a proper email reply. Include: subject line, appropriate salutation, body paragraphs addressing all points from the listening, polite closing. Use semi-formal to formal tone.',
    },
    'short-article': {
      name: 'Short Article',
      nameZh: '短文撰寫',
      formatHint: 'Write a short article. Include: catchy headline, engaging opening, body paragraphs with key points from the listening, and a concluding remark. Use an appropriate tone for the target audience.',
    },
    'report': {
      name: 'Report',
      nameZh: '報告撰寫',
      formatHint: 'Write a report. Include: title ("Report on..."), introduction/background, findings (use sub-headings), and recommendations. Use objective tone and passive voice where appropriate.',
    },
  };

  const taskInfo = taskTypeMap[input.taskType];

  const systemPrompt = `你是一位香港 DSE English Paper 3 評卷專家，專門設計 Integrated Skills 練習題。
⚠️ 原創性要求：必須生成 100% 原創內容，嚴禁複製或改寫任何真實 HKDSE 試題。

請生成一個完整的 Integrated Skills 任務，模擬 DSE Paper 3 Part B「聽 → 記 → 寫」的真實考試流程。

═══════════════════════════════════════
一、聆聽材料 (listeningContent) 設計規則
═══════════════════════════════════════

1. 結構與長度：${diff.lines}
2. 角色標籤：Woman:/Man:/Boy/Girl:（TTS 相容，禁用 A/B/Speaker 標籤）
3. 內容密度：每 3-4 行必須包含一個可提取的 Content Point
4. 陷阱設計：${diff.traps}
5. 自然口語：linking (gonna/wanna)、reduction、hesitation (Um.../Well...)、self-correction
6. 題材：校園活動、社區服務、環保倡議、文化交流、科技應用、社會議題

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
    { temperature: 0.6, maxTokens: 4096, jsonMode: true, timeoutMs: 30000 }
  );

  const task = parseAIJSON<IntegratedSkillsTask>(result);

  // 驗證必要欄位
  if (!task.listeningContent || !task.writingTask) {
    throw new Error('AI 生成的 Integrated Skills 任務不完整');
  }

  return {
    listeningContent: task.listeningContent,
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

  const systemPrompt = `你是一位香港 DSE English Paper 3 評卷專家，專門批改 Integrated Skills (聆聽 + 寫作綜合) 答案。
請同時從「Listening 提取準確度」和「Writing 品質」兩個維度進行評估。

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
    { temperature: 0.3, maxTokens: 4096, jsonMode: true, timeoutMs: 30000 }
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
  const deepSeekConfigured = !!DEEPSEEK_API_KEY && DEEPSEEK_API_KEY !== 'sk-your-deepseek-api-key-here';
  const vertexGeminiConfigured = !!VERTEX_PROJECT_ID && hasServiceAccountSource();
  const geminiApiKeyConfigured = !!GEMINI_API_KEY;
  return deepSeekConfigured || vertexGeminiConfigured || geminiApiKeyConfigured;
}

export function isVertexGeminiConfigured(): boolean {
  return !!VERTEX_PROJECT_ID && hasServiceAccountSource();
}

export function getAIProviders() {
  return {
    deepseek: !!DEEPSEEK_API_KEY && DEEPSEEK_API_KEY !== 'sk-your-deepseek-api-key-here',
    vertexGemini: isVertexGeminiConfigured(),
    geminiApiKey: !!GEMINI_API_KEY,
    vertexProjectId: VERTEX_PROJECT_ID || null,
    vertexLocation: VERTEX_LOCATION,
    vertexModel: VERTEX_GEMINI_MODEL,
  };
}
