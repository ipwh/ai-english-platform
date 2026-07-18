// Sprint 9: Mistake Tracker — records and analyzes mistakes
import type { MistakeRecord, MistakeCategory, MistakeSeverity } from '../types';

/** Input for recording a new mistake */
export interface RecordMistakeInput {
  studentId: string;
  questionId: string;
  questionSummary: string;
  studentAnswer: string;
  correctAnswer: string;
  category: MistakeCategory;
  aiExplanation?: string;
}

/** Severity based on mistake category */
export function classifySeverity(category: MistakeCategory): MistakeSeverity {
  switch (category) {
    case 'grammar': return 'major';
    case 'vocabulary': return 'minor';
    case 'comprehension': return 'critical';
    case 'careless': return 'minor';
    case 'time-management': return 'major';
    case 'chinglish': return 'major';
  }
}

/** Extract grammar point from question summary (heuristic) */
export function extractGrammarPoint(questionSummary: string): string {
  const patterns: [RegExp, string][] = [
    [/(tenses|tense|present perfect|past perfect|future|continuous|simple past|simple present)/i, 'tenses'],
    [/(passive voice|passive)/i, 'passive-voice'],
    [/(conditional|if.*clause|type \d|type [A-C])/i, 'conditionals'],
    [/(relative clause|who|which|that|whom|whose)/i, 'relative-clauses'],
    [/(reported speech|indirect speech)/i, 'reported-speech'],
    [/(modal|can|could|may|might|must|should|would)/i, 'modal-verbs'],
    [/(article|a\s|an\s|the\s)/i, 'articles'],
    [/(preposition|in\s|on\s|at\s|by\s|for\s|with\s)/i, 'prepositions'],
    [/(subject.verb|agreement|singular|plural)/i, 'subject-verb-agreement'],
    [/(gerund|infinitive|to \w+|\w+ing)/i, 'gerunds-infinitives'],
    [/(connector|linking|however|therefore|moreover|furthermore)/i, 'connectors'],
    [/(comparison|comparative|superlative|more\b|most\b|\b\w+er\b|\b\w+est\b)/i, 'comparatives'],
    [/(inversion|not only|hardly|scarcely|seldom)/i, 'inversion'],
    [/(phrasal verb|look \w+|put \w+|take \w+|get \w+|come \w+)/i, 'phrasal-verbs'],
    [/(subjunctive|wish|if only|as if|as though)/i, 'subjunctive'],
  ];
  for (const [regex, point] of patterns) {
    if (regex.test(questionSummary)) return point;
  }
  return 'general';
}

/** Calculate SRS next review date using simplified SM-2 algorithm */
export function calculateNextReview(
  currentInterval: number,
  easeFactor: number,
  quality: number // 0-5, where 0=complete blackout, 5=perfect
): { interval: number; easeFactor: number; nextDate: Date } {
  let newEf = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  if (newEf < 1.3) newEf = 1.3;

  let newInterval: number;
  if (quality < 3) {
    newInterval = 1; // Reset
  } else if (currentInterval === 0) {
    newInterval = 1;
  } else if (currentInterval === 1) {
    newInterval = 3;
  } else {
    newInterval = Math.round(currentInterval * newEf);
  }

  const nextDate = new Date();
  nextDate.setDate(nextDate.getDate() + newInterval);

  return { interval: newInterval, easeFactor: Math.round(newEf * 100) / 100, nextDate };
}

/** Filter mistakes due for review */
export function getDueForReview(mistakes: MistakeRecord[]): MistakeRecord[] {
  const now = new Date();
  return mistakes.filter(m => !m.reviewed && m.nextReviewDate && m.nextReviewDate <= now);
}

/** Check if a student has mastered a category based on recent accuracy */
export function estimateCategoryMastery(
  mistakes: MistakeRecord[],
  category: MistakeCategory
): number {
  const catMistakes = mistakes.filter(m => m.category === category);
  if (catMistakes.length === 0) return 100;

  const now = new Date();
  const recent30d = catMistakes.filter(m => {
    const days = (now.getTime() - m.createdAt.getTime()) / 86400000;
    return days <= 30;
  });

  // Mastery = 100 - (mistakes in last 30 days * 5), clamped to 0-100
  const penalty = recent30d.length * 5;
  const reviewedBonus = catMistakes.filter(m => m.reviewed).length * 2;
  return Math.max(0, Math.min(100, 100 - penalty + reviewedBonus));
}
