// Sprint 32: Mistake Intelligence Repository
import { db } from '@/shared/db/db';
import {
  buildMistakeSkillBreakdown,
  mistakeBucketKey,
} from '../services/mistake-skill-breakdown';

/** 單一學生的弱項桶上限 — 保證不遺漏任何現存弱項 */
const MAX_BUCKETS = 50;

const MISTAKE_CATEGORIES = new Set([
  'grammar', 'vocabulary', 'comprehension', 'careless', 'time-management', 'chinglish',
]);

/**
 * Aggregate mistakes into StudentMistakeSummary for a student.
 *
 * 2026-09-14: 改以「技能／題型」分桶（與錯題頁共用 buildMistakeSkillBreakdown —
 * 單一分桶 owner）。舊版把 `mistakeType`（一個分類字串）當成題目文字丢進
 * `extractGrammarPoint()` 的正則 → 幾乎所有錯題都落入 `general`，
 * 弱項摘要因此失去分辨力。
 *
 * grammarCategory 現在的值形如 `reading:inference` / `grammar:tenses-simple` /
 * `vocabulary`。顯示層用 GRAMMAR_CATEGORY_LABELS → bucketKeyLabelZh 解析中文標籤。
 */
export async function aggregateMistakes(studentId: string) {
  const mistakes = await db.mistake.findMany({
    where: { studentId },
    select: {
      mistakeType: true,
      createdAt: true,
      reviewed: true,
      languageSkill: true,
      grammarItem: true,
      questionType: true,
    },
  });

  const buckets = buildMistakeSkillBreakdown(mistakes, MAX_BUCKETS);

  // 動態載入以避開 repository → db-layer service 的靜態依賴（模組邊界規則）
  const { classifySeverity } = await import('@/modules/mistake/db/services/mistake-tracker');
  const { calculateTrend } = await import('../services/mistake-intelligence-formula');

  // 每週錯誤次數（趨勢分析）— 以同一 bucket key 聚合
  const weeklyByBucket = new Map<string, Map<string, number>>();
  for (const m of mistakes) {
    const key = mistakeBucketKey(m);
    const week = getWeekKey(m.createdAt);
    const map = weeklyByBucket.get(key) ?? new Map<string, number>();
    map.set(week, (map.get(week) ?? 0) + 1);
    weeklyByBucket.set(key, map);
  }

  const weeks = getLast4Weeks();
  const results = [];
  for (const bucket of buckets) {
    const weekly = weeklyByBucket.get(bucket.key);
    const trend = calculateTrend({
      category: bucket.key,
      weeklyCounts: weeks.map(w => weekly?.get(w) ?? 0),
    });
    const severity = MISTAKE_CATEGORIES.has(bucket.mistakeType)
      ? classifySeverity(bucket.mistakeType as Parameters<typeof classifySeverity>[0])
      : 'major';

    const summary = await db.studentMistakeSummary.upsert({
      where: { studentId_grammarCategory: { studentId, grammarCategory: bucket.key } },
      create: {
        studentId,
        grammarCategory: bucket.key,
        mistakeCount: bucket.count,
        lastSeen: new Date(bucket.lastSeen),
        severity,
        mastered: false,
        trend,
      },
      update: {
        mistakeCount: bucket.count,
        lastSeen: new Date(bucket.lastSeen),
        severity,
        trend,
        // 仍有現存錯題 → 重新成為弱項（mastered 只代表「不再有該類錯題」）
        mastered: false,
      },
    });
    results.push(summary);
  }

  // 已消失的弱項桶 → 標記為 mastered（列被保留，不刪除歷史）
  await db.studentMistakeSummary.updateMany({
    where: {
      studentId,
      mastered: false,
      ...(buckets.length > 0
        ? { grammarCategory: { notIn: buckets.map(b => b.key) } }
        : {}),
    },
    data: { mastered: true },
  });

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
