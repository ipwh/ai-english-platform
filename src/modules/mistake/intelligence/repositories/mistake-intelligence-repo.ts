// Sprint 32: Mistake Intelligence Repository
import { db } from '@/shared/db/db';

/** Aggregate mistakes into StudentMistakeSummary for a student */
export async function aggregateMistakes(studentId: string) {
  const mistakes = await db.mistake.findMany({
    where: { studentId },
    select: { mistakeType: true, createdAt: true },
  });

  // Import dynamically to avoid circular deps in tests
  const { extractGrammarPoint } = await import('@/modules/mistake/db/services/mistake-tracker');
  const { classifySeverity } = await import('@/modules/mistake/db/services/mistake-tracker');
  const { calculateTrend } = await import('../services/mistake-intelligence-formula');

  // Group by grammar category
  const grouped = new Map<string, { count: number; lastSeen: Date; weeklyCounts: Map<string, number> }>();
  for (const m of mistakes) {
    const cat = extractGrammarPoint(m.mistakeType);
    const existing = grouped.get(cat);
    const week = getWeekKey(m.createdAt);
    if (existing) {
      existing.count++;
      if (m.createdAt > existing.lastSeen) existing.lastSeen = m.createdAt;
      existing.weeklyCounts.set(week, (existing.weeklyCounts.get(week) ?? 0) + 1);
    } else {
      const wc = new Map<string, number>();
      wc.set(week, 1);
      grouped.set(cat, { count: 1, lastSeen: m.createdAt, weeklyCounts: wc });
    }
  }

  // Upsert summaries
  const results = [];
  for (const [cat, data] of grouped) {
    const severity = classifySeverity(cat as Parameters<typeof classifySeverity>[0]);
    const weeks = getLast4Weeks();
    const weeklyCounts = weeks.map(w => data.weeklyCounts.get(w) ?? 0);
    const trend = calculateTrend({ category: cat, weeklyCounts });

    const summary = await db.studentMistakeSummary.upsert({
      where: { studentId_grammarCategory: { studentId, grammarCategory: cat } },
      create: {
        studentId,
        grammarCategory: cat,
        mistakeCount: data.count,
        lastSeen: data.lastSeen,
        severity,
        mastered: false,
        trend,
      },
      update: {
        mistakeCount: data.count,
        lastSeen: data.lastSeen,
        severity,
        trend,
      },
    });
    results.push(summary);
  }
  return results;
}

/** Get top weaknesses for a student, ordered by mistake count descending */
export async function getTopWeaknesses(studentId: string, limit = 10) {
  return db.studentMistakeSummary.findMany({
    where: { studentId, mastered: false },
    orderBy: { mistakeCount: 'desc' },
    take: limit,
  });
}

/** Get recurring mistakes: categories appearing repeatedly over time */
export async function getRecurringMistakes(studentId: string, minOccurrences = 3) {
  return db.studentMistakeSummary.findMany({
    where: { studentId, mistakeCount: { gte: minOccurrences }, mastered: false },
    orderBy: { mistakeCount: 'desc' },
  });
}

/** Get all summaries for a student */
export async function getStudentSummaries(studentId: string) {
  return db.studentMistakeSummary.findMany({
    where: { studentId },
    orderBy: { mistakeCount: 'desc' },
  });
}

// ---- helpers ----

function getWeekKey(date: Date): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay()); // Monday
  return d.toISOString().slice(0, 10);
}

function getLast4Weeks(): string[] {
  const weeks: string[] = [];
  const now = new Date();
  for (let i = 4; i >= 1; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i * 7);
    weeks.push(getWeekKey(d));
  }
  return weeks;
}
