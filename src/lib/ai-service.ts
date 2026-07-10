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

async function callLLM(
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

  if (hasDeepSeek) {
    try {
      const result = await callDeepSeek(messages, options);
      lastAIProvider = 'deepseek';
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`DeepSeek: ${msg}`);
      if (!hasVertexGemini && !hasGemini) {
        throw new Error(`AI 服務全部不可用。\n${errors.join('\n')}`);
      }
      console.warn('[ai-service] DeepSeek 失敗，切換 Gemini fallback:', msg);
    }
  }

  if (hasVertexGemini) {
    try {
      const result = await callGeminiViaVertex(messages, options);
      lastAIProvider = 'vertex-gemini';
      console.log('[ai-service] 使用 Vertex Gemini (fallback)');
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Vertex Gemini: ${msg}`);
      if (!hasGemini) {
        throw new Error(`AI 服務全部不可用。\n${errors.join('\n')}`);
      }
      console.warn('[ai-service] Vertex Gemini 失敗，切換 Gemini API key fallback:', msg);
    }
  }

  try {
    const result = await callGemini(messages, options);
    lastAIProvider = 'gemini-api';
    console.log('[ai-service] 使用 Gemini API key (fallback)');
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`Gemini API: ${msg}`);
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
}

export async function generateQuestions(input: GenerateQuestionsInput): Promise<GeneratedQuestion[]> {
  const count = input.count || 5;
  const skillDesc = input.grammarItemZh || input.languageSkillZh || input.grammarItem || input.languageSkill || '綜合';
  const typeDesc = input.questionType || 'mc';
  const diffMap = { remedial: '補底', core: '核心', challenge: '挑戰' };

  const isListening = input.languageSkill === 'listening';
  const systemPrompt = `你是一位香港中學英文科教師，熟悉 ELE KLACG 2017 課程指引。
請根據以下要求生成英語練習題目，並以純 JSON 陣列格式回覆（不要用 Markdown 代碼塊包裝）。

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

每題必須包含以下欄位（全部為必填）：
- type: 題型 ("mc" / "fill-blank" / "error-correction" / "short-writing")
- prompt: 英文題目問題${isListening ? '（針對聆聽內容的提問）' : ''}
- promptZh: 中文輔助說明
${isListening ? '- listeningContent: 英文聆聽材料（對話/獨白，50-100字）\n- listeningContentZh: 中文簡短情境說明\n' : ''}- choices: 選項陣列（MC題4個選項；其他題型給空陣列 []）
- answer: 正確答案（MC題給選項字母如 "A"；填充題給單詞）
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
- 回覆必須是有效的 JSON 陣列，以 [ 開頭，以 ] 結尾

【MCQ 選項品質要求（極重要）】
- 每個選項必須是完整、有意義的英文句子或片語（至少3個單詞），不可只有單個單詞或字母
- 所有選項必須屬於同一語法形式（如全部名詞片語、全部完整句子、全部動詞片語）
- 干擾選項必須看起來合理（plausible distractor），不可明顯荒謬
- 選項長度應大致相近，不可有某個選項明顯過長或過短
- 選項之間不可有重疊或包含關係

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
    { temperature: 0.7, maxTokens: 2048, jsonMode: true, timeoutMs: 25000 }
  );

  const tryValidate = (rawText: string) => {
    const parsed = parseGeneratedQuestions(rawText);
    const validated = validateAIResponse(GeneratedQuestionsArraySchema, parsed);
    if (!validated.success) {
      throw new Error(validated.error);
    }
    return validated.data;
  };

  try {
    return tryValidate(result);
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
  const systemPrompt = `你是一位香港中學英文科教師，負責批改學生的英文練習答案。
請以繁體中文提供詳細分析，並以純 JSON 格式回覆（以 { 開頭，以 } 結尾，不要用 Markdown 代碼塊包裝）。

分析要點：
1. 判斷答案是否正確（isCorrect: boolean）
2. 給予分數 0-100（score: number）
3. 提供繁體中文回饋（feedbackZh: string）
4. 提供英文回饋（feedbackEn: string）
5. 判斷錯誤類型（mistakeType: grammar/vocabulary/comprehension/careless/time-management/chinglish/none）
6. 詳細解釋（explanation: string，繁體中文）
7. 改進建議（improvementTip: string，繁體中文）
8. 相關文法點（relatedGrammarPoint: string，可選）

注意：
- 對香港學生的常見中式英文錯誤要特別標註
- 解釋要具體、易懂，適合中學生閱讀
- 使用繁體中文，避免簡體字`;

  const userPrompt = `題目：${input.question}
題型：${input.questionType}
正確答案：${input.correctAnswer}
學生答案：${input.studentAnswer}
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
  const context = `作文題目：${input.title}
寫作要求：${input.prompt}
${input.textType ? `文本類型：${input.textType}` : ''}
${input.studentLevel ? `學生年級：${input.studentLevel}` : ''}

學生作文內容：
"""
${essayContent}
"""`;

  // === Call 1：文法 + Chinglish + 總分 + 總評（語言準確性） ===
  const grammarPrompt = `你是一位香港中學英文科教師，專注批改語言準確性。
請以純 JSON 格式回覆（以 { 開頭，以 } 結尾）。

{
  "overallScore": 75,
  "grammarErrors": [
    { "original": "錯誤原文", "correction": "修正後", "explanation": "原因（繁體中文）" }
  ],
  "chinglishWarnings": [
    { "original": "中式英文原文", "suggestion": "建議改法", "explanation": "為何是中式英文（繁體中文）" }
  ],
  "generalComment": "語言準確性總評（繁體中文，50-80字）"
}

注意：只專注文法、拼字、中式英文、時態等語言問題。不需評論結構或詞彙。`.trim();

  const grammarUserPrompt = `${context}\n\n請只分析語言準確性（文法錯誤+中式英文+總分+總評）。`;

  // === Call 2：詞彙 + 結構 + 優缺點 + 修改版（寫作技巧） ===
  const stylePrompt = `你是一位香港中學英文科教師，專注批改寫作技巧並提供修改範例。
請以純 JSON 格式回覆（以 { 開頭，以 } 結尾）。

{
  "strengths": ["優點1（繁體中文）", "優點2"],
  "weaknesses": ["弱點1（繁體中文）", "弱點2"],
  "vocabularySuggestions": [
    { "original": "原詞", "suggestion": "建議詞", "reason": "原因（繁體中文）" }
  ],
  "structureFeedback": "文章結構評語（繁體中文，50-100字）",
  "revisedVersion": "修正後的完整文章（保留原意，修正文法錯誤及 Chinglish，優化詞彙與句型，不改變原文字數過多）"
}

注意：只專注詞彙選擇、句子變化、段落結構、論點組織等寫作技巧，並提供一個流暢的修改版本。不需評論文法或 Chinglish（已由另一分析處理）。`.trim();

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

  // 合併結果（失敗的部分用 fallback）
  const combined: WritingAnalysis = {
    overallScore: grammarAnalysis.overallScore ?? 70,
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
請以純 JSON 格式回覆（以 { 開頭，以 } 結尾，不要用 Markdown 代碼塊包裝），所有中文使用繁體中文。

回覆欄位：
1. reasonZh: string 為什麼答錯（繁體中文，簡潔易懂）
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
  const systemPrompt = `你是一位香港中學英文科的學習顧問。
請根據學生的學習數據提供個人化分析與建議，以純 JSON 格式回覆（以 { 開頭，以 } 結尾，不要用 Markdown 代碼塊包裝），所有中文使用繁體中文。

回覆欄位：
1. summary: string 整體學習狀況摘要
2. strengthsAreas: string[] 學生做得好的方面
3. urgentAreas: string[] 急需改善的弱項
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

  const systemPrompt = `你是一位香港中學英文科私人學習顧問。
請根據學生的個人背景、弱項與近期表現，回答學生的英文學習問題。
請使用繁體中文，語氣清晰、具體、可執行。
請以純 JSON 格式回覆（以 { 開頭，以 } 結尾，不要用 Markdown 代碼塊包裝），欄位如下：
1. answer: string 直接回答學生問題
2. followUpTips: string[] 2-4個後續學習建議
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
