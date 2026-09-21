-- 2026-09-21 稽核修正：`User.overallAccuracy` 移除 `DEFAULT 0`。
--
-- 病根：欄位是 `Float? DEFAULT 0`，而唯一會把它改寫為 null（＝無可驗證證據）
-- 的路徑 `StudentStateMutationService.syncActivityMetrics()` 只在「學生提交練習
-- 或作業」後執行。因此每個新匯入、從未使用平台的學生都停在 0%：
--   * 教師學生名單顯示紅色「0%」（看似答錯全部）
--   * 班平均／全校平均被大量 0 拉低
--   * 匯出報表把 0 當「無資料」（與班平均讀法互相矛盾）
--
-- 本 migration 只移除預設值：此後未提供該欄的寫入一律為 NULL（語意正確）。
-- 既有列由一次性回填腳本校正：
--   npx tsx scripts/backfill-null-overall-accuracy.ts --apply
-- （該腳本會以正典投影 `collectVerifiedActivities()` 重算，只把
--  「無可驗證證據」的 0 改為 NULL，真實 0% 不受影響。）
--
-- 注意：Cloud Run 部署不會自動套用 migration，需人手執行
--       `npx prisma migrate deploy`。

ALTER TABLE "User" ALTER COLUMN "overallAccuracy" DROP DEFAULT;
