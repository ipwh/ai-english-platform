// Sprint 94: Integrated Skills Analysis Use Case
import { executeAI } from '../services/ai-execution';
import { IntegratedSkillsAnalysisSchema } from '../schemas/ai-schema';
import { sanitizeForAI } from '../services/sanitizer';
import { isDSERAGEnabled, retrieveMarkingScheme, buildDSEContextPrompt } from '../services/rag-service';
import { logger } from '@/shared/logger/logger';
import { estimateLevelFromScore100 } from '../core/level-estimation';
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

  const systemPrompt = `你是一位香港 DSE English Paper 3 批改專家，專門批改 Integrated Skills 答案。
${paper3MSContext}

批改框架（平台教學參考，並非 HKEAA 官方評分標準）：平台整理的三維評分框架 — Listening 理解 (40%) + Language 語言 (35%) + Organization 組織 (25%)；權重為平台設定，並非來自官方文件。請依此框架批改，但必須在教學上忠於 HKEAA Paper 3 的能力要求。

批改維度一：Listening 提取準確度 — 逐點比對 expectedContentPoints，評估 Note-taking 品質
批改維度二：Writing 品質 — Paraphrasing vs 過度抄襲檢測、PEEL 結構、Audience Awareness

⚠️ BILINGUAL OUTPUT: 所有反饋欄位必須同時提供英文和繁體中文版本，讓英文能力稍遜的學生也能理解。
- generalComment / generalCommentZh
- structureFeedback / structureFeedbackZh
- improvementTips / improvementTipsZh
- noteTakingFeedback / noteTakingFeedbackZh (from noteTakingFeedback in old format)
- dataManipulationFeedback / dataManipulationFeedbackZh (from dataManipulationFeedback in old format)

回覆純 JSON：
{ "overallScore": 0-100, "listeningAccuracy": 0-100, "writingQuality": 0-100, "contentCompleteness": 0-100, "languageAccuracy": 0-100, "organizationClarity": 0-100, "capturedPoints": [...], "missedPoints": [...], "overCopyWarnings": [{ "original": "...", "suggestion": "..." }], "chinglishWarnings": [{ "original": "...", "suggestion": "...", "explanation": "..." }], "grammarErrors": [{ "original": "...", "correction": "...", "explanation": "..." }], "vocabularySuggestions": [{ "original": "...", "suggestion": "...", "reason": "..." }], "structureFeedback": "...", "structureFeedbackZh": "...（繁體中文）", "generalComment": "...", "generalCommentZh": "...（繁體中文）", "improvementTips": ["English tip 1"], "improvementTipsZh": ["中文建議 1"], "noteTakingFeedback": "...", "noteTakingFeedbackZh": "...（繁體中文）", "dataManipulationFeedback": "...", "dataManipulationFeedbackZh": "...（繁體中文）", "estimatedLevel": "Level 1-5 或 Below Level 1（平台估算，非官方等級）", "modelAnswer": "A complete reference model answer in English" }
⚠️ FOR grammarErrors: Only include REAL grammatical errors. If a sentence has no error, DO NOT include it. "original" and "correction" MUST be different text. Empty array [] if no errors.
⚠️ "modelAnswer" 必須為完整英文參考範文，展示如何正確整合聆聽+Data File 資訊、適切改寫、格式正確的答案。此欄位不可留空。此範文是平台的教學參考範本，不是 HKEAA 官方評分樣本。`;

  const expectedPointsText = input.expectedContentPoints.map((p, i) => `${i + 1}. ${p}`).join('\n');

  // 2026-08-29 audit: include the Data File sources the student worked from.
  // Without them, dataManipulationFeedback would be produced about material
  // the AI never saw (hallucinated data-file analysis).
  const dataFileText = (input.dataFileSources ?? [])
    .map(s => `【${s.type}】${s.title}\n${s.content}`)
    .join('\n\n');

  const userPrompt = `【聆聽材料】\n${input.listeningContent.slice(0, 3000)}\n\n【Note-taking 指引】\n${input.noteTakingGuide.map(g => `- ${g.question} (提示: ${g.hint})`).join('\n')}\n\n【預期內容要點】\n${expectedPointsText}\n\n${dataFileText ? `【Data File 資料（學生作答時可參考的文件來源）】\n${dataFileText}\n\n` : ''}【寫作任務】\n${input.writingTask}\n\n【學生 Note-taking】\n${input.studentNotes || '(未填寫)'}\n\n【學生寫作】\n"""\n${sanitizedWriting}\n"""\n\n請批改此 Integrated Skills 答案。`;

  const analysis = await executeAI({
    context: { feature: 'Listening', useCase: 'AnalyzeIntegratedSkills', promptName: 'IntegratedSkillsAnalysis', promptVersion: 'v1' },
    messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
    options: { temperature: 0.3, maxTokens: 4096, jsonMode: true, timeoutMs: 30000, userId: input.userId },
    schema: IntegratedSkillsAnalysisSchema,
  });

  // Cross-paper consistency: the LLM's estimatedLevel is NEVER authoritative.
  // Override with the same deterministic 0-100 → 1-5 policy used across papers.
  //
  // The LLM's overallScore is also a free-form number that can contradict the
  // three displayed component scores, so it is recomputed deterministically from
  // the platform's own 40/35/25 weighting (Listening 40% + Language 35% +
  // Organization 25%) before the level is derived.
  const overallScore = Math.round(
    analysis.listeningAccuracy * 0.40 +
    analysis.languageAccuracy * 0.35 +
    analysis.organizationClarity * 0.25
  );
  return {
    ...analysis,
    overallScore,
    estimatedLevel: estimateLevelFromScore100(overallScore),
    // 2026-08-30 audit: without Data File sources the AI never saw the
    // material it would be criticising — suppress data-manipulation feedback
    // instead of delivering analysis about unseen content.
    ...(dataFileText
      ? {}
      : {
          dataManipulationFeedback: '',
          dataManipulationFeedbackZh: '',
        }),
  };
}
