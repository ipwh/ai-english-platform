// ============================================
// Completed learning activity accounting
// Keeps direct practice and teacher assignments in the same student metrics.
// ============================================

import { db } from '@/shared/db/db';

type LearningActivity = {
  totalQuestions: number;
  correctCount: number;
  completedAt: Date;
};

function getWeekStart(date: Date): string {
  const monday = new Date(date);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return monday.toISOString().slice(0, 10);
}

/**
 * Rebuild derived metrics from persisted completion records. Recalculation is
 * intentional: a student may resubmit an assignment, so incrementing would
 * count the same activity twice.
 */
export async function syncStudentActivityMetrics(studentId: string): Promise<void> {
  const [sessions, submissions] = await Promise.all([
    db.practiceSession.findMany({
      where: { studentId },
      select: { totalQuestions: true, correctCount: true, startedAt: true },
    }),
    db.submission.findMany({
      where: {
        studentId,
        status: { in: ['submitted', 'graded'] },
        submittedAt: { not: null },
        score: { not: null },
      },
      select: {
        score: true,
        submittedAt: true,
        assignment: { select: { questionCount: true } },
      },
    }),
  ]);

  const activities: LearningActivity[] = [
    ...sessions.map(session => ({
      totalQuestions: session.totalQuestions,
      correctCount: session.correctCount,
      completedAt: session.startedAt,
    })),
    ...submissions.map(submission => {
      const totalQuestions = submission.assignment.questionCount;
      return {
        totalQuestions,
        correctCount: Math.round((submission.score! / 100) * totalQuestions),
        completedAt: submission.submittedAt!,
      };
    }),
  ];

  const totalQuestions = activities.reduce((sum, activity) => sum + activity.totalQuestions, 0);
  const correctCount = activities.reduce((sum, activity) => sum + activity.correctCount, 0);
  const overallAccuracy = totalQuestions > 0
    ? Math.round((correctCount / totalQuestions) * 100)
    : 0;

  await db.user.update({ where: { id: studentId }, data: { overallAccuracy } });

  const now = new Date();
  const weekStart = getWeekStart(now);
  const weekActivities = activities.filter(activity => getWeekStart(activity.completedAt) === weekStart);
  const weekTotal = weekActivities.reduce((sum, activity) => sum + activity.totalQuestions, 0);
  const weekCorrect = weekActivities.reduce((sum, activity) => sum + activity.correctCount, 0);

  await db.weeklySnapshot.upsert({
    where: { userId_weekStart: { userId: studentId, weekStart } },
    create: {
      userId: studentId,
      weekStart,
      totalQuestions: weekTotal,
      correctCount: weekCorrect,
      accuracy: weekTotal > 0 ? Math.round((weekCorrect / weekTotal) * 100) : 0,
      sessionsCount: weekActivities.length,
      xpGained: 0,
      streakDays: 0,
      wordsLearned: 0,
    },
    update: {
      totalQuestions: weekTotal,
      correctCount: weekCorrect,
      accuracy: weekTotal > 0 ? Math.round((weekCorrect / weekTotal) * 100) : 0,
      sessionsCount: weekActivities.length,
    },
  });
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
    '@/modules/student-mastery/services/student-mastery-service'
  );

  await updateAfterExercise({
    studentId: params.studentId,
    skill: skill as 'grammar' | 'vocabulary' | 'reading' | 'writing' | 'listening' | 'speaking',
    subSkill: params.subSkill,
    totalQuestions: params.totalQuestions,
    correctCount: params.correctCount,
  });
}