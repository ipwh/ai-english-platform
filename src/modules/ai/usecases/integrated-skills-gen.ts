// Sprint 94: Integrated Skills Generation Use Case
import { executeAI } from '../services/ai-execution';
import { IntegratedSkillsTaskSchema } from '../schemas/ai-schema';
import { getDSEEmpiricalTopics } from '../services/dse-topics';
import { selectDiverseTopics, buildDiversityInstruction, recordTopicUsage } from '../services/topic-selector';
import { INTEGRATED_SKILLS_DIFF_MAP, INTEGRATED_SKILLS_TASK_TYPE_MAP } from '../services/integrated-skills-config';
import { normalizeListeningContent } from '../services/listening-normalizer';
import type { IntegratedSkillsTask } from './integrated-skills-types';

export type IntegratedSkillsTaskType =
  | 'summary' | 'email-reply' | 'short-article' | 'report'
  | 'speech' | 'proposal' | 'notice' | 'press-release' | 'letter-to-editor';

export interface GenerateIntegratedSkillsInput {
  userId?: string; gradeLevel: string; difficulty: 'remedial' | 'core' | 'challenge';
  taskType: IntegratedSkillsTaskType; topicHint?: string;
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
CRITICAL: listeningContent FORMAT — DIALOGUE LINES ONLY
═══════════════════════════════════════
The listeningContent MUST be actual dialogue lines with speaker labels.
Each line MUST start with "Woman: " or "Man: " or "Boy: " or "Girl: ".
NEVER output a narrative summary like "Two students discuss..."
NEVER output paragraph-style descriptions of what was said.
ALWAYS output the exact words the speakers say, line by line.

CORRECT format (dialogue):
Woman: Good morning everyone. I'm Ms. Chan, your activity coordinator.
Man: Thank you for coming. Today we'll discuss the details of our school programme.
Woman: First, let me share the key dates for this year's charity event.

WRONG format (summary — FORBIDDEN):
Two students, Emily and Jason, discuss the upcoming charity walkathon with their teacher. They talk about event details and fundraising goals.

═══════════════════════════════════════
CRITICAL: Dialogue Quality & Length
═══════════════════════════════════════
Each speaker line MUST be a complete, meaningful sentence (8-25 English words).
DO NOT produce single-word or fragment responses (e.g., "Yes.", "Okay.", "Right.").
The conversation must include:
- Rich contextual details: dates, numbers, names, places, amounts, reasons
- Natural back-and-forth: questions followed by answers, opinions, clarifications
- Sufficient content for students to extract 4-6 distinct information points
The dialogue should sound like a REAL DSE Paper 3 recording:
- Authentic Hong Kong school/community context
- Clear speaker roles (teacher/student, organizer/participant, etc.)
- Realistic scenario with a beginning, middle, and conclusion

═══════════════════════════════════════
CRITICAL: Speaker Labels — FULL WORDS ONLY
═══════════════════════════════════════
Speaker labels MUST be FULL English words: Woman, Man, Boy, Girl.
NEVER use abbreviations like W:, M:, B:, G: — these are FORBIDDEN.
Each line must start with "Woman: " or "Man: " or "Boy: " or "Girl: ".
Example of CORRECT format:
Woman: Good morning everyone. I'm Ms. Chan, your activity coordinator.
Man: Thank you for coming. Today we'll discuss the details of our school programme.

Listening design rules: ${diff.lines}, use at least 2 different speakers from {Woman, Man, Boy, Girl}.
Trap design: ${diff.traps} — use number confusion (e.g. 5432 vs 5423) and date corrections.

═══════════════════════════════════════
Data File Requirements — ALL CONTENT MUST BE IN ENGLISH
═══════════════════════════════════════
Generate ${diff.dataFilePages} Data File sources (email/memo/report-excerpt/webpage/statistics/notice).
⚠️ CRITICAL: ALL data file content (title, content, EVERYTHING) MUST be written in ENGLISH.
This is an English exam (DSE Paper 3). The student must read and interpret English materials.
NEVER generate Chinese text in data file content. NEVER mix languages.
Each source must have:
- type: one of email, memo, report-excerpt, webpage, statistics, notice
- title: a descriptive title for the source
- content: the actual text content of the source
- relevantFor: array of question indices (1-based) this source helps answer
- sourceDate (optional): date of the source if applicable
Include at least 1 distractor source not relevant to any question.
Include subtle info conflicts between sources (e.g., different dates for same event).

═══════════════════════════════════════
CRITICAL: Note-taking Guide — BILINGUAL + HINTS ONLY, NEVER ANSWERS
═══════════════════════════════════════
The noteTakingGuide is for STUDENTS to fill in during listening.
It MUST contain guiding questions with HINTS — NEVER the actual answers.
Hints should tell students WHAT to listen for (e.g. "Listen for the date"),
NOT what the answer is (e.g. DO NOT write "August 15th").

IMPORTANT — BILINGUAL FORMAT:
- "question" / "hint": Write in ENGLISH (primary display language)
- "questionZh" / "hintZh": Write in TRADITIONAL CHINESE 繁體中文 (secondary, shown on toggle)

Use symbol system: $=money #=number !=important @=time in hints.
Example of CORRECT hint: "留意日期，可能有更改" (tells student to listen for date, not the date itself)
Example of WRONG hint: "答案是8月15日" (reveals the answer — FORBIDDEN)
Example of CORRECT hint: "注意金額和用途限制" (tells student to listen for money, not the amount)
Example of WRONG hint: "津貼是$2,500" (reveals the answer — FORBIDDEN)

Writing task: ${taskInfo.name} (${taskInfo.nameZh}), format: ${taskInfo.formatHint}, approximately ${diff.wordLimit} words.

Output pure JSON (start with {, end with }, no markdown):
{
  "listeningContent": "Woman: Hello...\\nMan: Yes...\\nWoman: Also...",
  "listeningTopicZh": "主題名稱（繁體中文）",
  "dataFile": { "sources": [{ "type": "email", "title": "...", "content": "...", "relevantFor": [1, 2], "sourceDate": "2024-03-15" }] },
  "noteTakingGuide": [{ "question": "What date did the students arrive?", "hint": "Listen for the date — it may change", "questionZh": "學生抵達日期是？", "hintZh": "留意日期，可能有更改" }],
  "writingTask": "You are... Write a...",
  "expectedContentPoints": ["Content point as a plain string", "Another content point as a plain string"],
  "listeningAnswers": [{ "question": "...", "answer": "..." }]
}

⚠️ IMPORTANT: expectedContentPoints MUST be an array of plain strings, NOT objects with {point, source} keys.

Grade: ${input.gradeLevel} | Difficulty: ${diff.label}${input.topicHint ? ` | Topic: ${input.topicHint}` : ''}
All Chinese text (listeningTopicZh, noteTakingGuide hints, etc.) must use Traditional Chinese (繁體中文).`;

  const userPrompt = `Generate a DSE Paper 3 Part B Integrated Skills exercise: task type: ${taskInfo.name}, grade: ${input.gradeLevel}, difficulty: ${input.difficulty}, approximately ${diff.wordLimit} words. Required topic: "${diverseTopics[0]}".

CRITICAL REQUIREMENTS:
- listeningContent MUST be a substantial English dialogue (${diff.lines})
- Each speaker line MUST be 8-25 English words — NO single-word responses
- Speaker labels MUST be FULL words: Woman:/Man:/Boy:/Girl: — NEVER W:/M:
- Include rich details: dates, numbers, names, places, reasons
- The dialogue must sound like a REAL DSE Paper 3 recording`;

  const task = await executeAI({
    context: { feature: 'Listening', useCase: 'GenerateIntegratedSkills', promptName: 'IntegratedSkillsGeneration', promptVersion: 'v1' },
    messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
    options: { temperature: 0.6, maxTokens: 8192, jsonMode: true, timeoutMs: 45000, userId: input.userId },
    schema: IntegratedSkillsTaskSchema,
  });

  // Record the topic as used
  if (input.userId && diverseTopics[0]) {
    recordTopicUsage(input.userId, diverseTopics[0], 'school', 'listening');
  }

  return { listeningContent: normalizeListeningContent(task.listeningContent), listeningTopicZh: task.listeningTopicZh || 'Integrated Skills 聆聽任務', dataFile: task.dataFile, noteTakingGuide: sanitizeNoteGuide(task.noteTakingGuide || []), writingTask: task.writingTask, taskType: input.taskType, wordLimit: diff.wordLimit, expectedContentPoints: task.expectedContentPoints || [], listeningAnswers: task.listeningAnswers || [] };
}

/**
 * Sanitize note-taking guide hints to remove answer-like content.
 * The LLM occasionally leaks actual answers into hints despite prompt instructions.
 * This post-processing redacts hints that look like answers (dates, dollar amounts, etc.)
 * in BOTH English and Traditional Chinese.
 */
function sanitizeNoteGuide(guide: Array<{ question: string; hint: string; questionZh?: string; hintZh?: string }>): Array<{ question: string; hint: string; questionZh?: string; hintZh?: string }> {
  return guide.map(item => {
    let hint = item.hint;
    // ── English patterns ──
    // Dollar amounts: $500, $2,500, HKD 100, etc.
    hint = hint.replace(/\$[\d,]+(\s*(HKD|USD|港元|元))?/g, '【金額】');
    hint = hint.replace(/HKD\s*\$?[\d,]+/gi, '【金額】');
    // Dates: Aug 15, 15th August, 2024-08-15, etc.
    hint = hint.replace(/\b\d{1,2}(st|nd|rd|th)?\s*(January|February|March|April|May|June|July|August|September|October|November|December)\b/gi, '【日期】');
    hint = hint.replace(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s*\d{1,2}(st|nd|rd|th)?\b/gi, '【日期】');
    // Times: 3:00pm, 14:00, etc.
    hint = hint.replace(/\b\d{1,2}:\d{2}\s*(am|pm|AM|PM)?\b/g, '【時間】');
    // Phone numbers / specific numbers with 4+ digits
    hint = hint.replace(/\b\d{4,}\b/g, '【數字】');
    // Email addresses
    hint = hint.replace(/[\w.-]+@[\w.-]+\.\w+/g, '【電郵】');
    // Percentages: 60%, 80 percent
    hint = hint.replace(/\b\d{1,3}\s*(%|percent)\b/gi, '【百分比】');
    // Parenthetical examples that leak answers: (e.g., 'Beach Clean-up'), (例如：'...')
    hint = hint.replace(/\(e\.g\.,?\s*['"][^'"]+['"]\s*\)/gi, '(e.g., 【例子】)');
    hint = hint.replace(/\(例如[：:]\s*['"][^'"]+['"]\s*\)/g, '(例如：【例子】)');

    // ── Traditional Chinese patterns ──
    // Chinese dates: 8月15日, 7月20日, 二零二四年八月
    hint = hint.replace(/\d{1,2}\s*月\s*\d{1,2}\s*日/g, '【日期】');
    hint = hint.replace(/\d{4}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日/g, '【日期】');
    // Chinese times: 上午9時, 下午1時, 9點
    hint = hint.replace(/[上下]午\s*\d{1,2}\s*[時點]/g, '【時間】');
    hint = hint.replace(/\d{1,2}[：:]\d{2}/g, '【時間】');
    // Chinese dollar amounts: $500, 500元, 2,500港元
    hint = hint.replace(/\d{1,3}(,\d{3})*\s*(元|港元|美元)/g, '【金額】');
    // Chinese percentages: 60%
    hint = hint.replace(/\d{1,3}\s*%/g, '【百分比】');
    // Chinese age/qualification leaks: 16歲, 年滿16
    hint = hint.replace(/\d{1,2}\s*歲/g, '【年齡】');
    // Chinese name/proper noun leaks: 'Beach Clean-up' in Chinese context
    hint = hint.replace(/['"][^'"]{3,}['"]/g, '【名稱】');
    // Explicit answer phrases in Chinese
    hint = hint.replace(/答案(是|為|：|:)\s*.+/g, '答案請自行從錄音中找出');
    hint = hint.replace(/answer\s*(is|:)\s*.+/gi, 'Listen to the recording for the answer');
    // e.g. patterns in Chinese
    hint = hint.replace(/例如[：:]\s*.+/g, '例如：【請從錄音中找出】');

    return { question: item.question, hint };
  });
}
