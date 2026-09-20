// ============================================
// 一次性回填：把「無可驗證資料」的 User.overallAccuracy 由 0 改為 null
//
// 背景（2026-09-20 稽核）：`syncActivityMetrics` 舊碼在沒有可驗證證據時寫入 0，
// 令 852 名學生中 837 名顯示「準確率 0%」（其中 22 名有練習但無可驗證答案列），
// 亦令 `/api/admin/export-sheets` 的班平均被 0 拉低。
// 新碼已改為寫 null；本腳本只為「已存在」的舊列做一次性校正。
//
// 用法：
//   npx tsx scripts/backfill-null-overall-accuracy.ts           （dry-run，只報告）
//   npx tsx scripts/backfill-null-overall-accuracy.ts --apply    （正式寫入）
//
// 語意：以正典投影（`collectVerifiedActivities` + 已評分 submissions）重算，
// 與 `syncActivityMetrics` 完全同源；只更新值有差異的學生。
// DATABASE_URL 來源：環境變數優先，否則依序讀 .env.local / .env / cloud-run-env.yaml
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
  for (const path of ['.env.local', '.env', 'cloud-run-env.yaml']) {
    const url = readEnvValue(resolve(process.cwd(), path), 'DATABASE_URL');
    if (url) return url;
  }
  throw new Error('找不到 DATABASE_URL（請設定環境變數，或確認 .env.local / cloud-run-env.yaml 存在）');
}

async function main() {
  const apply = process.argv.includes('--apply');
  process.env.DATABASE_URL = getDbUrl(); // 必須在載入應用模組之前設定

  const { db } = await import('@/shared/db/db');
  const { listAllSessionsWithEvidence } = await import('@/modules/exercise/services/practice-history-service');
  const { collectVerifiedActivities } = await import('@/modules/student/state/StudentStateMutationService');

  const gradedSubmissionWhere = {
    status: { in: ['submitted', 'graded'] },
    submittedAt: { not: null },
    score: { not: null },
  } as const;

  const hasEvidenceSources = {
    OR: [
      { sessions: { some: {} } },
      { submissions: { some: gradedSubmissionWhere } },
    ],
  } as const;

  const [withSources, withoutSources] = await Promise.all([
    db.user.findMany({ where: { role: 'student', ...hasEvidenceSources }, select: { id: true, overallAccuracy: true } }),
    db.user.findMany({ where: { role: 'student', NOT: hasEvidenceSources }, select: { id: true, overallAccuracy: true } }),
  ]);

  let toNull = 0;
  let corrected = 0;
  let unchanged = 0;
  const updates: Array<{ id: string; next: number | null; prev: number | null }> = [];

  // 無任何證據來源 → 正典值必為 null
  for (const s of withoutSources) {
    if (s.overallAccuracy === null) { unchanged++; continue; }
    toNull++;
    updates.push({ id: s.id, prev: s.overallAccuracy, next: null });
  }

  // 有練習／作業 → 以正典投影逐個重算
  for (const s of withSources) {
    const [sessions, submissions] = await Promise.all([
      listAllSessionsWithEvidence(s.id).catch(() => [] as Array<{ startedAt: Date; answers: unknown }>),
      db.submission.findMany({
        where: { studentId: s.id, ...gradedSubmissionWhere },
        select: { score: true, submittedAt: true, assignment: { select: { questionCount: true } } },
      }),
    ]);

    const activities = [
      ...(await collectVerifiedActivities(sessions)),
      ...submissions.map(sub => ({
        totalQuestions: sub.assignment.questionCount,
        correctCount: Math.round(((sub.score ?? 0) / 100) * sub.assignment.questionCount),
        completedAt: sub.submittedAt ?? new Date(),
      })),
    ];
    const total = activities.reduce((sum, a) => sum + a.totalQuestions, 0);
    const correct = activities.reduce((sum, a) => sum + a.correctCount, 0);
    const canonical: number | null = total > 0 ? Math.round((correct / total) * 100) : null;

    if (canonical === s.overallAccuracy) { unchanged++; continue; }
    if (canonical === null) toNull++; else corrected++;
    updates.push({ id: s.id, prev: s.overallAccuracy, next: canonical });
  }

  console.log(`學生總數=${withSources.length + withoutSources.length}（有證據來源 ${withSources.length} / 無 ${withoutSources.length}）`);
  console.log(`未變更=${unchanged}  0 → null=${toNull}  其他校正=${corrected}`);
  console.log('變更樣本（最多 10 筆，id 只顯示前 8 碼）：');
  for (const u of updates.slice(0, 10)) {
    console.log(`  ${u.id.slice(0, 8)}…  ${u.prev} → ${u.next === null ? 'null' : u.next}`);
  }

  if (!apply) {
    console.log('\n（dry-run）要寫入請加 --apply');
    await db.$disconnect();
    return;
  }

  for (const u of updates) {
    await db.user.update({ where: { id: u.id }, data: { overallAccuracy: u.next } });
  }
  console.log(`\n✅ 已寫入 ${updates.length} 筆`);
  await db.$disconnect();
}

main().catch(err => {
  console.error('❌ 回填失敗：', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
