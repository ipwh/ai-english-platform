// ============================================
// Self-Directed Practice — practice-history read model (2026-10-10)
// ============================================
// Feeds the student's「練習歷史」(a day-by-day view) so a custom-practice set appears
// next to the HKDSE practice sessions of the same Hong Kong day, and a day on which
// the student ONLY did custom practice still shows up.
//
// Isolation contract (unchanged): these are ENGAGEMENT records. They never take part
// in `evaluatePracticeEvidence`, accuracy, mastery, mistakes or XP — the history
// aggregates keep coming from PracticeSession alone, and this read model is returned
// under its own key so the two can never be summed by accident.
//
// Bounded by construction: the month view returns ONE row per day (GROUP BY in SQL),
// the day view one bounded query for that single day.
// ============================================

import { hkDayStartUtc, hkMonthStartUtc, nextMonthKey, DAY_MS } from '@/shared/utils/hk-date';
import {
  countOwnSetsByDayKey,
  listOwnSetsByDayKey,
  type CustomPracticeSetSummaryRow,
} from '../repositories/custom-practice-repo';

/** One Hong Kong day on which the student generated custom practice. */
export interface CustomPracticeHistoryDay {
  dayKey: string;
  setsCount: number;
}

export interface CustomPracticeHistoryEntry {
  id: string;
  objective: string;
  category: string;
  difficulty: string;
  questionCount: number;
  createdAt: Date;
  submitted: boolean;
  submittedAt: Date | null;
  awardedMarks: number | null;
  totalMarks: number | null;
  needsReviewCount: number | null;
}

/** Every day of `monthKey` (Hong Kong) with at least one custom-practice set. */
export async function getCustomPracticeHistoryMonth(
  ownerUserId: string,
  monthKey: string
): Promise<CustomPracticeHistoryDay[]> {
  const since = hkMonthStartUtc(monthKey);
  const until = hkMonthStartUtc(nextMonthKey(monthKey));
  const rows = await countOwnSetsByDayKey(ownerUserId, since, until);
  return rows.map(row => ({ dayKey: row.dayKey, setsCount: row.setsCount }));
}

/** The custom-practice sets of one Hong Kong day, oldest first. */
export async function getCustomPracticeHistoryDay(
  ownerUserId: string,
  dayKey: string,
  maxSets = 50
): Promise<CustomPracticeHistoryEntry[]> {
  const since = hkDayStartUtc(dayKey);
  const until = new Date(since.getTime() + DAY_MS);
  const rows: CustomPracticeSetSummaryRow[] = await listOwnSetsByDayKey(ownerUserId, since, until, maxSets);

  return rows.map(row => ({
    id: row.id,
    objective: row.objective,
    category: row.category,
    difficulty: row.difficulty,
    questionCount: row.questionCount,
    createdAt: row.createdAt,
    submitted: row.submitted,
    submittedAt: row.submittedAt,
    awardedMarks: row.awardedMarks,
    totalMarks: row.totalMarks,
    needsReviewCount: row.needsReviewCount,
  }));
}
