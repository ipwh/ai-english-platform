# ADR-041: Mistake Skill Attribution & Review Layering

- **Status**: Accepted
- **Date**: 2026-09-14
- **Related**: ADR-035 (adaptive learning layer), ADR-033 (grading fairness), R3.10-D.3 (trusted-state poisoning)

## Context

學生反映「我的錯題」用處不大，因為 comprehension／listening 錯題依附在一篇
passage 上，不可能重複出題再考。審計後發現問題比 UX 更深：

1. **`Mistake` 沒有任何技能欄位** —— 只有 6 類 `mistakeType`。前端一直讀
   `m.grammarItem` / `m.languageSkill`（永遠 `undefined`），因此技能 chip 空白、
   技能篩選永遠 0 結果，而「重做」按鈕產生的空參數被 `practice/page.tsx` 的
   `if (!grammarItem && !languageSkill) return;` 擋掉 —— 按鈕完全無效。
2. **練習頁 POST 錯題時未送 `questionSummary`** → 存為 `''`，而 GET 的
   「依摘要去重」過濾會把空摘要整批隱藏（DB 有 row、介面永遠看不到）。
3. **弱項聚合退化**：`aggregateMistakes()` 把 `mistakeType`（一個分類字串）
   丢進 `extractGrammarPoint()` 的正則（該函式期望題目文字）→ 幾乎所有錯題歸為
   `general`，弱項摘要失去分辨力。
4. **SRS 把每條錯題當 flashcard**：`nextReviewDate` 從不更新（每日同一批卡片），
   篇章題目無法當卡片，而 `SRSReviewFlow` 的逐卡 payload 形狀與 API 期望不符
   → 每次提交都是靜默 400，複習結果從未寫入。

沒有技能歸屬，錯題就只是「一堆題目文字」；有了技能歸屬，錯題才能變成
「我在哪一類題目持續失分」這個可執行的訊號。

## Decision

1. **技能歸屬由伺服器解析，單一 owner**
   `exercise/services/mistake-skill-identity.ts`
   - 權威來源：`ReadingQuestion.dseType` / `GrammarQuestion.grammarItem`
     （伺服器持有的正典題目定義，與評分同一來源）。
   - 客戶端自報值**永不覆蓋**正典解析結果；只有解析不到時（例如即時生成、
     未持久化的聆聽題目）才採用，且必須通過白名單，並以
     `skillSource: 'client-claimed'` 標記來源。
   - 無法解析一律留空並標記 `unresolved`——**不推測技能**。
   - `/api/mistakes` POST 與 `practice-submission-service` 共用同一解析器。

2. **錯題列新增技能欄位**（migration `20260914_mistake_skill_identity`）
   `languageSkill` / `grammarItem` / `questionType` / `skillSource`，
   全部可為 NULL。**歷史列不回填** —— 沒有可信來源可還原技能，寧可留空。

3. **複習單位是「技能／題型」，不是該條題目**
   `mistake/intelligence/services/mistake-skill-breakdown.ts`（純函式）
   以「題型 > 文法項目 > 錯誤類型」分桶，並標示 `replayable`：
   passage-bound 題目為 `false`（可重考的是文法／詞彙類自足題目）。
   分桶結果同時供錯題頁、`aggregateMistakes()` 使用 —— 單一分桶 owner。

4. **篇章題目移出 SRS flashcard 隊列**
   `mistake-repo.listDueMistakesForReview()` 只抽「到期（`nextReviewDate`
   為 null 或已過）且可重考」的錯題；閱讀／聆聽／comprehension 題目不進隊列。
   排除條件以顯式 `OR: [{ languageSkill: null }, { languageSkill: { notIn: [...] } }]`
   表達 —— SQL 的 `NULL NOT IN (...)` 結果是 NULL，用 `NOT { in: [...] }` 會令
   歷史列被靜默排除。

5. **SRS 排程單一 owner**
   `mistake/db/services/mistake-tracker.nextMistakeReviewState()`
   （SM-2、可注入 `now`）由 `PATCH /api/mistakes`（標記已溫習）與
   `POST /api/srs/review`（評分）共用；沒有它 `nextReviewDate` 永不更新，
   每日複習永遠是同一批卡片。

6. **弱項類別 = bucket key，標籤由 resolver 提供**
   `StudentMistakeSummary.grammarCategory` 現為 `reading:inference` /
   `grammar:tenses-simple` / `vocabulary` 等；顯示層用
   `bucketKeyLabelZh()`（與 `mistakeBucketKey()` 對稱）解析中文標籤，
   教師端同步使用。不再出現的弱項桶標記 `mastered`（列保留、不刪歷史），
   弱項再現時重新標記為未掌握。

7. **策略卡是確定性內容，不呼叫 AI**
   `mistake/intelligence/services/mistake-strategy.ts` 提供雙語題型策略卡
   （閱讀 9 種 dseType + 聆聽 3 種 + 文法／詞彙／粗心／時間管理／Chinglish）。
   閱讀標籤重用 reading 模組的 DSE 分類，不重複定義。
   未知題型只回退到「未分類」卡，不冒充特定題型。

## Invariants

1. 客戶端自報技能永不覆蓋正典解析結果。
2. 技能解析失敗不阻止錯題記錄（記錄 fail-open），但技能留空、標記 `unresolved`。
3. passage-bound 錯題（reading／listening／comprehension）不得進入 SRS flashcard 隊列。
4. 錯題記錄永不影響評分、mastery 或 verified accuracy（沿用 R3.10-D.3）。
5. 策略卡與標籤為確定性靜態資料；錯題模組不得 import AI provider／LLM。

## Consequences

- 新錯題具備完整技能／題型；歷史錯題維持 `NULL`，只靠 `mistakeType` 區分篇章題。
- 學生端不再出現無效的「重做」連結：閱讀 → DSE 閱讀卷（涵蓋該題型）、
  聆聽／文法 → 同題型新題、詞彙／語境詞義 → 生詞簿。
- `/api/student/weakness` 的類別值改變（bucket keys）；`getCanonicalDSEWeight()`
  以 `includes()` 查表，`reading:inference` 仍命中 `inference` 權重 0.80，
  無需改動權重表。
- SRS 錯題隊列變小且每日遞減（真正間隔重溫），而非同一批卡片永久重複。
- 測試：`mistake-skill-breakdown`、`mistake-skill-identity`、`mistakes-skill-identity`（API）、
  `mistake-aggregation`、`srs-review-contract`、`mistake-repo-query` 共 67 用例，
  另 `route-security` 增補 2 用例。

## References

- `src/modules/exercise/services/mistake-skill-identity.ts`
- `src/modules/mistake/intelligence/services/mistake-skill-breakdown.ts`
- `src/modules/mistake/intelligence/services/mistake-strategy.ts`
- `src/modules/mistake/db/repositories/mistake-repo.ts`（`listDueMistakesForReview`）
- `src/modules/mistake/db/services/mistake-tracker.ts`（`nextMistakeReviewState`）
- `prisma/migrations/20260914_mistake_skill_identity/`
