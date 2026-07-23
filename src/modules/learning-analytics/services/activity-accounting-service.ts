// ============================================
// Completed learning activity accounting
// Keeps direct practice and teacher assignments in the same student metrics.
// Sprint 74: Delegates writes to StudentStateMutationService (canonical mutation path).
// ============================================

import { studentStateMutationService } from '@/modules/student/state/StudentStateMutationService';

/**
 * Rebuild derived metrics from persisted completion records.
 * Delegates DB access to StudentStateMutationService.
 */
export async function syncStudentActivityMetrics(studentId: string): Promise<void> {
  await studentStateMutationService.syncActivityMetrics(studentId);
}

/** Record mastery once for a newly completed activity. */
export async function recordActivityMastery(params: {
  studentId: string;
  skill: string | null | undefined;
  subSkill: string;
  totalQuestions: number;
  correctCount: number;
}): Promise<void> {
  const allowedSkills = new Set(['grammar', 'vocabulary', 'reading', 'writing', 'listening', 'speaking']);
  const skill = allowedSkills.has(params.skill || '') ? params.skill! : 'grammar';
  const { updateAfterExercise } = await import(
    '@/modules/student/mastery/services/student-mastery-service'
  );

  await updateAfterExercise({
    studentId: params.studentId,
    skill: skill as 'grammar' | 'vocabulary' | 'reading' | 'writing' | 'listening' | 'speaking',
    subSkill: params.subSkill,
    totalQuestions: params.totalQuestions,
    correctCount: params.correctCount,
  });
}