// Sprint 94: Integrated Skills Analysis Use Case
import { callLLM } from '../services/llm-call';
import { parseAIJSON } from '../services/json-utils';
import { sanitizeForAI } from '../services/sanitizer';
import { isDSERAGEnabled, retrieveMarkingScheme, buildDSEContextPrompt } from '../services/rag-service';
import { logger } from '@/shared/logger/logger';
import type { AnalyzeIntegratedSkillsInput, IntegratedSkillsAnalysis } from './integrated-skills-types';

export async function analyzeIntegratedSkills(input: AnalyzeIntegratedSkillsInput): Promise<IntegratedSkillsAnalysis> {
  const sanitizedWriting = sanitizeForAI(input.studentWriting);
  let paper3MSContext = '';
  try {
    if (isDSERAGEnabled()) {
      const msChunks = await retrieveMarkingScheme('Listening', 3);
      paper3MSContext = buildDSEContextPrompt([], msChunks.map(r => ({ content: r.chunk.content, title: r.materialTitle, score: r.score })), 'analyze_integrated');
      if (paper3MSContext) logger.info({ module: 'dse-rag', msChunks: msChunks.length }, 'analyzeIntegratedSkills: Retrieved Listening MS chunks');
    }
  } catch (err) { logger.warn({ module: 'dse-rag', error: (err as Error).message }, 'analyzeIntegratedSkills MS retrieval failed'); }

  const systemPrompt = `你是一位香港 DSE English Paper 3 評卷專家，專門批改 Integrated Skills 答案。
${paper3MSContext}

DSE Paper 3 官方評分標準：Listening 理解 (40%) + Language 語言 (35%) + Organization 組織 (25%)

批改維度一：Listening 提取準確度 — 逐點比對 expectedContentPoints，評估 Note-taking 品質
批改維度二：Writing 品質 — Paraphrasing vs 過度抄襲檢測、PEEL 結構、Audience Awareness

回覆純 JSON：
{ "overallScore": 0-100, "listeningAccuracy": 0-100, "writingQuality": 0-100, "contentCompleteness": 0-100, "languageAccuracy": 0-100, "organizationClarity": 0-100, "capturedPoints": [...], "missedPoints": [...], "overCopyWarnings": [{ "original": "...", "suggestion": "..." }], "grammarErrors": [{ "original": "...", "correction": "...", "explanation": "..." }], "vocabularySuggestions": [{ "original": "...", "suggestion": "...", "reason": "..." }], "structureFeedback": "...", "generalComment": "...", "improvementTips": [...], "estimatedLevel": "Level 1-5 或 Below Level 1" }
所有中文使用繁體中文。`;

  const expectedPointsText = input.expectedContentPoints.map((p, i) => `${i + 1}. ${p}`).join('\n');
  const userPrompt = `【聆聽材料】\n${input.listeningContent.slice(0, 3000)}\n\n【Note-taking 指引】\n${input.noteTakingGuide.map(g => `- ${g.question} (提示: ${g.hint})`).join('\n')}\n\n【預期內容要點】\n${expectedPointsText}\n\n【寫作任務】\n${input.writingTask}\n\n【學生 Note-taking】\n${input.studentNotes || '(未填寫)'}\n\n【學生寫作】\n"""\n${sanitizedWriting}\n"""\n\n請批改此 Integrated Skills 答案。`;

  const result = await callLLM([{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }], { temperature: 0.3, maxTokens: 4096, jsonMode: true, timeoutMs: 15000, userId: input.userId });
  const analysis = parseAIJSON<IntegratedSkillsAnalysis>(result);
  if (!analysis.overallScore && analysis.overallScore !== 0) throw new Error('AI Integrated Skills 分析不完整');
  return analysis;
}
