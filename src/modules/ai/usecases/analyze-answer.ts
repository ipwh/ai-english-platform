// Sprint 92: Answer Analysis Use Case — canonical implementation
// Physically extracted from ai-service.ts

import { executeAI } from '../services/ai-execution';
import { sanitizeForAI } from '../services/sanitizer';
import { AnswerAnalysisSchema } from '../schemas/ai-schema';
import { HALLUCINATION_GUARD } from '../services/hallucination-guard';
import { isDSERAGEnabled, retrieveMarkingScheme, buildDSEContextPrompt, type DSESkill } from '../services/rag-service';
import { logger } from '@/shared/logger/logger';

export interface AnalyzeAnswerInput {
  userId?: string;
  question: string;
  questionType: string;
  correctAnswer: string;
  studentAnswer: string;
  choices?: string[];
  listeningContent?: string;
  readingContent?: string;
  grammarItem?: string;
  grammarItemZh?: string;
  studentLevel?: string;
}

export interface AnswerAnalysis {
  isCorrect: boolean;
  score: number;
  feedbackZh: string;
  feedbackEn: string;
  mistakeType: 'grammar' | 'vocabulary' | 'comprehension' | 'careless' | 'time-management' | 'chinglish' | 'none';
  explanation: string;
  improvementTip: string;
  relatedGrammarPoint?: string;
}

export async function analyzeAnswer(input: AnalyzeAnswerInput): Promise<AnswerAnalysis> {
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

  // ⚠️ Normalize correctAnswer: if it's a letter out of range for available choices,
  // resolve it to prevent AI hallucination (the AI would see A/B/C but answer "D")
  const MCQ_LETTERS = ['A', 'B', 'C', 'D'] as const;
  let normalizedCorrectAnswer = input.correctAnswer;
  let correctAnswerNote = '';
  if (input.choices && input.choices.length > 0) {
    const answerUpper = input.correctAnswer.trim().toUpperCase();
    const answerIdx = MCQ_LETTERS.indexOf(answerUpper as typeof MCQ_LETTERS[number]);
    if (answerIdx >= 0 && answerIdx >= input.choices.length) {
      // Answer letter references a non-existent choice — log and fall back to first choice
      logger.warn({
        module: 'analyze-answer',
        correctAnswer: input.correctAnswer,
        choicesCount: input.choices.length,
        choices: input.choices.map(c => c.slice(0, 40)).join('|'),
      }, 'correctAnswer letter out of range, normalizing for AI prompt');
      // Try text-based matching first
      const textMatchIdx = input.choices.findIndex(
        c => c.trim().toLowerCase() === input.correctAnswer.trim().toLowerCase(),
      );
      if (textMatchIdx >= 0) {
        normalizedCorrectAnswer = MCQ_LETTERS[textMatchIdx] ?? input.correctAnswer;
      } else {
        // R3.10-L: NEVER substitute a guessed key ('A') — that produces an
        // explanation "grounded" in the wrong answer. Tell the model the key
        // is unresolvable instead.
        normalizedCorrectAnswer = '';
        correctAnswerNote = '（⚠️ 此題的正確答案欄位無法對應任何選項。請不要臆測正確選項，也不要聲稱學生答對或答錯；請根據題目與選項內容給出中性、具體的學習提示，並說明此題的答案記錄有誤、建議重做。）';
      }
    }
  }

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
正確答案：${normalizedCorrectAnswer ? sanitizeForAI(normalizedCorrectAnswer) : correctAnswerNote}
學生答案：${sanitizeForAI(input.studentAnswer)}
學生答案詞數（系統計算）：${studentWordCount}
${input.grammarItemZh ? `文法項目：${input.grammarItemZh}` : ''}
${input.studentLevel ? `學生年級：${input.studentLevel}` : ''}
${contextBlock}
${input.questionType === 'error-correction' ? `⚠️ 改錯題特別說明：學生可能寫出了完整的改正後句子，而非只寫修改的部分。請檢查學生答案中是否包含了正確的改正（例如原句 "families gets" 應改為 "families get"），即使學生寫了整句也要判定為正確。` : ''}
⚠️ CRITICAL: 你的解釋必須引用上述【聆聽內容】/【閱讀篇章】/【選項內容】中的實際文字，嚴禁編造不存在於上述內容中的資訊（如虛構的「漢堡」、「薯條」等）。若正確答案是字母（如 B），請對照【選項內容】找出對應的實際選項文字（如 "the grilled chicken salad"），並在解釋中使用該文字。

請分析學生的答案。`;

  const validated = await executeAI({
    context: { feature: 'Reading', useCase: 'AnalyzeAnswer', promptName: 'AnswerAnalysis', promptVersion: 'v1' },
    messages: [
      { role: 'system', content: systemPrompt + msContextPrompt },
      { role: 'user', content: userPrompt },
    ],
    // Explicit budget: this use case previously relied on config.ai.timeoutMs,
    // i.e. 8s in production — below the measured DeepSeek throughput for a
    // 2048-token JSON answer (~200 tok/s → 10s+), which surfaced to students as
    // "DeepSeek request timed out" on the practice page (2026-09-15).
    options: { temperature: 0.3, maxTokens: 2048, jsonMode: true, timeoutMs: 20000, userId: input.userId },
    schema: AnswerAnalysisSchema,
  });

  if (input.questionType === 'mc') {
    validated.score = validated.isCorrect ? 100 : 0;
  }

  return validated;
}
