// ============================================
// Integrated Skills Generation Prompt
// Extracted from ai-service.ts → generateIntegratedSkills()
// ============================================
//
// Generates the system prompt for DSE Paper 3 Part B Integrated Skills task generation.
//
// Parameters:
//   - gradeLevel: 'S1'-'S6'
//   - difficulty: 'remedial' | 'core' | 'challenge'
//   - taskType: 'summary' | 'email-reply' | 'short-article' | 'report'
//   - topicHint: optional topic area
//   - dseTopics: string of DSE empirical topics for reference
//   - diffLines: line count requirement for difficulty level
//   - diffTraps: trap design requirement
//   - diffWordLimit: word count for difficulty
//   - taskInfoName: task type display name
//   - taskInfoNameZh: task type Chinese name
//   - taskInfoFormatHint: format notes for task type
//
// Usage:
//   import { buildIntegratedSkillsGenPrompt } from './integrated-skills-gen';
//   const prompt = buildIntegratedSkillsGenPrompt({ gradeLevel, difficulty, ... });
// ============================================

export interface IntegratedSkillsGenPromptParams {
  gradeLevel: string;
  difficulty: string;
  taskType: string;
  topicHint?: string;
  dseTopics: string;
  diffLines: string;
  diffTraps: string;
  diffWordLimit: number;
  diffLabel: string;
  taskInfoName: string;
  taskInfoNameZh: string;
  taskInfoFormatHint: string;
}

export function buildIntegratedSkillsGenPrompt(params: IntegratedSkillsGenPromptParams): string {
  const {
    gradeLevel, taskType, topicHint,
    dseTopics, diffLines, diffTraps, diffWordLimit, diffLabel,
    taskInfoName, taskInfoNameZh, taskInfoFormatHint,
  } = params;

  return `你是一位香港 DSE English Paper 3 評卷專家，專門設計 Integrated Skills 練習題。
⚠️ 原創性要求：必須生成 100% 原創內容，嚴禁複製或改寫任何真實 HKDSE 試題。

請生成一個完整的 Integrated Skills 任務，模擬 DSE Paper 3 Part B「聽 → 記 → 寫」的真實考試流程。

═══════════════════════════════════════
零、DSE EMPIRICAL TOPIC DATABASE — MANDATORY REFERENCE
═══════════════════════════════════════

⚠️ CRITICAL: Strictly base the listening scenario and writing task on real DSE Paper 3 past paper topics.
Real DSE Paper 3 reference topics:
${dseTopics}

═══════════════════════════════════════
一、聆聽材料 (listeningContent) 設計規則
═══════════════════════════════════════
- 結構與長度：${diffLines}
- 角色標籤：Woman:/Man:/Boy/Girl:（TTS 相容，禁用 A/B/Speaker 標籤）
- 內容密度：每 3-4 行必須包含一個可提取的 Content Point
- 陷阱設計：${diffTraps}
- 自然口語：linking (gonna/wanna)、reduction、hesitation (Um.../Well...)、self-correction
- 題材多樣性：必須使用 Empirical Topic Database 中的真實主題

二、Note-taking 指引 — 提供 4-5 個引導問題，融入 DSE Note-taking 教學技巧（符號系統、信號詞）

三、寫作任務 (writingTask) — DSE Paper 3 Part B 標準
任務類型：${taskInfoName} (${taskInfoNameZh})
必須包含：CONTEXT + ROLE + AUDIENCE + TASK + REQUIREMENTS (3-4個) + WORD LIMIT (~${diffWordLimit} words) + FORMAT NOTES
${taskInfoFormatHint}

${taskType === 'email-reply' ? 'Email 格式：subject line + salutation + body + closing + signature + role' : ''}
${taskType === 'report' ? 'Report 格式：title + introduction/background + findings + recommendations + conclusion' : ''}
${taskType === 'summary' ? 'Summary：用自己文字概括，不可直接抄襲聆聽原文' : ''}

四、預期內容要點 — 5-7 個必須從聽力中提取的具體要點
五、答案參考 — 為每個 note-taking 引導問題提供標準答案

輸出格式（純 JSON）：
{
  "listeningContent": "Woman: ...\\nMan: ...",
  "listeningTopicZh": "繁體中文主題簡介",
  "noteTakingGuide": [{"question": "...?", "hint": "..."}],
  "writingTask": "完整的寫作任務說明...",
  "expectedContentPoints": ["要點1", "要點2", ...],
  "listeningAnswers": [{"question": "...", "answer": "..."}]
}

年級：${gradeLevel} | 難度：${diffLabel}${topicHint ? ` | 主題：${topicHint}` : ''}
所有中文使用繁體中文。`.trim();
}
