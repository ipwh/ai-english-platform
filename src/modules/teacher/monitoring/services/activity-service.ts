// Sprint 133: Behavior-based monitoring data access.
// Architecture contract: API routes must not import Prisma/db or repositories
// directly — this service is the single access point for activity signals.
import { db } from '@/shared/db/db';

/**
 * Latest activity timestamp per student = max(last login, last practice).
 * Only students present in the result have activity evidence.
 */
export async function getLastActivityMap(studentIds: string[]): Promise<Map<string, Date>> {
  if (studentIds.length === 0) return new Map();
  const [loginAgg, practiceAgg] = await Promise.all([
    db.loginLog.groupBy({ by: ['userId'], _max: { loginAt: true }, where: { userId: { in: studentIds } } }),
    db.practiceSession.groupBy({ by: ['studentId'], _max: { startedAt: true }, where: { studentId: { in: studentIds } } }),
  ]);
  const map = new Map<string, Date>();
  for (const row of loginAgg) {
    const at = row._max.loginAt;
    if (at) map.set(row.userId, at);
  }
  for (const row of practiceAgg) {
    const at = row._max.startedAt;
    const existing = map.get(row.studentId);
    if (at && (!existing || at.getTime() > existing.getTime())) map.set(row.studentId, at);
  }
  return map;
}

/**
 * Most-practised difficulty per student ("remedial" | "core" | "challenge").
 * Exposes high-accuracy-but-too-easy patterns at a glance.
 */
export async function getDominantDifficultyMap(studentIds: string[]): Promise<Map<string, string>> {
  if (studentIds.length === 0) return new Map();
  const agg = await db.practiceSession.groupBy({
    by: ['studentId', 'difficulty'],
    _count: { _all: true },
    where: { studentId: { in: studentIds } },
  });
  const counts = new Map<string, Map<string, number>>();
  for (const row of agg) {
    if (!counts.has(row.studentId)) counts.set(row.studentId, new Map());
    counts.get(row.studentId)!.set(row.difficulty, row._count._all);
  }
  const result = new Map<string, string>();
  for (const [studentId, diffMap] of counts) {
    if (diffMap.size > 0) {
      result.set(studentId, [...diffMap.entries()].sort((a, b) => b[1] - a[1])[0][0]);
    }
  }
  return result;
}
