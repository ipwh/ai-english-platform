// Sprint 5: Reading Prompts v1 — v4.2 enhanced with full DSE Paper 1 support
// HKDSE Paper 1 Reading comprehension prompts
import { HALLUCINATION_GUARD } from '@/modules/ai/services/hallucination-guard';
export const version = '1.2.0';
export const description = 'HKDSE Reading prompts: reading passage generation and comprehension question prompts (MCQ, T/F/NG, matching, summary cloze, referencing, inference, tone)';
export const updatedAt = '2026-07-20';
export const author = 'AI English Platform';

const DSE_PAPER1_QUESTION_TYPES = `
## DSE Paper 1 全題型支援

支援以下題型（對應真實 HKDSE Paper 1 格式）：
1. **MCQ** — 四選一，含 inferencing 及 vocabulary-in-context
2. **True/False/Not Given** — 判斷陳述是否與篇章一致
3. **Matching** — 配對段落標題 (matching headings) / 人物觀點配對
4. **Summary Cloze** — 根據篇章填寫摘要空格 (word bank provided)
5. **Short Answer** — 短答題 (限15字以內)
6. **Referencing** — "What does 'it/this/they' refer to in line X?"
7. **Open-ended Inference** — 推論題 (30-50字，3-4分題)
8. **Tone/Attitude/Purpose** — 判斷作者語氣/態度/寫作目的
9. **Sequencing** — 按篇章順序排列事件
`;

export function buildReadingSectionPrompt(): string {
  return `${HALLUCINATION_GUARD}
${DSE_PAPER1_QUESTION_TYPES}
【閱讀理解題特別要求】
- readingContent: 完整的英文閱讀篇章（80-200字）
- 所有題目必須基於此閱讀篇章
- 篇章類型：S1-S3 故事/書信/海報；S4-S6 新聞/議論文/社論
- 提供 readingContentZh 繁體中文輔助說明
- 題目必須混合多種題型，模仿真實 DSE Paper 1 格式（Part A: 簡單題型；Part B1/B2: 進階題型）

【期望 JSON schema — 完整題型支援】
{
  "readingContent": "Full English passage (80-200 words)",
  "readingContentZh": "繁體中文輔助說明",
  "partLabel": "A|B1|B2",
  "questions": [
    {
      "type": "MCQ|trueFalseNG|matching|summaryCloze|shortAnswer|referencing|inference|toneAttitude|sequencing",
      "questionText": "Question in English",
      "questionTextZh": "繁體中文題目翻譯",
      "choices": ["A. ...", "B. ...", "C. ...", "D. ..."],
      "answer": "A",
      "explanationZh": "繁體中文解釋",
      "marks": 1-4,
      "lineReference": "line 5-8 (optional, for referencing questions)"
    }
  ]
}`;
}
