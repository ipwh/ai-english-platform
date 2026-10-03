// ============================================
// IELTS Progress Service — honest projections only
// ============================================
// Cumulative counts come from SQL-level aggregation (groupBy), not from
// "latest N" slices. Historical band rows are a DISPLAY history (a record of
// past estimates), never used to recompute a cumulative metric.
//
// Note: IELTS progress deliberately does NOT produce cumulative average bands —
// averaging estimates across different components would imply a precision the
// platform does not have. Each row is a point-in-time practice estimate.
// ============================================

import type { IeltsBandEstimate } from '../domain/types';
import * as ieltsRepo from '../repositories/ielts-repo';
import { parseJson } from './row-mappers';

export interface IeltsSkillProgress {
  skill: string;
  attemptCount: number;
  submittedCount: number;
  latestAttempt: {
    id: string;
    testId: string;
    testType: string;
    submittedAt: Date | null;
    rawScore: number | null;
    totalItems: number | null;
    bandEstimate: IeltsBandEstimate | null;
  } | null;
  latestAssessment: {
    id: string;
    taskType: string | null;
    promptVersion: string;
    assessmentSource: string;
    confidence: string;
    estimatedBand: number | null;
    languageBandEstimate: number | null;
    createdAt: Date;
  } | null;
}

export interface IeltsProgressSummary {
  skills: IeltsSkillProgress[];
  recentAttempts: Array<{
    id: string;
    skill: string;
    testType: string;
    status: string;
    startedAt: Date;
    submittedAt: Date | null;
    rawScore: number | null;
    totalItems: number | null;
    bandEstimate: IeltsBandEstimate | null;
  }>;
}

const TRACKED_SKILLS = ['LISTENING', 'READING', 'WRITING', 'SPEAKING'] as const;

export async function getIeltsProgress(userId: string): Promise<IeltsProgressSummary> {
  const [counts, recentAttempts] = await Promise.all([
    ieltsRepo.countAttemptsBySkillAndStatus(userId),
    ieltsRepo.findAttemptsByUser(userId, { take: 30 }),
  ]);

  const skills: IeltsSkillProgress[] = [];
  for (const skill of TRACKED_SKILLS) {
    const skillCounts = counts.filter((c) => c.skill === skill);
    const attemptCount = skillCounts.reduce((sum, c) => sum + c._count._all, 0);
    const submittedCount = skillCounts
      .filter((c) => c.status === 'SUBMITTED')
      .reduce((sum, c) => sum + c._count._all, 0);

    const latestAttemptRow =
      skill === 'READING' || skill === 'LISTENING'
        ? await ieltsRepo.findLatestSubmittedAttemptForSkill(userId, skill)
        : null;
    const latestAssessmentRow =
      skill === 'WRITING' || skill === 'SPEAKING'
        ? await ieltsRepo.findLatestCompletedAssessmentForSkill(userId, skill)
        : null;

    skills.push({
      skill,
      attemptCount,
      submittedCount,
      latestAttempt: latestAttemptRow
        ? {
            id: latestAttemptRow.id,
            testId: latestAttemptRow.testId,
            testType: latestAttemptRow.testType,
            submittedAt: latestAttemptRow.submittedAt,
            rawScore: latestAttemptRow.rawScore,
            totalItems: latestAttemptRow.totalItems,
            bandEstimate: parseJson<IeltsBandEstimate | null>(latestAttemptRow.bandEstimate, null),
          }
        : null,
      latestAssessment: latestAssessmentRow
        ? {
            id: latestAssessmentRow.id,
            taskType: latestAssessmentRow.taskType,
            promptVersion: latestAssessmentRow.promptVersion,
            assessmentSource: latestAssessmentRow.assessmentSource,
            confidence: latestAssessmentRow.confidence,
            estimatedBand: latestAssessmentRow.estimatedBand,
            languageBandEstimate: latestAssessmentRow.languageBandEstimate,
            createdAt: latestAssessmentRow.createdAt,
          }
        : null,
    });
  }

  return {
    skills,
    recentAttempts: recentAttempts.map((a) => ({
      id: a.id,
      skill: a.skill,
      testType: a.testType,
      status: a.status,
      startedAt: a.startedAt,
      submittedAt: a.submittedAt,
      rawScore: a.rawScore,
      totalItems: a.totalItems,
      bandEstimate: parseJson<IeltsBandEstimate | null>(a.bandEstimate, null),
    })),
  };
}
