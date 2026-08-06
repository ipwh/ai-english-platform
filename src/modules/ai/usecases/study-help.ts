// Sprint 94: Study Help Use Case
import { executeAI } from '../services/ai-execution';
import { sanitizeForAI } from '../services/sanitizer';
import { StudyHelpResponseSchema } from '../schemas/ai-schema';
import { HALLUCINATION_GUARD } from '../services/hallucination-guard';
import { isDSERAGEnabled, retrievePastPaperContent, retrieveMarkingScheme, buildDSEContextPrompt, type DSESkill } from '../services/rag-service';
import { logger } from '@/shared/logger/logger';

export interface StudyHelpInput {
  userId?: string; question: string; studentLevel: string;
  weakSkills?: { name: string; nameZh: string; accuracy: number }[];
  recentMistakes?: { mistakeType: string; questionId: string; createdAt?: string }[];
  recentPerformance?: { date: string; accuracy: number; questionsDone: number }[];
}
export interface StudyHelpResponse { answer: string; followUpTips: string[]; recommendedFocus: string[]; }

export async function answerStudyHelp(input: StudyHelpInput): Promise<StudyHelpResponse> {
  const weakSkillsDesc = (input.weakSkills || []).map(s => `${s.nameZh} (${s.accuracy}%)`).join('、');
  const mistakesDesc = (input.recentMistakes || []).slice(0, 5).map(m => `${m.mistakeType}${m.createdAt ? ` @ ${m.createdAt}` : ''}`).join('、');
  const recentDesc = (input.recentPerformance || []).slice(0, 5).map(p => `${p.date}: ${p.accuracy}% / ${p.questionsDone}題`).join('\n');

  let dseContextPrompt = '';
  try {
    if (isDSERAGEnabled()) {
      const firstWeakSkill = (input.weakSkills || [])[0];
      const dseSkill: DSESkill = firstWeakSkill?.name ? (['reading', 'writing', 'listening', 'speaking'].includes(firstWeakSkill.name.toLowerCase()) ? (firstWeakSkill.name.toLowerCase() as DSESkill) : 'General') : 'General';
      const [pastPaperChunks, msChunks] = await Promise.all([
        retrievePastPaperContent(dseSkill, input.question, undefined, input.studentLevel, 2),
        retrieveMarkingScheme(dseSkill === 'General' ? 'Reading' : dseSkill, 2),
      ]);
      dseContextPrompt = buildDSEContextPrompt(
        pastPaperChunks.map(r => ({ content: r.chunk.content, title: r.materialTitle, score: r.score })),
        msChunks.map(r => ({ content: r.chunk.content, title: r.materialTitle, score: r.score })), 'study_help');
      if (dseContextPrompt) logger.info({ module: 'dse-rag' }, 'studyHelp: Retrieved past papers + MS');
    }
  } catch (err) { logger.warn({ module: 'dse-rag', error: (err as Error).message }, 'studyHelp RAG failed'); }

  const systemPrompt = `${HALLUCINATION_GUARD}
你是一位香港中學英文科私人學習顧問，熟悉 HKDSE English Language Level Descriptors。
請根據學生的個人背景、弱項與近期表現，對照 HKDSE 等級描述回答學生的英文學習問題。
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

  return executeAI({
    context: { feature: 'Learning', useCase: 'StudyHelp', promptName: 'StudyHelpResponse', promptVersion: 'v1' },
    messages: [{ role: 'system', content: systemPrompt + dseContextPrompt }, { role: 'user', content: userPrompt }],
    options: { temperature: 0.5, maxTokens: 2048, jsonMode: true, userId: input.userId },
    schema: StudyHelpResponseSchema,
  });
}
