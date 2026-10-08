// ============================================
// Prompt Registry — centralized prompt discovery & versioning
//
// Registers prompt metadata (name, version, description, builder function)
// for all prompts used via executeAI(). Enables future A/B testing,
// prompt versioning, and prompt analytics without changing use cases.
//
// Prompt names here MUST match ExecutionContext.promptName in use cases.
// ============================================

import {
  buildExplainMistakeUserPrompt,
  buildProgressAnalysisUserPrompt,
} from './grammar/v1';
import { buildAnswerVerificationUserPrompt } from './grammar/answer-verification';

// ============================================
// Types
// ============================================

export interface PromptDefinition {
  /** Unique prompt name — matches ExecutionContext.promptName */
  name: string;
  /** Semantic version (e.g. "v1", "v2") — matches ExecutionContext.promptVersion */
  version: string;
  /** Human-readable description of what this prompt does */
  description: string;
  /** Builder function (optional — inline prompts have no standalone builder) */
  build?: (...args: any[]) => string;
  /** Feature area */
  feature: string;
}

// ============================================
// Registry
// ============================================

const registry = new Map<string, PromptDefinition>();

// ============================================
// Public API
// ============================================

/**
 * Register a prompt definition. Idempotent — re-registering with the same
 * name overwrites the previous entry (useful for version bumps).
 */
export function registerPrompt(def: PromptDefinition): void {
  registry.set(def.name, def);
}

/**
 * Get a prompt definition by name. Returns undefined if not registered.
 */
export function getPrompt(name: string): PromptDefinition | undefined {
  return registry.get(name);
}

/**
 * List all registered prompts.
 */
export function listPrompts(): PromptDefinition[] {
  return Array.from(registry.values());
}

// ============================================
// Initial Registration — prompts used by executeAI()
// ============================================

// 1. MaterialAnalysis — inline prompt in analyze-material.ts
registerPrompt({
  name: 'MaterialAnalysis',
  version: 'v1',
  description: 'Analyze teaching material content (summary, vocabulary, grammar, questions, difficulty)',
  feature: 'Reading',
});

// 2. ProgressAnalysis — builders in grammar/v1.ts
registerPrompt({
  name: 'ProgressAnalysis',
  version: 'v1',
  description: 'Analyze student learning progress against HKDSE Level Descriptors',
  feature: 'Learning',
  build: buildProgressAnalysisUserPrompt,
});

// 3. MistakeExplanation — builders in grammar/v1.ts
registerPrompt({
  name: 'MistakeExplanation',
  version: 'v1',
  description: 'Explain why a student answer is wrong with HKDSE-aligned feedback',
  feature: 'Learning',
  build: buildExplainMistakeUserPrompt,
});

// 4. IntegratedSkillsAnalysis — inline prompt in integrated-skills-analysis.ts
registerPrompt({
  name: 'IntegratedSkillsAnalysis',
  version: 'v1',
  description: 'Analyze DSE Paper 3 Integrated Skills answer (Listening + Writing)',
  feature: 'Listening',
});

// 5. StudyHelpResponse — inline prompt in study-help.ts
registerPrompt({
  name: 'StudyHelpResponse',
  version: 'v1',
  description: 'Personalized study help with HKDSE-aligned recommendations',
  feature: 'Learning',
});

// 6. AnswerAnalysis — inline prompt in analyze-answer.ts
registerPrompt({
  name: 'AnswerAnalysis',
  version: 'v1',
  description: 'Evaluate student answer against correct answer with HKDSE-aligned rubric',
  feature: 'Reading',
});

// 7. WordAnalysis — inline prompt in analyze-word.ts
registerPrompt({
  name: 'WordAnalysis',
  version: 'v1',
  description: 'Analyze English vocabulary (POS, meaning, examples, synonyms, collocations)',
  feature: 'Vocabulary',
});

// 8. AdaptiveWritingGuide — inline prompt in adaptive-writing-guide.ts
registerPrompt({
  name: 'AdaptiveWritingGuide',
  version: 'v1',
  description: 'Live writing coaching with personalized tips and structure feedback',
  feature: 'Writing',
});

// 9. IntegratedSkillsGeneration — inline prompt in integrated-skills-gen.ts
registerPrompt({
  name: 'IntegratedSkillsGeneration',
  version: 'v1',
  description: 'Generate DSE Paper 3 Integrated Skills task (listening + writing)',
  feature: 'Listening',
});

// 10. WritingPromptGeneration — inline prompt in writing-prompt.ts
registerPrompt({
  name: 'WritingPromptGeneration',
  version: 'v1',
  description: 'Generate DSE Paper 2 Part B writing prompt with topic diversity',
  feature: 'Writing',
});

// 11. WritingOutlineGeneration — inline prompt in writing-outline.ts
registerPrompt({
  name: 'WritingOutlineGeneration',
  version: 'v1',
  description: 'Generate structured writing outline with paragraph guidance',
  feature: 'Writing',
});

// 12. AnalyzeWriting — inline prompt in analyze-writing.ts
registerPrompt({
  name: 'AnalyzeWriting',
  version: 'v1',
  description: 'Full writing analysis with CLO rubric scoring and Chinglish detection',
  feature: 'Writing',
});

// 13. GenerateQuestionsAnswerVerification — builders in grammar/answer-verification.ts
// 交付前答案把關：第二次獨立 pass blind-solve 每題並判斷 soundness。
// 生成器的答案鍵刻意不提供（blind solve），避免驗證器為既有答案鍵護航。
// v2（2026-09-27）：新增「完整轉換檢查」——轉換題若沒有任何選項同時滿足
// 全部必要轉換（例：must→had to 且 we→they），必須判 flawed 而非挑最接近者。
registerPrompt({
  name: 'GenerateQuestionsAnswerVerification',
  version: 'v2',
  description: 'Independently blind-solve generated questions and judge whether each item has exactly one defensible answer',
  build: buildAnswerVerificationUserPrompt,
  feature: 'QuestionGeneration',
});

// 14. IeltsWritingAssessment — builders in ielts/writing-assessment.ts
// 2026-10-03 PHASE IELTS-01：四項官方準則逐項評估；版本常數
// IELTS_WRITING_TASK1_V1 / IELTS_WRITING_TASK2_V1 會連同評估一併持久化。
// 平台自身由準則分數平均計算 task band（AI 只回準則分，不回總分）。
registerPrompt({
  name: 'IeltsWritingAssessment',
  version: 'v1',
  description: 'Criterion-specific IELTS writing assessment (Task Achievement/Response, Coherence & Cohesion, Lexical Resource, Grammar) with verbatim evidence',
  feature: 'IELTS',
});

// 15. IeltsSpeakingPreparation — builders in ielts/speaking-preparation.ts
// 2026-10-03 (II)：口說改為「準備教練」——不評分、不模擬考官、不評發音。
// 版本常數 IELTS_SPEAKING_PREP_V1 會連同每次準備計劃一併持久化。
registerPrompt({
  name: 'IeltsSpeakingPreparation',
  version: 'v1',
  description: 'IELTS speaking preparation coach (plan, language functions, pitfalls, follow-up practice); NO scoring, NO examiner simulation',
  feature: 'IELTS',
});

// 16. IeltsQuestionGeneration — builders in ielts/question-generation.ts
// 2026-10-03 (IV)：AI 出題（Reading/Listening 套卷＋Writing 題目）。AI 輸出只是
// 原料：先經決定性屏檢（question-validator），再經獨立 blind-solve 覆核（答案鍵
// 永不提供給驗證器），通過者才以 QA_REQUIRED 儲存；AI 永不發佈。
// 版本常數 IELTS_QUESTION_GENERATION_V1 / IELTS_WRITING_PROMPT_GEN_V1 /
// IELTS_SECTION_EXTENSION_V1（2026-10-08：對**同一段落文本**補題，只回 questions，
// 用來把短少的段落補足到官方題數 —— 見 generation-service.topUpSection()）。
registerPrompt({
  name: 'IeltsQuestionGeneration',
  version: 'v1',
  description: 'AI authoring of IELTS-style practice (Reading/Listening sets, Writing task prompts) under official-format rules; screened + verified before QA_REQUIRED storage',
  feature: 'IELTS',
});

// 17. IeltsItemVerification — blind-solve verifier（答案鍵永不出現在 prompt）
registerPrompt({
  name: 'IeltsItemVerification',
  version: 'v1',
  description: 'Independent blind-solve verification of generated IELTS items (answer keys never shown); per-item soundness ok/ambiguous/flawed',
  feature: 'IELTS',
});

// 18. IeltsMistakeExplanation — builders in ielts/mistake-explanation.ts
// 2026-10-03 (VI)：錯題 AI 解說——只解釋、不改分數（判定已由決定性評分器定案）；
// 只對「已提交且被評為 incorrect」的客觀題生成；違禁宣稱過濾。
// 版本常數 IELTS_MISTAKE_EXPLANATION_V1。
registerPrompt({
  name: 'IeltsMistakeExplanation',
  version: 'v1',
  description: 'Advisory explanation of a wrong IELTS objective answer (never changes the mark); quotes the passage/transcript and addresses the student\'s specific answer',
  feature: 'IELTS',
});
