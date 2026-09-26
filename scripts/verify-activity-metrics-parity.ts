// ============================================
// 部署閘門：syncActivityMetrics 改寫前後的輸出差異（乾跑，唯讀）
// ============================================
// 步驟 5 把 `syncActivityMetrics` 的全歷史部分改由 SQL 聚合提供。本腳本對
// **每一位學生**同時計算「舊路徑」與「新路徑」的最終產出並逐欄比對：
//   · overallAccuracy（含 null 語意）
//   · 週快照 totalQuestions / correctCount / accuracy / sessionsCount
//
// 舊路徑（改寫前）：collectVerifiedActivities(全歷史逐列) + submissions
// 新路徑（改寫後）：aggregateVerifiedTotalsForStudent(僅數字) + 本週有界逐列 + submissions
//
// 要求 **0 差異** 才可部署。任何差異即 exit 1。
//
// ⚠️ 本腳本**不呼叫** syncActivityMetrics（那會寫入 DB）—— 兩條路徑都在此
//    就地重算，純讀取。
//
// 用法：npx tsx scripts/verify-activity-metrics-parity.ts
// ============================================

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function readEnvValue(path: string, key: string): string | null {
  try {
    const content = readFileSync(path, 'utf8').replace(/^\uFEFF/, '');
    const match = content.match(new RegExp(`^${key}\\s*[:=]\\s*"?([^"\\r\\n]+?)"?\\s*$`, 'm'));
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

function getDbUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  for (const path of ['.env.local', '.env']) {
    const url = readEnvValue(resolve(process.cwd(), path), 'DATABASE_URL');
    if (url) return url;
  }
  throw new Error('找不到 DATABASE_URL（請設定環境變數，或確認 .env.local 存在）');
}

interface Metrics {
  accuracy: number | null;
  weekStart: string;
  weekTotal: number;
  weekCorrect: number;
  weekAccuracy: number;
  weekSessions: number;
}

async function main() {
  process.env.DATABASE_URL = getDbUrl();

  const { db } = await import('@/shared/db/db');
  const { hkDayKey, hkWeekStartMondayUtc } = await import('@/shared/utils/hk-date');
  const { listAllSessionsWithEvidence } = await import('@/modules/exercise/services/practice-history-service');
  const { collectVerifiedActivities } = await import('@/modules/student/state/StudentStateMutationService');
  const { aggregateVerifiedTotalsForStudent } = await import('@/modules/exercise/repositories/practice-repo');
  const { aggregateVerifiedTotalsForStudents } = await import('@/modules/exercise/services/practice-history-service');

  const gradedSubmissionWhere = {
    status: { in: ['submitted', 'graded'] },
    submittedAt: { not: null },
    score: { not: null },
  } as const;

  const submissionSelect = {
    score: true,
    submittedAt: true,
    assignment: { select: { questionCount: true } },
  } as const;

  // 受測對象：有練習的 ∪ 有已評分 submissions 的 ∪ 少量完全沒有資料的（驗 null 語意）
  const [withSessions, withSubmissions, anyUsers] = await Promise.all([
    db.user.findMany({ where: { sessions: { some: {} } }, select: { id: true } }),
    db.user.findMany({ where: { submissions: { some: gradedSubmissionWhere } }, select: { id: true } }),
    db.user.findMany({ take: 20, select: { id: true } }),
  ]);
  const studentIds = Array.from(new Set([
    ...withSessions.map(u => u.id),
    ...withSubmissions.map(u => u.id),
    ...anyUsers.map(u => u.id),
  ]));

  console.log(`\n=== 部署閘門：syncActivityMetrics 新舊路徑輸出差異（${studentIds.length} 名學生）===`);
  console.log('（乾跑，唯讀；不呼叫會寫入的 syncActivityMetrics）\n');

  const now = new Date();
  const weekKey = (d: Date) => hkDayKey(hkWeekStartMondayUtc(d));
  const weekStart = weekKey(now);

  let compared = 0;
  let withEvidence = 0;
  const diffs: Array<{ studentId: string; field: string; old: unknown; next: unknown }> = [];

  // 步驟 6（admin export 批次投影）的舊路徑期望值：只計練習（不含 submissions）
  const oldBatch = new Map<string, { verifiedTotalQuestions: number; verifiedCorrectCount: number; recordedTotalQuestions: number; recordedCorrectCount: number; sessionsCount: number }>();

  for (const studentId of studentIds) {
    const submissions = await db.submission.findMany({
      where: { studentId, ...gradedSubmissionWhere },
      select: submissionSelect,
    });
    const submissionActs = submissions.map(s => ({
      totalQuestions: s.assignment.questionCount,
      correctCount: Math.round((s.score! / 100) * s.assignment.questionCount),
      completedAt: s.submittedAt!,
    }));

    // ---- 舊路徑：全歷史逐列 ----
    const allSessions = await listAllSessionsWithEvidence(studentId);
    const oldActs = [...(await collectVerifiedActivities(allSessions)), ...submissionActs];
    const oldTotal = oldActs.reduce((n, a) => n + a.totalQuestions, 0);
    const oldCorrect = oldActs.reduce((n, a) => n + a.correctCount, 0);
    const oldWeekActs = oldActs.filter(a => weekKey(a.completedAt) === weekStart);
    const oldWeekTotal = oldWeekActs.reduce((n, a) => n + a.totalQuestions, 0);
    const oldWeekCorrect = oldWeekActs.reduce((n, a) => n + a.correctCount, 0);

    const oldMetrics: Metrics = {
      accuracy: oldTotal > 0 ? Math.round((oldCorrect / oldTotal) * 100) : null,
      weekStart,
      weekTotal: oldWeekTotal,
      weekCorrect: oldWeekCorrect,
      weekAccuracy: oldWeekTotal > 0 ? Math.round((oldWeekCorrect / oldWeekTotal) * 100) : 0,
      weekSessions: oldWeekActs.length,
    };

    // ---- 新路徑：SQL 聚合 + 本週有界 ----
    const totals = await aggregateVerifiedTotalsForStudent(studentId);
    const newSessions = await listAllSessionsWithEvidence(studentId, { since: hkWeekStartMondayUtc(now) });
    const newActs = [...(await collectVerifiedActivities(newSessions)), ...submissionActs];
    const newTotal = totals.verifiedTotalQuestions + submissionActs.reduce((n, a) => n + a.totalQuestions, 0);
    const newCorrect = totals.verifiedCorrectCount + submissionActs.reduce((n, a) => n + a.correctCount, 0);
    const newWeekActs = newActs.filter(a => weekKey(a.completedAt) === weekStart);
    const newWeekTotal = newWeekActs.reduce((n, a) => n + a.totalQuestions, 0);
    const newWeekCorrect = newWeekActs.reduce((n, a) => n + a.correctCount, 0);

    const newMetrics: Metrics = {
      accuracy: newTotal > 0 ? Math.round((newCorrect / newTotal) * 100) : null,
      weekStart,
      weekTotal: newWeekTotal,
      weekCorrect: newWeekCorrect,
      weekAccuracy: newWeekTotal > 0 ? Math.round((newWeekCorrect / newWeekTotal) * 100) : 0,
      weekSessions: newWeekActs.length,
    };

    compared++;
    if (oldMetrics.accuracy !== null || newMetrics.accuracy !== null) withEvidence++;

    // ---- 步驟 6：批次投影舊路徑（逐列聚合，不含 submissions） ----
    // 只有**有場次**的學生才會出現在舊實作的結果 Map（舊碼由回傳的場次列分桶），
    // 故這裡必須同樣只在 allSessions.length > 0 時設定期望值 —— 否則會誤報差異。
    if (allSessions.length > 0) {
      const oldPracticeActs = await collectVerifiedActivities(allSessions);
      oldBatch.set(studentId, {
        verifiedTotalQuestions: oldPracticeActs.reduce((n, a) => n + a.totalQuestions, 0),
        verifiedCorrectCount: oldPracticeActs.reduce((n, a) => n + a.correctCount, 0),
        recordedTotalQuestions: allSessions.reduce((n, s) => n + s.totalQuestions, 0),
        recordedCorrectCount: allSessions.reduce((n, s) => n + s.correctCount, 0),
        sessionsCount: allSessions.length,
      });
    }

    for (const key of Object.keys(oldMetrics) as Array<keyof Metrics>) {
      if (oldMetrics[key] !== newMetrics[key]) {
        diffs.push({ studentId, field: key, old: oldMetrics[key], next: newMetrics[key] });
      }
    }
  }

  console.log(`已比對 ${compared} 名學生（其中 ${withEvidence} 名有可驗證證據）。`);

  // ---- 步驟 6：批次投影（單一 SQL 聚合）新舊比對 ----
  const newBatch = await aggregateVerifiedTotalsForStudents(studentIds);
  for (const [studentId, oldTotals] of oldBatch) {
    const got = newBatch.get(studentId);
    if (!got) {
      diffs.push({ studentId, field: 'batch:missing', old: 'present', next: 'absent' });
      continue;
    }
    const expectedAccuracy = oldTotals.verifiedTotalQuestions > 0
      ? Math.round((oldTotals.verifiedCorrectCount / oldTotals.verifiedTotalQuestions) * 100)
      : null;
    const pairs: Array<[string, unknown, unknown]> = [
      ['batch.verifiedTotalQuestions', oldTotals.verifiedTotalQuestions, got.verifiedTotalQuestions],
      ['batch.verifiedCorrectCount', oldTotals.verifiedCorrectCount, got.verifiedCorrectCount],
      ['batch.recordedTotalQuestions', oldTotals.recordedTotalQuestions, got.recordedTotalQuestions],
      ['batch.recordedCorrectCount', oldTotals.recordedCorrectCount, got.recordedCorrectCount],
      ['batch.sessionsCount', oldTotals.sessionsCount, got.sessionsCount],
      ['batch.accuracy', expectedAccuracy, got.accuracy],
    ];
    for (const [field, oldV, newV] of pairs) {
      if (oldV !== newV) diffs.push({ studentId, field, old: oldV, next: newV });
    }
  }
  // 新路徑不得回傳「沒有場次」的學生（否則匯出會把無資料寫成 0 分列）
  for (const studentId of newBatch.keys()) {
    if (!oldBatch.has(studentId)) {
      diffs.push({ studentId, field: 'batch:unexpected', old: 'absent', next: 'present' });
    }
  }
  console.log(`批次投影已比對 ${oldBatch.size} 名學生（新路徑回傳 ${newBatch.size} 列）。`);

  if (diffs.length === 0) {
    console.log('\n✅ 0 差異：新舊路徑的 overallAccuracy 與週快照產出完全相同 → 部署閘門通過。\n');
  } else {
    console.log(`\n❌ 發現 ${diffs.length} 處差異（不可部署）：\n`);
    for (const d of diffs.slice(0, 40)) {
      console.log(`  ${d.studentId} | ${d.field} | 舊=${String(d.old)} 新=${String(d.next)}`);
    }
    if (diffs.length > 40) console.log(`  …另有 ${diffs.length - 40} 處`);
    console.log('');
    await db.$disconnect();
    process.exit(1);
  }

  await db.$disconnect();
}

main().catch(err => {
  console.error('驗證失敗:', err instanceof Error ? err.message : err);
  process.exit(1);
});
