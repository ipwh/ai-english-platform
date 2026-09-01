// ============================================
// 解除不在名單中的學生班別（畢業生 / 轉校生）
//
// 用途：學年轉換後，把「不在新名單」的學生從班級中解除，
//       使其不再出現在課堂名單（畢業生/轉校生），
//       但完整保留其學習紀錄（錯題、練習、寫作等）。
//
// 用法：
//   npx tsx scripts/unassign-non-roster.ts            （dry-run 預覽）
//   npx tsx scripts/unassign-non-roster.ts --apply    （正式寫入）
//
// 資料來源：
//   - 名單 email：Google Sheet 公開 CSV 匯出（GOOGLE_SHEETS_CLASS_ROSTER_ID 或 --sheet <id>）
//   - DB：.env.local → .env → cloud-run-env.yaml 的 DATABASE_URL
// ============================================

import { Pool } from 'pg';
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
  throw new Error('找不到 DATABASE_URL');
}

async function fetchRosterEmails(spreadsheetId: string): Promise<string[]> {
  // 使用公開 CSV 匯出端點（Office 檔與原生 Sheet 皆可；連結分享即可，無需 OAuth）
  const exportUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv`;
  const res = await fetch(exportUrl, { redirect: 'follow' });
  if (!res.ok) throw new Error(`無法匯出 Sheet CSV (${res.status})`);
  const csv = await res.text();

  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2) throw new Error('Sheet 沒有資料列');
  const headers = lines[0].split(',').map((h: string) => h.trim().toLowerCase());
  const emailIdx = headers.findIndex((h: string) =>
    h === 'email' || h === '電郵' || h === '電郵地址' || h === 'e-mail'
  );
  if (emailIdx === -1) throw new Error(`找不到 Email 欄位，可用欄位：${headers.join(', ')}`);

  const emails = new Set<string>();
  for (let i = 1; i < lines.length; i++) {
    // 簡易 CSV 剖析（email 欄不含逗號，直接 split 即可）
    const cells = lines[i].split(',');
    const email = (cells[emailIdx] || '').trim().toLowerCase();
    if (email) emails.add(email);
  }
  return [...emails];
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const sheetArgIdx = args.indexOf('--sheet');
  const sheetId = sheetArgIdx >= 0 && args[sheetArgIdx + 1]
    ? args[sheetArgIdx + 1]
    : (readEnvValue(resolve(process.cwd(), '.env.local'), 'GOOGLE_SHEETS_CLASS_ROSTER_ID')
      || readEnvValue(resolve(process.cwd(), 'cloud-run-env.yaml'), 'GOOGLE_SHEETS_CLASS_ROSTER_ID')
      || '1OtUT_xVc7Plzwbjx2EMnSYERGv59PCid');

  console.log(`讀取名單 email（Sheet: ${sheetId}）...`);
  const emails = await fetchRosterEmails(sheetId);
  console.log(`名單共有 ${emails.length} 個 email`);

  const pool = new Pool({ connectionString: getDbUrl(), max: 2 });
  try {
    const before = await pool.query(
      `SELECT COUNT(*)::int AS n FROM "User" WHERE role='student' AND "classId" IS NOT NULL AND email NOT LIKE '%@school.hk' AND "classId" NOT IN (SELECT id FROM "Class" WHERE name = 'Demo')`
    );
    const inRoster = await pool.query(
      `SELECT COUNT(*)::int AS n FROM "User" WHERE role='student' AND "classId" IS NOT NULL AND email NOT LIKE '%@school.hk' AND "classId" NOT IN (SELECT id FROM "Class" WHERE name = 'Demo') AND email = ANY($1::text[])`,
      [emails]
    );
    const toUnassign = before.rows[0].n - inRoster.rows[0].n;

    console.log(`目前有班別的學生（排除 demo）: ${before.rows[0].n}`);
    console.log(`其中在新名單內: ${inRoster.rows[0].n}`);
    console.log(`將解除班別（畢業生/轉校生）: ${toUnassign}${apply ? '（正式寫入）' : '（dry-run）'}`);

    if (!apply) {
      console.log('\n（未加 --apply，未寫入任何資料）');
      return;
    }

    const res = await pool.query(
      `UPDATE "User" SET "classId" = NULL, "classNumber" = NULL
       WHERE role='student'
         AND email NOT LIKE '%@school.hk'
         AND "classId" NOT IN (SELECT id FROM "Class" WHERE name = 'Demo')
         AND email != ALL($1::text[])`,
      [emails]
    );
    console.log(`\n✅ 已解除 ${res.rowCount} 名學生的班別（學習紀錄保留）`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('❌', err);
  process.exit(1);
});
