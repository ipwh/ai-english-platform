// Sprint 100: Adaptive Writing Guide Use Case — extracted from ai-service.ts
// Provides live writing coaching based on student draft + DSE text type guide.

import { callLLM } from '../services/llm-call';
import { parseAIJSON } from '../services/json-utils';
import { validateAIResponse, AdaptiveWritingGuideOutputSchema } from '../schemas/ai-schema';
import { DSE_TEXT_TYPE_GUIDE } from '../services/dse-writing-data';
import { logger } from '@/shared/logger/logger';

export interface AdaptiveWritingGuideInput {
  userId?: string;
  textType: string;
  gradeLevel: string;
  writingPrompt: string;
  studentDraft?: string;
  lang?: 'zh' | 'en';
}

export interface AdaptiveWritingGuideOutput {
  personalizedTips: string[];
  structureIssues: string[];
  suggestedNextParagraph: string;
  missingElements: string[];
}

export async function generateAdaptiveWritingGuide(
  input: AdaptiveWritingGuideInput,
): Promise<AdaptiveWritingGuideOutput> {
  if (!input.studentDraft || input.studentDraft.trim().length < 20) {
    return {
      personalizedTips: ['開始寫作後，AI 會根據你的草稿提供個人化建議。'],
      structureIssues: [],
      suggestedNextParagraph: '先寫出你的 Introduction，然後回來查看 AI 建議。',
      missingElements: [],
    };
  }

  const guide = DSE_TEXT_TYPE_GUIDE[input.textType];
  const draftSnippet = input.studentDraft.slice(0, 2000);
  const systemPrompt = `你是一位香港 DSE English Paper 2 寫作導師。文體：${guide?.name || input.textType}，年級：${input.gradeLevel}。回覆純 JSON：{ "personalizedTips": [...], "structureIssues": [...], "suggestedNextParagraph": "...", "missingElements": [...] }，繁體中文。`;

  try {
    const result = await callLLM(
      [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `寫作任務：${input.writingPrompt}\n\n學生草稿：\n"""\n${draftSnippet}\n"""\n\n請提供個人化寫作建議。`,
        },
      ],
      {
        temperature: 0.4,
        maxTokens: 1024,
        jsonMode: true,
        timeoutMs: 12000,
        userId: input.userId,
      },
    );
    const parsed = parseAIJSON<AdaptiveWritingGuideOutput>(result);

    const validated = validateAIResponse(AdaptiveWritingGuideOutputSchema, parsed);
    if (!validated.success) throw new Error(validated.error);

    return validated.data;
  } catch {
    logger.warn({ module: 'live-writing-coach' }, 'Live writing coach failed');
    return {
      personalizedTips: ['繼續寫作，完成後可以使用 AI 批改獲得詳細分析。'],
      structureIssues: [],
      suggestedNextParagraph: '繼續發展你的下一個論點，記得使用 PEEL 結構。',
      missingElements: [],
    };
  }
}
