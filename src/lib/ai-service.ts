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
    .replace(/^\s*\(?\s*(?:[A-Da-d]|[1-4])\s*\)?\s+/u, '')
    // T: / F) / True: / False.
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

  return 'A';
}

// ============================================
// 答案準確性保障規則（注入 system prompt 結尾）
// ============================================
const STRICT_ANSWER_RULES = `
【答案準確性規則 — 必須嚴格遵守（CRITICAL）】
1. MCQ 題型：answer 欄位必須是 "A" / "B" / "C" / "D" 其中一個字母。
   該字母對應的 choices 選項內容必須是正確答案。
   嚴禁 answer 指向不存在於 choices 中的內容。
2. 聆聽題型 (listening)：answer 指向的正確答案必須逐字（verbatim）出現在 listeningContent 中。
   例如：listeningContent 中有 "at 4 o'clock"，則正確答案必須是包含 "4 o'clock" 的選項。
   嚴禁生成 listeningContent 中未出現的時間、數字、人名、地點作為正確答案。
3. 閱讀題型 (reading)：answer 指向的正確答案必須可從 readingContent 中直接推斷或引用。
   不可生成篇章中完全未提及的資訊作為正確答案。
4. 時間表達一致性：全題使用統一格式。
   若 listeningContent 用 "4 o'clock"，則 choices 中也用 "4 o'clock"，不可混用 "four o'clock" 或 "4:00"。
5. 數字一致性：若 listeningContent 提及 "15 dollars"，答案選項必須是 "15 dollars"，
   不可變成 "fifteen dollars" 或 "$15"。
6. 輸出前自我檢查（Self-Check）：生成每題後，確認 answer 對應的選項文字確實存在於 listeningContent/readingContent 中。
   如不一致，必須修正後再輸出。`;

function normalizeForComparison(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')           // 多空格 → 單空格
    .replace(/['']/g, "'")          // 統一撇號
    .replace(/[""]/g, '"')          // 統一引號
    .replace(/[–—]/g, '-')          // 統一破折號
    .replace(/[.!?,;:]$/, '');      // 移除尾部標點
}

/** 驗證生成題目的答案一致性，發現不一致時記錄警告 */
function validateAnswerConsistency(q: GeneratedQuestion, index: number): string[] {
  const warnings: string[] = [];

  // MCQ: answer 必須對應 choices 中的某個選項
  if (q.type === 'mc' && q.choices && q.choices.length > 0) {
    const answerLetter = (q.answer || '').trim().toUpperCase();
    const letterIndex = MCQ_LETTERS.indexOf(answerLetter as typeof MCQ_LETTERS[number]);
    if (letterIndex < 0 || letterIndex >= q.choices.length) {
      warnings.push(`Q${index}: answer "${q.answer}" 不指向任何選項 (choices count=${q.choices.length})`);
    }
  }

  // 聆聽題: answer 對應的選項文字必須出現在 listeningContent 中
  if (q.listeningContent && q.answer && q.choices && q.choices.length > 0) {
    const answerLetter = q.answer.trim().toUpperCase();
    const letterIndex = MCQ_LETTERS.indexOf(answerLetter as typeof MCQ_LETTERS[number]);
    if (letterIndex >= 0 && letterIndex < q.choices.length) {
      const answerText = q.choices[letterIndex];
      const normalizedListening = normalizeForComparison(q.listeningContent);
      const normalizedAnswer = normalizeForComparison(answerText);
      if (!normalizedListening.includes(normalizedAnswer)) {
        // 嘗試部分匹配（針對時間/數字表達）
        const words = normalizedAnswer.split(' ');
        const lastTwoWords = words.slice(-2).join(' ');
        const lastThreeWords = words.slice(-3).join(' ');
        if (!normalizedListening.includes(lastThreeWords) && !normalizedListening.includes(lastTwoWords)) {
          warnings.push(`Q${index} (LISTENING): answer text "${answerText}" not found verbatim in listeningContent`);
        }
      }
    }
  }

  // 閱讀題: answer 對應的選項文字應可從 readingContent 推斷
  if (q.readingContent && q.answer && q.choices && q.choices.length > 0) {
    const answerLetter = q.answer.trim().toUpperCase();
    const letterIndex = MCQ_LETTERS.indexOf(answerLetter as typeof MCQ_LETTERS[number]);
    if (letterIndex >= 0 && letterIndex < q.choices.length) {
      const answerText = q.choices[letterIndex];
      const normalizedReading = normalizeForComparison(q.readingContent);
      const normalizedAnswer = normalizeForComparison(answerText);
      // 對於 reading 題，答案不一定要逐字出現，但要檢查關鍵詞
      const keyWords = normalizedAnswer.split(' ').filter(w => w.length > 3);
      const missingKeywords = keyWords.filter(kw => !normalizedReading.includes(kw));
      if (missingKeywords.length === keyWords.length && keyWords.length > 0) {
        warnings.push(`Q${index} (READING): no keywords from answer "${answerText}" found in readingContent`);
      }
    }
  }

  return warnings;
}

function normalizeGeneratedQuestions(questions: GeneratedQuestion[]): GeneratedQuestion[] {
  return questions.map((q) => {
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
      return { ...base, choices: [] };
    }

    const cleanedChoices = Array.from(new Set(
      (base.choices || [])
        .map(stripMcqPrefix)
        .map(c => c.trim())
        .filter(Boolean)
    ));

    const fallbackChoices = [
      'All of the above.',
      'None of the above.',
      'Not mentioned in the question.',
      'Cannot be determined from the given information.',
    ];

    const normalizedChoices: string[] = [...cleanedChoices];
    for (const fallback of fallbackChoices) {
      if (normalizedChoices.length >= 4) break;
      if (!normalizedChoices.some(c => c.toLowerCase() === fallback.toLowerCase())) {
        normalizedChoices.push(fallback);
      }
    }

    const finalChoices = normalizedChoices.slice(0, 4);
    const finalAnswer = normalizeMcqAnswer(base.answer, finalChoices);

    // 驗證答案一致性並記錄警告
    const tempQuestion: GeneratedQuestion = {
      ...base,
      choices: finalChoices,
      answer: finalAnswer,
    };
    const warnings = validateAnswerConsistency(tempQuestion, 0);
    if (warnings.length > 0) {
      console.warn('[ai-service] Answer consistency warnings:', warnings);
    }

    return {
      ...base,
      choices: finalChoices,
      answer: finalAnswer,
    };
  });
}

export async function generateQuestions(input: GenerateQuestionsInput): Promise<GeneratedQuestion[]> {
  const count = input.count || 5;
  const skillDesc = input.grammarItemZh || input.languageSkillZh || input.grammarItem || input.languageSkill || '綜合';
  const typeDesc = input.questionType || 'mc';
  const diffMap = { remedial: '補底', core: '核心', challenge: '挑戰' };

  const isListening = input.languageSkill === 'listening';
  const isReading = input.languageSkill === 'reading';
  const isMcq = typeDesc === 'mc';

  // 聽力/閱讀題使用較低 temperature 提高準確性
  const qTemperature = (isListening || isReading) ? 0.3 : 0.7;

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
${input.topic ? `- 主題：${input.topic}` : ''}
${isListening ? `
【聆聽題特別要求】
- listeningContent: 一段完整的英文對話（50-100字），作為學生的聆聽材料
- 對話必須使用角色標籤格式，每行一個角色發言，以便 TTS 系統用不同聲音朗讀
- 正確格式示例：
  Woman: Excuse me, could you tell me where the nearest MTR station is?
  Man: Sure, just go straight and turn left at the second crossing.
  Woman: Thank you so much!
- 角色標籤只可使用：Woman / Man / Boy / Girl
- 嚴禁使用 A / B / Speaker A / Speaker B 等字母標籤！
  原因：TTS 系統會根據 Woman/Man 自動分配女聲/男聲，但不會讀出標籤文字，
  學生只聽到不同聲音，無法分辨誰是「A」誰是「B」。
- 題目 prompt 及選項中如需引用說話者，必須用 "the woman" / "the man" / "the boy" / "the girl"
  例如："What does the man suggest?" 而非 "What does A suggest?"
- listeningContentZh: 中文簡短情境說明
- prompt: 針對聆聽內容的題目問題` : ''}
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
}` : ''}

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

  const result = await callLLM(
    [
      { role: 'system', content: systemPrompt },
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
    // 後驗證：檢查所有題目的答案一致性
    const allWarnings: string[] = [];
    questions.forEach((q, i) => {
      allWarnings.push(...validateAnswerConsistency(q, i + 1));
    });
    if (allWarnings.length > 0) {
      console.warn('[ai-service] Generated questions have answer consistency issues:', allWarnings);
    }
    return questions;
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
      { role: 'system', content: systemPrompt },
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
  const grammarPrompt = `你是一位香港中學英文科教師兼 HKDSE English Paper 2 評卷員。
請嚴格依據以下官方 HKDSE Writing Level Descriptors 進行評分。
請以純 JSON 格式回覆（以 { 開頭，以 } 結尾）。

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
請以純 JSON 格式回覆（以 { 開頭，以 } 結尾）。

評分基準回顧：
- Level 5: Content 廣泛相關有創意；Language 句式廣泛準確、詞彙進階、語域恰當；Organization 完全連貫、分段有效。
- Level 4: Content 大部分詳細；Language 多種句式準確、錯誤不影響清晰；Organization 大部分連貫。
- Level 3: Content 大部分相關、有創意；Language 簡單及部分複合句準確、常用詞彙恰當；Organization 部分連貫。
- Level 2: Content 部分相關、使用熟悉文體特徵；Language 簡單句良好、基本標點正確；Organization 可辨識結構。
- Level 1: Content 少數相關點；Language 數句簡單可理解句子；Organization 句間少量連結。
- 低於 Level 1: 內容完全無關、只寫一兩句、無法辨識為完整文章。

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
              { role: 'system', content: grammarPrompt },
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
        { role: 'system', content: stylePrompt },
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
      { role: 'system', content: systemPrompt },
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
  const systemPrompt = `你是一位香港中學英文科的學習顧問，熟悉 HKDSE English Language Level Descriptors。
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
      { role: 'system', content: systemPrompt },
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
}

export interface GenerateWritingOutlineInput {
  textType: string;
  gradeLevel: string;
  wordLimit: number;
  writingPrompt: string;
  topicHint?: string;
  lang?: 'zh' | 'en';
}

/**
 * 生成寫作題目 — 產出一個具體、有啟發性的作文題目
 * 與 generateQuestions 完全分離，有獨立的 system prompt
 */
export async function generateWritingPrompt(input: GenerateWritingPromptInput): Promise<string> {
  const lang = input.lang || 'en';
  const systemPrompt = `You are an experienced HKDSE English Language Paper 2 examiner.
Create ONE complete, self-contained writing prompt. Return ONLY the prompt text.

The prompt MUST include ALL of these elements in order:
1. CONTEXT: A clear situation or background (1 sentence)
2. ROLE: Who the writer is (e.g. "You are the editor of your school magazine")
3. TASK: What to write, including the required text type (1 sentence)
4. REQUIREMENTS: 2-3 specific content points or guiding questions
5. WORD LIMIT: "Write about ${input.wordLimit} words."

Text type: ${input.textType}
Grade: ${input.gradeLevel} (${input.gradeLevel === 'S1' || input.gradeLevel === 'S2' || input.gradeLevel === 'S3' ? 'junior secondary — school, family, hobbies' : 'senior secondary — social issues, argumentative, DSE-level'})
${input.topicHint ? `Topic area: ${input.topicHint}` : 'Pick an engaging topic.'}

Example format:
"You are a member of your school's Environmental Protection Club. Your school has decided to go plastic-free starting next month. Write a letter to all students explaining the new policy, describing at least two benefits of reducing plastic use, and suggesting one practical way students can help. Write about 200 words."

CRITICAL: Output ONLY the writing prompt. No headings, no labels, no "Here is a prompt:". Just the complete, ready-to-use prompt text.`.trim();

  const userPrompt = `Create a complete writing prompt. Text type: ${input.textType}. Grade: ${input.gradeLevel}. Word limit: ${input.wordLimit} words.${input.topicHint ? ` Topic: ${input.topicHint}.` : ''}`;

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
  const systemPrompt = `You are an experienced HKDSE English writing tutor. Your job is to create a DETAILED, STRUCTURED, BILINGUAL (Chinese + English) writing outline that helps a ${input.gradeLevel} student plan their essay.

THE OUTLINE MUST BE COMPLETELY DIFFERENT FROM THE WRITING PROMPT. The prompt tells the student WHAT to write. The outline tells them HOW to write it — paragraph by paragraph, with concrete content ideas.

FORMAT: Every section MUST be in BOTH Chinese (繁體中文) AND English, using this exact format:

---
## Paragraph N — [Paragraph Role] / [中文角色]
**Topic sentence / 主題句**:
- EN: [one clear topic sentence]
- ZH: [對應中文]

**Content points / 內容要點** (use SHORT PHRASES only, NOT full sentences):
- EN: [short phrase 1] / ZH: [對應中文短語]
- EN: [short phrase 2] / ZH: [對應中文短語]
- EN: [short phrase 3] / ZH: [對應中文短語]

**Useful phrases / 實用句式**:
- EN: [linking phrase or sentence starter] / ZH: [對應中文]
---

CRITICAL RULES:
1. ALL content points MUST be SHORT PHRASES (3-8 words in English, 4-10 characters in Chinese) — NOT complete sentences. For example: "plastic bag levy scheme" NOT "The government introduced a plastic bag levy scheme in 2009."
2. Every section MUST have BOTH Chinese and English — always side by side.
3. Every paragraph MUST have COMPLETELY DIFFERENT content — do not repeat ideas.
4. Be CONCRETE and TOPIC-SPECIFIC — mention real facts, places, policies, or examples relevant to the topic.
5. The outline must be immediately usable — a student should be able to write each paragraph by following your points.
6. Return ONLY the outline. No introductory phrases like "Here is an outline". No concluding remarks. No JSON.

Structure:
- **Paragraph 1 — Introduction / 導論**
  - Hook / 開首語
  - Background context / 背景
  - Thesis statement / 論點陳述
${input.wordLimit >= 300 ? '- **Paragraph 2 — Body 1 / 主體段落一**: First main argument\n- **Paragraph 3 — Body 2 / 主體段落二**: Second main argument\n- **Paragraph 4 — Counter-argument / 反論駁斥**: Opposing view + rebuttal' : '- **Paragraph 2 — Body 1 / 主體段落一**: First main argument\n- **Paragraph 3 — Body 2 / 主體段落二**: Second main argument'}
- **Final Paragraph — Conclusion / 結論**
  - Restate thesis / 重申論點
  - Summarise key points / 總結要點
  - Final thought / 結語

Writing task details:
- Text type: ${input.textType}
- Grade: ${input.gradeLevel}
- Word limit: ~${input.wordLimit} words
- Prompt: ${input.writingPrompt}
${input.topicHint ? `- Topic context: ${input.topicHint}` : ''}`;

  const userPrompt = `Create a detailed bilingual (ZH+EN) paragraph-by-paragraph writing outline for this task. Use SHORT PHRASES for content points, NOT full sentences.\n\nPrompt: ${input.writingPrompt}\n\nText type: ${input.textType}\nGrade: ${input.gradeLevel}\nWords: ~${input.wordLimit}`;

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
