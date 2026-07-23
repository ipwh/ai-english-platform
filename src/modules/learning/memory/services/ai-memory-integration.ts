// Sprint 25: AI Memory Integration — inject learning context into prompts
// Sprint 75: Uses MemoryService (which delegates to persistent IMemoryRepository)
import { memoryService } from '../services/memory-service';
import type { LearningContext } from '../types';

/**
 * Get the learning context for AI prompt injection.
 * MemoryService handles persistence through IMemoryRepository.
 */
export async function getMemoryContext(
  studentId: string,
  options?: { recentAccuracy?: number; recentStreak?: number; recentQuestions?: number },
): Promise<LearningContext> {
  return memoryService.getContext(
    studentId,
    options?.recentAccuracy ?? 0.7,
    options?.recentStreak ?? 0,
    options?.recentQuestions ?? 0,
  );
}

/**
 * Build a memory-enriched system prompt by appending
 * the student's learning context to the base system prompt.
 */
export async function enrichSystemPrompt(
  studentId: string,
  baseSystemPrompt: string,
): Promise<string> {
  const ctx = await getMemoryContext(studentId);

  const memoryBlock = [
    '',
    '=== STUDENT LEARNING CONTEXT ===',
    `Grammar level: ${ctx.summary.match(/Grammar: ([^.]*)/)?.[1] || 'N/A'}`,
    `Strengths: ${ctx.keyMetrics.activeSkills.join(', ') || 'building'}`,
    `Needs focus: ${ctx.keyMetrics.needsFocus.join(', ') || 'general practice'}`,
    `Suggested difficulty: ${ctx.suggestedDifficulty}`,
    ctx.personalizationHints.length > 0 ? `Hints: ${ctx.personalizationHints.slice(0, 3).join('; ')}` : '',
    '=== END CONTEXT ===',
  ].filter(Boolean).join('\n');

  return baseSystemPrompt + memoryBlock;
}

/**
 * Get a concise memory summary for lightweight prompt injection.
 * Suitable for use in exercise generation, feedback, and correction prompts.
 */
export async function getMemorySummary(studentId: string): Promise<string> {
  const ctx = await getMemoryContext(studentId);
  return [
    `Student: ${ctx.keyMetrics.needsFocus.length > 0 ? `focus on ${ctx.keyMetrics.needsFocus.join(', ')}` : 'balanced practice'}`,
    `Difficulty: ${ctx.suggestedDifficulty}`,
    `Streak: ${ctx.keyMetrics.streakDays} days`,
    ctx.avoidTopics.length > 0 ? `Avoid: ${ctx.avoidTopics.slice(0, 3).join(', ')}` : '',
  ].filter(Boolean).join('. ');
}

/**
 * Record an AI interaction result back to memory.
 * Called after AI generates content for a student.
 */
export async function recordAiInteraction(
  studentId: string,
  interaction: {
    type: 'exercise' | 'feedback' | 'essay-correction' | 'chat' | 'recommendation';
    skill?: string;
    correct?: boolean;
    topic?: string;
    topicZh?: string;
  },
): Promise<void> {
  if (interaction.type === 'exercise' && interaction.skill && interaction.correct !== undefined) {
    await memoryService.recordGrammarResult(
      studentId,
      interaction.skill,
      interaction.topicZh || interaction.skill,
      interaction.correct,
    );
  }

  // Record as a session interaction
  await memoryService.recordSession(studentId, 1, 1);
}
