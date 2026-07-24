// Sprint 102: Semantic Answer Evaluation Engine
// Rubric-based marking that behaves like an HKDSE examiner, not a keyword matcher.
//
// Pipeline: Normalize → Semantic Match → Rubric Evaluate → Score → Feedback

import type { QuestionRubric, RubricConcept, RubricEvaluation } from '@/modules/ai/prompts/reading/types';

// ═══ Stage 1: Normalize ═══
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, ' ')           // collapse whitespace
    .replace(/[.!?,;:'"]+$/g, '')   // trailing punctuation
    .replace(/['']/g, "'")           // smart quotes
    .replace(/[""]/g, '"')           // smart double quotes
    .trim();
}

// ═══ Common synonym/abbreviation mapping ═══
const COMMON_SYNONYMS: Record<string, string[]> = {
  'electronic waste': ['e-waste', 'e waste', 'ewaste', 'digital waste'],
  'e-waste': ['electronic waste', 'digital waste'],
  'false news': ['fake news', 'misinformation', 'disinformation'],
  'fake news': ['false news', 'misinformation'],
  'anxiety': ['stress', 'worry', 'nervousness', 'tension'],
  'stress': ['anxiety', 'tension', 'pressure'],
  'ecological damage': ['environmental damage', 'environmental destruction', 'ecological harm', 'damage to the environment'],
  'democratized': ['made accessible', 'made available to everyone', 'opened up', 'made open'],
  'influences': ['affects', 'shapes', 'changes', 'impacts', 'has an effect on'],
  'technology influences humans': ['tech affects people', 'technology shapes us', 'tech influences us', 'technology has an impact on people'],
  'plastics': ['plastic', 'microplastics', 'microplastics'],
  'biodegradable plastics': ['biodegradable plastic', 'plant-based plastics', 'bioplastics', 'eco-friendly plastics'],
  'microplastics': ['micro plastics', 'micro-plastics', 'plastic particles', 'tiny plastic pieces'],
};

function findSynonyms(word: string): string[] {
  const norm = normalize(word);
  const direct = COMMON_SYNONYMS[norm] || [];
  // Also check reverse mapping
  const reverse: string[] = [];
  for (const [key, values] of Object.entries(COMMON_SYNONYMS)) {
    if (values.includes(norm)) reverse.push(key);
  }
  return [...direct, ...reverse];
}

// ═══ Stage 2: Semantic Matching ═══
function matchConcept(
  studentAnswer: string,
  concept: RubricConcept,
): boolean {
  const normAnswer = normalize(studentAnswer);
  const normDesc = normalize(concept.description);

  // 1. Direct match
  if (normAnswer === normDesc) return true;

  // 2. Contains the concept description
  if (normAnswer.includes(normDesc) && normDesc.length > 5) return true;
  if (normDesc.includes(normAnswer) && normAnswer.length > 5) return true;

  // 3. Synonym matching
  const allSynonyms = [...concept.acceptedSynonyms, ...findSynonyms(normDesc)];
  for (const syn of allSynonyms) {
    const normSyn = normalize(syn);
    if (normAnswer.includes(normSyn) && normSyn.length > 4) return true;
    if (normSyn.includes(normAnswer) && normAnswer.length > 4) return true;
  }

  // 4. Paraphrase matching
  for (const para of concept.acceptedParaphrases) {
    const normPara = normalize(para);
    if (normAnswer.includes(normPara) && normPara.length > 8) return true;
  }

  // 5. Word overlap (for multi-word concepts)
  const conceptWords = normDesc.split(' ').filter(w => w.length > 3);
  const answerWords = normAnswer.split(' ');
  if (conceptWords.length >= 2) {
    const overlap = conceptWords.filter(cw =>
      answerWords.some(aw => aw.includes(cw) || cw.includes(aw))
    ).length;
    if (overlap >= Math.ceil(conceptWords.length * 0.6)) return true;
  }

  return false;
}

// ═══ Stage 3: Rubric Evaluation ═══
function evaluateRubric(
  studentAnswer: string,
  rubric: QuestionRubric,
): { matchedIds: string[]; missingIds: string[] } {
  const matchedIds: string[] = [];
  const missingIds: string[] = [];

  for (const concept of rubric.requiredConcepts) {
    if (matchConcept(studentAnswer, concept)) {
      matchedIds.push(concept.id);
    } else {
      missingIds.push(concept.id);
    }
  }

  // Check optional concepts
  if (rubric.optionalConcepts) {
    for (const concept of rubric.optionalConcepts) {
      if (matchConcept(studentAnswer, concept)) {
        matchedIds.push(concept.id);
      }
    }
  }

  return { matchedIds, missingIds };
}

// ═══ Stage 4: Score Calculation ═══
function calculateScore(
  matchedIds: string[],
  missingIds: string[],
  rubric: QuestionRubric,
): { score: number; decision: 'correct' | 'partial' | 'incorrect' } {
  const requiredCount = rubric.requiredConcepts.length;

  if (missingIds.length === 0) {
    return { score: rubric.maxMarks, decision: 'correct' };
  }

  if (matchedIds.length === 0) {
    return { score: 0, decision: 'incorrect' };
  }

  // Partial credit: at least minRequiredForPartial concepts matched
  if (matchedIds.length >= rubric.partialCreditRules.minRequiredForPartial) {
    // Calculate proportional score
    const requiredMatched = rubric.requiredConcepts.filter(c => matchedIds.includes(c.id));
    const marks = requiredMatched.reduce((sum, c) => sum + c.marks, 0);
    const partial = Math.max(rubric.partialCreditRules.partialMarks, marks);
    return { score: Math.min(partial, rubric.maxMarks - 1), decision: 'partial' };
  }

  return { score: 0, decision: 'incorrect' };
}

// ═══ Stage 5: Feedback Generation ═══
function generateFeedback(
  matchedIds: string[],
  missingIds: string[],
  rubric: QuestionRubric,
  decision: 'correct' | 'partial' | 'incorrect',
  score: number,
): { feedback: string; feedbackEn: string } {
  const allConcepts = [...rubric.requiredConcepts, ...(rubric.optionalConcepts || [])];

  if (decision === 'correct') {
    return {
      feedback: `✅ 完全正確！你成功展示了所有必要概念：${rubric.requiredConcepts.map(c => c.description).join('、')}。得分 ${score}/${rubric.maxMarks}`,
      feedbackEn: `✅ Correct! You demonstrated all required concepts: ${rubric.requiredConcepts.map(c => c.description).join(', ')}. Score ${score}/${rubric.maxMarks}`,
    };
  }

  if (decision === 'partial') {
    const matchedDesc = matchedIds.map(id => allConcepts.find(c => c.id === id)?.description).filter(Boolean);
    const missingDesc = missingIds.map(id => allConcepts.find(c => c.id === id)?.description).filter(Boolean);
    return {
      feedback: `⚠️ 部分正確。你答到了：${matchedDesc.join('、')}。但還需要：${missingDesc.join('、')}。得分 ${score}/${rubric.maxMarks}`,
      feedbackEn: `⚠️ Partially correct. You covered: ${matchedDesc.join(', ')}. But you also need: ${missingDesc.join(', ')}. Score ${score}/${rubric.maxMarks}`,
    };
  }

  return {
    feedback: `❌ 不正確。正確答案需包含：${rubric.requiredConcepts.map(c => c.description).join('、')}。你的答案未涵蓋這些概念。得分 ${score}/${rubric.maxMarks}`,
    feedbackEn: `❌ Incorrect. The answer should include: ${rubric.requiredConcepts.map(c => c.description).join(', ')}. Your answer did not cover these concepts. Score ${score}/${rubric.maxMarks}`,
  };
}

// ═══ Main Entry Point ═══
export function evaluateAnswer(
  studentAnswer: string,
  rubric: QuestionRubric,
): RubricEvaluation {
  const { matchedIds, missingIds } = evaluateRubric(studentAnswer, rubric);
  const { score, decision } = calculateScore(matchedIds, missingIds, rubric);
  const { feedback, feedbackEn } = generateFeedback(matchedIds, missingIds, rubric, decision, score);

  return {
    score,
    maxScore: rubric.maxMarks,
    decision,
    matchedConcepts: matchedIds,
    missingConcepts: missingIds,
    feedback,
    feedbackEn,
  };
}

/**
 * Legacy-compatible evaluation: wraps rubric evaluation for the old AnswerAnalysis format.
 * When no rubric is available, falls back to lenient keyword matching.
 */
export function evaluateAnswerLegacy(
  studentAnswer: string,
  correctAnswer: string,
  marks: number,
  rubric?: QuestionRubric,
): { score: number; isCorrect: boolean; isPartiallyCorrect: boolean; feedbackZh: string; feedbackEn: string } {
  if (rubric) {
    const result = evaluateAnswer(studentAnswer, rubric);
    return {
      score: result.score,
      isCorrect: result.decision === 'correct',
      isPartiallyCorrect: result.decision === 'partial',
      feedbackZh: result.feedback,
      feedbackEn: result.feedbackEn || result.feedback,
    };
  }

  // Fallback: lenient matching (Sprint 102 enhanced version)
  const norm = (s: string) => normalize(s);
  const normStudent = norm(studentAnswer);
  const normCorrect = norm(correctAnswer);

  if (normStudent === normCorrect) {
    return { score: marks, isCorrect: true, isPartiallyCorrect: false, feedbackZh: '✅ 正確！', feedbackEn: '✅ Correct!' };
  }

  // Check containment — if student answer contains the correct answer, it's at least partial
  if (normCorrect.includes(normStudent) && normStudent.length > 3) {
    return { score: Math.ceil(marks / 2), isCorrect: false, isPartiallyCorrect: true, feedbackZh: `⚠️ 部分正確。你的答案方向正確但不完整。`, feedbackEn: '⚠️ Partially correct.' };
  }
  // Student's answer contains the correct answer (e.g. "microplastics" contains "plastics")
  if (normStudent.includes(normCorrect) && normCorrect.length > 3) {
    // Relaxed: if student answer is a reasonable expansion of the short correct answer
    const isShortAnswer = normCorrect.length < 15;
    if (isShortAnswer || normStudent.length <= normCorrect.length * 3) {
      return { score: marks, isCorrect: true, isPartiallyCorrect: false, feedbackZh: `✅ 答案可接受。「${studentAnswer}」已涵蓋正確答案。`, feedbackEn: `✅ Acceptable. Your answer covers the key point.` };
    }
    return { score: Math.ceil(marks / 2), isCorrect: false, isPartiallyCorrect: true, feedbackZh: `⚠️ 部分正確。你的答案包含了正確內容但過於冗長。`, feedbackEn: '⚠️ Partially correct but too verbose.' };
  }

  // Keyword overlap
  const correctWords = normCorrect.split(' ').filter(w => w.length > 3);
  const studentWords = new Set(normStudent.split(' '));
  const overlap = correctWords.filter(w => studentWords.has(w)).length;
  const ratio = correctWords.length > 0 ? overlap / correctWords.length : 0;

  if (ratio >= 0.6) {
    return { score: ratio >= 0.8 ? marks : Math.ceil(marks * 0.7), isCorrect: ratio >= 0.8, isPartiallyCorrect: ratio < 0.8, feedbackZh: `✅ 答案可接受。語意相符約 ${Math.round(ratio * 100)}%。`, feedbackEn: `✅ Acceptable. ~${Math.round(ratio * 100)}% semantic match.` };
  }
  if (ratio >= 0.4) {
    return { score: Math.ceil(marks / 2), isCorrect: false, isPartiallyCorrect: true, feedbackZh: `⚠️ 部分正確。方向對但不完整。`, feedbackEn: '⚠️ Partially correct.' };
  }

  return { score: 0, isCorrect: false, isPartiallyCorrect: false, feedbackZh: `❌ 不正確。正確答案是「${correctAnswer}」。`, feedbackEn: `❌ Incorrect. The correct answer is "${correctAnswer}".` };
}
