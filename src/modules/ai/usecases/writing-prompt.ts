// Sprint 94: Writing Prompt Generation Use Case
import { callLLM } from '../services/llm-call';
import { DSE_TEXT_TYPE_GUIDE } from '../services/dse-writing-data';
import { getDSEEmpiricalTopics, validateDSEtopicMatch } from '../services/dse-topics';
import { selectDiverseTopics, buildDiversityInstruction, recordTopicUsage } from '../services/topic-selector';
import { logger } from '@/shared/logger/logger';

export interface GenerateWritingPromptInput {
  userId?: string; textType: string; gradeLevel: string; difficulty?: string;
  wordLimit: number; topicHint?: string; lang?: 'zh' | 'en'; weakSkills?: string[];
}
export interface GenerateWritingOutlineInput {
  userId?: string; textType: string; gradeLevel: string; difficulty?: string;
  wordLimit: number; writingPrompt: string; topicHint?: string; lang?: 'zh' | 'en'; weakSkills?: string[];
}
export interface GenerateWritingGuideInput {
  userId?: string; textType: string; gradeLevel: string; writingPrompt: string;
  studentDraft?: string; lang?: 'zh' | 'en';
}
export interface WritingGuide {
  structureGuide: { paragraph: number; role: string; roleZh: string; tips: string; tipsZh: string }[];
  usefulPhrases: { english: string; chinese: string; purpose: string }[];
  commonMistakes: { mistake: string; mistakeZh: string; correction: string; correctionZh: string }[];
  vocabularyUpgrades: { basic: string; advanced: string; context: string }[];
}

export async function generateWritingPrompt(input: GenerateWritingPromptInput): Promise<string> {
  const guide = DSE_TEXT_TYPE_GUIDE[input.textType];
  const structureHint = guide ? `\nThis text type (${guide.name}) should include: ${guide.requiredElements.join(', ')}.\nRecommended structure: ${guide.structure.map(s => `${s.role} → ${s.keyContent}`).join(' | ')}` : '';
  const weakSkillHint = input.weakSkills?.length ? `\nThe student struggles with: ${input.weakSkills.join(', ')}. Design the prompt to specifically challenge and develop these weak areas.` : '';

  // Diversity-aware topic selection
  const userId = input.userId || 'anonymous';
  const diverseTopics = input.topicHint
    ? [input.topicHint]
    : selectDiverseTopics({ userId, skill: 'writing', gradeLevel: input.gradeLevel, count: 1 });
  const diversityInstruction = buildDiversityInstruction({ userId, skill: 'writing', gradeLevel: input.gradeLevel });
  // Also get 4 additional diverse reference topics from DSE empirical DB (excluding the chosen one)
  const referenceTopics = getDSEEmpiricalTopics('writing', undefined, 5, diverseTopics);

  const systemPrompt = `You are an experienced HKDSE English Language Paper 2 examiner.

Create ONE complete, self-contained writing prompt that mirrors the style, complexity, and expectations of the REAL HKDSE English Paper 2 Part B.

The prompt MUST include ALL of these elements in order:
1. CONTEXT: A clear, realistic situation (1-2 sentences)
2. ROLE: Who the writer is
3. TASK: What to write, CLEARLY stating the required text type
4. REQUIREMENTS: 3 specific content points or guiding questions
5. WORD LIMIT: "Write about ${input.wordLimit} words."

Text type: ${guide?.name || input.textType}${structureHint}
Grade: ${input.gradeLevel}${input.difficulty ? ` | Difficulty: ${input.difficulty}` : ''}

⚠️ REQUIRED TOPIC: "${diverseTopics[0]}" — You MUST base your prompt on this specific topic.

${diversityInstruction}

DSE reference topics (for style reference only — do NOT use these as your main topic):
${referenceTopics.map(t => `  • ${t}`).join('\n')}
${weakSkillHint}

CRITICAL: Output ONLY the writing prompt. No headings, no labels. Just the complete, ready-to-use prompt text.`.trim();

  const userPrompt = `Create a DSE-style writing prompt. Text type: ${guide?.name || input.textType}. Grade: ${input.gradeLevel}.${input.difficulty ? ` Difficulty: ${input.difficulty}.` : ''} Word limit: ${input.wordLimit} words. Required topic: "${diverseTopics[0]}".`;

  const result = await callLLM([{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }], { temperature: 0.8, maxTokens: 1024, timeoutMs: 12000, userId: input.userId });
  const prompt = result.trim();

  // Record the topic as used
  if (input.userId && diverseTopics[0]) {
    recordTopicUsage(input.userId, diverseTopics[0], 'culture', 'writing');
  }

  const topicCheck = validateDSEtopicMatch(prompt, 'writing');
  if (!topicCheck.matched) logger.warn({ module: 'writing-prompt', score: topicCheck.score }, 'DSE topic match LOW');
  return prompt;
}
