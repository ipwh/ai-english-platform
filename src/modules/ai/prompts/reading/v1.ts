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
1. Use [Paragraph N] at the start of each paragraph. Do NOT include [line N] or [N] markers.
2. Use authentic publication source: "adapted from [real publication name]"
3. Ensure the topic aligns with DSE empirical topics (HK-local ~40%, global ~60%)
4. Vocabulary level must match target HKEAA level
5. Include at least 2-3 idiomatic expressions or figurative language where level-appropriate

### Phase 4A: Passage Voice & Naturalness (MANDATORY)

#### Voice & Stance:
- Every passage MUST have a clear authorial voice — avoid robotic, textbook-like neutrality
- Where the topic invites it, include a subtle stance, opinion, or evaluative perspective
- Include caveats, limitations, or contrasting viewpoints to create intellectual tension
- Do NOT sound like an encyclopedia entry or a student summary
- Opening paragraph should engage the reader, not just state facts

#### Paragraph Progression:
- Each paragraph must serve a distinct rhetorical purpose
- Paragraphs should flow naturally, not read like isolated factual blocks
- Use organic transitions (not just "Furthermore" / "Moreover" on repeat)
- The passage should have shape: opening, development, nuance/contrast, closing
- Later paragraphs should build on earlier ones for cross-paragraph reasoning

#### Sentence Variety:
- Vary sentence length: mix short (5-10 words) with longer complex ones (20-35 words)
- Vary sentence openings — do NOT start 3+ consecutive sentences the same way
- Use a mix of simple, compound, and complex structures naturally

#### Inference Space:
- Leave some ideas IMPLIED rather than explicitly stated
- Do not over-explain every point; trust the reader to connect ideas
- Make tone/attitude detectable through word choice, not stated directly
- The passage should naturally support inference and tone questions

### Prohibited Content:
- Do NOT use fabricated statistics, studies, or citations
- Do NOT include political content beyond what appears in real DSE papers
- Do NOT use overly specialized jargon without context clues
- Do NOT write passages that sound AI-generated or template-driven
`;

// ============================================
// Phase 4B: Skill Boundary Prompt — Differentiating Question Types
// ============================================

const SKILL_BOUNDARY_PROMPT = `
## ⚠️ CRITICAL: Question Skill Boundaries — Do NOT Confuse These

Each question tests exactly ONE reading skill. You MUST ensure questions for different skills are genuinely different.

### Skill Differentiation Table:

| Skill | Tests... | Does NOT test... | Must reference |
|-------|----------|------------------|----------------|
| **Factual** | Locating explicitly stated info | Inference, tone, whole-text | Single paragraph |
| **Reference** | What pronoun/noun refers to | Meaning, inference | Single word/phrase |
| **Vocabulary** | Word meaning in context | General dictionary meaning | Single word/phrase |
| **Inference** | Reading between lines in ONE paragraph | Whole-text, cross-paragraph | Single paragraph |
| **Cross-Paragraph** | Connecting claims across 2+ paragraphs | Single-paragraph inference | 2+ paragraphs |
| **Whole-Text** | Synthesizing the ENTIRE passage | Summary, single para, cross-para only | 3+ paragraphs / entire passage |
| **Tone/Stance** | Author's voice via word choice, hedging | Factual content, simple +/- label | Word choice patterns |
| **Paragraph Function** | WHY a paragraph exists (rhetorical role) | WHAT it says | Single paragraph's role |
| **Main Idea** | Central thesis/gist of passage | Paragraph function, detail synthesis | Entire passage |
| **Summary/Transform** | Completing structured summaries | Open-ended synthesis | Specified paragraphs |

### ⚠️ Key Rules to Avoid Skill Overlap:

1. **Whole-text ≠ Summary**: A whole-text question requires the student to form their own synthesis. A summary provides the structure. Do not label a summary cloze as whole-text.

2. **Tone/Stance ≠ Inference**: A tone question MUST depend on word choice, hedging, contrast, or structure — not just "what can be inferred." If the answer is simply "positive" or "negative" without nuance, it's too factual.

3. **Cross-Paragraph ≠ Inference**: If a question can be answered by reading ONE paragraph, it is NOT cross-paragraph — even if the question text mentions two paragraphs.

4. **Paragraph Function ≠ Main Idea**: "What is the function of paragraph 3?" asks about rhetorical role (e.g., "provides a counterexample"). "What is the main idea?" asks about the central argument.

5. **Main Idea ≠ Whole-Text**: Main idea is the central thesis (one sentence). Whole-text requires integrating details from across the passage.

### ⚠️ Tone/Stance Question Quality:

Tone and stance questions MUST:
- Depend on word choice (e.g., "merely," "supposedly," "in fact"), hedging ("may," "appears to"), contrast structures ("While X... Y...")
- Distinguish attitude from factual description
- Avoid answers that are just "positive" / "negative" / "neutral"
- Use nuanced tone labels: "skeptical," "cautiously optimistic," "subtly critical," "wryly humorous," "respectfully dismissive"
- Reference specific language from the passage as evidence

BAD: "What is the writer's attitude? → Positive"
GOOD: "What is the writer's attitude toward the renovation? → Cautiously optimistic, as shown by phrases like 'promising yet unproven' and 'potential pitfalls remain'"

### ⚠️ Whole-Text Question Quality:

A valid whole-text question:
- CANNOT be answered from a single paragraph
- Requires integrating information from 3+ paragraphs
- Asks about the passage's overall message, argument development, or cumulative effect
- Is NOT a summary cloze, NOT a main idea question, NOT a cross-paragraph comparison

BAD: "What is the passage about?" (main idea, not whole-text)
GOOD: "How does the writer build the argument that X, and what evidence from different parts of the passage supports this?"

### ⚠️ Cross-Paragraph Question Quality:

A valid cross-paragraph question:
- Requires connecting claims, evidence, or developments from 2+ paragraphs
- Cannot be answered by reading just one paragraph
- Involves comparison, development tracking, or synthesis across paragraphs

BAD: "According to paragraphs 2 and 3, what is X?" (factual, not cross-paragraph)
GOOD: "How does the argument in paragraph 3 modify the claim made in paragraph 2?"

### ⚠️ Part A & Short-Passage Guardrails:

For Part A papers or passages with ≤3 paragraphs:
- Whole-text and cross-paragraph questions are OPTIONAL, not required
- At most 15% of questions should be higher-order (tone/stance, cross-paragraph, whole-text, paragraph function, main idea)
- At most 1 whole-text item per Part A paper
- Focus on factual, reference, vocabulary, and simple inference
- Part A is designed to be accessible — do not overload with complex reasoning

For Part B1/B2 or passages with 4+ paragraphs:
- Higher-order skills should be ≥20% of questions
- Whole-text synthesis is expected
- Cross-paragraph reasoning is appropriate
`;

// ============================================
// Phase 4C: Summary Cloze Sophistication — Copy / Change / Create
// ============================================

const SUMMARY_CLOZE_SOPHISTICATION_PROMPT = `
## ⚠️ CRITICAL: Summary Cloze & Transformation Quality Rules

Summary cloze, table completion, cause-effect completion, and sentence transformation items MUST follow these rules.

### Answer Mode: Copy / Change / Create

Every gap in a summary cloze or transformation item belongs to ONE of three modes:

| Mode | Rule | Example |
|------|------|---------|
| **copy** | The exact word exists in the passage and fits without change. | Passage: "It was completed in 2010." → Gap: "It was _____ in 2010." → "completed" |
| **change** | The word exists but needs tense/number/part-of-speech adjustment. | Passage: "They decided to expand." → Gap: "The _____ to expand was unanimous." → "decision" (NOT "decided") |
| **create** | The word does NOT appear; must be inferred from context. | Passage: "The project faced many obstacles." → Gap: "The project was _____ from the start." → "problematic" or "difficult" |

### ⚠️ Mode Distribution Rules:

1. **Never make ALL gaps "copy"** — at least 30% of gaps must be "change" or "create"
2. For a 4-gap summary: at least 1 gap should require change (grammar) and at least 1 should be create (inference)
3. For a 3-gap summary: at least 1 gap should require change
4. "Create" mode gaps should have clear context clues in the surrounding text
5. Annotate each gap with its mode in the answer metadata

### ⚠️ Grammar-Aware Gap Design:

- Surrounding words MUST provide part-of-speech cues (articles before nouns, auxiliaries before verbs, etc.)
- If a gap needs a past participle, the helper "has/have/had/been" must appear nearby
- If a gap needs a noun, an article (a/an/the) or quantifier must appear before it
- If a gap needs a gerund (-ing), a preposition or "by" must precede it
- Do NOT leave grammar cues ambiguous — the required part of speech should be clear

### ⚠️ Distinguish Summary Cloze from Other Skills:

- Summary cloze tests: comprehension + grammar + controlled transformation
- Vocabulary-in-context tests: word meaning only (NOT grammar adjustment)
- Inference tests: implied meaning (NOT structural completion)
- Do NOT make summary gaps that are just vocabulary lookups — require grammatical engagement

### ⚠️ Sentence Transformation Quality:

Sentence transformation items (causeEffectCompletion, errorCorrectionSummary, etc.) must:
- Preserve the original meaning exactly
- Force grammatical restructuring (voice, clause type, tense, modality)
- NOT be solvable by just copying words in a different order
- Include clear grammatical constraints in the instruction

BAD: "Complete: Knowing the _____ of kite flying will make it more enjoyable." (just vocabulary lookup)
GOOD: "Complete using ONE word: Knowing the _____ of kite flying will make it more enjoyable. You must change the form of a word found in paragraph 1." (forces change mode)

BAD: "Rewrite: 'The committee approved the plan.' → 'The plan _____ by the committee.'" (trivial passive)
GOOD: "Rewrite using 'approval': 'The committee approved the plan.' → 'The plan received _____ from the committee.'" (forces word-form change + structure change)
### ⚠️ Phase 4C.1: Sentence Transformation Guardrails

Sentence transformation items (causeEffectCompletion, errorCorrectionSummary, tableCompletion) must:
1. **Preserve meaning exactly** — the transformed sentence must convey the same information as the original
2. **Force structural change** — at least ONE of: voice change, clause restructuring, word-form conversion, or modality change
3. **NOT be solvable by just replacing one word** — if the answer is just substituting a synonym, it's too weak

STRONG transformation: "Rewrite in the passive voice" / "Combine using a relative clause" / "Transform the adjective into a noun"
WEAK transformation: "Rewrite using the word X" without structural change / "Replace the word Y" / "Change the tense"

### ⚠️ Sentence Transformation Answer Format:

For transformation items, include BOTH:
- The model answer (the correctly transformed sentence)
- 1-2 common student errors where the meaning is distorted or structure unchanged`;

// ============================================
// Phase 3A + 4B: Question Blueprint & Distractor Quality
// ============================================

const QUESTION_BLUEPRINT_PROMPT = `
## ⚠️ MANDATORY Question Type Mix (MUST FOLLOW)

Your question set MUST include ALL of these type families:
1. **Factual/Literal** (≥2 items, ≤55% of total): mcq, trueFalseNG, shortAnswer, mcCloze, negativeInference
2. **Reference** (≥1 item): referencing — "What does 'it' refer to?"
3. **Vocabulary in context** (≥1 item): vocabularyInContext, synonymSearch, phraseSearch
4. **Inference** (≥1 item): inference, authorIntention
5. **Tone/Attitude/Stance** (≥1 item): toneAttitude — MUST use nuanced tone vocabulary
6. **Whole-text synthesis** (≥1 item for 4+ paragraph passages): A question requiring integration across 3+ paragraphs or the entire passage
7. **Summary cloze or transformation** (≥1 item): summaryCloze, mcCloze, tableCompletion, causeEffectCompletion

### ⚠️ Skill Distribution Rules (MANDATORY):

For passages with 4+ paragraphs and 7+ questions:
- **Factual items**: ≤55% of questions (too many factual = too easy)
- **Higher-order skills** (cross-paragraph, whole-text, tone/stance, paragraph function, main idea): ≥20% of questions
- **No single skill category** should exceed 40% of questions
- Include at least ONE of: cross-paragraph reasoning, paragraph function, or main idea question

For shorter passages (≤3 paragraphs):
- Focus on factual, inference, vocabulary, reference
- Whole-text and cross-paragraph questions are optional but welcome

### ⚠️ Distractor Quality Rules (MANDATORY):
- ALL MCQ distractors must be PLAUSIBLE — a student should need to read the passage to eliminate them
- Include HALF-TRUE traps: options that are mostly correct but have one wrong detail
- Include SCOPE-SHIFT traps: options that are true but about a different paragraph/section
- Include CONTRAST-MISS traps: options that reverse a relationship (e.g., "increases" vs "decreases")
- Include CAUSE-EFFECT-SWAP traps: options that mix up cause and effect from the passage
- Include REFERENCE-CONFUSION traps: options that attribute a statement to the wrong person/thing
- Include TONE traps: options with correct content but overstated, understated, or wrong attitude
- Include QUALIFIER-MISS traps: options that drop important qualifiers (e.g., "may" → "will", "some" → "all")
- Include NEGATION-MISS traps: options that miss a negative (e.g., "not necessary" → "necessary")
- NEVER use absurd or obviously wrong distractors
- NEVER use "All of the above" / "None of the above" — these are NOT DSE-compatible
- Each distractor should be similar in length and complexity to the correct answer
- The correct answer must NOT stand out by length, style, or phrasing patterns
- At least one distractor must be "almost right" — a student who reads shallowly should find it plausible

### ⚠️ Wording Realism (MANDATORY):
- Do NOT over-guide students: avoid stems that give away the answer
- Paraphrase the passage in question stems where possible — don't just quote
- For vocabulary questions: prefer "What does X mean as used in the passage?" over "Find a synonym for X"
- Avoid asking about a word that is directly defined in the next sentence

### ⚠️ Coverage & Progression (MANDATORY):
- Ensure EVERY paragraph has at least one question
- Early questions (first 40%): literal comprehension, easy to locate
- Middle questions (40-70%): inference, vocabulary, reference, paragraph function
- Late questions (last 30%): tone/attitude, whole-text, cross-paragraph, summary/transformation
- Reserve the last 1-2 items for whole-text synthesis or main idea
- Place cross-paragraph questions where students have read all relevant paragraphs
`;

// ============================================
// Main Prompt Builder (Single Passage — backward compatible)
// ============================================
export function buildReadingSectionPrompt(): string {
  return `${HALLUCINATION_GUARD_LITE}
${DSE_PAPER1_ALL_QUESTION_TYPES}
${buildDSEWordingPrompt()}
${QUESTION_BLUEPRINT_PROMPT}
${SUMMARY_CLOZE_SOPHISTICATION_PROMPT}
${SKILL_BOUNDARY_PROMPT}
${PASSAGE_QUALITY_STANDARDS}

【閱讀理解題特別要求】
- readingContent: 完整的英文閱讀篇章。必須用 [Paragraph 1] [Paragraph 2] 等標記明確分隔每個段落。嚴禁使用 [line N] 或 [N] 行號標記。
- 所有題目必須基於此閱讀篇章，答案必須能在文中找到
- 篇章類型：根據 DSE 12+ 文本類型庫選擇（feature article, newspaper article, interview, blog post, etc.）
- 提供 readingContentZh 繁體中文輔助說明
- 題目必須混合多種題型，模仿真實 DSE Paper 1 格式
- 每題必須標註 marks (1-6)。使用 targetPhrase 標記目標詞彙。每個問題必須在題目中明確註明段落號（如 \"in paragraph 3\"）。代名詞（it/this/they）必須標明段落。不要寫 (line N) — 行號由前端渲染時自動顯示
- 使用真實 DSE 出題句式（參考 Question Wording Templates）

【期望 JSON schema — 完整題型支援 v2】
{
  "readingContent": "[Paragraph 1] Full English passage text here...\n\n[Paragraph 2] Next paragraph text...",
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
// Lite Prompt Builder — condensed for quick generation (legacy path)
// Avoids the heavy SKILL_BOUNDARY, SUMMARY_CLOZE, and full BLUEPRINT
// prompts to keep generation fast on Vercel's 60s function limit.
// ============================================
export function buildReadingSectionPromptLite(): string {
  return `${HALLUCINATION_GUARD_LITE}

## CRITICAL: You are generating a DSE Paper 1 reading exercise.

### ⚠️ Passage Requirements (MUST FOLLOW):
- Generate a reading passage of EXACTLY 500-800 words with 3-5 paragraphs
- Start each paragraph with [Paragraph N] marker (e.g., [Paragraph 1])
- Do NOT use [line N] markers — the system adds those automatically
- Use a realistic DSE text type: feature article, newspaper article, blog post, interview, etc.
- Include 3-5 vocabulary hints with Chinese meanings
- The passage must feel authentic, not AI-generated
- Vary topics — avoid overused clichés (sports day, cinema schedule, bee conservation)

### ⛔ PARAGRAPH DISTRIBUTION (MANDATORY — VIOLATION = REJECTION)

You MUST follow this EXACT distribution based on your paragraph count:

| Paragraphs | Questions | REQUIRED Distribution |
|------------|-----------|----------------------|
| 3 paragraphs | 10 questions | P1:3, P2:4, P3:3 |
| 4 paragraphs | 10 questions | P1:2-3, P2:2-3, P3:2-3, P4:2-3 |
| 5 paragraphs | 10 questions | P1:2, P2:2, P3:2, P4:2, P5:2 |

ABSOLUTE RULES (zero tolerance):
- 🚫 NO paragraph shall have 0 questions — EVERY paragraph MUST be tested
- 🚫 NO paragraph shall have more than 3 questions
- 🚫 Difference between the paragraph with most questions and the paragraph with fewest questions MUST be ≤ 1

╔══════════════════════════════════════════════════════════════╗
║  MANDATORY SELF-CHECK (do BEFORE outputting JSON):          ║
║                                                              ║
║  ACCEPTABLE distributions by paragraph count:                ║
║    4 paragraphs: [3,2,3,2] [2,3,2,3] [3,3,2,2] [2,2,3,3]   ║
║                  [2,3,3,2]. ANY other pattern is WRONG.     ║
║    5 paragraphs: ONLY [2,2,2,2,2] is acceptable.            ║
║                  ANY other pattern is WRONG.                ║
║                                                              ║
║  Fill in YOUR actual counts below:                           ║
║    Paragraph 1 has ___ questions (must be 2 or 3)            ║
║    Paragraph 2 has ___ questions (must be 2 or 3)            ║
║    Paragraph 3 has ___ questions (must be 2 or 3)            ║
║    Paragraph 4 has ___ questions (must be 2 or 3)            ║
║    Paragraph 5 has ___ questions (must be 2 if exists)       ║
║    TOTAL: ___ (must be exactly 10)                           ║
║                                                              ║
║  Verify ALL boxes before output:                             ║
║    ☐ Every paragraph has 2 or 3 questions?                   ║
║    ☐ NO paragraph has 0, 1, or 4+ questions?                 ║
║    ☐ Total sums to exactly 10?                               ║
║    ☐ Max count − Min count ≤ 1?                              ║
║    ☐ [5-paragraph] ALL questions reference a paragraph?      ║
║      (No "passage as a whole" — it leaves P5 untested!)      ║
║    ☐ EVERY referencing Q: quoted word appears in cited para? ║
║      (e.g., Q: "paragraph 1" + "'they'" → "they" IS in P1?)  ║
║                                                              ║
║  ⛔ If ANY box is unchecked → DELETE and REDISTRIBUTE        ║
║     questions BEFORE outputting. This is NON-NEGOTIABLE.     ║
╚══════════════════════════════════════════════════════════════╝

### ⛔ PARAGRAPH REFERENCE ACCURACY (MANDATORY — VIOLATION = REJECTION)

Every question that references a paragraph MUST have its answer VERIFIABLY located in that exact paragraph.

ABSOLUTE RULES:
- If a question says "According to paragraph 2", the answer MUST be found in paragraph 2 — NOT in paragraph 1, 3, or any other paragraph.
- If the answer spans multiple paragraphs, use "Based on the passage" or "According to paragraphs 1-2" instead of citing a single paragraph.
- Questions about the whole passage must say "According to the passage" or "In the passage as a whole" — NOT cite a specific paragraph.
- ⛔ EXCEPTION for [2,2,2,2,2] (5 paragraphs): ALL 10 questions MUST reference a specific paragraph. "Passage as a whole" is FORBIDDEN because it leaves one paragraph untested. For toneAttitude, reference the LAST paragraph: "According to paragraph 5, what is the author's attitude...". For summaryCloze in 5-paragraph mode, use "Complete the following summary of paragraphs 1-5".
- ⛔ REFERENCING questions: The word/phrase being referenced (e.g., 'they', 'it', 'this', 'such tools') MUST physically appear in the paragraph cited. For example, if Q3 asks "In paragraph 1, what does 'they' refer to?", the word 'they' MUST be present in paragraph 1 — DO NOT cite paragraph 1 if 'they' only appears in paragraph 2. ALWAYS check: does the quoted word actually exist in the cited paragraph?

╔══════════════════════════════════════════════════════════════╗
║  PARAGRAPH VERIFICATION (for EACH question):               ║
║                                                              ║
║  Q___ says "paragraph ___"                                   ║
║    → The answer appears in paragraph ___.                    ║
║    → Do these match? ☐                                       ║
║                                                              ║
║  Repeat for EVERY question. If ANY mismatch → FIX the       ║
║  question's paragraph reference BEFORE outputting JSON.      ║
╚══════════════════════════════════════════════════════════════╝

### ⚠️ Question Requirements (MUST FOLLOW):
- Mix at least 4 different question types: mcq, trueFalseNG, referencing, vocabularyInContext, inference, toneAttitude, shortAnswer, summaryCloze, mcCloze
- For summaryCloze: the summary ALWAYS covers multiple paragraphs or the whole passage. Use "Complete the following summary of the passage" or "Complete the following summary of paragraphs X-Y" — NEVER cite a single paragraph like "paragraph 1" for a summaryCloze question.
- Every question must use EXACT DSE wording with paragraph reference
- Every question must include marks (1-4) and word limits
- For mcq: include 4 plausible distractors labeled A/B/C/D
- For toneAttitude: ⛔ MUST include 4 choices labeled A/B/C/D in the "choices" array. Use nuanced labels (skeptical, cautiously optimistic, subtly critical, reservedly hopeful, mildly apprehensive — NEVER just "positive" or "negative"). toneAttitude is ALWAYS an MCQ — never an open-ended question.
- For trueFalseNG: use exactly "True (T), False (F) or Not Given (NG)" format
- For referencing: "Who or what does 'X' refer to?"
- For vocabulary: "What does 'X' mean as used in the passage?" or "Find a word/phrase that means 'Y'"
- For inference: "Based on paragraph X, explain why..." (30-50 words)
- Include answer explanations in both English and Chinese

### ⚠️ Skill Mix (MUST FOLLOW):
- Factual/literal: ≤55% of questions
- At least 1 reference question (pronoun referent)
- At least 1 vocabulary-in-context question
- At least 1 inference question
- At least 1 higher-order question (tone/attitude, whole-text, or cross-paragraph)
- No question should test the same skill as another without clear differentiation

### Return this JSON format:
{
  "readingContent": "[Paragraph 1] ...\n\n[Paragraph 2] ...",
  "readingContentZh": "繁體中文輔助說明",
  "textType": "feature_article",
  "source": "adapted from ...",
  "vocabularyHints": [{"word": "...", "meaningZh": "..."}],
  "questions": [
    {
      "index": 1,
      "type": "mcq",
      "targetPhrase": "key phrase from passage",
      "questionText": "DSE-style question with paragraph reference",
      "questionTextZh": "中文翻譯",
      "marks": 1,
      "wordLimit": "ONE word",
      "choices": ["A. ...", "B. ...", "C. ...", "D. ..."],
      "answer": "A",
      "acceptAlso": [],
      "explanationZh": "中文解釋",
      "explanationEn": "English explanation"
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

${QUESTION_BLUEPRINT_PROMPT}

${SUMMARY_CLOZE_SOPHISTICATION_PROMPT}

${SKILL_BOUNDARY_PROMPT}

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

${QUESTION_BLUEPRINT_PROMPT}

${SUMMARY_CLOZE_SOPHISTICATION_PROMPT}

${SKILL_BOUNDARY_PROMPT}

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
- CRITICAL: Distribute questions evenly across ALL paragraphs. With ${count} questions and the passage paragraphs, assign roughly 1 question per paragraph. Do NOT cluster multiple questions in the same paragraph while leaving others empty.
- Every question must use EXACT DSE wording
- Every question must include marks (1-4) and word limits where applicable
- Pronoun references (it/this/they/its) MUST specify the paragraph number in the question text
- Use targetPhrase field to mark key vocabulary — do NOT write (line N) in question text

Return JSON array of questions with embedded readingContent.`;
}
