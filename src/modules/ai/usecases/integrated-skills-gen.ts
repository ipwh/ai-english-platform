// Sprint 94: Integrated Skills Generation Use Case
import { executeAI } from '../services/ai-execution';
import { IntegratedSkillsTaskSchema } from '../schemas/ai-schema';
import { getDSEEmpiricalTopics } from '../services/dse-topics';
import { selectDiverseTopics, buildDiversityInstruction, recordTopicUsage } from '../services/topic-selector';
import { INTEGRATED_SKILLS_DIFF_MAP, INTEGRATED_SKILLS_TASK_TYPE_MAP } from '../services/integrated-skills-config';
import { normalizeListeningContent } from '../services/listening-normalizer';
import type { IntegratedSkillsTask } from './integrated-skills-types';

export interface GenerateIntegratedSkillsInput {
  userId?: string; gradeLevel: string; difficulty: 'remedial' | 'core' | 'challenge';
  taskType: 'summary' | 'email-reply' | 'short-article' | 'report'; topicHint?: string;
}

export async function generateIntegratedSkills(input: GenerateIntegratedSkillsInput): Promise<IntegratedSkillsTask> {
  const diff = INTEGRATED_SKILLS_DIFF_MAP[input.difficulty];
  const taskInfo = INTEGRATED_SKILLS_TASK_TYPE_MAP[input.taskType];

  // Diversity-aware topic selection
  const userId = input.userId || 'anonymous';
  const diverseTopics = input.topicHint
    ? [input.topicHint]
    : selectDiverseTopics({ userId, skill: 'listening', gradeLevel: input.gradeLevel, count: 1 });
  const diversityInstruction = buildDiversityInstruction({ userId, skill: 'listening', gradeLevel: input.gradeLevel });
  const referenceTopics = getDSEEmpiricalTopics('listening', undefined, 6, diverseTopics);

  const systemPrompt = `You are a Hong Kong DSE English Paper 3 examiner specializing in Integrated Skills task design.
Generate a complete Integrated Skills task simulating the real DSE Paper 3 Part B "Listen → Note-take → Write" exam flow.

⚠️ REQUIRED TOPIC: "${diverseTopics[0]}" — You MUST design the entire task around this specific topic.

${diversityInstruction}

Real DSE Paper 3 reference topics (for style reference only — do NOT use as main topic):
${referenceTopics.map(t => `  • ${t}`).join('\n')}

═══════════════════════════════════════
CRITICAL: listeningContent LANGUAGE — MUST BE ENGLISH
═══════════════════════════════════════
The listeningContent field MUST contain a natural English conversation.
This is an English listening exam (DSE Paper 3). The dialogue MUST be in English.
DO NOT generate Chinese dialogue. DO NOT mix languages.
The characters speak English. The conversation sounds like a real DSE recording.

═══════════════════════════════════════
CRITICAL: Speaker Labels — FULL WORDS ONLY
═══════════════════════════════════════
Speaker labels MUST be FULL English words: Woman, Man, Boy, Girl.
NEVER use abbreviations like W:, M:, B:, G:, W:, M: — these cause TTS errors.
Each line must start with "Woman: " or "Man: " or "Boy: " or "Girl: ".
Example of CORRECT format:
Woman: Good morning everyone. I'm Ms. Chan.
Man: Thank you for coming. Today we'll discuss the programme.

Listening design rules: ${diff.lines}, use at least 2 different speakers from {Woman, Man, Boy, Girl}.
Trap design: ${diff.traps} — use number confusion (e.g. 5432 vs 5423) and date corrections.
Note-taking guide: provide 4-5 guiding questions (Who/What/When/Where/Why/How).
Use symbol system: $=money #=number !=important @=time.
Writing task: ${taskInfo.name} (${taskInfo.nameZh}), format: ${taskInfo.formatHint}, approximately ${diff.wordLimit} words.

Output pure JSON (start with {, end with }, no markdown):
{
  "listeningContent": "Woman: Hello...\\nMan: Yes...\\nWoman: Also...",
  "listeningTopicZh": "主題名稱（繁體中文）",
  "noteTakingGuide": [{ "question": "What is the arrival date?", "hint": "Listen for date changes" }],
  "writingTask": "You are... Write a...",
  "expectedContentPoints": ["Point 1", "Point 2"],
  "listeningAnswers": [{ "question": "...", "answer": "..." }]
}

Grade: ${input.gradeLevel} | Difficulty: ${diff.label}${input.topicHint ? ` | Topic: ${input.topicHint}` : ''}
All Chinese text (listeningTopicZh, noteTakingGuide hints, etc.) must use Traditional Chinese (繁體中文).`;

  const userPrompt = `Generate a DSE Paper 3 Part B Integrated Skills exercise: task type: ${taskInfo.name}, grade: ${input.gradeLevel}, difficulty: ${input.difficulty}, approximately ${diff.wordLimit} words. Required topic: "${diverseTopics[0]}". Remember: listeningContent MUST be in English with full speaker labels (Woman:/Man:/Boy:/Girl:).`;

  const task = await executeAI({
    context: { feature: 'Listening', useCase: 'GenerateIntegratedSkills', promptName: 'IntegratedSkillsGeneration', promptVersion: 'v1' },
    messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
    options: { temperature: 0.6, maxTokens: 4096, jsonMode: true, timeoutMs: 30000, userId: input.userId },
    schema: IntegratedSkillsTaskSchema,
  });

  // Record the topic as used
  if (input.userId && diverseTopics[0]) {
    recordTopicUsage(input.userId, diverseTopics[0], 'school', 'listening');
  }

  return { listeningContent: normalizeListeningContent(task.listeningContent), listeningTopicZh: task.listeningTopicZh || 'Integrated Skills 聆聽任務', noteTakingGuide: task.noteTakingGuide || [], writingTask: task.writingTask, taskType: input.taskType, wordLimit: diff.wordLimit, expectedContentPoints: task.expectedContentPoints || [], listeningAnswers: task.listeningAnswers || [] };
}
