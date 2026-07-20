// Sprint 42: Speaking Prompts v1.2 — Enhanced with HKDSE Paper 4 rubrics + hallucination guard
// HKDSE Paper 4 Speaking prompts
import { HALLUCINATION_GUARD_LITE } from '@/modules/ai/services/hallucination-guard';
export const version = '1.2.0';
export const description = 'HKDSE Speaking prompts: group discussion and individual response prompts with full Paper 4 scoring rubrics';
export const updatedAt = '2026-07-20';
export const author = 'AI English Platform';

const PAPER4_RUBRICS = `
## HKDSE Paper 4 Speaking Assessment Criteria (Levels 1–5)

### 1. Pronunciation & Delivery (發音與表達)
- L5: Projects voice clearly; natural pace and rhythm; varied intonation to convey meaning
- L4: Clear pronunciation; mostly natural pace; some effective intonation
- L3: Generally clear; occasional hesitation; limited intonation range
- L2: Frequent pronunciation errors; unnatural pace; monotone
- L1: Unclear articulation; halting delivery; difficult to understand

### 2. Communication Strategies (溝通策略)
- L5: Initiates, maintains, and concludes discussion; responds appropriately; invites others; clarifies when needed
- L4: Contributes actively; responds to others; basic turn-taking
- L3: Some interaction; responds to direct questions; limited initiation
- L2: Minimal interaction; mostly passive; responds only when prompted
- L1: Little or no interaction; relies on others to carry the conversation

### 3. Vocabulary & Sentence Patterns (詞彙與句式)
- L5: Wide range of appropriate vocabulary; complex sentence structures; idiomatic expressions
- L4: Good range; mostly accurate; some complex structures
- L3: Adequate range for familiar topics; simple sentences dominate; occasional errors
- L2: Limited vocabulary; frequent errors; very basic sentence patterns
- L1: Very limited vocabulary; frequent errors impede communication

### 4. Ideas & Organization (意念與組織)
- L5: Well-developed ideas with clear reasoning; logical structure; effective examples
- L4: Clear ideas with supporting details; coherent organization
- L3: Simple ideas; basic organization; some supporting points
- L2: Underdeveloped ideas; disjointed; few supporting details
- L1: Few or no relevant ideas; incoherent
`;

export function buildSpeakingPrompt(topic: string, gradeLevel: string): string {
  return `你是一位香港 DSE English Paper 4 Speaking 考官，嚴格根據 HKDSE Level Descriptors 評分。

${PAPER4_RUBRICS}

${HALLUCINATION_GUARD_LITE}

請生成一個 HKDSE 格式的口語練習題目，並根據以上準則提供評分指導。

要求：
- 年級：${gradeLevel}
- 主題：${topic}
- 格式：Group Discussion (8 minutes) + Individual Response (1 minute)
- 提供 discussion topic、supporting points、vocabulary hints
- 使用英文生成口語內容，評語和解釋提供繁體中文翻譯
- 必須包含考官評分提示：針對上述 4 個評分維度（Pronunciation、Communication Strategies、Vocabulary、Ideas），各提供 2-3 個具體評分重點`;
}

export function buildSpeakingAnalysisPrompt(transcript: string, topic: string): string {
  return `你是一位香港 DSE English Paper 4 Speaking 考官，請根據以下準則分析學生的口語表現。

${PAPER4_RUBRICS}

學生 transcript：${transcript}
討論主題：${topic}

請提供：
1. 各維度評級 (L1-L5) 及簡短說明
2. 整體評級 (overall level)
3. 3 個具體改善建議
4. 1-2 個做得好的地方（正面回饋）
5. 建議的 follow-up 練習

格式：JSON
{
  "pronunciationAndDelivery": { "level": "L3", "score": 3, "comment": "..." },
  "communicationStrategies": { "level": "L4", "score": 4, "comment": "..." },
  "vocabularyAndSentencePatterns": { "level": "L2", "score": 2, "comment": "..." },
  "ideasAndOrganization": { "level": "L3", "score": 3, "comment": "..." },
  "overallLevel": "L3",
  "strengths": ["...", "..."],
  "improvements": ["...", "...", "..."],
  "followUpPractice": "..."
}`;
}
