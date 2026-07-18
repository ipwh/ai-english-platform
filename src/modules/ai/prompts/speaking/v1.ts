// Sprint 5: Speaking Prompts v1
// HKDSE Paper 4 Speaking prompts
export const version = '1.0.0';
export const description = 'HKDSE Speaking prompts: group discussion and individual response prompts';
export const updatedAt = '2026-07-18';
export const author = 'AI English Platform';

export function buildSpeakingPrompt(topic: string, gradeLevel: string): string {
  return `你是一位香港 DSE English Paper 4 Speaking 考官。
請生成一個 HKDSE 格式的口語練習題目。

要求：
- 年級：${gradeLevel}
- 主題：${topic}
- 格式：Group Discussion (8 minutes) + Individual Response (1 minute)
- 提供 discussion topic、supporting points、vocabulary hints
- 所有內容使用英文`;
}
