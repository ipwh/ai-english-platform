// Sprint 5: Reading Prompts v1
// HKDSE Paper 1 Reading comprehension prompts
export const version = '1.0.0';
export const description = 'HKDSE Reading prompts: reading passage generation and comprehension question prompts';
export const updatedAt = '2026-07-18';
export const author = 'AI English Platform';

export function buildReadingSectionPrompt(): string {
  return `
【閱讀理解題特別要求】
- readingContent: 完整的英文閱讀篇章（80-200字）
- 所有題目必須基於此閱讀篇章
- 篇章類型：S1-S3 故事/書信/海報；S4-S6 新聞/議論文/社論
- 提供 readingContentZh 繁體中文輔助說明`;
}
