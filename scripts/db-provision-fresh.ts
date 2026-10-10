// ============================================
// 全新資料庫佈建（Fresh-Database Provisioning）
// ============================================
// 2026-10-09（Sprint 135，P0 遷移修復）
//
// 問題（本機實測，HEAD 46707151，空資料庫）：
//   Applying migration `20260719_add_student_mastery`
//   Applying migration `20260719_add_student_mistake_summary`
//   Applying migration `20260719_json_fields_migration`
//   Error: ERROR: current transaction is aborted ...（exit 1）
//   第 3 個遷移假設 `User."badgeIds"` / `User."subjects"` 已存在（`DO $$ RAISE
//   EXCEPTION $$`），但前兩個遷移只建立 StudentMastery / StudentMistakeSummary
//   ⇒ 遷移鏈**無法從零重放**。影響：災難復原／任何新環境。生產（只有待套用遷移）
//   與 CI（`prisma db push`）不受影響。
//
// 修復策略（符合 mandate：**不重寫已套用遷移、不破壞生產歷史**）：
//   1. `prisma/baseline/schema-baseline.sql`：由 `schema.prisma` 產生的**最終結構**
//      （重新產生：`npm run db:baseline:generate`；Prisma 7 的旗標是
//      `--to-schema`，`--to-schema-datamodel` 已移除）。
//   2. 本腳本**只**接受完全空白的資料庫（判定 owner：
//      `src/shared/db/fresh-provision-preflight.ts`）：
//        確保 vector extension → 套用基線 → 對每個遷移
//        `prisma migrate resolve --applied`（補記歷史，不執行破壞性 SQL）
//      → `migrate deploy` 必須是 no-op → `migrate diff --exit-code` 必須為 0。
//   3. 已有 `_prisma_migrations` 的資料庫一律**拒絕**（exit 3）——既有歷史
//      永不觸碰；因此對生產環境執行本腳本永遠無效（安全）。
//
// 用法：
//   npx tsx scripts/db-provision-fresh.ts                       （dry-run：只回報可否佈建）
//   npx tsx scripts/db-provision-fresh.ts --apply               （佈建空白的目標庫）
//   npx tsx scripts/db-provision-fresh.ts --verify-only         （重跑驗證：deploy no-op ＋ 零漂移）
//   npx tsx scripts/db-provision-fresh.ts --url=postgresql://…  （指定目標；預設 DATABASE_URL／.env.local）
//
// 退出碼：0＝成功（含 dry-run 通過）／1＝驗證失敗／2＝使用或連線錯誤／
//         3＝拒絕佈建（資料庫非空白）
//
// DATABASE_URL 取得：`--url` > 環境變數 > `.env.local`／`.env`（`scripts/lib/db-env.ts`）。
// 連線字串一律**遮蔽密碼**後才輸出。
// ============================================

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Pool } from 'pg';
import { argValue, getDbUrl } from './lib/db-env';
import {
  FRESH_PROVISION_REFUSED_EXIT_CODE,
  evaluateFreshProvisionPreflight,
  evaluateMigrationHistory,
} from '@/shared/db/fresh-provision-preflight';

const EXIT_OK = 0;
const EXIT_VERIFY_FAILED = 1;
const EXIT_USAGE_ERROR = 2;

const BASELINE_PATH = resolve(process.cwd(), 'prisma/baseline/schema-baseline.sql');
const MIGRATIONS_DIR = resolve(process.cwd(), 'prisma/migrations');

/** extension 擁有的表不算「既有資料表」（例如 vector 的型別物件）。 */
const PROBE_HISTORY_SQL = `SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS present`;

const PROBE_TABLES_SQL = `
  SELECT c.relname AS name
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
    AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.deptype = 'e')
  ORDER BY c.relname`;

function redact(url: string): string {
  return url.replace(/:\/\/([^:]+):[^@]+@/, '://$1:***@');
}

function runPrisma(
  args: string[],
  url: string
): { exitCode: number; output: string } {
  try {
    const output = execFileSync('npx', ['prisma', ...args], {
      encoding: 'utf8',
      env: { ...process.env, DATABASE_URL: url, DIRECT_DATABASE_URL: url },
      // Windows 的 npx 是 npx.cmd，需要 shell；參數皆為本檔硬編碼的遷移名稱／旗標。
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { exitCode: 0, output };
  } catch (error) {
    const failure = error as { status?: number; stdout?: string; stderr?: string };
    return {
      exitCode: typeof failure.status === 'number' ? failure.status : 1,
      output: `${failure.stdout ?? ''}${failure.stderr ?? ''}`,
    };
  }
}

function listMigrations(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter(name => {
      const full = join(MIGRATIONS_DIR, name);
      return statSync(full).isDirectory() && existsSync(join(full, 'migration.sql'));
    })
    .sort();
}

/** 步驟 5：`migrate deploy` 必須 no-op、`migrate diff` 必須零漂移。 */
function verifyDeployed(url: string): boolean {
  const deploy = runPrisma(['migrate', 'deploy'], url);
  const applied = /Applying migration/.test(deploy.output);
  console.log(`  · migrate deploy      : exit ${deploy.exitCode}${applied ? '（仍套用遷移 ⇒ 失敗）' : '（無待套用遷移）'}`);
  if (deploy.exitCode !== EXIT_OK || applied) {
    console.error(deploy.output.trim().split('\n').slice(-6).join('\n'));
    return false;
  }

  const diff = runPrisma(
    ['migrate', 'diff', '--from-config-datasource', '--to-schema', 'prisma/schema.prisma', '--exit-code'],
    url
  );
  console.log(`  · migrate diff        : exit ${diff.exitCode}（0＝零漂移，2＝有差異）`);
  if (diff.exitCode !== EXIT_OK) {
    console.error(diff.output.trim().split('\n').slice(-12).join('\n'));
    return false;
  }

  return true;
}

async function main(): Promise<number> {
  const apply = process.argv.includes('--apply');
  const verifyOnly = process.argv.includes('--verify-only');
  const url = argValue('--url') ?? process.env.DATABASE_URL ?? getDbUrl();

  console.log('=== 全新資料庫佈建（Fresh-Database Provisioning）===');
  console.log(`目標：${redact(url)}`);
  console.log(`模式：${verifyOnly ? '--verify-only（重跑驗證，不寫入）' : apply ? '--apply（會寫入）' : 'dry-run（只判定，不寫入）'}`);

  if (verifyOnly) {
    console.log('步驟：驗證既有資料庫（migrate deploy no-op ＋ 零漂移）');
    return verifyDeployed(url) ? EXIT_OK : EXIT_VERIFY_FAILED;
  }

  if (!existsSync(BASELINE_PATH)) {
    console.error(`找不到基線：${BASELINE_PATH}（請先執行 npm run db:baseline:generate）`);
    return EXIT_USAGE_ERROR;
  }

  const baselineSql = readFileSync(BASELINE_PATH, 'utf8');
  const migrations = listMigrations();

  const pool = new Pool({ connectionString: url, max: 1 });
  let decisionAllowed = false;
  let tablesBefore: string[] = [];
  try {
    const probeHistory = await pool.query<{ present: boolean }>(PROBE_HISTORY_SQL);
    const probeTables = await pool.query<{ name: string }>(PROBE_TABLES_SQL);
    tablesBefore = probeTables.rows.map(row => row.name);

    const decision = evaluateFreshProvisionPreflight({
      hasMigrationHistory: probeHistory.rows[0]?.present === true,
      existingTables: tablesBefore,
    });

    console.log(`\n前置判定：${decision.code} — ${decision.reason}`);
    if (!decision.allowed) {
      console.error(
        `\n拒絕佈建（exit ${FRESH_PROVISION_REFUSED_EXIT_CODE}）：既有資料庫永不被本腳本修改。` +
          '\n若要驗證既有資料庫的遷移狀態，請用 --verify-only。'
      );
      return FRESH_PROVISION_REFUSED_EXIT_CODE;
    }
    decisionAllowed = true;

    console.log(`\n佈建計畫：`);
    console.log(`  1. CREATE EXTENSION IF NOT EXISTS vector（基線含 vector(1536) 欄位）`);
    console.log(`  2. 套用基線 ${BASELINE_PATH}（${baselineSql.length} 位元組）`);
    console.log(`  3. 補記 ${migrations.length} 筆遷移歷史（prisma migrate resolve --applied）`);
    console.log(`  4. 驗證：migrate deploy no-op ＋ migrate diff 零漂移`);

    if (!apply) {
      console.log('\ndry-run 結束：目標資料庫**未被修改**。加上 --apply 才會寫入。');
      return EXIT_OK;
    }

    console.log('\n[1/4] 確保 vector extension …');
    await pool.query('CREATE EXTENSION IF NOT EXISTS vector');

    console.log('[2/4] 套用基線 …');
    await pool.query(baselineSql);
    const afterBaseline = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind IN ('r','p')
          AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.deptype = 'e')`
    );
    console.log(`      基線建立 ${afterBaseline.rows[0]?.count ?? '?'} 張表`);

    console.log(`[3/4] 補記 ${migrations.length} 筆遷移歷史 …`);
    for (const name of migrations) {
      const resolvedResult = runPrisma(['migrate', 'resolve', '--applied', name], url);
      if (resolvedResult.exitCode !== EXIT_OK) {
        console.error(`      ✗ ${name}`);
        console.error(resolvedResult.output.trim().split('\n').slice(-6).join('\n'));
        return EXIT_VERIFY_FAILED;
      }
      console.log(`      ✓ ${name}`);
    }

    // 後置條件：歷史必須恰好等於本倉庫的遷移集合（不得靜默多記／少記／rolled_back）。
    const historyRows = await pool.query<{
      migration_name: string;
      finished: boolean;
      rolled_back: boolean;
    }>(
      `SELECT migration_name,
              finished_at IS NOT NULL     AS finished,
              rolled_back_at IS NOT NULL  AS rolled_back
         FROM _prisma_migrations`
    );
    const historyCheck = evaluateMigrationHistory(
      historyRows.rows.map(row => ({
        migrationName: row.migration_name,
        finished: row.finished,
        rolledBack: row.rolled_back,
      })),
      migrations
    );
    if (!historyCheck.ok) {
      console.error('      ✗ 遷移歷史驗證失敗：');
      for (const problem of historyCheck.problems) console.error(`        · ${problem}`);
      return EXIT_VERIFY_FAILED;
    }
    console.log(`      ✓ 遷移歷史一致（${migrations.length} 筆：全數 finished、無 rolled_back、無多餘列）`);

    console.log('[4/4] 驗證 …');
    if (!verifyDeployed(url)) return EXIT_VERIFY_FAILED;

    console.log('\n佈建完成：空資料庫已可通過 `prisma migrate deploy`（no-op）與零漂移檢查。');
    return EXIT_OK;
  } finally {
    await pool.end();
    if (!decisionAllowed && tablesBefore.length > 0) {
      console.log(`（未修改任何資料；目標原有 ${tablesBefore.length} 張表）`);
    }
  }
}

main()
  .then(code => {
    process.exitCode = code;
  })
  .catch(error => {
    console.error('佈建失敗：', error instanceof Error ? error.message : error);
    process.exitCode = EXIT_USAGE_ERROR;
  });
