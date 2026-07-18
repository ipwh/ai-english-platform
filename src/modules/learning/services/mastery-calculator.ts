// Sprint 7: Mastery Calculator
// Computes skill mastery scores from practice data
import type { SkillMastery } from '../types';

/** Raw practice input for mastery computation */
export interface PracticeEntry {
  skillId: string;
  correct: boolean;
  practicedAt: Date;
}

const MASTERY_THRESHOLD = 70;   // Score >= 70 = mastered
const DECAY_DAYS = 14;           // Skills decay after 14 days without practice
const MIN_ATTEMPTS = 3;          // Need at least 3 attempts for reliable score

/**
 * Calculate mastery score (0-100) for a skill.
 * Factors: accuracy (60%), recency (25%), volume (15%)
 */
export function calculateMastery(entries: PracticeEntry[]): SkillMastery {
  if (entries.length === 0) {
    return { skillId: entries[0]?.skillId || '', score: 0, totalAttempts: 0, correctAttempts: 0, accuracy: 0, daysSinceLastPractice: 999 };
  }

  const skillId = entries[0].skillId;
  const totalAttempts = entries.length;
  const correctAttempts = entries.filter(e => e.correct).length;
  const accuracy = totalAttempts > 0 ? correctAttempts / totalAttempts : 0;

  // Recency: days since last practice
  const now = new Date();
  const lastPracticed = entries.reduce((max, e) => e.practicedAt > max ? e.practicedAt : max, new Date(0));
  const daysSinceLastPractice = Math.floor((now.getTime() - lastPracticed.getTime()) / 86400000);

  // Recency decay factor: 1.0 if practiced today, decays to 0.5 after DECAY_DAYS
  const recencyFactor = Math.max(0.5, 1 - (daysSinceLastPractice / DECAY_DAYS) * 0.5);

  // Volume factor: scales from 0.5 (1 attempt) to 1.0 (10+ attempts)
  const volumeFactor = Math.min(1, 0.5 + (totalAttempts / MIN_ATTEMPTS) * 0.5);

  // Weighted score
  const rawScore = (accuracy * 0.6 + recencyFactor * 0.25 + volumeFactor * 0.15) * 100;

  return {
    skillId,
    score: Math.round(rawScore),
    totalAttempts,
    correctAttempts,
    accuracy: Math.round(accuracy * 100) / 100,
    daysSinceLastPractice,
    firstPracticedAt: entries.reduce((min, e) => e.practicedAt < min ? e.practicedAt : min, new Date()),
    lastPracticedAt: lastPracticed,
  };
}

/** Check if a skill is considered "mastered" */
export function isMastered(mastery: SkillMastery): boolean {
  return mastery.score >= MASTERY_THRESHOLD && mastery.totalAttempts >= MIN_ATTEMPTS;
}

/** Calculate mastery for multiple skills from flat practice list */
export function calculateAllMastery(entries: PracticeEntry[]): Map<string, SkillMastery> {
  const grouped = new Map<string, PracticeEntry[]>();
  for (const e of entries) {
    if (!grouped.has(e.skillId)) grouped.set(e.skillId, []);
    grouped.get(e.skillId)!.push(e);
  }
  const result = new Map<string, SkillMastery>();
  for (const [skillId, groupEntries] of grouped) {
    result.set(skillId, calculateMastery(groupEntries));
  }
  return result;
}
