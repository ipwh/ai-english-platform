# ADR-046 — Server-Side Evidence Aggregation (Neon Egress) & Fail-Closed Metric Sync

- **Status**: Accepted
- **Date**: 2026-09-26
- **Relates to**: ADR-044 (Measurable Practice & Honest Empty States), ADR-045 (Server-Owned Listening Store), ADR-041 (Mistake Skill Attribution)

---

## 1. Context

2026-09-25：Neon 通知 public network transfer 已用 **4 GB / 5 GB（80 %）**，而專案資料庫只有 **30.9 MB** —— egress 是練習資料量的約 **130 倍**。當時 Free plan 的失敗模式是**暫停 compute**（全校停用），而非降級。

實測（`npm run db:diagnose:egress`，唯讀）：

| 量測項 | 數值 |
|---|---|
| 資料庫大小 | 30.9 MB（PracticeSession 2.2 MB、PracticeAnswer 4.0 MB） |
| 使用者 / 有練習的學生 | 877 / 82 |
| PracticeSession / PracticeAnswer | 6,781 / 10,109 列（平均每場 1.5 答案列） |
| 全校跑一次全歷史投影 | **3.2 MB** |
| 單一學生一次投影（最大） | **1.3 MB**（該帳號 4,853 場，佔全部場次 72 %） |
| admin 匯出批次投影一次 | **2.4 MB** |

以「已消耗量反推校準係數」得 k ≈ 11.4，即實際 egress 約為「練習場次驅動模型」的 11 倍：**其餘來自同一批資料被反覆重讀**，不是資料量。

### 1.1 根因：全歷史投影被反覆重讀

`getCumulativeSkillTotals()`、`syncActivityMetrics()`、`aggregateVerifiedTotalsForStudents()` 三者都以分頁把**每一列** session + answer 搬進 Node 才自行加總。其中 `syncActivityMetrics` **每次練習提交**都執行（`practice-submission-service.ts`），而 `getCumulativeSkillTotals` 每次練習頁載入都執行。

## 2. Decision

### 2.1 累積投影改由伺服器端 SQL 聚合提供（只回傳數字）

新增 `practice-repo.aggregateVerifiedTotalsForStudent()` / `...BySkillForStudent()` / `...ForStudentsByIds()`，只回傳**每名學生（或每個技能）一列**的數字：

| 投影 | 之前 | 之後 |
|---|---|---|
| 全校逐學生 | 3.2 MB | **55 KB**（58×） |
| admin 匯出批次 | 2.4 MB | **82 列** |
| 單場提交觸發的全歷史掃描 | 1.3 MB（重帳號） | 單列 |

回傳量由 O(場次+答案列) 變為 **O(學生+技能)** —— 不再隨練習量成長。

### 2.2 規則單一定義（SQL 與 TS 永不分歧）

新增 leaf module `exercise/services/practice-evidence-rules.ts`，`PRACTICE_EVIDENCE_RULES` 同時供：

- TS 判定（`evaluatePracticeEvidence()` / `hasServerKeyAuthority()`）
- SQL predicate 生成（`practice-repo.evidenceRulesSql()`）

並以測試**禁止任一邊手寫 literals**（`r310d1-grammar-authority.test.ts` 斷言 service 與 repo 皆不得出現 `'server-key-resolved'` 等字串）。新增評分權威時只改一處。

### 2.3 SQL 必須重現場次層級 all-or-nothing（**不可**用逐列 `WHERE`）

`evaluatePracticeEvidence()` 是**場次層級 all-or-nothing**：一個場次只有在「至少一列」且「**所有**列通過 tier-1」且「至少一列 counted」時才成立；任一列不合法 ⇒ 整個場次 0 分。

因此 SQL 以 `flags → verdict` 兩段 CTE 實作：

- **tier-1**（所有列都須通過）：`questionId` 非空、`result` 合法、`scoredBy` 合法、`(scoredBy, scoringMethod)` 為權威配對
- **tier-2**（僅 counted 列）：`awardedScore`/`maxScore` 為有限數、`maxScore > 0`、`0 ≤ awardedScore ≤ maxScore`
- `countsTowardScore = false` 的列被**跳過**（不計入，但仍須通過 tier-1）—— 這正是逐列 `WHERE` 會判錯的地方

若寫成逐列過濾會把 TS 判為不可驗證的場次一起算進去（**方向性錯誤：高估分數**）。

### 2.4 本週窗口改為有界抓取（等價性是精確的，非近似）

`collectVerifiedActivities()` 以 `startedAt` 作為 `completedAt`，因此
`since = hkWeekStartMondayUtc(now)` 與原本的 `weekKey` 過濾涵蓋**完全相同**的場次集合。改為有界抓取後，原本的 `weekKey` 過濾仍保留為第二道防線。

### 2.5 失敗一律往上拋（fail-closed）—— 修正既有資料完整性缺陷

舊碼 `listAllSessionsWithEvidence(...).catch(() => [])` 會把一次短暫的 DB 讀取失敗當成「無場次」→ 寫入 `overallAccuracy = null`，**覆蓋原本正確的值**，而且函式正常返回 → 呼叫端的 fail-closed 保護（`practice-submission-service` 會 throw 並要求客戶端重播）**永遠不會觸發**。

現在 `syncActivityMetrics` 的失敗一律往上拋，交由呼叫端既有的 fail-closed 路徑處理。**不得改回 catch-to-empty**：那會令系統故障靜默變成學生的「無資料」。

### 2.6 通知輪詢**不是** egress 目標（實測否證一個假設）

Cloud Run 存取日誌（`npm run profile:requests`，2026-09-24 10:00–11:00 HKT，6,620 個請求）：

- `/api/notifications` = **6,227 次（94.1 %）** 的請求；回應 5.28 MB / 6.4 MB
- 但 `pg_stat_statements`（上課時段）顯示該查詢 **444 次呼叫、0 列**

即：通知是**請求**層面的主導者，但**幾乎不產生 DB egress**（0.9 KB 回應主要是 JSON 外殼）。**結論：不應為 egress 而調整其 15 秒輪詢間隔。** 反過來說，同一窗口顯示應用層最大來源是練習歷史投影（`PracticeSession` 127 次/6,819 列、`PracticeAnswer` 28 次/5,746 列、平均 205.2 列/次 —— 正是全歷史分頁的特徵）。

## 3. Verification Gates（部署前必須全綠）

| 閘門 | 內容 | 指令 |
|---|---|---|
| 規則單一來源 | source-scan 測試禁止 SQL/TS 任一邊手寫 literals | `npm test` |
| 對抗性等價性 | 22 個 fixtures（含 legacy 列、零答案、presence、NaN/Infinity、同場混合）→ SQL verdict == 正典 TS verdict；交易內強制回滾，零落地 | `practice-evidence-sql-equivalence.test.ts`（DB-gated） |
| 真實資料等價性 | 82 名學生逐名比對 SQL vs 正典投影（含技能標籤） | `npm run db:verify:evidence-sql` |
| 部署閘門（0 差異） | 對每位學生乾跑「舊路徑 vs 新路徑」的 `overallAccuracy`、週快照四欄、批次投影六欄 | `npm run db:verify:metrics-parity` |

實測結果：對抗性 22/22 通過；真實資料完全等價；部署閘門 **99 名學生 + 批次投影 82 名 → 0 差異**；`tsc` 0 error；`npm run build:prod` exit 0；全套 3,203 測試通過。

> 等價性驗證在開發過程中**兩度揪出真實分歧**（`min(skillZh)` 標籤、以及「最新**已驗證**場次」的標籤來源），兩者都是靠真實資料而非 mock 才發現 —— 這是本 ADR 要求「以真實資料證明等價」的理由。

## 4. Instrumentation（維運）

| 指令 | 用途 |
|---|---|
| `npm run db:diagnose:egress` | 唯讀 egress 診斷：大小／分布／計費週期消耗推算／主要消耗者 |
| `npm run db:query-stats` | `pg_stat_statements` 排行（`--enable` 建立、`--reset` 清空） |
| `npm run profile:requests` | Cloud Run 日誌：每端點請求數與回應位元組 |

**已知限制（實測）**：

1. Neon 的 `shared_preload_libraries` **已含** `pg_stat_statements` → `CREATE EXTENSION` 即可生效，無需重啟 compute。
2. **scale-to-zero 會清空 `pg_stat_statements`**（實測：compute 啟動時間與 `stats_reset` 只差 3 ms）。要累積涵蓋上課日的窗口，需在 Console 暫時關閉 scale-to-zero；上課時段的持續輪詢本身會讓 compute 保持喚醒，故通常無需調整。
3. 計費週期**每月 1 日重置**；Neon 只計算「經 proxy 送出的位元組」（egress），與 DB 大小無關，且**無逐查詢位元組統計** —— `rows` 是唯一可得的代理指標。
4. PowerShell 5.1 會弄壞含 `>` / `<` 的原生指令參數內層引號，故 `profile:requests` 改走 **Logging REST API**（filter 置於 JSON body），不使用 `gcloud logging read`。

## 5. Consequences

**正面**

- egress 主因（全歷史重複讀取）被移除，且回傳量不再隨使用量成長
- 規則單一來源 + 三層驗證閘門，令 SQL 與 TS 不可能悄悄分歧
- 修掉一個靜默的資料完整性缺陷（讀取失敗覆蓋準確率）
- 刪除零消費者的死碼（`listPracticeSessionsWithEvidenceForStudents`）

**限制與風險**

- SQL 使用 PostgreSQL 語法（`FILTER` / `::timestamptz` / `btrim` / `array_agg`），與 `assessment-repo`、`mistake-repo` 既有 raw SQL 的前提相同
- 等價性依賴 `evaluatePracticeEvidence` 的語意；若該規則變更，SQL predicate 必須同步（已由單一來源 + 測試強制）
- `pg_stat_statements` 的 `rows` 非位元組；歸因結論具方向性而非精確值

**後續**

- 剩餘來源需在部署後重新量測（`db:query-stats` + `profile:requests`）確認排序變化
- 本次變更**不含任何 schema 變更／migration**，回滾 = 切回上一個 Cloud Run revision
