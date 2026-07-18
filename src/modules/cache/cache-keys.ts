// Sprint 12: Cache Keys — organized key generation
import type { CacheNamespace } from './types';

/** Generate a namespaced cache key */
function key(namespace: CacheNamespace, ...parts: string[]): string {
  return `${namespace}:${parts.join(':')}`;
}

// ============================================
// Grammar Explanations
// ============================================

export const grammarKeys = {
  explainMistake: (questionId: string, studentAnswer: string) =>
    key('grammar:explanation', 'mistake', questionId, hash(studentAnswer)),
  questionGen: (params: string) =>
    key('grammar:explanation', 'gen', hash(params)),
};

// ============================================
// Vocabulary Analysis
// ============================================

export const vocabKeys = {
  wordAnalysis: (word: string, gradeLevel: string) =>
    key('vocabulary:analysis', word.toLowerCase(), gradeLevel),
  suggestions: (studentId: string, text: string) =>
    key('vocabulary:analysis', 'suggest', studentId, hash(text)),
};

// ============================================
// Reading Passages
// ============================================

export const readingKeys = {
  passage: (materialId: string) =>
    key('reading:passage', materialId),
  chunk: (materialId: string, chunkIndex: number) =>
    key('reading:passage', materialId, String(chunkIndex)),
};

// ============================================
// Generated Exercises
// ============================================

export const exerciseKeys = {
  generated: (params: string) =>
    key('exercise:generated', hash(params)),
  forStudent: (studentId: string, skill: string, difficulty: string) =>
    key('exercise:generated', studentId, skill, difficulty),
};

// ============================================
// Essay Feedback
// ============================================

export const essayKeys = {
  analysis: (studentId: string, title: string, hashContent: string) =>
    key('essay:feedback', 'analysis', studentId, hash(title + hashContent)),
  grammar: (studentId: string, hashContent: string) =>
    key('essay:feedback', 'grammar', studentId, hashContent),
  style: (studentId: string, hashContent: string) =>
    key('essay:feedback', 'style', studentId, hashContent),
};

// ============================================
// AI Response (generic)
// ============================================

export const aiKeys = {
  response: (model: string, hashPrompt: string) =>
    key('ai:response', model, hashPrompt),
};

// ============================================
// Student Profile
// ============================================

export const profileKeys = {
  student: (studentId: string) =>
    key('profile:student', studentId),
};

// ============================================
// Helpers
// ============================================

/** Simple string hash for cache key normalization */
function hash(input: string): string {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) - h) + input.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h).toString(36);
}
