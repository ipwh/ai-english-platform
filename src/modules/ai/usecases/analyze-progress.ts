// Sprint 94: Progress Analysis Use Case
import { executeAI } from '../services/ai-execution';
import { ProgressAnalysisSchema } from '../schemas/ai-schema';
import { isDSERAGEnabled, retrievePastPaperContent, retrieveMarkingScheme, buildDSEContextPrompt, type DSESkill } from '../services/rag-service';
import { getProgressAnalysisSystemPrompt, buildProgressAnalysisUserPrompt } from '../prompts';
import { logger } from '@/shared/logger/logger';

export interface AnalyzeProgressInput {
  userId?: string; studentLevel: string; overallAccuracy: number;
  weakSkills: { name: string; nameZh: string; accuracy: number }[];
  recentPerformance: { date: string; accuracy: number; questionsDone: number }[];
  streakDays: number;
}
export interface ProgressAnalysis {
  summary: string; strengthsAreas: string[]; urgentAreas: string[];
  recommendedFocus: { skill: string; reason: string; priority: 'high' | 'medium' | 'low' }[];
  studyPlan: string; encouragementMessage: string; estimatedTimeToImprove: string;
}

export async function analyzeProgress(input: AnalyzeProgressInput): Promise<ProgressAnalysis> {
  let dseContextPrompt = '';
  try {
    if (isDSERAGEnabled()) {
      const weakSkillNames = input.weakSkills.map(s => s.nameZh);
      const needsWriting = weakSkillNames.some(s => s.includes('寫作') || s.includes('Writing'));
      const needsReading = weakSkillNames.some(s => s.includes('閱讀') || s.includes('Reading'));
      const needsListening = weakSkillNames.some(s => s.includes('聆聽') || s.includes('Listening'));
      const skills: DSESkill[] = [];
      if (needsWriting) skills.push('Writing');
      if (needsReading) skills.push('Reading');
      if (needsListening) skills.push('Listening');
      if (skills.length === 0) skills.push('Reading', 'Writing');
      const [pastPaperChunks, msChunks] = await Promise.all([
        retrievePastPaperContent(skills[0], undefined, input.overallAccuracy < 60 ? 'remedial' : 'core', undefined, 3),
        retrieveMarkingScheme(skills[0], 2),
      ]);
      dseContextPrompt = buildDSEContextPrompt(
        pastPaperChunks.map(r => ({ content: r.chunk.content, title: r.materialTitle, score: r.score })),
        msChunks.map(r => ({ content: r.chunk.content, title: r.materialTitle, score: r.score })), 'study_help');
      if (dseContextPrompt) logger.info({ module: 'dse-rag' }, 'analyzeProgress: Retrieved past papers + MS');
    }
  } catch (err) { logger.warn({ module: 'dse-rag', error: (err as Error).message }, 'analyzeProgress RAG failed'); }
  const systemPrompt = getProgressAnalysisSystemPrompt(dseContextPrompt);
  const weakSkillsDesc = input.weakSkills.map(s => `${s.nameZh} (正確率: ${s.accuracy}%)`).join('、');
  const recentDesc = input.recentPerformance.map(p => `${p.date}: 正確率${p.accuracy}%, ${p.questionsDone}題`).join('\n');
  const userPrompt = buildProgressAnalysisUserPrompt({ studentLevel: input.studentLevel, overallAccuracy: input.overallAccuracy, streakDays: input.streakDays, weakSkillsDesc, recentDesc });
  return executeAI({
    context: { feature: 'Learning', useCase: 'AnalyzeProgress', promptName: 'ProgressAnalysis' },
    messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
    options: { temperature: 0.6, maxTokens: 2048, jsonMode: true, timeoutMs: 12000, userId: input.userId },
    schema: ProgressAnalysisSchema,
  });
}
