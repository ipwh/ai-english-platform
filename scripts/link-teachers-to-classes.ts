// ============================================
// 修復：把全校班級連結到所有教師／管理員（TeacherClass）
//
// 背景（2026-10-08 使用者回報「其他老師登入後看不到學生名單及作答情況」）：
// 生產庫 `TeacherClass` 曾是 **0 列** —— 26 位教師全部沒有任教班級關聯，
// 原因是教師帳號由「首次 Google 登入」自動建立（`src/shared/auth/auth-next.ts`
// 的 signIn callback 只建立 User，不建立班級關聯），而 `/api/import` 與
// `bulkImportTeachers()` 只在「新建教師」時才連結班級（既有教師重匯不入帳），
// 教師自助設定頁的班級清單又取自 `/api/classes`（非管理員只回自己任教的班級）
// ⇒ 教師無法自救。
//
// 影響（全部以 `TeacherClass` 為權威）：
//   · `GET /api/teacher/students`  → `taughtClassIds.length === 0` 直接回空
//   · `GET /api/classes`           → 非管理員回 0 班（出作業／報告匯出班級清單）
//   · `GET /api/teacher/students/[id]`、`resolveTeacherStudentClass()`
//     （`/api/practice/history?includeAnswers=1`）→ 403「不屬於您任教的班級」
//   · 只有 `role = 'admin'` 繞過上述檢查
//
// 語意（依使用者決定，最寬鬆）：**每個班級** 連結到 **所有** 教師與管理員，
// 等同管理員在「班級管理」逐一重新儲存班級（`POST /api/admin/classes`）時
// 的自動連結行為 —— 該路由與本腳本共用 `adminLinkEducators()` 單一實作。
//
// **學校網域政策（2026-10-08）**：只有**校內網域**帳號可以是教師／管理員
// （`@/shared/auth/sign-in-role` 為唯一 owner）。因此：
//   · 連結對象一律經 `adminFindEducators()`（已按網域過濾）；
//   · `--apply` 會同時**清除不合法的既有關聯**（帳號非教師／管理員，或非校內網域
//     —— 例：曾被自動判為教師的校外 Google 帳號），並在 dry-run 先行列出。
//
// 用法：
//   npx tsx scripts/link-teachers-to-classes.ts             （dry-run，只報告）
//   npx tsx scripts/link-teachers-to-classes.ts --apply      （正式寫入）
//   npx tsx scripts/link-teachers-to-classes.ts --class=4A   （只處理指定班級）
//
// 冪等：以 upsert 建立（`TeacherClass @@unique([teacherId, classId])`），
// 已存在的關聯不會重建、重跑不會產生重複列；只補缺少的配對。
// 注意：新班級由 `/api/admin/classes` 建立時會自動連結所有 educators，
// 新教師首次 Google 登入亦會自動連結（`auth-next.ts`）；
// 本腳本用於**補既有缺口**（例：修正前建立、或由 CSV 匯入只指定部分班級的教師）。
// DATABASE_URL 來源：環境變數優先，否則依序讀 .env.local / .env / cloud-run-env.yaml
// ============================================

import { getDbUrl, argValue } from './lib/db-env';
import { isSchoolDomainEmail } from '@/shared/auth/sign-in-role';

async function main() {
  const apply = process.argv.includes('--apply');
  const onlyClass = argValue('--class');
  process.env.DATABASE_URL = getDbUrl(); // 必須在載入應用模組之前設定

  const { db } = await import('@/shared/db/db');
  const { adminGetClasses, adminFindEducators, adminLinkEducators } =
    await import('@/modules/admin/services/admin-operations');

  const allClasses = await adminGetClasses();
  const classes = onlyClass ? allClasses.filter(c => c.name === onlyClass) : allClasses;
  if (onlyClass && classes.length === 0) {
    throw new Error(`找不到班級：${onlyClass}（可用班級：${allClasses.map(c => c.name).join(', ')}）`);
  }

  const educators = await adminFindEducators();
  const existing = await db.teacherClass.findMany({
    where: { classId: { in: classes.map(c => c.id) } },
    select: { teacherId: true, classId: true },
  });
  const existingKeys = new Set(existing.map(r => `${r.classId}:${r.teacherId}`));

  const plan = classes.map(cls => ({
    cls,
    missing: educators.filter(e => !existingKeys.has(`${cls.id}:${e.id}`)),
  }));
  const totalMissing = plan.reduce((sum, p) => sum + p.missing.length, 0);

  console.log(`教師／管理員（校內網域）：${educators.length} 人`);
  console.log(`班級（不含 Demo）：${classes.length} 班${onlyClass ? `（--class=${onlyClass}）` : ''}`);
  console.log(`已存在關聯：${existing.length} 筆；缺少：${totalMissing} 筆`);
  for (const p of plan) {
    const linked = educators.length - p.missing.length;
    console.log(`  ${p.cls.name}: ${linked}/${educators.length}${p.missing.length === 0 ? '（無需處理）' : ` → 待補 ${p.missing.length}`}`);
  }

  // 不合法關聯：帳號已非教師／管理員（例：被降為學生），或非校內網域。
  const allLinks = await db.teacherClass.findMany({
    select: { id: true, class: { select: { name: true } }, teacher: { select: { role: true, email: true } } },
  });
  const invalidLinks = allLinks.filter(link =>
    (link.teacher.role !== 'teacher' && link.teacher.role !== 'admin')
    || !isSchoolDomainEmail(link.teacher.email));
  console.log(`不合法的既有關聯：${invalidLinks.length} 筆${invalidLinks.length > 0 ? '（將於 --apply 時刪除）' : ''}`);
  for (const link of invalidLinks.slice(0, 10)) {
    console.log(`  ${link.class.name} ← ${link.teacher.email}（role=${link.teacher.role}）`);
  }

  if (!apply) {
    console.log('\n（dry-run）要寫入請加 --apply');
    await db.$disconnect();
    return;
  }

  if (invalidLinks.length > 0) {
    const removed = await db.teacherClass.deleteMany({ where: { id: { in: invalidLinks.map(link => link.id) } } });
    console.log(`\n🧹 已刪除 ${removed.count} 筆不合法關聯`);
  }

  let written = 0;
  for (const p of plan) {
    if (p.missing.length === 0) continue;
    written += await adminLinkEducators(p.cls.id, p.missing);
  }
  console.log(`✅ 已建立 ${written} 筆 TeacherClass 關聯`);
  console.log(`   TeacherClass 總數：${await db.teacherClass.count()}`);
  await db.$disconnect();
}

main().catch(err => {
  console.error('❌ 連結失敗：', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
