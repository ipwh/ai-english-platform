// ============================================
// 學年轉換腳本 — 將資料庫中的學年更新為新學年
//
// 用法：
//   npx tsx scripts/set-academic-year.ts 2026-2027          （dry-run 預覽）
//   npx tsx scripts/set-academic-year.ts 2026-2027 --apply  （正式寫入）
//
// 功能：
//   1. UPDATE "Class".academicYear   （班級學年）
//   2. UPDATE "User".academicYear    （學生學年）
//   3. ALTER TABLE "Class" 的 academicYear 欄位預設值
//
// DATABASE_URL 來源：環境變數優先，否則自動讀取 cloud-run-env.yaml
// ============================================

import { Pool } from 'pg';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const OLD_YEAR = '2025-2026';

function readEnvValue(path: string, key: string): string | null {
  try {
    const content = readFileSync(path, 'utf8').replace(/^\uFEFF/, '');
    // 支援 KEY="value"（yaml）與 KEY=value（dotenv）
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
  const args = process.argv.slice(2);
  const newYear = args.find((a) => /^\d{4}-\d{4}$/.test(a)) || '2026-2027';
  const apply = args.includes('--apply');
  const dbUrl = getDbUrl();

  const pool = new Pool({ connectionString: dbUrl, max: 2 });

  try {
    const beforeClass = await pool.query(
      `SELECT "academicYear", COUNT(*)::int AS n FROM "Class" GROUP BY "academicYear" ORDER BY "academicYear" NULLS FIRST`,
    );
    const beforeUser = await pool.query(
      `SELECT "academicYear", COUNT(*)::int AS n FROM "User" GROUP BY "academicYear" ORDER BY "academicYear" NULLS FIRST`,
    );

    console.log(`\n目標學年：${newYear}${apply ? '（正式寫入）' : '（dry-run 預覽）'}\n`);
    console.log('📊 Class.academicYear 現況：');
    for (const r of beforeClass.rows) console.log(`   ${r.academicYear ?? '(null)'}: ${r.n}`);
    console.log('\n📊 User.academicYear 現況：');
    for (const r of beforeUser.rows) console.log(`   ${r.academicYear ?? '(null)'}: ${r.n}`);

    const classToUpdate = Number(beforeClass.rows.find((r: { academicYear: string | null }) => r.academicYear === OLD_YEAR)?.n ?? 0);
    const userToUpdate = Number(beforeUser.rows.find((r: { academicYear: string | null }) => r.academicYear === OLD_YEAR)?.n ?? 0);

    console.log(`\n將更新：Class ${classToUpdate} 筆、User ${userToUpdate} 筆（${OLD_YEAR} → ${newYear}）`);
    console.log(`並把 Class.academicYear 資料庫預設值改為 ${newYear}`);

    if (!apply) {
      console.log('\n（未加 --apply，未寫入任何資料）');
      return;
    }

    if (classToUpdate > 0) {
      await pool.query(`UPDATE "Class" SET "academicYear" = $1 WHERE "academicYear" = $2`, [newYear, OLD_YEAR]);
    }
    if (userToUpdate > 0) {
      await pool.query(`UPDATE "User" SET "academicYear" = $1 WHERE "academicYear" = $2`, [newYear, OLD_YEAR]);
    }
    // newYear 已由 regex 驗證，安全內嵌
    await pool.query(`ALTER TABLE "Class" ALTER COLUMN "academicYear" SET DEFAULT '${newYear}'`);

    const afterClass = await pool.query(
      `SELECT "academicYear", COUNT(*)::int AS n FROM "Class" GROUP BY "academicYear" ORDER BY "academicYear" NULLS FIRST`,
    );
    console.log('\n✅ 完成。Class.academicYear 更新後：');
    for (const r of afterClass.rows) console.log(`   ${r.academicYear ?? '(null)'}: ${r.n}`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('❌', err);
  process.exit(1);
});
