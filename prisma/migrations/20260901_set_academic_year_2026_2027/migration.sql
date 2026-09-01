-- ============================================
-- 學年轉換 2025-2026 → 2026-2027
--
-- 1. 更新 Class.academicYear 的資料庫預設值
-- 2. 將既有班級資料的舊學年更新為新學年
-- 3. 將既有學生資料的舊學年更新為新學年
-- ============================================

-- AlterTable: 變更預設值
ALTER TABLE "Class" ALTER COLUMN "academicYear" SET DEFAULT '2026-2027';

-- DataMigration: 班級
UPDATE "Class" SET "academicYear" = '2026-2027' WHERE "academicYear" = '2025-2026';

-- DataMigration: 學生
UPDATE "User" SET "academicYear" = '2026-2027' WHERE "academicYear" = '2025-2026';
