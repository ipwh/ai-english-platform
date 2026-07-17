// ============================================
// Question Generation Prompt
// Extracted from ai-service.ts → generateQuestions()
// ============================================
//
// Generates the system prompt for DSE practice question generation.
// This is the largest prompt in the codebase (~300+ lines).
//
// Parameters are all the dynamic values from generateQuestions():
//   - dseTopics: string of DSE empirical topics
//   - count: number of questions
//   - skillDesc: skill description in Chinese
//   - difficultyLabel: difficulty label in Chinese
//   - gradeLevel: 'S1'-'S6'
//   - typeDesc: question type description
//   - topic: forced diverse topic
//   - userTopic: optional topic from input
//   - isListening: whether this is a listening skill
//   - isReading: whether this is a reading skill
//   - strictAnswerRules: the STRICT_ANSWER_RULES constant
//   - dseContextPrompt: DSE RAG context (appended at call site)
//
// Usage:
//   import { buildQuestionGenerationPrompt } from './question-generation';
//   const systemPrompt = buildQuestionGenerationPrompt({ ...params });
//   const finalPrompt = systemPrompt + dseContextPrompt;
// ============================================

export interface QuestionGenPromptParams {
  count: number;
  skillDesc: string;
  difficultyLabel: string;
  gradeLevel: string;
  typeDesc: string;
  topic: string;
  userTopic?: string;
  isListening: boolean;
  isReading: boolean;
  strictAnswerRules: string;
  /** DSE empirical topics reference text */
  dseTopics: string;
}

export function buildQuestionGenerationPrompt(params: QuestionGenPromptParams): string {
  const {
    count, skillDesc, difficultyLabel, gradeLevel, typeDesc, topic,
    userTopic, isListening, isReading, strictAnswerRules, dseTopics,
  } = params;

  return `你是一位香港中學英文科教師，熟悉 ELE KLACG 2017 課程指引及 HKDSE English Language Level Descriptors。
請根據以下要求生成英語練習題目，題目必須對齊 HKDSE 各卷別（Reading / Writing / Listening / Speaking）的能力要求。
請以純 JSON 陣列格式回覆（不要用 Markdown 代碼塊包裝）。

═══════════════════════════════════════
DSE EMPIRICAL TOPIC DATABASE — MANDATORY REFERENCE
═══════════════════════════════════════
⚠️ CRITICAL: Strictly base your topics on real DSE past papers (2012-2024).
${dseTopics}

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

每題必須包含以下欄位（全部為必填）：
- type: "mc" / "fill-blank" / "error-correction" / "short-writing"
- prompt: 英文題目問題
- promptZh: 中文輔助說明
${isListening ? '- listeningContent / listeningContentZh\n' : ''}${isReading ? '- readingContent / readingContentZh\n' : ''}- choices: MC題4個選項；其他題型 []
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
