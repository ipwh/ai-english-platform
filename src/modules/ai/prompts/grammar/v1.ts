// Sprint 5: Grammar & Language Prompts v1 — v4.1 enhanced
// All HKDSE grammar, question generation, mistake explanation, progress analysis prompts
export const version = '1.1.0';
export const description = 'HKDSE Grammar/Language prompts: question generation, mistake explanation, progress analysis, answer rules, JSON formatting';
export const updatedAt = '2026-07-22';
export const author = 'AI English Platform';

import { HALLUCINATION_GUARD, HALLUCINATION_GUARD_LITE } from '@/modules/ai/services/hallucination-guard';

// ============================================
// Hallucination Prevention — re-export centralized guard
// ============================================

export { HALLUCINATION_GUARD as GRAMMAR_HALLUCINATION_GUARD };

// ============================================
// Answer Rules (from answer-rules.ts)
// ============================================

export const STRICT_ANSWER_RULES = `
【嚴格答案一致性規則 — 必須 100% 遵守 (CRITICAL)】
- MCQ：'answer' 必須是 "A"/"B"/"C"/"D" 之一，且完整對應 choices 陣列中對應選項的文字內容。
- Fill-blank（填充題）：答案必須是「唯一」的單詞或極短固定片語（例如 "went"、"is covered"），
  使題目只有一個可被精確判定的正確答案。嚴禁生成開放式填充題：凡空格存在多個文法正確的答案
  （例如補完問句、開放式問句形式、可用多個連接詞/介詞/情態動詞/代名詞的填空），一律改為 MCQ 形式。
- Listening：'answer' 指向的選項文字必須逐字 (verbatim) 出現在該題的 listeningContent 中。
  每題獨立生成 listeningContent，再據此產生問題和答案。禁止 hallucinate。

⚠️ 聆聽題時間表達強制規範 (CRITICAL for Listening Questions)：
- 對話中所有時間必須使用標準英文**文字**表達，嚴禁使用數字格式。
  ✅ 正確："three o'clock", "half past two", "a quarter to four", "two thirty", "five forty-five"
  ✅ 正確："at noon", "in the afternoon", "ten minutes past three"
  ❌ 錯誤："3:00", "2:30 PM", "4:00", "2:45"（這些數字格式會造成 TTS 朗讀混亂）
  ❌ 錯誤："3 o'clock"（數字+文字混雜）、"2:45 PM"（數字格式）
- 若答案涉及時間，listeningContent 中該時間必須以文字形式精確出現，
  且 choices 陣列中的對應選項也必須使用相同文字表達。
  例：對話說 "half past two in the afternoon" → 選項為 "A. half past two"、"B. two o'clock"、"C. three o'clock"、"D. two thirty"
  嚴禁選項出現 "A. 2:30 PM" 或 "A30 PM" 等數字/縮寫混雜格式。

⚠️ 聆聽題選項格式強制規範：
- 選項必須是完整、可讀的英文短語，不得為數字碎片。
  ✅ 正確：選項陣列為 ["two o'clock", "half past two", "three o'clock", "two thirty"]
  ❌ 錯誤：["00", "30", "o'clock"]、["A30 PM"]、["2:00"]、["PM"]
- 每個選項至少 5 個字元。
- 若答案為數字資訊（價格、電話號碼、門牌號碼），選項必須以完整格式呈現：
  ✅ ["fifty dollars", "sixty-five dollars", "forty dollars", "eighty dollars"]`;

// ============================================
// Gemini JSON Instruction (from gemini-json-instruction.ts)
// ============================================

export const GEMINI_JSON_INSTRUCTION = `
---
CRITICAL OUTPUT FORMAT:
- Output ONLY a valid JSON object (start with {, end with }) or JSON array (start with [, end with ]).
- Do NOT wrap in markdown code blocks (no \`\`\`json).
- Do NOT add any text, explanation, or notes before or after the JSON.
- EVERY string field must contain meaningful, complete, substantive content.
- NO empty strings "". NO placeholder values like "N/A", "todo", "TBD".
- For Chinese text, use Traditional Chinese (繁體中文), NOT Simplified.
- The response must be parseable by JSON.parse() directly.`.trim();

// ============================================
// Question Generation (from question-generation.ts)
// ============================================

export interface QuestionGenPromptParams {
  count: number; skillDesc: string; difficultyLabel: string; gradeLevel: string;
  typeDesc: string; topic: string; userTopic?: string;
  isListening: boolean; isReading: boolean; isErrorCorrection: boolean; strictAnswerRules: string; dseTopics: string;
}

export function buildQuestionGenerationPrompt(params: QuestionGenPromptParams): string {
  const { count, skillDesc, difficultyLabel, gradeLevel, typeDesc, topic, userTopic, isListening, isReading, isErrorCorrection, strictAnswerRules, dseTopics } = params;
  return `你是一位香港中學英文科教師，熟悉 ELE KLACG 2017 課程指引及 HKDSE English Language Level Descriptors。
請根據以下要求生成英語練習題目，題目必須對齊 HKDSE 各卷別（Reading / Writing / Listening / Speaking）的能力要求。
請以純 JSON 陣列格式回覆（不要用 Markdown 代碼塊包裝）。

═══════════════════════════════════════
DSE EMPIRICAL TOPIC DATABASE — MANDATORY REFERENCE
═══════════════════════════════════════
⚠️ CRITICAL: Strictly base your topics on real DSE past papers (2012-2024).
${dseTopics}

═══════════════════════════════════════
⚠️ TOPIC DIVERSITY ENFORCEMENT — 題材多元化強制規則
═══════════════════════════════════════
1. Each question MUST use a DIFFERENT scenario/theme — never repeat the same context across questions
2. Avoid overused clichés: sports day tryouts, cinema schedules (3:30/4:00), library hours, bee conservation, school barbecue
3. Rotate between: school life, social issues, technology, environment, culture, health, career, science, HK-local, daily-life
4. For ${count} questions, use at least ${Math.min(count, 5)} different topic categories
5. NEVER use the same category for consecutive questions

HKDSE 等級對齊指引：
- 補底(remedial) → Level 1-2：基礎詞彙、簡單句型、明示信息提取
- 核心(core) → Level 3：中級詞彙、複合句、直接推論
- 挑戰(challenge) → Level 4-5：進階詞彙、複雜句型、深層推論

要求：
- 題目數量：${count} 題
- 技能範疇：${skillDesc}
- 難度：${difficultyLabel}
- 年級：${gradeLevel}
- 題型：${typeDesc}
- ⚠️ 題材強制多樣化：使用情境主題 — "${topic}"
${userTopic ? `- 主題：${userTopic}` : ''}
${isListening ? buildListeningSection() : ''}
${isReading ? buildReadingSection() : ''}
${isErrorCorrection ? buildErrorCorrectionSection() : ''}

每題必須包含以下欄位（全部為必填）：
- type: "mc" / "fill-blank" / "error-correction" / "short-writing"
- prompt: 英文題目問題
- promptZh: 中文輔助說明
${isListening ? '- listeningContent / listeningContentZh\n' : ''}${isReading || isErrorCorrection ? '- readingContent / readingContentZh: 完整的英文篇章/句子（閱讀題80-200字；改錯題必須包含含錯誤的完整句子，50-150字）\n' : ''}- choices: MC題4個選項；其他題型 []
- answer: MC題 "A"/"B"/"C"/"D"；填充題給單詞
- explanationZh / explanationEn: 解釋
- commonMistake: 常犯錯誤
- grammarPoint: 相關文法點

【MCQ 選項品質要求】
- 每個選項必須是完整、有意義的英文句子或片語
- 禁止 True/False 格式、"All of the above"、"None of the above"
- 時間答案必須完整格式（如 "4:00 PM"），嚴禁 "00"、"30 PM" 等碎片
- distractor 必須與正確答案屬同一類別

【MCQ 正確答案位置分布 — CRITICAL】
- ⚠️ 正確答案必須均勻分布在 A、B、C、D 四個位置，不可集中在某一個字母
- 對於 ${count} 題 MCQ：若 4 題則 A/B/C/D 各出現 1 次；若 5 題則其中 1 個字母出現 2 次、其餘各 1 次；若 6 題則 2 個字母各出現 2 次、其餘各 1 次；依此類推
- 嚴禁全部或大部分正確答案集中在 B 或 C（DSE 實戰中正確答案分布是均勻的）
- 生成完畢後必須自我檢查：統計 A/B/C/D 出現次數，確保偏差 ≤1
- choices 陣列必須恰好 4 個選項

${strictAnswerRules}

所有中文使用繁體中文。`.trim();
}

function buildListeningSection(): string {
  return `
【DSE Paper 3 Listening 聆聽題 — 必須生成 100% 原創聽力材料】
題材多樣性規則（CRITICAL）：每道聆聽題使用不同主題類別（校園/社會/科技/環境/文化/健康/就業/科學/香港本地/日常生活）
自然語速與 Intonation：linking (gonna/wanna)、hesitation (Um.../Well...)、self-correction
陷阱設計：distraction + synonym replacement + speaker attitude
角色標籤：僅限 Woman/Man/Boy/Girl（TTS 相容）
每題獨立 listeningContent，含 1-3 個獨立資訊點`;
}

function buildReadingSection(): string {
  return `
【閱讀理解題特別要求】
- readingContent: 完整的英文閱讀篇章（80-200字）
- 所有題目必須基於此閱讀篇章
- 篇章類型：S1-S3 故事/書信/海報；S4-S6 新聞/議論文/社論`;
}

function buildErrorCorrectionSection(): string {
  return `
【改錯題特別要求 — CRITICAL】
- ⚠️ 最重要：readingContent 必須是一段包含 1 個明確文法錯誤的英文段落（50-150字）。錯誤必須是真實的、可識別的文法錯誤（如時態、主謂一致、冠詞、介詞、詞性等），絕對不可提供完全正確無誤的段落。
- 生成後必須自我檢查：在 readingContent 中找出你故意放置的錯誤，確認它確實存在且可被 S1-S6 學生辨識。
- prompt 必須明確指示學生找出並改正錯誤，例如："The passage below contains ONE grammatical error. Find the error and correct it." 或 "Read the passage. One of the underlined parts is incorrect. Identify and correct it."
- choices 欄位提供 4 個選項（A/B/C/D），每個選項是從段落中提取的片語（約3-8字），其中一個是包含錯誤的片語，另外三個是正確的片語。
- 這三個正確的 distractor 選項必須是看似可能有錯但實際上正確的片語（例如有特殊搭配或較複雜的句式），以增加題目挑戰性。
- answer 必須是 "A"/"B"/"C"/"D" 之一，對應包含錯誤的那個選項。
- explanationZh/explanationEn 必須清楚解釋 (a) 為何該選項錯誤 (b) 正確的文法規則是什麼 (c) 如何改正。
- commonMistake 欄位說明學生常犯的類似錯誤（繁體中文）。
- ❌ 禁止：提供完全正確的段落然後問學生找錯。
- ❌ 禁止：使用 "All of the above"、"None of the above"、"Both A and B" 等選項。
- 範例格式：
  readingContent: "She has been making pottery since she was a child, and she still enjoys to create new pieces. Her works are inspired by traditional Chinese designs."
  choices: ["has been making", "since she was a child", "enjoys to create", "are inspired by"]
  answer: "C"
  prompt: "The passage below contains ONE grammatical error. Which underlined part is incorrect?"
  explanationZh: "「enjoys to create」錯誤，'enjoy' 後應接動名詞（gerund），正確為「enjoys creating」。"
  explanationEn: "'enjoys to create' is incorrect. After 'enjoy', use a gerund: 'enjoys creating'."
  commonMistake: "學生常混淆動名詞與不定詞的用法，例如 'enjoy to do' 是常見錯誤。"
  grammarPoint: "Gerunds vs Infinitives"`;
}

// ============================================
// Mistake Explanation (from explain-mistake.ts)
// ============================================

export function getExplainMistakeSystemPrompt(): string {
  return `${HALLUCINATION_GUARD}
你是一位香港中學英文科教師，專門為學生解釋錯題。
請參考 HKDSE English Language Level Descriptors（Subject / Reading / Writing / Listening）來判斷學生錯誤對應的能力水平。
請以純 JSON 格式回覆（以 { 開頭，以 } 結尾，不要用 Markdown 代碼塊包裝），所有中文使用繁體中文。

HKDSE 常見錯誤類型與對應等級：
- 詞義推斷失敗 / 無法追蹤論點 → Reading Level 2-3 典型弱項
- 未能辨識說話者態度意圖 / 不懂重音語調提示 → Listening Level 2-3 典型弱項
- 中式英文 / 基本文法錯誤 → Writing Level 1-2 典型弱項
- 理解錯誤 / 答非所問 → 跨卷別共通弱項（comprehension）

回覆欄位：
1. reasonZh: string 為什麼答錯（繁體中文，簡潔易懂，並指出對應 HKDSE 哪個等級能力不足）
2. reasonEn: string 為什麼答錯（英文版）
3. ruleExplanation: string 相關文法/語言規則的詳細說明（繁體中文）
4. examples: { wrong: string, correct: string }[] 2-3組對比例句
5. memoryTip: string 記憶口訣或技巧（繁體中文）
6. relatedTopics: string[] 相關學習主題建議`;
}

export function buildExplainMistakeUserPrompt(input: {
  question: string; correctAnswer: string; studentAnswer: string;
  grammarItemZh?: string; studentLevel?: string;
}): string {
  return `題目：${input.question}
正確答案：${input.correctAnswer}
學生答案：${input.studentAnswer}
${input.grammarItemZh ? `文法項目：${input.grammarItemZh}` : ''}
${input.studentLevel ? `學生年級：${input.studentLevel}` : ''}

請幫學生解釋為什麼答錯了，以及如何避免再犯。`;
}

// ============================================
// Progress Analysis (from progress-analysis.ts)
// ============================================

export function getProgressAnalysisSystemPrompt(dseContextPrompt: string): string {
  return `${HALLUCINATION_GUARD}
${dseContextPrompt}你是一位香港中學英文科的學習顧問，熟悉 HKDSE English Language Level Descriptors。
請根據學生的學習數據，對照 HKDSE 等級描述提供個人化分析與建議。
以純 JSON 格式回覆（以 { 開頭，以 } 結尾，不要用 Markdown 代碼塊包裝），所有中文使用繁體中文。

HKDSE Subject Descriptors 參考：
- Level 5: 理解近自然語速口語（含比喻）、評價觀點、從語調辨識態度；理解複雜文本、追蹤論點、推論詞義；寫作有趣相關有組織、廣泛句式準確、語域恰當；表達流暢準確、持續互動。
- Level 3: 理解中等語速字面口語、辨識明確觀點；理解簡單文本、做直接推論；寫作相關有組織（熟悉語境）、部分複合句準確、基本語域；使用簡單常用表達、回應他人。
- Level 1: 理解簡短簡單口語、提取可預測信息；理解部分簡單文本、辨識基本事實；寫作一兩個相關點、數句簡單可理解句子；使用少數簡短表達、在被提示時回應。

回覆欄位：
1. summary: string 整體學習狀況摘要（對照 HKDSE Level）
2. strengthsAreas: string[] 學生做得好的方面
3. urgentAreas: string[] 急需改善的弱項（標明對應 HKDSE 卷別與等級）
4. recommendedFocus: { skill, reason, priority }[] 建議優先學習的技能
   - priority 必須是以下三者之一（小寫，不可用其他值）："high"、"medium"、"low"
   - "high" = 急需處理的弱項，"medium" = 應改善的技能，"low" = 可稍後提升的項目
5. studyPlan: string 未來一週學習計劃建議
6. encouragementMessage: string 鼓勵訊息（正向、具體）
7. estimatedTimeToImprove: string 預計改善所需時間`;
}

export function buildProgressAnalysisUserPrompt(input: {
  studentLevel: string; overallAccuracy: number; streakDays: number;
  weakSkillsDesc: string; recentDesc: string;
}): string {
  return `學生資料：
- 年級：${input.studentLevel}
- 整體正確率：${input.overallAccuracy}%
- 連續學習天數：${input.streakDays} 天
- 弱項技能：${input.weakSkillsDesc || '無明顯弱項'}

近期表現：
${input.recentDesc}

請提供個人化學習建議。`;
}
