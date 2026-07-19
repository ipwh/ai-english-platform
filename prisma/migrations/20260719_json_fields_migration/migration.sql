-- Sprint 40+: Prisma JSON fields migration
-- 將 User 模型中的 String JSON 欄位遷移至原生 Json 型態
-- 這些欄位原本用 String 儲存 JSON 陣列，現在改用原生 PostgreSQL JSONB

-- 注意：此 migration 假設現有資料已經是有效 JSON
-- 如果資料無效，ALTER 會失敗，需要先清理資料

BEGIN;

-- 1. User.badgeIds: String → Json (JSONB)
-- 先新增暫存欄位
ALTER TABLE "User" ADD COLUMN "badgeIds_json" JSONB DEFAULT '[]'::jsonb;

-- 遷移現有資料
UPDATE "User" 
SET "badgeIds_json" = CASE 
  WHEN "badgeIds" IS NOT NULL AND "badgeIds" != '' 
  THEN "badgeIds"::jsonb 
  ELSE '[]'::jsonb 
END;

-- 驗證遷移資料
DO $$
DECLARE
  mismatch_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO mismatch_count FROM "User" 
  WHERE "badgeIds_json" IS NULL;
  
  IF mismatch_count > 0 THEN
    RAISE EXCEPTION '資料遷移失敗：% 筆 User 記錄的 badgeIds_json 為 NULL', mismatch_count;
  END IF;
END $$;

-- 刪除舊欄位，重新命名新欄位
ALTER TABLE "User" DROP COLUMN "badgeIds";
ALTER TABLE "User" RENAME COLUMN "badgeIds_json" TO "badgeIds";

-- 2. User.subjects: String → Json (JSONB)
ALTER TABLE "User" ADD COLUMN "subjects_json" JSONB;

UPDATE "User" 
SET "subjects_json" = CASE 
  WHEN "subjects" IS NOT NULL AND "subjects" != '' 
  THEN "subjects"::jsonb 
  ELSE NULL 
END;

ALTER TABLE "User" DROP COLUMN "subjects";
ALTER TABLE "User" RENAME COLUMN "subjects_json" TO "subjects";

COMMIT;
