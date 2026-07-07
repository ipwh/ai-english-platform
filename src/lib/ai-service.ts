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
  MaterialAnalysisSchema,
  validateAIResponse,
} from './ai-schema';

// ============================================
// 設定
// ============================================

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1';
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface DeepSeekResponse {
  id: string;
  choices: { message: { role: string; content: string }; finish_reason: string }[];
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

// ============================================
// 核心 API 調用
// ============================================

async function callDeepSeek(
  messages: ChatMessage[],
  options?: { temperature?: number; maxTokens?: number; jsonMode?: boolean; timeoutMs?: number }
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
- listeningContent: 一段完整的英文對話或獨白（50-100字），作為學生的聆聽材料
- 對話必須用自然段落形式書寫，嚴禁使用 "Woman:" "Man:" "A:" "B:" 等角色標籤
- 正確格式示例："Excuse me, could you tell me where the nearest MTR station is? Sure, just go straight and turn left at the second crossing."
- 錯誤格式示例："Woman: Where is the MTR? Man: Go straight and turn left."（禁止此格式！）
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
- 回覆必須是有效的 JSON 陣列，以 [ 開頭，以 ] 結尾`;

  const userPrompt = `請生成 ${count} 道 ${skillDesc}（${diffMap[input.difficulty]}程度，${input.gradeLevel}）的${typeDesc === 'mc' ? '選擇題' : typeDesc === 'fill-blank' ? '填充題' : typeDesc === 'error-correction' ? '改錯題' : '寫作題'}。`;

  const result = await callDeepSeek(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    { temperature: 0.7, maxTokens: 2048, jsonMode: true, timeoutMs: 25000 }
  );

  const questions = parseGeneratedQuestions(result);
  const validated = validateAIResponse(GeneratedQuestionsArraySchema, questions);
  if (!validated.success) throw new Error(validated.error);
  return validated.data;
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

/** 穩健解析 AI 回傳的 JSON，處理 markdown 代碼塊、截斷等常見問題 */
export function parseAIJSON<T>(raw: string): T {
  let cleaned = raw
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();

  // 嘗試直接解析
  try { return JSON.parse(cleaned) as T; } catch { /* continue */ }

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
請以繁體中文提供詳細分析，並以 JSON 格式回覆。

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

  const result = await callDeepSeek(
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
  const systemPrompt = `你是一位香港中學英文科教師，專門批改學生英文作文。
請以 JSON 格式回覆詳細的寫作分析，所有中文內容使用繁體中文。

分析要點：
1. overallScore: 0-100 整體分數
2. strengths: string[] 文章中做得好的地方（繁體中文）
3. weaknesses: string[] 需要改善的地方（繁體中文）
4. grammarErrors: { original, correction, explanation }[] 文法錯誤及修正
5. chinglishWarnings: { original, suggestion, explanation }[] 中式英文問題（特別重要！）
6. vocabularySuggestions: { original, suggestion, reason }[] 詞彙改進建議
7. structureFeedback: string 文章結構整體評語
8. revisedVersion: string 修正後的完整版本（可選）
9. generalComment: string 總體評語（繁體中文）

重點：香港學生常見的中式英文（Chinglish）問題必須仔細標註。`;

  const userPrompt = `作文題目：${input.title}
寫作要求：${input.prompt}
${input.textType ? `文本類型：${input.textType}` : ''}
${input.studentLevel ? `學生年級：${input.studentLevel}` : ''}

學生作文內容：
"""
${input.studentDraft}
"""

請詳細批改這篇作文。`;

  const result = await callDeepSeek(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    { temperature: 0.4, maxTokens: 4096, jsonMode: true }
  );

  const writing = parseAIJSON<WritingAnalysis>(result);
  const validated = validateAIResponse(WritingAnalysisSchema, writing);
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
請以 JSON 格式回覆，所有中文使用繁體中文。

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

  const result = await callDeepSeek(
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
請根據學生的學習數據提供個人化分析與建議，以 JSON 格式回覆，所有中文使用繁體中文。

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

  const result = await callDeepSeek(
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
請分析以下教材內容，以 JSON 格式回覆，所有中文使用繁體中文。

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

  const result = await callDeepSeek(
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
// 七、輔助函數
// ============================================

/** 檢查 DeepSeek API 是否已設定 */
export function isDeepSeekConfigured(): boolean {
  return !!DEEPSEEK_API_KEY && DEEPSEEK_API_KEY !== 'sk-your-deepseek-api-key-here';
}
