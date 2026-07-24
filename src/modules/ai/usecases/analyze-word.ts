// Sprint 94: Word Analysis Use Case
import { callLLM } from '../services/llm-call';
import { parseAIJSON } from '../services/json-utils';
import { sanitizeForAI } from '../services/sanitizer';
import { validateAIResponse } from '../schemas/ai-schema';
import { HALLUCINATION_GUARD } from '../services/hallucination-guard';

export interface AnalyzeWordInput { userId?: string; word: string; gradeLevel?: string; }

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
  "partOfSpeech": "主要詞性",
  "allPartOfSpeech": ["所有常見詞性"],
  "meaningZh": "主要中文意思（繁體中文）",
  "secondaryMeaningZh": "次要中文意思（如有，否則 null）",
  "exampleSentence": "英文例句",
  "exampleZh": "例句中文翻譯（繁體中文）",
  "synonyms": ["同義字"],
  "antonyms": ["反義字"],
  "collocations": ["搭配詞"]
}

## 規則
- meaningZh 使用繁體中文
- 例句難度適應 ${gradeLevel} 年級
- collocations 格式: "動詞 + 名詞" 或常見片語
- 不要輸出 markdown，只輸出純 JSON`;

  const result = await callLLM(
    [{ role: 'system', content: systemPrompt }, { role: 'user', content: `請分析以下英文單字：${word}\n學生年級：${gradeLevel}` }],
    { temperature: 0.3, maxTokens: 1024, jsonMode: true, timeoutMs: 15000, userId: input.userId }
  );
  const data = parseAIJSON(result);
  const validated = validateAIResponse(WordAnalysisSchema, data);
  if (!validated.success) throw new Error(validated.error);
  return validated.data;
}
