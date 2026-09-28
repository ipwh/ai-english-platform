<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Project: AI English Platform

See `CLAUDE.md` for full architecture documentation.

## Quick Start (New Maintainer)
1. Read `CLAUDE.md` for architecture, ownership, and conventions
2. Read `CHANGELOG.md` for the latest changes (2026-09-26: Neon egress 收口 —— 全歷史投影改走 SQL 聚合（3.2 MB → 55 KB）＋修掉靜默覆蓋準確率的 fail-open；2026-09-23 (IV): 封鎖瀏覽器自動翻譯（`removeChild` 崩潰）；(III): 修復 (II) 稽核的全部 6 項缺陷；2026-09-21 (III): 聆聽成為可量測 — 伺服器 `ListeningQuestion` 題庫、交付前逐字可批改判準、`listening-server-exact-match` 證據、聆聽不再自評（ADR-045）)
3. Read `README.md` for features and ADRs
4. Reference `docs/architecture/ADR-*.md` for architectural decisions
5. Run `npm test` — expect 3245 pass / 2 skipped (169 files passed, 2 skipped; core files: semantic-evaluator, analyze-writing, answer-verification, listening-answer-scoring, generate-questions-topup, vocabulary-add-word). The 2 skipped are gated: one needs `TEST_DATABASE_URL`, one is the DB-gated evidence-SQL suite (runs when `DATABASE_URL` is localhost — i.e. in CI — or `EVIDENCE_SQL_TEST=1`)
6. DB migrations: `npx prisma migrate deploy`（CLI 自 2026-09-27 起優先使用 `.env.local` 的 `DIRECT_DATABASE_URL` 直連主機；執行期仍用 `DATABASE_URL` pooler；勿只信 `.env`）。部署 2026-09-21 (III) 後需套用 `20260924_listening_question_store`（建 `ListeningQuestion`、刪除休眠的 `ListeningSession`/`ListeningAnswer`，無需回填）；部署 2026-09-21 (II) 後另需一次性回填：`npm run db:backfill:accuracy:apply`（把「無可驗證證據」的 `overallAccuracy = 0` 改為 `null`；真實 0% 不動）
6. AI Infra CLI quick reference:
   - `npm run prompt:list` — list all prompt versions
   - `npm run prompt:states` — release lifecycle states
   - `npm run evaluate:reading` — run regression evaluation
   - `npm run prompt:experiment list` — list experiments
   - `npm run prompt:monitor dashboard` — live monitoring dashboard
   - `npm run prompt:monitor recover` — crash recovery after restart
   - `npm run prompt:monitor recover --dry-run` — preview recovery
   - `npm run prompt:monitor recovery-report` — last recovery report
   - `npm run calibration:report` — calibration gate report (exit 0 PASS / 1 FAIL / 2 INSUFFICIENT_DATA)
   - `npm run calibration:intake|verify|marker-pack|marker-intake|adjudicate|freeze` — human-marker evidence pipeline (fail-closed; never ingest level-only as evidence)
8. Neon egress / evidence-aggregate tooling (all read-only unless flagged):
   - `npm run db:diagnose:egress` — egress 診斷（大小／分布／計費週期消耗推算／主要消耗者；`--used-gb` / `--limit-gb`）
   - `npm run db:verify:evidence-sql` — SQL 聚合 vs TS 正典投影等價性（真實資料，要求完全一致）
   - `npm run db:verify:metrics-parity` — **部署閘門**：`syncActivityMetrics` 與 admin 匯出批次投影的新舊路徑逐欄比對，要求 0 差異
   - `npm run db:query-stats` — `pg_stat_statements` 排行（`--enable` 建立擴充、`--reset` 清空觀測窗）
   - `npm run profile:requests` — Cloud Run 日誌：每端點請求數與回應位元組（走 Logging REST API，非 `gcloud logging read`）
9. XP 稽核與回調（唯讀；預設 dry-run）：
   - `npx tsx scripts/audit-student-xp.ts --name=<姓名>` — 單生 XP 來源、逐香港日、爆量偵測、帳本 vs 餘額對帳
   - `npx tsx scripts/audit-student-xp.ts --top` — 全校 `masterWord` 次數排行
   - `npx tsx scripts/clawback-farmed-xp.ts [--apply]` — 刪除刷分 `XpTransaction` 列並扣減 `User.xp`（預設 dry-run；冪等）
   - 共用工具：`scripts/lib/db-env.ts`（新腳本請用它載入 `DATABASE_URL`，勿再複製 `readEnvValue`）

## Key Rules
- **Single pipeline**: `executeAI()` for JSON, `executeAIRaw()` for raw text. Never create another pipeline.
- **XP 發放必須經單一政策閘門**（2026-09-28 事故）：`student/progress/services/xp-event-policy.ts` 是唯一的事件白名單與去重鍵來源。`POST /api/gamification` **永不**採信客戶端的 `idempotencyKey`／`streakDays`／`difficulty`：去重鍵一律由伺服器依識別碼（`questionId`／`wordId`／`mistakeId`／`sessionId`）或香港日建立，且**必須按 `studentId` 界定**（`XpTransaction.idempotencyKey` 是全庫唯一索引，否則 A 生領過的鍵會令 B 生領不到）；難度由正典題目解析（`exercise/services/question-difficulty-resolution.ts`，只有 `GrammarQuestion` 有 difficulty），連續天數由 `calculatePracticeStreak()` 重算；缺少識別碼 ⇒ 400。**禁止**新增無閘門事件、**禁止**回復無守衛的 XP 入口（已刪除 `progress-service.awardXp`／`student-service.addXp` 等）。實測事故：一名學生反覆切換單字熟悉度刷得 95,904 XP（同一分鐘 111 筆），已回調 5,456 列 / 130,944 XP（`scripts/clawback-farmed-xp.ts`）
- **DeepSeek V4.1 thinking is opt-in**: the provider sends `thinking: {type:'disabled'}` unless a caller passes `thinking: true`. The API default (thinking on, effort `high`) ignores `temperature` and spends `max_tokens` on `reasoning_content` — measured 2026-09-15: omitting it returned an EMPTY answer after 21s with `max_tokens: 4096` (see CHANGELOG 2026-09-15). Opting in means raising `maxTokens`/`timeoutMs` too.
- **Single owner**: Every responsibility has exactly one canonical module (see CLAUDE.md Ownership section)
- **`submissionClass` 不單獨授權副作用**：`exercise/services/practice-submission-service.ts` 的錯題建立與掌握度更新必須同時滿足 `usedServerScoring`（本次確實用伺服器答案鍵評分）。fail-open 回退的客戶端自評列可被偽造 `isCorrect`，**永不**可變成錯題／掌握度／證據（2026-09-21 ADR-045 稽核）。
- **聆聽交付前必須逐字可批改**：`listening/services/listening-question-service.ts` 的 `isDeliverableListeningMc()` 是唯一交付判準（MC + 對話非空 + 答案**逐字**出現在對話中，詞邊界比對）。全數不可交付 ⇒ 結構化 422 `LISTENING_QUESTIONS_NOT_DELIVERABLE`，**永不**交付無法公平批改的題目；聆聽評分不可用時 fail-open 保存但不得產生證據。
- **錯題技能歸屬**: 錯題的技能／題型一律由正典題目定義解析（`exercise/services/mistake-skill-identity.ts`）；客戶端自報值只作後備且須通過白名單。閱讀／聆聽題目依附篇章 → 不得當 flashcard（`listDueMistakesForReview` 排除）- **閱讀診斷 verdict 單一權威**：`reading-feedback-builder.ts` 的 `verdict` 只能由評分器（`isCorrect` / `isPartiallyCorrect`）決定；抄襲／詞形／語調／詞性等規則式訊號只能寫入 `qualityFlags`（＋ `qualityAdvice`），**永不改寫 verdict**。UI 徽章須與上方分數同源- **TTS 多角色音訊不得自行拼接位元**：`tts-service.ts` 的 `multiSpeaker` 段間停頓必須用該段自己的 SSML `<break>`（開頭，結尾會被裁剪）產生；**永不**手寫／拼接 MP3 frame（格式不符會令 Chromium 在第一段後 `MEDIA_ERR_DECODE` 並停止播放）- **累積指標不得由「最新 N 筆」推算**：學生端的「累積」數字（連續天數、技能掌握度題數、每週統計、整體準確率）一律由**日期界線查詢／全歷史分頁**或正典投影（`shared/utils/hk-date.ts`、`student/progress/services/streak-service.ts`、`exercise/services/practice-history-service.ts`、`student/state/StudentStateMutationService.collectVerifiedActivities`）產生。任何 `take: N` ／ `.slice(0, N)` 切片只可作「最近記錄清單」顯示，**永不**作為累積或連續指標的來源（2026-09-20 稽核：最新 50／90／200 筆視窗令香港連續 6 天顯示為 1、技能題數遞減至 0、累積準確率被截斷）。**全歷史亦不等於逐列搬運**（2026-09-26，ADR-046）：累積投影一律走 SQL 聚合，只回傳每名學生／每個技能**一列**數字；逐列搬全歷史會被 Neon egress 放大（實測全校一次 3.2 MB、每次提交／頁面載入各一次）
- **證據規則必須單一定義（SQL 與 TS 永不分歧）**：`exercise/services/practice-evidence-rules.ts` 的 `PRACTICE_EVIDENCE_RULES` 同時供 TS 判定（`evaluatePracticeEvidence`）與 SQL predicate 生成（`practice-repo.evidenceRulesSql`）。**禁止**在任一邊手寫 `'server-key-resolved'` 等 literals（有 source-scan 測試強制）。改動證據規則時，`npm run db:verify:evidence-sql`（真實資料等價性）與 `npm run db:verify:metrics-parity`（部署閘門 0 差異）必須重跑
- **SQL 證據聚合必須重現場次層級 all-or-nothing**：`evaluatePracticeEvidence()` 是「一個場次只要有一列不合法就整場 0 分」。SQL **不可**寫成逐列 `WHERE` 過濾（會把不可驗證的場次一起算進去 → **高估**分數）。`countsTowardScore = false` 的列會被跳過，但仍須通過 tier-1 檢查（這是逐列寫法最容易判錯之處）
- **指標同步失敗必須 fail-closed，永不 catch-to-empty**：`syncActivityMetrics` 的讀取失敗**一律往上拋**。舊碼 `.catch(() => [])` 會把短暫 DB 故障當成「無場次」→ 寫入 `overallAccuracy = null` **覆蓋原本正確的值**，且正常返回令呼叫端的 fail-closed 保護永不觸發（2026-09-26 修正，ADR-046）。系統故障**永不**得靜默變成學生的「無資料」
- **通知輪詢不是 egress 目標**（2026-09-26 實測）：`/api/notifications` 佔 **94 % 的請求**，但其查詢回傳 **0 列** → 幾乎不產生 DB egress。**不要**為 egress 調整其 15 秒間隔；要動它請先以 `npm run db:query-stats` 提出證據
- **生成題目必須通過交付前答案覆核（Answer Verification）**：生成後的題目在**交付與持久化之前**，必須經 `ai/services/answer-verification.ts` 把關（決定性缺陷螢幕 + 第二次獨立 LLM pass **blind-solve**）。驗證器**永不**看到答案鍵；只有 `soundness === 'ok'` **且** blind 答案等於答案鍵才可交付；`flawed`／`ambiguous`／答案不符／無 verdict 一律丟棄並觸發重新出題（`generate-questions.ts`，格式修復路徑同樣不得繞過）。結構驗證（`question-validator.ts`）**不代表答案正確**：2026-09-20 實例 `update in / update up / update with / update on` 四個選項全錯，仍通過全部結構檢查並交付。2026-09-27（覆核 v2）：轉換題（轉述句等）必須逐項檢查「**同時**滿足解說列出的全部轉換」——只要沒有任何選項同時滿足（例：must→had to 且 we→they），一律判 `flawed` 丟棄重出，**不得**挑「最接近」的半對選項（實例：'we had to' 被當成正解交付，學生選 'they must' 被誤判錯）。
- **資料庫熱路徑交易護欄與錯誤處理邊界**：互動交易一律帶 `{ maxWait, timeout }`（`progress-repo.applyXpEventOnce`、`student-mastery-repo.applyPracticeMasteryOnce`、`practice-repo.createPracticeExecutionTx`）；**禁止**在交易內捕捉 P2002 後繼續查詢（Postgres 已中止交易 → 25P02 → 500）。P2002 一律讓交易回滾、在交易外重讀（2026-09-26 晚事故）。`awardXp` 不得呼叫 `studentStateBuilder.build()` 取等級（等級只由 XP 決定 → `getLevelInfo`）。
- **Cloud Run 併發基線 = 50**（`scripts/cloud-run-deploy.ps1`／`cloud-run.yaml`；2026-09-26 晚 P95>5s 事故後由 80 下調）。調整前先量測（`npm run profile:requests` ＋延遲指標）。
- **遷移走直連、執行走 pooler**：Prisma CLI（migrate deploy）以 `DIRECT_DATABASE_URL` 連 Neon 直連主機；執行期 `DATABASE_URL`（`-pooler` 主機）。**不要**加 `pgbouncer=true` —— 本專案為 Prisma 7 + `@prisma/adapter-pg`（pg Pool），該參數會被忽略、無作用（僅舊版 Prisma engine 有效）。
- **無資料 ≠ 0**：可為空的分數欄位（`User.overallAccuracy` 等）在「沒有可驗證資料」時必須寫 `null` 並顯示「—」，**不得**以 0 代替（2026-09-20 稽核：舊碼寫 0 → 837/852 學生顯示「準確率 0%」、班平均被拉低）。診斷的自評分數需明確標示不計入準確率；「未評估」不得 clamp 成 0 分。`User.overallAccuracy` **沒有 DB default**（2026-09-21 migration `20260923_user_overall_accuracy_drop_default`）；新增欄位／欄位語意時勿再加 `@default(0)`
- **提交權威由伺服器解析，不信客戶端自報**：`/api/practice` 先以 `questionId` 解析正典題目家族（`exercise/services/practice-authority-resolution.ts`）；全部解析為 `ReadingQuestion` ⇒ `reading`、全部 `GrammarQuestion` ⇒ `grammar`、全部 `ListeningQuestion` ⇒ `listening`；部分／混合／解析不到才回退既有 client-marker 分類。**不得**以客戶端 `skill`／`source`／`dseType` 直接決定是否計分（2026-09-21 稽核：練習頁的閱讀題有伺服器答案鍵卻被當成 legacy → 不計準確率／掌握度／錯題）
- **交付前丟題必須補回，不得令題數短少**：`ai/usecases/generate-questions.ts` 的生成迴圈是**累積 + 補題**（`MAX_ROUNDS = 3`）：每輪只補不足的題數，通過全部閘門的題目會累積至達到 `count`；**永不**再「整批重生只回傳最後一輪」（會令答案覆核／交付條件每丟一題就永久少一題 —— 2026-09-25 實測：預設 5 題只交付 2–4 題）。呼叫端專屬的交付條件（例：聆聽 `isDeliverableListeningMc`）必須經 `GenerateQuestionsOptions.acceptQuestion` 在**生成階段**套用，否則補題迴圈看不到它。仍不足時 best-effort 交付並記 warning；覆核器不可用則立即停止補題。
- **補題（湊數）永不降低合格標準**：每一輪（含 JSON 格式修復路徑）都必須通過**同一組**閘門 —— 結構驗證 → 答案覆核 → 交付條件 → 逐題品質閘；品質閘**逐題 fail-closed**（不得因「只是少數」而放行一行對話、缺篇章等缺陷題，由補題輪補回數量）。跨輪去重鍵必須包含題目**所依附的內容**（同一段對話／篇章不得重用於兩題），補題提示必須帶上被否決的原因（答案覆核 ＋ 交付條件）。生成輪失敗（額度耗盡／供應商錯誤／逾時）**不得丟棄已通過閘門的題目**；首輪失敗往外拋時必須**保留原始錯誤型別**（包成新 `Error` 會令 `isBudgetExceededError` 的 instanceof 失效 → 503 變成 500）。`_meta` 必須誠實回報 `requestedCount` / `deliveredCount` / `shortfall`，`count` 為**實際交付**題數。
- **交付前覆核失敗只丢問題題目**：閱讀交付保留所有通過覆核的題目；低於 `MIN_VERIFIED_READING_QUESTIONS` 才整份作廢，並回 **結構化 422**（`ANSWER_VERIFICATION_FAILED` + details）；前端自動重試一次。**不得**再以無語意的 500 表示覆核否決。AI 語意評分的短答題用內容詞重疊（`verificationAnswerMatch: 'overlap'`），確定性題型維持嚴格相等
- **活躍狀態門檻單一 owner**：`teacher/monitoring/services/activity-service.ts` 的 `classifyActivityStatus()`（香港日界線）區分「未開始／失聯（≥14 日）／低活躍（≥7 日）／活躍」；活動來源＝登入 ∪ 練習 ∪ 寫作草稿 ∪ 作業提交。UI **不得**自行寫第二套天數門檻（2026-09-21 稽核：名單與班級詳情對同一學生給出不同標籤）
- **日界線必須是香港日**：所有「今日／昨日／本週」判定經 `hkDayKey()`（UTC+8，無夏令）。**禁止**以 `toISOString().slice(0, 10)` 當「日」（雲端為 UTC → 香港 08:00 才換日，且會令早上練習歸入前一日而產生假缺口）。
- **Budget enforced**: LLM calls are gated by `getBudgetStatus()` in `provider-registry.ts`. Usage is counted in the `AiDailyUsage` table (`ai/runtime/ai-usage-store.ts`), so the limit is **global across instances and survives cold starts** — never reintroduce a per-process counter. Limits: `AI_DAILY_TOKEN_LIMIT` (default 20M) / `AI_MONTHLY_COST_LIMIT` (default 50 USD); over budget ⇒ 503 until the next UTC day (HKT 08:00). Ledger outages degrade to in-process counters (fail-open, logged) rather than failing AI calls.
- **錯題必須有伺服器評分證據，且可被解除**：`POST /api/mistakes` 的唯一閘門是 `exercise/services/practice-evidence-service.ts` 的 `findVerifiedIncorrectAnswer()` —— 只接受該學生對該題「確實由伺服器答案鍵評為 `incorrect`」的作答列，並以**該列**的答案為準（`client-key-deterministic` 不算）。**客戶端不得自行判定對錯後建立錯題**（2026-09-23 稽核：可被偽造，且 `ON CONFLICT DO NOTHING` 令客戶端那筆贏過伺服器權威版本）。已被伺服器評為答對的題目由 `findResolvedQuestionIds()` **衍生計算**為「已解除」——**不可**改成「答對就刪除錯題」（MCQ 猜中率 25%），也**不可**新增 DB 欄位（會令程式與 migration 的部署次序互相依賴）。
- **AI 不可用時不得偽造評分判定**：`assessment/services/assignment-grader.ts` 在 AI 失敗時回 `result: 'ungradable'` + `countsTowardScore: false` + `scoringMethod: 'assignment-ai-unavailable'`；呼叫端據此把 `score` 設為 `null` 並留給老師批改，且不得記掌握度。**永不**以逐字比對冒充語意評分（2026-09-23 稽核：系統故障會經 `syncActivityMetrics` 直接拉低學生 `overallAccuracy`）。
- **瀏覽器自動翻譯必須封鎖**：`src/app/layout.tsx` 的 `metadata.other = { google: 'notranslate' }` 與 `<html translate="no">` **不得移除**。瀏覽器翻譯（Chrome／Edge／Google 翻譯）會把文字節點包進 `<font>` 並改寫父子關係，令 React 之後的 `removeChild` 拋 `The node to be removed is not a child of this node`，整個頁面被錯誤邊界接住（2026-09-23 稽核：錯誤頁被翻成簡體後崩潰；本專案並無任何簡體字串）。平台以自家 lang cookie／i18n ＋ `/api/ai/translate` 提供翻譯，且機器翻譯會破壞 DSE 篇章行號與答案比對。區段錯誤邊界 `src/app/error.tsx` **不可**輸出 html/body（渲染在 root layout 之內；只有 `global-error.tsx` 可以）
- **確定性文字比對的寬鬆邊界**：`exercise/services/practice-answer-scorer.ts` 的寬鬆包含比對要求「答案鍵含可識別詞（長度 ≥ 4 或含數字）」**且**「全部答案鍵詞彙都以完整詞出現」。純功能詞答案鍵（the / not / was / an）只能精確相等 —— 舊碼的 `filter(w => w.length > 2)` 會令答案鍵塌縮，把任何含該詞的句子判為正確（2026-09-23 實測）。
- **PDF 匯出不得依賴 PDFKit 標準字型（Helvetica 等）**：Turbopack 打包 `pdfkit` 後 `__dirname` 變成建構佔位符 `/ROOT`，標準字型 AFM 於執行期 `ENOENT`（`new PDFDocument()` 直接拋錯）。所有 PDF 路由必須 `new PDFDocument({ font: '' })` 並只用內嵌字型（`public/fonts/NotoSansTC-Regular.ttf`）——`export/writing-analysis`、`export/integrated-skills`、`vocabulary/export-pdf` 皆同。`format === 'pdf'` 失敗**永不**回退成 HTML（HTML 以 200 回傳、客戶端存成 .pdf → 判為 corrupted）：必須回結構化非 2xx 錯誤。文字排版必須以 `doc.heightOfString()` **逐塊量測後**才繪製（不得固定列高／固定位移 —— 例句換行會令內文重疊，2026-09-26 生產事故）
- **生字簿新增欄位契約**：`POST /api/vocabulary` 正典欄位為 `translation` / `example`（AI 分析結果須映射，**勿**直送 `meaningZh` / `exampleSentence`）；擴充欄位 `allPartOfSpeech` / `secondaryMeaningZh` / `exampleZh` / `synonyms` / `antonyms` / `collocations` 須一併保存（DB 以 JSON 字串存，`serializeVocab` 轉回陣列）。批量操作的成功計數**只計伺服器確認新增**的數量，重複單字回 409，失敗必須如實顯示（2026-09-26 事故：400 被吞掉仍顯示「成功加入」）
- **Evidence over speculation**: Every architectural decision requires git history, metrics, or runtime evidence
- **No speculative abstractions**: Delete code that has zero runtime consumers. Restore only if proven needed.
- **AI Infra modules are independent**: `prompt-versioning/`, `regression/`, `experiments/`, `continuous-evaluation/` — never import from each other; only integrate through barrel exports. CLI and CI are the only cross-module consumers.
- **瀏覽器基線必須涵蓋校內 iPad（Safari 15.4+）**：`package.json` 的 `browserslist` **不得刪除／不得只留 Next 16 預設值**。Next.js 16 的基線是 Safari 16.4+，而 Next **自己的 client runtime**（`node_modules/next/dist/client/components/error-boundary.js`）就輸出 class static block（`static{…}`，Safari 16.4+ 才可解析）；iPad Air 2／iPad mini 4 等最高只到 **iPadOS 15.8（Safari 15.6）**，解析該 chunk 即 **SyntaxError** → React 永不 hydrate → **整個 app 所有按鈕（含 Google 登入）按了沒反應**（2026-09-23 稽核：該 chunk 由 `(public)/login` 等數十個路由的 build-manifest 載入，非只有登入頁）。**改動 `browserslist` 或升級 Next.js 後必須重新驗證建構產物**：`Get-ChildItem .next/static -Recurse -Filter *.js | Select-String -Pattern 'static\s*\{'` 必須為 0。下限為 15.4（產物使用 `Object.hasOwn`／`structuredClone`，SWC 不補 polyfill）。已知限制：Tailwind 4 的 CSS 使用 `@property`（Safari 16.4 ✗）與 `color-mix()`（Safari 16.2 ✗），iPadOS 15 上帶透明度的顏色與部分漸層會失效（`@layer` 為 15.4 ✓，`@property` 有 Tailwind 自帶 `@supports` fallback）。

