// ============================================
// Sprint 109: Self-Reflection
// Deterministic reflection on LLM output. No AI calls.
// ============================================

import type { ReflectionResult, ReflectionCheck } from './prompt-types';

interface ReflectionInput {
  questions: Record<string, unknown>[];
  expectedCount?: number;
  requestedDifficulty?: string;
  questionType?: string;
}

/** Reflect on LLM-generated questions. Returns structured feedback. */
export function reflectOnOutput(input: ReflectionInput): ReflectionResult {
  const checks: ReflectionCheck[] = [];
  const warnings: string[] = [];
  const suggestions: string[] = [];

  const qs = input.questions || [];
  const count = qs.length;

  // 1. Answer presence
  const missingAnswer = qs.filter(q => !q.answer || String(q.answer).trim().length === 0).length;
  checks.push({
    name: 'answer-presence',
    passed: missingAnswer === 0,
    detail: missingAnswer > 0 ? `${missingAnswer}/${count} questions missing answer` : `All ${count} questions have answers`,
  });
  if (missingAnswer > 0) {
    warnings.push(`${missingAnswer} questions are missing answers`);
    suggestions.push('Add explicit instruction: "Every question MUST include an answer field"');
  }

  // 2. MCQ option count
  const mcQuestions = qs.filter(q => q.type === 'mc' || q.type === 'mcq');
  const badMCQ = mcQuestions.filter(q => !Array.isArray(q.choices) || (q.choices as string[]).length !== 4).length;
  checks.push({
    name: 'mcq-option-count',
    passed: badMCQ === 0,
    detail: badMCQ > 0 ? `${badMCQ}/${mcQuestions.length} MC questions don't have 4 options` : `All ${mcQuestions.length} MC questions have 4 options`,
  });
  if (badMCQ > 0) {
    warnings.push(`${badMCQ} MC questions don't have exactly 4 options`);
    suggestions.push('Add explicit instruction: "MCQ MUST have exactly 4 options"');
  }

  // 3. Explanation presence
  const missingExp = qs.filter(q => !q.explanationZh || String(q.explanationZh).trim().length < 5).length;
  checks.push({
    name: 'explanation-presence',
    passed: missingExp === 0,
    detail: missingExp > 0 ? `${missingExp}/${count} questions missing explanation` : `All ${count} questions have explanations`,
  });
  if (missingExp > 0) {
    warnings.push(`${missingExp} questions are missing explanations`);
    suggestions.push('Add explicit instruction: "Every question MUST include explanationZh"');
  }

  // 4. Count match
  if (input.expectedCount && count !== input.expectedCount) {
    checks.push({
      name: 'question-count',
      passed: false,
      detail: `Expected ${input.expectedCount}, got ${count}`,
    });
    warnings.push(`Question count mismatch: expected ${input.expectedCount}, got ${count}`);
    suggestions.push('Add explicit instruction: "Generate EXACTLY N questions"');
  } else {
    checks.push({ name: 'question-count', passed: true, detail: `Generated ${count} questions` });
  }

  // 5. Duplicate detection
  const prompts = qs.map(q => String(q.prompt || q.question || q.questionText || '').trim().toLowerCase()).filter(p => p.length > 0);
  const duplicates = prompts.filter((p, i) => prompts.indexOf(p) !== i).length;
  checks.push({
    name: 'no-duplicates',
    passed: duplicates === 0,
    detail: duplicates > 0 ? `${duplicates} duplicate questions detected` : 'No duplicate questions',
  });
  if (duplicates > 0) {
    warnings.push(`${duplicates} duplicate questions detected`);
  }

  // 6. Placeholder detection
  const placeholders = qs.filter(q => {
    const fields = [q.answer, q.explanationZh, q.explanationEn]; // commonMistake is optional
    return fields.some(f => {
      const s = String(f || '').trim().toLowerCase();
      return s === 'n/a' || s === 'tbd' || s === 'todo' || s === '...';
    });
  }).length;
  checks.push({
    name: 'no-placeholders',
    passed: placeholders === 0,
    detail: placeholders > 0 ? `${placeholders} questions contain placeholders` : 'No placeholders detected',
  });
  if (placeholders > 0) {
    warnings.push(`${placeholders} questions contain placeholder values`);
    suggestions.push('Add explicit instruction: "Do NOT use placeholder values"');
  }

  const passedCount = checks.filter(c => c.passed).length;
  const score = Math.round((passedCount / Math.max(1, checks.length)) * 100);

  return {
    score,
    passed: warnings.length === 0,
    checks,
    warnings,
    improvementSuggestions: suggestions,
  };
}
