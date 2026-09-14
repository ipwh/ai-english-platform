-- ============================================
-- 2026-09-14: Mistake skill identity
--
-- 錯題的可複習單位是「技能／題型」，不是該條題目本身。
-- comprehension / listening 錯題依附在一篇 passage 上，不可能重考同一題；
-- 沒有技能欄位就無法聚合弱項，也無法生成同題型新題。
--
-- 全部欄位可為 NULL（向後兼容；歷史列維持 NULL = 未分類）。
-- 不回填：歷史列沒有可信來源可還原技能，寧可留空，不憑空推測。
-- ============================================

ALTER TABLE "Mistake" ADD COLUMN "languageSkill" TEXT;
ALTER TABLE "Mistake" ADD COLUMN "grammarItem" TEXT;
ALTER TABLE "Mistake" ADD COLUMN "questionType" TEXT;
ALTER TABLE "Mistake" ADD COLUMN "skillSource" TEXT;

-- 弱項聚合以 (studentId, languageSkill, grammarItem, questionType) 分組
CREATE INDEX "Mistake_studentId_languageSkill_idx" ON "Mistake"("studentId", "languageSkill");
CREATE INDEX "Mistake_studentId_grammarItem_idx" ON "Mistake"("studentId", "grammarItem");
