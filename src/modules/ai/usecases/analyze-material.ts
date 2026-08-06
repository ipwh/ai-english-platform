// Sprint 94: Material Analysis Use Case
import { executeAI } from '../services/ai-execution';
import { MaterialAnalysisSchema } from '../schemas/ai-schema';
import { HALLUCINATION_GUARD } from '../services/hallucination-guard';

export interface AnalyzeMaterialInput { userId?: string; title: string; content: string; gradeLevel?: string; }
export interface MaterialAnalysis {
  summary: string; keyVocabulary: { word: string; meaningZh: string; exampleSentence: string }[];
  keyGrammarPoints: { point: string; explanationZh: string }[];
  suggestedQuestions: { type: string; prompt: string; answer: string }[];
  difficultyLevel: 'remedial' | 'core' | 'challenge'; suggestedGrade: string;
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

  return executeAI({
    context: { feature: 'Reading', useCase: 'AnalyzeMaterial', promptName: 'MaterialAnalysis' },
    messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
    options: { temperature: 0.4, maxTokens: 4096, jsonMode: true, userId: input.userId },
    schema: MaterialAnalysisSchema,
  });
}
