// Sprint 94: Integrated Skills Generation Use Case
import { callLLM } from '../services/llm-call';
import { parseAndValidateAIResponse } from '../services/response-pipeline';
import { validateAIResponse, IntegratedSkillsTaskSchema } from '../schemas/ai-schema';
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

  const systemPrompt = `你是一位香港 DSE English Paper 3 評卷專家，專門設計 Integrated Skills 練習題。
請生成一個完整的 Integrated Skills 任務，模擬 DSE Paper 3 Part B「聽 → 記 → 寫」的真實考試流程。

⚠️ REQUIRED TOPIC: "${diverseTopics[0]}" — You MUST design the entire task around this specific topic.

${diversityInstruction}

Real DSE Paper 3 reference topics (for style reference only — do NOT use as main topic):
${referenceTopics.map(t => `  • ${t}`).join('\n')}

聆聽材料設計規則：${diff.lines}，角色標籤 Woman/Man/Boy/Girl，陷阱設計：${diff.traps}
Note-taking 指引：提供 4-5 個引導問題（Who/What/When/Where/Why/How），使用符號系統（$=金錢 #=數字 !=重要 @=時間）
寫作任務：${taskInfo.name} (${taskInfo.nameZh})，格式要求：${taskInfo.formatHint}，字數約 ${diff.wordLimit} words
輸出純 JSON：
{ "listeningContent": "Woman: ...\\nMan: ...", "listeningTopicZh": "...", "noteTakingGuide": [{ "question": "...?", "hint": "..." }], "writingTask": "...", "expectedContentPoints": ["..."], "listeningAnswers": [{ "question": "...", "answer": "..." }] }
年級：${input.gradeLevel} | 難度：${diff.label}${input.topicHint ? ` | 主題：${input.topicHint}` : ''}
所有中文使用繁體中文。`;

  const userPrompt = `生成一個 DSE Paper 3 Part B Integrated Skills 練習：任務類型：${taskInfo.name}，年級：${input.gradeLevel}，難度：${input.difficulty}，字數要求：約 ${diff.wordLimit} words。必要主題："${diverseTopics[0]}"。`;

  const result = await callLLM([{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }], { temperature: 0.6, maxTokens: 4096, jsonMode: true, timeoutMs: 30000, userId: input.userId });
  const task = parseAndValidateAIResponse(result, IntegratedSkillsTaskSchema);

  // Record the topic as used
  if (input.userId && diverseTopics[0]) {
    recordTopicUsage(input.userId, diverseTopics[0], 'school', 'listening');
  }

  return { listeningContent: normalizeListeningContent(validated.data.listeningContent), listeningTopicZh: validated.data.listeningTopicZh || 'Integrated Skills 聆聽任務', noteTakingGuide: validated.data.noteTakingGuide || [], writingTask: validated.data.writingTask, taskType: input.taskType, wordLimit: diff.wordLimit, expectedContentPoints: validated.data.expectedContentPoints || [], listeningAnswers: validated.data.listeningAnswers || [] };
}
