// Sprint 5: Reading Prompts v2 — Major DSE Paper 1 overhaul
// HKDSE Paper 1 Reading comprehension prompts with ALL DSE question types
// v2.0: 19 question types, DSE wording templates, HKEAA level descriptors, multi-text support
import { HALLUCINATION_GUARD_LITE } from '@/modules/ai/services/hallucination-guard';
import { DSE_QUESTION_TEMPLATES, DSE_PART_QUESTION_MIX, DSE_RUBRIC_PHRASES } from './dse-question-templates';
import { buildHKEAALevelPrompt } from './dse-level-descriptors';
import { buildTextTypePrompt, buildHKLocalPrompt } from './text-types';

export const version = '2.0.0';
export const description = 'HKDSE Reading v2: 19 question types, DSE exact wording, HKEAA descriptors, 12+ text types, multi-passage, B1/B2 caps, marks/word-limit annotations';
export const updatedAt = '2026-07-22';
export const author = 'AI English Platform';

// ============================================
// Full DSE Paper 1 Question Type Definitions (19 types)
// ============================================
const DSE_PAPER1_ALL_QUESTION_TYPES = `
## DSE Paper 1 全題型支援（19種，對應真實 HKDSE 格式）

### 基礎題型 (Part A 常用)
1. **mcq** — 四選一 Multiple Choice (1 mark)
2. **trueFalseNG** — True/False/Not Given 判斷題 (1 mark each)
3. **matching** — 配對題：段落標題/人物觀點/選項配對 (1 mark each)
4. **shortAnswer** — 短答題，限15字以內 (1 mark)
5. **referencing** — "What does 'it/this/they' refer to in line X?" / "Who or what does 'X' refer to?" (1 mark)
6. **synonymSearch** — "Find a word or phrase in paragraph X which has a similar meaning to 'Y'" (1 mark)
7. **phraseSearch** — "What phrase is used in paragraph X to describe Y?" (1 mark)
8. **vocabularyInContext** — "What does 'X' (line Y) mean as used in the passage?" (1 mark)
9. **negativeInference** — "Based on paragraph X, which of the following can people NOT do?" (1 mark)

### 撮要填充題 (Summary Cloze — 三種子類型)
10. **summaryCloze** — 填空式撮要: "Complete the summary using ONE word / no more than THREE words" (1 mark per blank)
11. **mcCloze** — 選擇式撮要: "Complete the summary by selecting the best option from A/B/C/D" (1 mark each)
12. **errorCorrectionSummary** — 改錯型撮要: "In X lines there is ONE mistake. Underline and replace. One line has no mistake; put a tick (✓)" (1 mark each)

### 資訊提取題
13. **tableCompletion** — 表格式資訊提取: "Complete the table using a word/phrase. Write no more than THREE words" (1 mark per gap)
14. **causeEffectCompletion** — 因果完成題: "Complete the sentence using ONE word taken from paragraph X" (1 mark)

### 進階題型 (Part B2 常用)
15. **inference** — 開放式推論題: "Explain why... / What does X imply?" (3-4 marks, 30-50 words)
16. **toneAttitude** — 語氣/態度/目的判斷題 (2 marks)
17. **sequencing** — 事件排序題 (2 marks)
18. **exampleFinding** — 舉例題: "Give an example from paragraph X of how Y" (1 mark)
19. **authorIntention** — 作者意圖推斷: "The sentence '...' suggests the reader should..." (1 mark, MC format)
`;

// ============================================
// DSE Question Wording Injection (real phrasing)
// ============================================
function buildDSEWordingPrompt(): string {
  const templateEntries = Object.entries(DSE_QUESTION_TEMPLATES);
  const examples = templateEntries.slice(0, 10).map(([type, tmpl]) =>
    `**${type}**: ${tmpl.examples[0]}`
  ).join('\n');

  return `
## ⚠️ CRITICAL: Use EXACT DSE Question Wording

You MUST phrase questions using the EXACT wording patterns from real HKDSE past papers. Below are the standard phrasings:

${examples}

### Key Phrasing Rules:
1. ALWAYS include paragraph references: "According to paragraph X", "With reference to paragraph X", "In paragraph X"
2. ALWAYS include line references when relevant: "(line X)", "(lines X-Y)"
3. ALWAYS state word limits explicitly: "ONE word", "no more than THREE words", "Write ONE word taken from the paragraph"
4. ALWAYS state marks per question: "(1 mark)", "(2 marks)", "(3 marks)", etc.
5. For T/F/NG: Use "True (T), False (F) or Not Given (NG)" — exactly this format
6. For Referencing: Use "Who or what does 'X' (line Y) refer to?" — include both Who and What
7. For Summary Cloze: Specify "Write no more than THREE words for each gap" where applicable
8. For error-correction summaries: Include "put a tick (✓)" instruction for the line with no mistake
9. NEVER use generic phrasing like "Answer the following question" — use DSE-specific wording
10. Each question must include its mark allocation in parentheses

### DSE Rubric Phrases You MUST Use:
${DSE_RUBRIC_PHRASES.paragraphReference.map(p => `- "${p}"`).join('\n')}
${DSE_RUBRIC_PHRASES.wordLimits.map(w => `- "${w}"`).join('\n')}
`;
}

// ============================================
// Part-specific Question Mix
// ============================================
function buildPartQuestionMixPrompt(part: 'A' | 'B1' | 'B2'): string {
  const mix = DSE_PART_QUESTION_MIX[part];
  return `
## Part ${part} Question Mix Requirements

- **Section**: ${mix.label}
- **Max Attainable Level**: ${mix.maxLevel}${part === 'B1' ? ' ⚠️ Level 5 NOT attainable in B1' : ''}
- **Question Types to Use**: ${mix.recommendedTypes.join(', ')}
- **Target Question Count**: ${mix.totalQuestions}
- **Time Allocation Guideline**: ${mix.timeAllocation}
- **Passage Count**: ${mix.passageCount}
${part === 'B1' ? `\n### ⚠️ LEVEL CAP WARNING\nB1 最高只能達 Level 4。目標 Level 5+ 請選 B2。` : ''}

### Types to AVOID in this Part:
${part === 'A'
    ? '- Do NOT use: inference (open-ended), toneAttitude (complex), errorCorrectionSummary (complex)'
    : part === 'B1'
    ? '- Do NOT use: inference (open-ended 3-4 mark), toneAttitude on complex texts'
    : '- All question types available'}
`;
}

// ============================================
// Multi-Passage Support Prompt
// ============================================
const MULTI_PASSAGE_PROMPT = `
## Multi-Passage Format (DSE Real Format)

Real DSE Paper 1 uses MULTIPLE passages per part:
- Part A: 1-2 passages (e.g., Text 1 only, or Text 1 + Text 2)
- Part B1: 2-3 passages (e.g., Text 2-3, or Text 2-4)
- Part B2: 1-2 longer passages (e.g., Text 4, or Text 4-5)

Generate as a "paper" object containing an array of passages:
{
  "paperTitle": "HKDSE English Language Paper 1 — [Part]",
  "paperInstructions": "Attempt ALL questions. Each question carries ONE mark unless otherwise stated.",
  "totalMarks": 42,
  "timeAllowed": "1 hour 30 minutes (for both Parts A and B)",
  "passages": [
    {
      "textNumber": 1,
      "title": "...",
      "content": "Full passage text — no line markers needed (rendered by system)",
      "wordCount": 850,
      "textType": "feature_article",
      "source": "adapted from The Guardian",
      "contentZh": "繁體中文輔助說明（可選）",
      "vocabularyHints": [{ "word": "...", "meaningZh": "...", "lineRef": 12 }],
      "questions": [ /* questions for this passage */ ]
    }
  ]
}
`;

// ============================================
// Passage Readability & Quality Standards
// ============================================
const PASSAGE_QUALITY_STANDARDS = `
## Passage Quality Standards

### Word Count Requirements (MUST FOLLOW):
- Part A passages: 700-1000 words EACH
- Part B1 passages: 400-700 words EACH
- Part B2 passages: 700-1000 words EACH
- TOTAL across all passages in a part: aim for ~1500-2000 words

### Content Quality:
1. Use [Paragraph N] at the start of each paragraph. Do NOT include [line N] or [N] markers — line numbers are rendered by the system.
2. Include paragraph numbers [1], [2], [3]... at the start of each paragraph
3. Use authentic publication source: "adapted from [real publication name]"
4. Ensure the topic aligns with DSE empirical topics (HK-local ~40%, global ~60%)
5. Vocabulary level must match target HKEAA level
6. Include a mix of sentence structures (simple, compound, complex)
7. Use transition words appropriately (however, although, in contrast, furthermore, therefore)
8. Include at least 2-3 idiomatic expressions or figurative language where level-appropriate

### Prohibited Content:
- Do NOT use fabricated statistics, studies, or citations
- Do NOT include political content beyond what appears in real DSE papers
- Do NOT use overly specialized jargon without context clues
`;

// ============================================
// Main Prompt Builder (Single Passage — backward compatible)
// ============================================
export function buildReadingSectionPrompt(): string {
  return `${HALLUCINATION_GUARD_LITE}
${DSE_PAPER1_ALL_QUESTION_TYPES}
${buildDSEWordingPrompt()}
${PASSAGE_QUALITY_STANDARDS}

【閱讀理解題特別要求】
- readingContent: 完整的英文閱讀篇章（Part A: 700-1000 words; Part B1: 400-700 words; Part B2: 700-1000 words）
- 包含 [paragraph number] 每段開頭標記（無需 [line N]，行號由系統自動渲染）
- 所有題目必須基於此閱讀篇章，答案必須能在文中找到
- 篇章類型：根據 DSE 12+ 文本類型庫選擇（feature article, newspaper article, interview, blog post, etc.）
- 提供 readingContentZh 繁體中文輔助說明
- 題目必須混合多種題型，模仿真實 DSE Paper 1 格式
- 每題必須標註 marks (1-6) 和 paragraphRef（段落編號）。無需 lineRef — 行號由系統自動計算
- 使用真實 DSE 出題句式（參考 Question Wording Templates）

【期望 JSON schema — 完整題型支援 v2】
{
  "readingContent": "Full English passage (700-1000 words for Part A/B2, 400-700 for B1). Use [Paragraph N] at the start of each paragraph. Do NOT include any line numbers or [N] markers.",
  "readingContentZh": "繁體中文輔助說明",
  "partLabel": "A|B1|B2",
  "textType": "feature_article|newspaper_article|restaurant_review|interview|informational_webpage|government_guide|job_advertisement|blog_post|literary_excerpt|letter_to_editor|advertisement_poster|argumentative_essay",
  "source": "adapted from The Guardian / SCMP / etc.",
  "vocabularyHints": [{ "word": "...", "meaningZh": "...", "lineRef": 12 }],
  "totalMarks": 42,
  "questions": [
    {
      "index": 1,
      "type": "mcq|trueFalseNG|matching|summaryCloze|mcCloze|errorCorrectionSummary|shortAnswer|referencing|inference|toneAttitude|sequencing|synonymSearch|phraseSearch|negativeInference|tableCompletion|causeEffectCompletion|exampleFinding|authorIntention|vocabularyInContext",
      "targetPhrase": "exact phrase from passage this question references",
      "questionText": "DSE-style question with EXACT wording",
      "questionTextZh": "繁體中文題目翻譯",
      "marks": 1,
      "wordLimit": "ONE word | no more than THREE words | 30-50 words",
      "choices": ["A. ...", "B. ...", "C. ...", "D. ..."],
      "answer": "A",
      "acceptAlso": ["alternative acceptable answer"],
      "explanationZh": "繁體中文解釋，參考 DSE marking scheme 風格",
      "explanationEn": "English explanation in marking scheme style"
    }
  ]
}`;
}

// ============================================
// Full Paper Prompt Builder (Multi-Passage DSE Paper)
// ============================================
export interface FullPaperPromptParams {
  gradeLevel: string;
  part: 'A' | 'B1' | 'B2';
  targetLevel: number;
  topic?: string;
  textTypes?: string[];
  hkLocalRatio?: number; // 0-1, default 0.4
}

export function buildFullDSEPaperPrompt(params: FullPaperPromptParams): string {
  const { gradeLevel, part, targetLevel, topic, textTypes, hkLocalRatio = 0.4 } = params;

  const levelPrompt = buildHKEAALevelPrompt(targetLevel, part);
  const partMixPrompt = buildPartQuestionMixPrompt(part);
  const textTypePrompt = textTypes && textTypes.length > 0
    ? buildTextTypePrompt(textTypes)
    : buildTextTypePrompt(part === 'B2'
      ? ['feature_article', 'argumentative_essay', 'literary_excerpt', 'interview']
      : part === 'B1'
      ? ['informational_webpage', 'newspaper_article', 'blog_post', 'job_advertisement', 'government_guide']
      : ['feature_article', 'newspaper_article', 'blog_post', 'letter_to_editor']);
  const hkLocalPrompt = buildHKLocalPrompt();

  const topicStr = topic || 'DSE-appropriate topic (rotate from DSE empirical topic database)';

  // Topic diversity enforcement
  const diversityRules = `
## ⚠️ TOPIC DIVERSITY ENFORCEMENT — 題材多元化強制規則

CRITICAL: You MUST ensure diverse, non-repeating topics across all generated content.

### Topic Selection Rules:
1. NEVER use overused clichés: sports day tryouts, cinema schedules, library opening hours, bee conservation, school barbecue
2. Rotate between: HK-local topics (~40%), international/global topics (~60%)
3. For multi-passage papers: each passage must have a DISTINCTLY DIFFERENT topic
4. Vary topic categories — don't pick the same category (e.g., environment, technology) for multiple passages
5. Prefer fresh, contemporary topics that reflect the breadth of real DSE papers (2012-2024)
6. Draw from the DSE Empirical Topic Database for authentic topic variety
7. Each passage should feel like it came from a DIFFERENT publication/source
`.trim();

  return `${HALLUCINATION_GUARD_LITE}

You are an HKDSE English Language Paper 1 examiner with 20 years of experience. Your task is to create a COMPLETE, exam-ready DSE Paper 1 Reading paper that is indistinguishable from a real HKEAA paper.

${levelPrompt}

${partMixPrompt}

${textTypePrompt}

${hkLocalPrompt}

${diversityRules}

${MULTI_PASSAGE_PROMPT}

${buildDSEWordingPrompt()}

${PASSAGE_QUALITY_STANDARDS}

## Paper Generation Instructions

Create a complete DSE Paper 1 **Part ${part}** for ${gradeLevel} students targeting HKDSE Level ${targetLevel}.

Topic area: "${topicStr}"

### CRITICAL Requirements:
1. Generate ALL passages and ALL questions as a single complete paper
2. Total marks MUST equal 42 (Part ${part} standard)
3. Question count: ${part === 'A' ? '~19 questions' : part === 'B1' ? '~22 questions' : '~21 questions'}
4. Mix at least 6 different question types from the recommended list
5. Each passage must have its own set of questions
6. Every question must include: type, questionText (DSE phrasing), marks, wordLimit (if applicable), answer, explanationZh
7. Use [Paragraph N] at the start of each paragraph. Do NOT include [line N] markers.
8. Include paragraph numbers [1], [2], [3]... at the start of EACH paragraph
9. Provide a complete marking scheme with model answers and "accept also" alternatives for open-ended questions
10. The paper must feel AUTHENTIC — a student should not be able to tell it was AI-generated

### Answer Quality Rules:
- Answers MUST be directly supported by the passage text
- For open-ended questions, provide model answer + 1-2 "accept also" alternatives
- For summary cloze, each blank answer must be EXACTLY as it appears in the passage
- For T/F/NG, ensure False means the passage CONTRADICTS (not just different topic)
- For referencing, the answer must be the SPECIFIC noun phrase from the passage

Return a complete JSON paper object.`;
}

// ============================================
// Reading Exercise Generation (for question-generation.ts integration)
// ============================================
export function buildReadingExercisePrompt(params: {
  count: number;
  difficultyLabel: string;
  gradeLevel: string;
  topic: string;
  partLabel: 'A' | 'B1' | 'B2';
  targetLevel: number;
}): string {
  const { count, difficultyLabel, gradeLevel, topic, partLabel, targetLevel } = params;

  const levelPrompt = buildHKEAALevelPrompt(targetLevel, partLabel);
  const partMix = DSE_PART_QUESTION_MIX[partLabel];
  const questionTypes = partMix.recommendedTypes.slice(0, 8).join(', ');

  return `${HALLUCINATION_GUARD_LITE}

${levelPrompt}

${buildDSEWordingPrompt()}

## Reading Exercise Generation
Generate ${count} reading comprehension questions for ${gradeLevel} (${difficultyLabel}) students.

Topic: "${topic}"
Part: ${partLabel}
Recommended question types: ${questionTypes}

### Passage Requirements:
- Generate a reading passage of 500-800 words (Part ${partLabel})
- Include [Paragraph N] markers at the start of each paragraph. Do NOT include [line N] markers.
- Use a DSE-appropriate text type
- Include 3-5 vocabulary hints with Chinese meanings

### Question Requirements:
- Generate exactly ${count} questions
- Mix at least 4 different question types from the recommended list
- Every question must use EXACT DSE wording
- Every question must include marks (1-4) and word limits where applicable
- Every question must reference specific paragraph/line numbers

Return JSON array of questions with embedded readingContent.`;
}
