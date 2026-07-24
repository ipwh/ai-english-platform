// Sprint 102.5: Semantic Evaluation
// AI-powered via evaluateWithAI() for true understanding.
// Refactored in 102.5: remove duplicate, remove unused old evaluateAnswer/rubric functions
import type { QuestionRubric, RubricEvaluation } from '@/modules/ai/prompts/reading/types';

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').replace(/[.!?,;:'"]+$/g, '').trim();
}

export function evaluateAnswer(studentAnswer: string, rubric: QuestionRubric): RubricEvaluation {
  const matched: string[] = [];
  const missing: string[] = [];
  for (const c of rubric.requiredConcepts) {
    const ns = normalize(studentAnswer);
    const nc = normalize(c.description);
    if (ns.includes(nc) || nc.includes(ns) || c.acceptedSynonyms.some(s => ns.includes(normalize(s)))) {
      matched.push(c.id);
    } else {
      missing.push(c.id);
    }
  }
  const allMatched = missing.length === 0;
  const someMatched = matched.length >= rubric.partialCreditRules.minRequiredForPartial;
  const score = allMatched ? rubric.maxMarks : someMatched ? rubric.partialCreditRules.partialMarks : 0;
  return {
    score, maxScore: rubric.maxMarks,
    decision: allMatched ? 'correct' : someMatched ? 'partial' : 'incorrect',
    matchedConcepts: matched, missingConcepts: missing,
    feedback: allMatched ? '✅ 正確！' : someMatched ? '⚠️ 部分正確。' : '❌ 不正確。',
    feedbackEn: allMatched ? '✅ Correct!' : someMatched ? '⚠️ Partial.' : '❌ Incorrect.',
  };
}
