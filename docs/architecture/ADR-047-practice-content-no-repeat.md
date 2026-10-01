# ADR-047 — Practice Content Must Not Repeat: Cross-Request Dedupe & Content-Fingerprint XP Keys

- **Status**: Accepted
- **Date**: 2026-10-01
- **Relates to**: ADR-042 (Generated Answer Verification), ADR-045 (Server-Owned Listening Store), ADR-046 (Server-Side Evidence Aggregation), 2026-09-28 XP anti-farming policy (`xp-event-policy.ts`)

---

## 1. Context

用戶回報：**相同題目很快再次重複出現，能刷高分**。唯讀 SQL 稽核（DB 端聚合）確認並定位：

| 指標（近 14 日） | 實測 |
|---|---|
| 同一學生同一題目文字重複（最多者） | **57 次**（40 次在 24 小時內、20 次在 2 小時內） |
| 最重複的單一題目 | `what do people in spain do at midnight on new year's eve?` **13 場次** |
| 同一題內容以不同 `questionId` 重複領取 `answerCorrect` XP | **17 組 / 23 次額外發放**（單一內容最多 **7 個不同 id**） |
| 重複題目來源（重複組數） | `ai-generated` 60、`dse-listening` 33、`dse-reading` 23（全數經 `/api/ai/generate-questions`；`/api/reading` 完整試卷流程 0） |
| 同一段聆聽對話跨題重用 | 0（無證據；仍以結構性防線覆蓋） |
| `daily-challenge` 跨日重複（60 日） | 0 |

根因（兩個獨立缺陷疊加）：

1. **生成端跨請求零記憶**：`generateQuestions()` 只對「同一次請求內」去重（`acceptedPromptKeys` / `acceptedContextKeys`）；每次持久化都以 `randomUUID()` 產生新 id → 學生重複生成會再收到幾乎相同的題目。
2. **XP 去重鍵以 id 為準**：`answerCorrect` 的鍵為 `{studentId}:answer:{questionId}` → 同一內容重生成即為新 id ⇒ 再領一次；且 `reviewMistake`／`learnWord`／`masterWord` 的識別碼**無存在性／擁有權檢查**（任意唯一字串即可換 XP）、`answerCorrect` 的任意字串亦無需解析、`POST /api/gamification` 無限流。

## 2. Decision

### 2.1 出題跨請求去重（所有生成入口）

`generateQuestions(input, options)` 新增兩個**呼叫端注入**的近期素材（皆為不可信資料，經 `sanitizeForAI` 處理後只作去重／提示）：

| 素材 | 來源 | 視窗／上限 | 用途 |
|---|---|---|---|
| `recentPrompts` | `PracticeRepo.listRecentQuestionPrompts`（近 14 日答題文字，DB 端 GROUP BY 正規化文字、每題一列） | 14 日、150 列、新至舊 | 題目文字硬性排除 + 提示詞樣本（`AVOID REPETITION`） |
| `recentContexts` | `PracticeRepo.listRecentListeningDialogues`（由 `ListeningQuestion.dialogue` 回推） | 14 日、40 列、截斷 600 字元 | 對話內容硬性排除（換了問題文字仍是重複內容） |

- 素材來源單一 owner：`exercise/services/practice-history-service.ts` 的 `getRecentQuestionPromptsForGeneration`／`getRecentListeningDialoguesForGeneration`。
- 命中（正規化後完全相同）⇒ 生成階段硬性排除；與「同一請求內的重複」**分開計數**，補題提示帶「REPETITION FEEDBACK」具體原因；被排除數量由既有**補題迴圈**補足，交付標準不變。
- **每個** `generateQuestions` 入口都必須傳入：`/api/ai/generate-questions`、`/api/daily-challenge`、`/api/diagnostic/grammar`（並補上 POST 的 SEC-009 擁有權檢查）。
- 素材讀取失敗**不阻斷出題**（少去重提示即可；不得因此令學生無法練習）。

### 2.2 XP 去重鍵改為內容指紋（伺服器解析）

- `exercise/services/question-difficulty-resolution.ts` 的 `resolveAnswerXpIdentity()`：由 `questionId` 解析正典題目（Grammar / Reading / Listening），回傳**難度 ＋ sha256 內容指紋**（題型＋題目文字＋**排序後選項**＋**正確選項文字**）。
  - 指紋對「選項洗牌」與「重新生成的新 id」皆穩定 → 同一內容永遠只發一次 `answerCorrect`。
  - 查無此題 ⇒ 404（任意字串不得當 questionId）；查詢故障 ⇒ 5xx（故障 ≠ 查無此題）。
- `xp-event-policy` 的 answer 事件鍵改用呼叫端提供的 `answerContentKey`；客戶端 metadata 的同名值**永不採用**；未提供時回退 `questionId`（維持伺服器端呼叫語意）。
- `reviewMistake`／`learnWord`／`masterWord`：識別碼必須**屬於該學生**（查無或非本人 ⇒ 404）。
- `POST /api/gamification` 增加端點限流（60 次/分鐘/學生）；`XpTransaction.metadata` 記錄 `contentKey` 供日後以內容聚合審計。

### 2.3 學生端練習歷史（逐日檢視）

- 新 `GET /api/practice/history`：月檢視＝DB 端（每日 × 技能）聚合（`aggregatePracticeSessionsByDayAndSkill`，只回傳聚合列，延伸 ADR-046 的 egress 契約）；日檢視＝單日有界查詢（附正典 `evaluatePracticeEvidence` 投影）。
- 香港月界線工具（`hkMonthKey` / `nextMonthKey` / `previousMonthKey` / `hkMonthStartUtc`）納入 `shared/utils/hk-date.ts`（單一 owner）。
- 「我的進度」以逐日練習歷史（可回看任何月份）取代只顯示 5 筆的「最近練習記錄」。

### 2.4 刻意重複不在排除範圍

錯題 SRS 複習、單字間隔重複、老師指派的同一份作業——這些是教學設計的重複，非缺陷；去重只作用於**生成式練習內容**。

## 3. Consequences

- **正向**：生成式練習不再短期重複；同一內容不再重複發放 XP；識別碼真實性與擁有權有伺服器檢查；練習歷史可回看且符合 egress 契約。
- **殘留風險（誠實記錄）**：
  1. `answerCorrect` 的「是否答對」仍由客戶端在作答當下自報（伺服器評分發生在場次提交時）→ 徹底做法是將答題 XP 改為提交時由伺服器依評分結果發放（後續工作）。
  2. `completeSession` 每場 45 XP 仍可被腳本偽造場次重播（已以限流＋內容指紋降低誘因）。
  3. 閱讀**篇章**未持久化（`ReadingQuestion` 無 passage 欄位）→ 篇章層級去重不可行；`/api/reading` 完整試卷流程在 14 日內 0 重複，暫不變更。
  4. 重度學生（近 14 日 >150 道不同題目）只排除「最近 150 道」＋最近 40 段對話（上限為 egress 控制）。
  5. 內容指紋鍵為新鍵：舊 `answer:<questionId>` 已領過的題目，部署後需「再次答對同一題」才會多領一次 10 XP（一次性、有界）。

## 4. Evidence & Verification

- 唯讀 SQL 稽核（14 日）：重複題目組數／來源分布、重複內容付費組數、對話重用、每日挑戰跨日重複——全部以 DB 端聚合完成（未搬逐列）。
- 真實資料驗證：去重素材查詢（示例學生近 14 日 813 道不同題目 → 取最近 150 列、對話 40 列）；月摘要 SQL 分組 vs TS `hkDayKey()`（166 場、5 日、0 差異）。
- 測試：`question-xp-identity.test.ts`（8）、`xp-event-policy`（+5）、`generate-questions-topup`（+5，含跨請求與對話排除）、`practice-history-service`（+7）、`hk-date`（+3）；全套 3273 pass / 2 skipped。
