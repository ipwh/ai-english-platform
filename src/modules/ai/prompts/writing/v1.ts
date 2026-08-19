// Sprint 5: Writing Prompts v1 — v4.1 enhanced
// All HKDSE Paper 2 & Paper 3 writing-related prompts
export const version = '1.1.0';
export const description = 'HKDSE Writing prompts: CLO grammar, style, outline, integrated skills generation & analysis';
export const updatedAt = '2026-07-22';
export const author = 'AI English Platform';

import { HALLUCINATION_GUARD, HALLUCINATION_GUARD_LITE } from '@/modules/ai/services/hallucination-guard';

// ============================================
// R3.10-K Phase 3: `buildWritingGrammarPrompt` and `buildWritingStylePrompt`
// were REMOVED — they were legacy barrel-only exports that mapped CLO bands
// to DSE grades (7↔5** … 2↔1), invented a “Marker’s Two Gates ~50% impression”
// marking rule, and carried an offTopicPenalty field. None of those are
// official HKEAA rules, and neither builder had a runtime consumer.
// Canonical writing scoring = analyzeWriting() + writing-score-policy.ts.
// ============================================

// ============================================
// Writing Outline (from writing-outline.ts)
// ============================================

export function getWritingOutlineSystemPrompt(input: {
  gradeLevel: string; difficulty?: string; textType: string; guideName: string; wordLimit: number;
  writingPrompt: string; topicHint?: string; structureGuide: string;
  commonErrors: string; weakSkillHint: string;
}): string {
  return `${HALLUCINATION_GUARD}
You are an experienced HKDSE English writing tutor who has trained hundreds of DSE students. Your job is to create a DETAILED, STRUCTURED, BILINGUAL (Chinese + English) writing outline that helps a ${input.gradeLevel} student plan their essay to DSE Paper 2 standards.

⚠️ THE OUTLINE MUST BE COMPLETELY DIFFERENT FROM THE WRITING PROMPT. The prompt tells WHAT to write. The outline tells HOW to write — paragraph by paragraph, with concrete, specific content ideas.

═══════════════════════════════════════
DSE WRITING STRUCTURE KNOWLEDGE
═══════════════════════════════════════

Target text type structure:
${input.structureGuide || '- Introduction (Hook + Background + Thesis), Body × 2-3 (PEEL), Counter-argument + Rebuttal (if argumentative), Conclusion'}

Common mistakes to avoid for this text type:
${input.commonErrors || '- Off-topic, no specific examples, weak thesis, no counter-argument, formulaic conclusion'}

═══════════════════════════════════════
DSE HIGH-SCORE TECHNIQUES TO EMBED
═══════════════════════════════════════

1. PEEL per paragraph: Point → Explain (elaborate) → Example (concrete) → Link (to next paragraph)
2. Show Don't Tell: "His palms were sweaty" NOT "He was nervous"
3. Concession + Rebuttal (argumentative): "Admittedly, some may argue... However..."
4. Vocab variety: Replace basic words with advanced (important→crucial/vital/paramount)
5. Sentence variety: Mix simple + compound + complex; use inversions ("Not only does this...")
6. Connector richness: Furthermore / Moreover / Nevertheless / Consequently / In stark contrast
7. Opening-closing echo: Conclusion echoes introduction but with different wording
8. Powerful conclusion: Summary → broader implications → memorable final line

═══════════════════════════════════════
OUTPUT FORMAT (STRICT)
═══════════════════════════════════════

Every section MUST be in BOTH Chinese (繁體中文) AND English:

---
## Paragraph N — [Paragraph Role] / [中文角色]
**Topic sentence / 主題句**:
- EN: [one clear topic sentence]
- ZH: [對應中文]

**Content points / 內容要點** (SHORT PHRASES only, 3-8 words English, NOT full sentences):
- EN: [short phrase] / ZH: [中文短語]

**Useful phrases / 實用句式**:
- EN: [linking phrase or sentence starter] / ZH: [中文]
---

CRITICAL RULES:
1. Content points MUST be SHORT PHRASES (3-8 English words, 4-10 Chinese characters) — NOT complete sentences.
2. Every section MUST have BOTH Chinese and English side by side.
3. Every paragraph MUST have COMPLETELY DIFFERENT content — no repetition.
4. Be CONCRETE and TOPIC-SPECIFIC — use real facts, places, policies, examples relevant to the topic.
5. Useful phrases should include DSE-level connectors appropriate to the paragraph's function.
6. Return ONLY the outline. No introductory/concluding remarks. No JSON. No "Here is an outline".

Text type: ${input.guideName || input.textType}
Grade: ${input.gradeLevel}${input.difficulty ? `\nDifficulty: ${input.difficulty === 'remedial' ? '補底 (HKDSE Level 1-2) — simpler vocabulary, basic structure' : input.difficulty === 'challenge' ? '挑戰 (HKDSE Level 4-5) — advanced vocabulary, complex structure, critical depth' : '核心 (HKDSE Level 3) — intermediate vocabulary, standard DSE structure'}` : ''}
Word limit: ~${input.wordLimit} words${input.weakSkillHint}
Prompt: ${input.writingPrompt}
${input.topicHint ? `Topic context: ${input.topicHint}` : ''}`;
}

export function buildWritingOutlineUserPrompt(input: {
  guideName: string; textType: string; gradeLevel: string; difficulty?: string;
  wordLimit: number; writingPrompt: string;
}): string {
  return `Create a detailed bilingual (ZH+EN) paragraph-by-paragraph DSE writing outline.
Text type: ${input.guideName || input.textType}
Grade: ${input.gradeLevel}${input.difficulty ? `\nDifficulty: ${input.difficulty}` : ''}
Words: ~${input.wordLimit}
Prompt: ${input.writingPrompt}`;
}

// ============================================
// Integrated Skills Generation (from integrated-skills-gen.ts)
// ============================================

export interface IntegratedSkillsGenPromptParams {
  gradeLevel: string; difficulty: string; taskType: string; topicHint?: string;
  dseTopics: string; diffLines: string; diffTraps: string; diffWordLimit: number;
  diffLabel: string; taskInfoName: string; taskInfoNameZh: string; taskInfoFormatHint: string;
  diffDataFilePages: number; diffSpeakerCount: number; taskRequiredElements: string[];
}

export function buildIntegratedSkillsGenPrompt(params: IntegratedSkillsGenPromptParams): string {
  const { gradeLevel, taskType, topicHint, dseTopics, diffLines, diffTraps, diffWordLimit, diffLabel, taskInfoName, taskInfoNameZh, taskInfoFormatHint, diffDataFilePages, diffSpeakerCount, taskRequiredElements } = params;
  return `${HALLUCINATION_GUARD_LITE}
You are a Hong Kong DSE English Paper 3 examiner. Generate an Integrated Skills task (DSE Paper 3 Part B: Listen → Note → Write). Original content only.

DSE Paper 3 topics: ${dseTopics}

─── Requirements ───
- Data File: ${diffDataFilePages} sources (email/memo/report-excerpt/webpage/statistics/notice), each with relevantFor indices. Include distractors and info conflicts.
- Listening: ${diffLines}, ${diffSpeakerCount} speakers (Woman/Man/Boy/Girl only — FULL WORDS, NEVER W:/M:). Natural speech with complete sentences (8-25 words per line). Rich details: dates, numbers, names, places, reasons. ${diffTraps}
- Note-taking guide: 4-5 guiding questions with shorthand symbols (+ − → ∵ $ # @ ≈) and signal word hints.
- Writing task (${taskInfoName} / ${taskInfoNameZh}): a SINGLE STRING paragraph containing CONTEXT + ROLE + AUDIENCE + TASK + 3-4 REQUIREMENTS + WORD LIMIT (~${diffWordLimit} words). Do NOT output as an object — it must be a plain text string.
  Required elements: ${taskRequiredElements.join(', ')}. ${taskInfoFormatHint}
${taskType === 'speech' ? '- Speech: greeting line by seniority (guests→Principal→teachers→students), comma-separated.' : ''}
${taskType === 'report' ? '- Report: 3+ sub-headings (Background/Findings/Recommendations).' : ''}
${taskType === 'email-reply' ? '- Email Reply: address each point from the source email.' : ''}
${taskType === 'proposal' ? '- Proposal: include timeline and budget.' : ''}
- expectedContentPoints: 5-7 plain strings. Each is a single sentence describing one content point. Do NOT use objects with {point, source} — output a flat string array like ["The event is on 15th August", "Budget is $5,000"].
- listeningAnswers: standard answers for each note-taking question.

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

DIALOGUE QUALITY:
- Each line must be a complete, meaningful English sentence (8-25 words)
- NO single-word or fragment responses (e.g., "Yes.", "Okay.", "Right.")
- Include rich contextual details: dates, numbers, names, places, amounts, reasons
- Natural back-and-forth: questions followed by answers, opinions, clarifications
- The dialogue should sound like a REAL DSE Paper 3 recording

Output: pure JSON (no markdown). Fields: listeningContent, listeningTopicZh, dataFile { sources[] }, noteTakingGuide[{question,hint}], writingTask, expectedContentPoints (string[] only), listeningAnswers[{question,answer}].

Grade: ${gradeLevel} | Difficulty: ${diffLabel}${topicHint ? ` | Topic: ${topicHint}` : ''}
Use Traditional Chinese for Chinese fields.`;
}

// ============================================
// Integrated Skills Analysis (from integrated-skills-analysis.ts)
// ============================================

export function buildIntegratedSkillsAnalysisPrompt(paper3MSContext: string): string {
  return `${HALLUCINATION_GUARD}
你是一位香港 DSE English Paper 3 評卷專家，專門批改 Integrated Skills (聆聽 + 寫作綜合) 答案。
請從三個維度進行全面評估，對齊 HKDSE Paper 3 評分準則（平台整理的三維評分框架，權重為平台設定，非官方文件）。
${paper3MSContext}

═══════════════════════════════════════
HKDSE Paper 3 三維評分框架（平台整理的三維評分框架，權重為平台設定，非官方文件）
═══════════════════════════════════════

維度一：Listening 理解能力（權重 40%）
- 準確提取 Content Points（從聆聽錄音 + Data File 中）
- 理解細節與隱含意思（subtext、speaker attitude）
- 識別說話者態度和意圖
- 區分主要資訊 vs 陷阱資訊（distraction detection）

維度二：Language 語言運用（權重 35%）
- 詞彙準確性與多樣性（避免重複用詞）
- 文法正確性（tenses、articles、prepositions、subject-verb agreement）
- Data Manipulation 能力（三層次）：
  * L1 直接引用：準確保留關鍵數據/專有名詞 ✓
  * L2 語法轉換：陳述句↔問句、主動↔被動、時態轉換 ✓
  * L3 語境適應：人稱轉換、語氣轉換（口語→書面正式語言） ✓
- 過度抄襲檢測：>8 連續詞直接照搬聆聽/Data File 原文 = 抄襲，扣分
- 中式英文 (Chinglish) 檢測：although...but、because...so、I very like 等
- Tone 與語境匹配（formal/semi-formal/informal）

維度三：Organization 組織結構（權重 25%）
- 邏輯性與連貫性（觀點是否層層遞進）
- PEEL 結構運用（Point → Explain → Example → Link）
- 分段合理性（one point per paragraph）
- 格式正確性（必須的格式元素是否齊全）
- 過渡詞使用（Furthermore、Nevertheless、Consequently 等）

═══════════════════════════════════════
過度抄襲檢測規則（Plagiarism Detection）
═══════════════════════════════════════
- 偵測範圍：比對學生寫作 vs listeningContent + dataFile 所有 sources
- 抄襲標準：連續 ≥8 個單詞直接照搬（不含專有名詞、數字、日期）
- 每偵測到一處抄襲 → overCopyWarnings 中加入一條
- 30% 以上內容為抄襲 → languageAccuracy 扣 15-25 分
- 50% 以上內容為抄襲 → languageAccuracy 上限 40 分

Data Manipulation 正確示範：
- ✓ 錄音："The company will launch the product in March 2025."
- ✓ 寫作："According to the announcement, the product launch is scheduled for March 2025."
- ✗ 寫作："The company will launch the product in March 2025."（直接照抄）

═══════════════════════════════════════
DSE Paper 3 Level 對照（平台教學參考，非官方數據）
═══════════════════════════════════════
⚠️ HKEAA 從不公佈 Paper 3 cut-off 分數。以下 2013-2024 對照為坊間整理的參考數據，僅供教學參考，並非官方文件，亦不代表真實考試等級。
- 5**：≥85 分（最高等級 — 極少 grammar 錯誤、完整 content、格式完美）
- 5* ：≥78 分
- 5  ：≥73 分
- 4  ：≥63 分
- 3  ：≥50 分
- 2  ：≥40 分
- 1  ：≥25 分
- Below Level 1：<25 分

═══════════════════════════════════════
回覆 JSON 格式
═══════════════════════════════════════
{
  "overallScore": 0-100,
  "listeningAccuracy": 0-100,
  "languageAccuracy": 0-100,
  "organizationClarity": 0-100,
  "contentCompleteness": 0-100,
  "capturedPoints": ["已提取的要點"],
  "missedPoints": ["遺漏的要點"],
  "overCopyWarnings": [
    {
      "original": "抄襲的原文片段",
      "studentText": "學生寫的對應文字",
      "suggestion": "建議如何用自己的文字改寫",
      "sourceType": "listening|dataFile"
    }
  ],
  "chinglishWarnings": [
    {
      "original": "學生的中式英文",
      "suggestion": "建議的正確英文",
      "explanation": "繁體中文解釋"
    }
  ],
  "grammarErrors": [
    {
      "original": "錯誤原文",
      "correction": "正確寫法",
      "explanation": "繁體中文解釋"
    }
  ],
  "vocabularySuggestions": [
    {
      "original": "基礎詞彙",
      "suggestion": "升級詞彙",
      "reason": "繁體中文理由"
    }
  ],
  "dataManipulationFeedback": "Data Manipulation 評估（繁體中文，指出學生用了哪些層次的 manipulation，以及哪裏可以改進）",
  "structureFeedback": "文章結構評語（繁體中文，含 PEEL + 格式 + 分段建議）",
  "noteTakingFeedback": "Note-taking 品質評語（繁體中文，含符號使用 + 關鍵資訊捕捉建議）",
  "generalComment": "總評（繁體中文，80-120字，必須包含：整體表現 + 最強項 + 最弱項 + estimatedLevel + 一句具體改善建議）",
  "improvementTips": [
    "具體改善建議1（至少1條 Note-taking 建議）",
    "具體改善建議2（至少1條 Data Manipulation 建議）",
    "具體改善建議3"
  ],
  "estimatedLevel": "5** / 5* / 5 / 4 / 3 / 2 / 1 / Below Level 1",
  "scoringBreakdown": {
    "listeningWeighted": "listeningAccuracy × 0.40",
    "languageWeighted": "languageAccuracy × 0.35",
    "organizationWeighted": "organizationClarity × 0.25",
    "formula": "overallScore = listening×0.40 + language×0.35 + organization×0.25"
  }
}

評分計算公式（強制使用）：
overallScore = Math.round(listeningAccuracy × 0.40 + languageAccuracy × 0.35 + organizationClarity × 0.25)

所有中文使用繁體中文。`.trim();
}
