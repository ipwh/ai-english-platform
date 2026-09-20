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
registerPrompt({
  name: 'GenerateQuestionsAnswerVerification',
  version: 'v1',
  description: 'Independently blind-solve generated questions and judge whether each item has exactly one defensible answer',
  build: buildAnswerVerificationUserPrompt,
  feature: 'QuestionGeneration',
});
