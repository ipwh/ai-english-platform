// ============================================
// 全新資料庫佈建的前置判定（Fresh-Provision Preflight）
// ============================================
// 2026-10-09（Sprint 135，P0 遷移修復）
//
// 背景：`prisma migrate deploy` 對「空資料庫」必然失敗 —— 第 3 個遷移
// `20260719_json_fields_migration` 假設 `User."badgeIds"` / `User."subjects"` 已存在
// （`DO $$ ... RAISE EXCEPTION ... $$`），但前兩個遷移只建立
// `StudentMastery` / `StudentMistakeSummary`。本機實測（空庫）：第 1、2 個遷移成功，
// 第 3 個失敗（`current transaction is aborted`）。影響僅「全新資料庫」
// （災難復原／新環境）；生產（只有待套用遷移）與 CI（`prisma db push`）不受影響。
//
// 本模組是「這個資料庫可不可以走基線佈建」的**唯一判定 owner**（純函式，無 IO）：
//   - 已有遷移歷史（`_prisma_migrations`，不論是否全部成功）⇒ **拒絕**：
//     歷史不可被基線覆蓋（生產／既有環境永不受本路徑影響）。
//   - 已有任何使用者資料表 ⇒ **拒絕**：不接受「半成品」資料庫。
//   - 完全空白 ⇒ 允許：套用 `prisma/baseline/schema-baseline.sql`，再以
//     `prisma migrate resolve --applied` 逐筆補記歷史（**不重寫任何已套用遷移**）。
//
// 呼叫端：`scripts/db-provision-fresh.ts`（dry-run 預設，`--apply` 才寫入）。
// ============================================

/** 佈建被拒時 CLI 的退出碼（與 1＝驗證失敗、2＝使用／連線錯誤區分）。 */
export const FRESH_PROVISION_REFUSED_EXIT_CODE = 3;

export type FreshProvisionPreflightCode =
  | 'EMPTY_DATABASE'
  | 'HAS_MIGRATION_HISTORY'
  | 'HAS_EXISTING_TABLES';

export interface FreshProvisionProbe {
  /** `public._prisma_migrations` 是否存在（不論內容為成功或失敗列）。 */
  hasMigrationHistory: boolean;
  /** `public` 下的使用者資料表（已排除 extension 擁有的表）；排序不重要。 */
  existingTables: readonly string[];
}

export interface FreshProvisionDecision {
  allowed: boolean;
  code: FreshProvisionPreflightCode;
  /** 人類可讀理由（拒絕時務必具體：列出前幾張表）。 */
  reason: string;
}

const LISTED_TABLES = 5;

export function evaluateFreshProvisionPreflight(
  probe: FreshProvisionProbe
): FreshProvisionDecision {
  if (probe.hasMigrationHistory) {
    return {
      allowed: false,
      code: 'HAS_MIGRATION_HISTORY',
      reason:
        '資料庫已有 _prisma_migrations 歷史（可能來自生產／既有環境）——' +
        '基線佈建只允許套用於完全空白的資料庫，既有歷史永不觸碰。',
    };
  }

  if (probe.existingTables.length > 0) {
    const shown = [...probe.existingTables].sort().slice(0, LISTED_TABLES);
    const suffix =
      probe.existingTables.length > shown.length
        ? ` …（共 ${probe.existingTables.length} 張）`
        : '';
    return {
      allowed: false,
      code: 'HAS_EXISTING_TABLES',
      reason:
        `資料庫並非空白，已存在使用者資料表：${shown.join(', ')}${suffix}——` +
        '拒絕佈建（不接受半成品資料庫）。',
    };
  }

  return {
    allowed: true,
    code: 'EMPTY_DATABASE',
    reason: '資料庫完全空白（無遷移歷史、無使用者資料表）——可安全走基線佈建。',
  };
}

// ============================================
// 佈建後置條件：歷史必須「恰好等於」本倉庫的遷移集合
// ============================================
// 2026-10-10（Sprint 136）：`migrate resolve --applied` 是逐筆外部命令，
// 若任何一筆靜默失敗、被標記 rolled_back、或補進了不屬於本倉庫的列，
// 後續 `migrate deploy` 仍可能看似正常。本判定把「歷史一致」變成可測試的斷言，
// 而不是靠人工讀取當下的輸出。

export interface AppliedMigrationRecord {
  migrationName: string;
  /** `finished_at IS NOT NULL` */
  finished: boolean;
  /** `rolled_back_at IS NOT NULL` */
  rolledBack: boolean;
}

export interface MigrationHistoryCheck {
  ok: boolean;
  problems: string[];
}

export function evaluateMigrationHistory(
  records: readonly AppliedMigrationRecord[],
  expectedNames: readonly string[]
): MigrationHistoryCheck {
  const problems: string[] = [];
  const seen = new Set(records.map(record => record.migrationName));

  for (const name of expectedNames) {
    if (!seen.has(name)) {
      problems.push(`歷史缺少遷移列：${name}`);
    }
  }

  const expected = new Set(expectedNames);
  for (const record of records) {
    if (!expected.has(record.migrationName)) {
      problems.push(
        `歷史含未知遷移列：${record.migrationName}（${
          record.rolledBack ? 'rolled_back' : record.finished ? 'applied' : 'unfinished'
        }）`
      );
    } else if (record.rolledBack) {
      problems.push(`遷移被標記為 rolled_back：${record.migrationName}`);
    } else if (!record.finished) {
      problems.push(`遷移未完成（unfinished）：${record.migrationName}`);
    }
  }

  if (records.length !== expectedNames.length) {
    problems.push(`歷史列數不符：實際 ${records.length} 筆、預期 ${expectedNames.length} 筆`);
  }

  return { ok: problems.length === 0, problems };
}
