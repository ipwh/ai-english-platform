-- 2026-09-21 ADR-045：伺服器持有的正典聆聽題目定義 + 刪除休眠聆聽表
--
-- 背景：聆聽練習的答案鍵以往只存在瀏覽器（前端生成 → 前端持有鍵 → 提交時
-- 伺服器只能以前端送來的鍵批改，標記 client-key-deterministic），因此依證據
-- 契約永遠不可驗證：不計入準確率、技能掌握度與錯題本。
--
-- 本 migration 建立持久化題目表，令聆聽可與閱讀同一契約計分：
--   * 交付前寫入 ListeningQuestion（含伺服器答案鍵）
--   * 提交時以 scoringMethod = listening-server-exact-match 評分
--   * 歷史聆聽場次不受影響（永不回填、永不修復）
--
-- 同時刪除兩張休眠表（生產實測 0 列；唯一寫入函式 createListeningSession
-- 全專案零呼叫者），避免與新的題目表混淆。
-- 注意：ListeningAnswer 有指向 ListeningSession 的外鍵，必須先刪子表。

-- CreateTable
CREATE TABLE "ListeningQuestion" (
    "id" TEXT NOT NULL,
    "questionType" TEXT NOT NULL,
    "listeningType" TEXT,
    "questionText" TEXT NOT NULL,
    "choices" TEXT,
    "answer" TEXT NOT NULL,
    "marks" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "dialogue" TEXT,
    "dialogueZh" TEXT,
    "provenance" TEXT NOT NULL DEFAULT 'ai-generated',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ListeningQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ListeningQuestion_createdAt_idx" ON "ListeningQuestion"("createdAt");

-- DropTable（先子表後父表）
DROP TABLE IF EXISTS "ListeningAnswer";
DROP TABLE IF EXISTS "ListeningSession";
