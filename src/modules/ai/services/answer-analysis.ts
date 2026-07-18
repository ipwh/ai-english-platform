// Extracted from ai-service.ts (Sprint 4)
import { callLLM } from './ai-service';
import { parseAIJSON } from './json-utils';
import { isDSERAGEnabled, retrieveMarkingScheme, buildDSEContextPrompt, type DSESkill } from '@/modules/ai/services/rag-service';
import { logger } from '@/shared/logger/logger';
import { AnswerAnalysisSchema } from '@/modules/ai/schemas/ai-schema';
import { validateAIResponse } from '@/modules/ai/schemas/ai-schema';
import { buildAnswerAnalysisPrompt } from '@/modules/ai/prompts';

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

  const systemPrompt = buildAnswerAnalysisPrompt();

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

  const userPrompt = `題目：${input.question}
題型：${input.questionType}
正確答案：${input.correctAnswer}
學生答案：${input.studentAnswer}
學生答案詞數（系統計算）：${studentWordCount}
${input.grammarItemZh ? `文法項目：${input.grammarItemZh}` : ''}
${input.studentLevel ? `學生年級：${input.studentLevel}` : ''}
${contextBlock}
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

