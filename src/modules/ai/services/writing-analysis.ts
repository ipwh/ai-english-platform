// Sprint 5: Writing analysis — extracted from ai-service.ts
import type { AnalyzeWritingInput, WritingAnalysis } from './ai-service';
import { callLLM } from './ai-service';
import { parseAIJSON } from './json-utils';
import { isDSERAGEnabled, retrieveMarkingScheme, buildDSEContextPrompt, type DSESkill } from '@/modules/ai/services/rag-service';
import { logger } from '@/shared/logger/logger';
import { WritingAnalysisSchema, validateAIResponse } from '@/modules/ai/schemas/ai-schema';
import { detectChinglish } from '@/modules/assessment/services/chinglish';
import { sanitizeForAI } from './sanitizer';
import { buildWritingGrammarPrompt, buildWritingStylePrompt } from '@/modules/ai/prompts';
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
  const grammarPrompt = buildWritingGrammarPrompt(writingMSContext);

  const stylePrompt = buildWritingStylePrompt(writingMSContext);

  const grammarUserPrompt = `${context}\n\n請只分析語言準確性（文法錯誤+中式英文+總分+總評）。`;
  const styleUserPrompt = `${context}\n\n請分析寫作技巧並提供修改版（詞彙建議+結構評語+優點+弱點+修改版全文）。`;

  const [grammarResult, styleResult] = await Promise.all([
    (async () => {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          return await callLLM(
            [
              { role: 'system', content: grammarPrompt },
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
        { role: 'system', content: stylePrompt },
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
