// Sprint 94: Writing Outline Generation Use Case
import { callLLM } from '../services/llm-call';
import { DSE_TEXT_TYPE_GUIDE } from '../services/dse-writing-data';
import { getWritingOutlineSystemPrompt, buildWritingOutlineUserPrompt } from '../prompts';
import type { GenerateWritingOutlineInput } from './writing-prompt';

export async function generateWritingOutline(input: GenerateWritingOutlineInput): Promise<string> {
  const guide = DSE_TEXT_TYPE_GUIDE[input.textType];
  const structureGuide = guide ? guide.structure.map(s => `- Paragraph ${s.paragraph}: ${s.role} (${s.roleZh}) — ${s.keyContent}`).join('\n') : '';
  const commonErrors = guide ? guide.commonErrors.map(e => `- ❌ ${e.error} (${e.errorZh}) → ✅ ${e.fix}`).join('\n') : '';
  const weakSkillHint = input.weakSkills?.length ? `\nStudent weaknesses: ${input.weakSkills.join(', ')}. Emphasize these areas in the outline.` : '';

  const systemPrompt = getWritingOutlineSystemPrompt({ gradeLevel: input.gradeLevel, difficulty: input.difficulty, textType: input.textType, guideName: guide?.name || input.textType, wordLimit: input.wordLimit, writingPrompt: input.writingPrompt, topicHint: input.topicHint, structureGuide, commonErrors, weakSkillHint });
  const userPrompt = buildWritingOutlineUserPrompt({ guideName: guide?.name || input.textType, textType: input.textType, gradeLevel: input.gradeLevel, difficulty: input.difficulty, wordLimit: input.wordLimit, writingPrompt: input.writingPrompt });

  const result = await callLLM([{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }], { temperature: 0.7, maxTokens: 4096, timeoutMs: 8000, userId: input.userId });
  return result.trim();
}
