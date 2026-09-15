// Sprint 92: Mistake Explanation Use Case — canonical implementation
// Physically extracted from ai-service.ts

import { executeAI } from '../services/ai-execution';
import { sanitizeForAI } from '../services/sanitizer';
import { MistakeExplanationSchema } from '../schemas/ai-schema';
import { getExplainMistakeSystemPrompt, buildExplainMistakeUserPrompt } from '../prompts';
import { isDSERAGEnabled, retrieveMarkingScheme, buildDSEContextPrompt, type DSESkill } from '../services/rag-service';
import { logger } from '@/shared/logger/logger';

export interface ExplainMistakeInput {
  userId?: string;
  question: string;
  correctAnswer: string;
  studentAnswer: string;
  grammarItemZh?: string;
  studentLevel?: string;
  questionType?: string;
}

export interface MistakeExplanation {
  reasonZh: string;
  reasonEn: string;
  ruleExplanation: string;
  examples: { wrong: string; correct: string }[];
  memoryTip: string;
  relatedTopics: string[];
}

export async function explainMistake(input: ExplainMistakeInput): Promise<MistakeExplanation> {
  let msContextPrompt = '';
  try {
    if (isDSERAGEnabled()) {
      const skillForMS: DSESkill =
        input.questionType === 'short-writing' ? 'Writing' : 'Reading';
      const msChunks = await retrieveMarkingScheme(skillForMS, 2);
      msContextPrompt = buildDSEContextPrompt(
        [],
        msChunks.map(r => ({ content: r.chunk.content, title: r.materialTitle, score: r.score })),
        'explain_mistake'
      );
      if (msContextPrompt) {
        logger.info({ module: 'dse-rag', msChunks: msChunks.length }, 'explainMistake: Retrieved MS chunks');
      }
    }
  } catch (err) {
    logger.warn({ module: 'dse-rag', error: err instanceof Error ? err.message : String(err) }, 'explainMistake MS retrieval failed, fallback');
    msContextPrompt = '';
  }

  const systemPrompt = getExplainMistakeSystemPrompt();

  const userPrompt = buildExplainMistakeUserPrompt({
    question: sanitizeForAI(input.question),
    correctAnswer: sanitizeForAI(input.correctAnswer),
    studentAnswer: sanitizeForAI(input.studentAnswer),
    grammarItemZh: input.grammarItemZh,
    studentLevel: input.studentLevel,
  });

  return executeAI({
    context: { feature: 'Learning', useCase: 'ExplainMistake', promptName: 'MistakeExplanation', promptVersion: 'v1' },
    messages: [
      { role: 'system', content: systemPrompt + msContextPrompt },
      { role: 'user', content: userPrompt },
    ],
    // Explicit budget (never rely on the config default — it was 8s in production).
    options: { temperature: 0.5, maxTokens: 2048, jsonMode: true, timeoutMs: 20000, userId: input.userId },
    schema: MistakeExplanationSchema,
  });
}
