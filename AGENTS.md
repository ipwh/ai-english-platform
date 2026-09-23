<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Project: AI English Platform

See `CLAUDE.md` for full architecture documentation.

## Quick Start (New Maintainer)
1. Read `CLAUDE.md` for architecture, ownership, and conventions
2. Read `CHANGELOG.md` for the latest changes (2026-09-21 (III): 聆聽成為可量測 — 伺服器 `ListeningQuestion` 題庫、交付前逐字可批改判準、`listening-server-exact-match` 證據、聆聽不再自評（ADR-045）；(II): 可量測練習／誠實空值／教師監控訊號（ADR-044，`overallAccuracy` 移除 default 0、匯出改全歷史投影、閱讀覆核部分交付、練習閱讀正式計分、教師名單可篩選排序）；2026-09-21: 交付完整性、重送安全與教師 roster 授權收口（ADR-043）；2026-09-20 (IV): 生成題目交付前答案覆核（四個選項全錯不得交付，ADR-042）；(III): UTC 日界線全面收口 + 診斷改伺服器評分（D2b/D3）；(II): 無可驗證資料時準確率寫 null（不再顯示「0%」）＋診斷自評標示；(I): 連續天數與技能掌握度「越用越少」（UTC 日界線 + 最新 N 筆截斷）)
3. Read `README.md` for features and ADRs
4. Reference `docs/architecture/ADR-*.md` for architectural decisions
5. Run `npm test` — expect 3172 pass / 1 skipped (163 files passed, 1 skipped; core files: semantic-evaluator, analyze-writing, answer-verification, listening-answer-scoring)
6. DB migrations: `npx prisma migrate deploy`（本機 DATABASE_URL 由 `.env.local` 優先載入；勿只信 `.env`）。部署 2026-09-21 (III) 後需套用 `20260924_listening_question_store`（建 `ListeningQuestion`、刪除休眠的 `ListeningSession`/`ListeningAnswer`，無需回填）；部署 2026-09-21 (II) 後另需一次性回填：`npm run db:backfill:accuracy:apply`（把「無可驗證證據」的 `overallAccuracy = 0` 改為 `null`；真實 0% 不動）
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

## Key Rules
- **Single pipeline**: `executeAI()` for JSON, `executeAIRaw()` for raw text. Never create another pipeline.
- **DeepSeek V4.1 thinking is opt-in**: the provider sends `thinking: {type:'disabled'}` unless a caller passes `thinking: true`. The API default (thinking on, effort `high`) ignores `temperature` and spends `max_tokens` on `reasoning_content` — measured 2026-09-15: omitting it returned an EMPTY answer after 21s with `max_tokens: 4096` (see CHANGELOG 2026-09-15). Opting in means raising `maxTokens`/`timeoutMs` too.
- **Single owner**: Every responsibility has exactly one canonical module (see CLAUDE.md Ownership section)
- **`submissionClass` 不單獨授權副作用**：`exercise/services/practice-submission-service.ts` 的錯題建立與掌握度更新必須同時滿足 `usedServerScoring`（本次確實用伺服器答案鍵評分）。fail-open 回退的客戶端自評列可被偽造 `isCorrect`，**永不**可變成錯題／掌握度／證據（2026-09-21 ADR-045 稽核）。
- **聆聽交付前必須逐字可批改**：`listening/services/listening-question-service.ts` 的 `isDeliverableListeningMc()` 是唯一交付判準（MC + 對話非空 + 答案**逐字**出現在對話中，詞邊界比對）。全數不可交付 ⇒ 結構化 422 `LISTENING_QUESTIONS_NOT_DELIVERABLE`，**永不**交付無法公平批改的題目；聆聽評分不可用時 fail-open 保存但不得產生證據。
- **錯題技能歸屬**: 錯題的技能／題型一律由正典題目定義解析（`exercise/services/mistake-skill-identity.ts`）；客戶端自報值只作後備且須通過白名單。閱讀／聆聽題目依附篇章 → 不得當 flashcard（`listDueMistakesForReview` 排除）- **閱讀診斷 verdict 單一權威**：`reading-feedback-builder.ts` 的 `verdict` 只能由評分器（`isCorrect` / `isPartiallyCorrect`）決定；抄襲／詞形／語調／詞性等規則式訊號只能寫入 `qualityFlags`（＋ `qualityAdvice`），**永不改寫 verdict**。UI 徽章須與上方分數同源- **TTS 多角色音訊不得自行拼接位元**：`tts-service.ts` 的 `multiSpeaker` 段間停頓必須用該段自己的 SSML `<break>`（開頭，結尾會被裁剪）產生；**永不**手寫／拼接 MP3 frame（格式不符會令 Chromium 在第一段後 `MEDIA_ERR_DECODE` 並停止播放）- **累積指標不得由「最新 N 筆」推算**：學生端的「累積」數字（連續天數、技能掌握度題數、每週統計、整體準確率）一律由**日期界線查詢／全歷史分頁**或正典投影（`shared/utils/hk-date.ts`、`student/progress/services/streak-service.ts`、`exercise/services/practice-history-service.ts`、`student/state/StudentStateMutationService.collectVerifiedActivities`）產生。任何 `take: N` ／ `.slice(0, N)` 切片只可作「最近記錄清單」顯示，**永不**作為累積或連續指標的來源（2026-09-20 稽核：最新 50／90／200 筆視窗令香港連續 6 天顯示為 1、技能題數遞減至 0、累積準確率被截斷）。
- **生成題目必須通過交付前答案覆核（Answer Verification）**：生成後的題目在**交付與持久化之前**，必須經 `ai/services/answer-verification.ts` 把關（決定性缺陷螢幕 + 第二次獨立 LLM pass **blind-solve**）。驗證器**永不**看到答案鍵；只有 `soundness === 'ok'` **且** blind 答案等於答案鍵才可交付；`flawed`／`ambiguous`／答案不符／無 verdict 一律丟棄並觸發重新出題（`generate-questions.ts`，格式修復路徑同樣不得繞過）。結構驗證（`question-validator.ts`）**不代表答案正確**：2026-09-20 實例 `update in / update up / update with / update on` 四個選項全錯，仍通過全部結構檢查並交付。
- **無資料 ≠ 0**：可為空的分數欄位（`User.overallAccuracy` 等）在「沒有可驗證資料」時必須寫 `null` 並顯示「—」，**不得**以 0 代替（2026-09-20 稽核：舊碼寫 0 → 837/852 學生顯示「準確率 0%」、班平均被拉低）。診斷的自評分數需明確標示不計入準確率；「未評估」不得 clamp 成 0 分。`User.overallAccuracy` **沒有 DB default**（2026-09-21 migration `20260923_user_overall_accuracy_drop_default`）；新增欄位／欄位語意時勿再加 `@default(0)`
- **提交權威由伺服器解析，不信客戶端自報**：`/api/practice` 先以 `questionId` 解析正典題目家族（`exercise/services/practice-authority-resolution.ts`）；全部解析為 `ReadingQuestion` ⇒ `reading`、全部 `GrammarQuestion` ⇒ `grammar`、全部 `ListeningQuestion` ⇒ `listening`；部分／混合／解析不到才回退既有 client-marker 分類。**不得**以客戶端 `skill`／`source`／`dseType` 直接決定是否計分（2026-09-21 稽核：練習頁的閱讀題有伺服器答案鍵卻被當成 legacy → 不計準確率／掌握度／錯題）
- **交付前覆核失敗只丢問題題目**：閱讀交付保留所有通過覆核的題目；低於 `MIN_VERIFIED_READING_QUESTIONS` 才整份作廢，並回 **結構化 422**（`ANSWER_VERIFICATION_FAILED` + details）；前端自動重試一次。**不得**再以無語意的 500 表示覆核否決。AI 語意評分的短答題用內容詞重疊（`verificationAnswerMatch: 'overlap'`），確定性題型維持嚴格相等
- **活躍狀態門檻單一 owner**：`teacher/monitoring/services/activity-service.ts` 的 `classifyActivityStatus()`（香港日界線）區分「未開始／失聯（≥14 日）／低活躍（≥7 日）／活躍」；活動來源＝登入 ∪ 練習 ∪ 寫作草稿 ∪ 作業提交。UI **不得**自行寫第二套天數門檻（2026-09-21 稽核：名單與班級詳情對同一學生給出不同標籤）
- **日界線必須是香港日**：所有「今日／昨日／本週」判定經 `hkDayKey()`（UTC+8，無夏令）。**禁止**以 `toISOString().slice(0, 10)` 當「日」（雲端為 UTC → 香港 08:00 才換日，且會令早上練習歸入前一日而產生假缺口）。
- **Budget enforced**: LLM calls are gated by `getBudgetStatus()` in `provider-registry.ts`. Usage is counted in the `AiDailyUsage` table (`ai/runtime/ai-usage-store.ts`), so the limit is **global across instances and survives cold starts** — never reintroduce a per-process counter. Limits: `AI_DAILY_TOKEN_LIMIT` (default 20M) / `AI_MONTHLY_COST_LIMIT` (default 50 USD); over budget ⇒ 503 until the next UTC day (HKT 08:00). Ledger outages degrade to in-process counters (fail-open, logged) rather than failing AI calls.
- **錯題必須有伺服器評分證據，且可被解除**：`POST /api/mistakes` 的唯一閘門是 `exercise/services/practice-evidence-service.ts` 的 `findVerifiedIncorrectAnswer()` —— 只接受該學生對該題「確實由伺服器答案鍵評為 `incorrect`」的作答列，並以**該列**的答案為準（`client-key-deterministic` 不算）。**客戶端不得自行判定對錯後建立錯題**（2026-09-23 稽核：可被偽造，且 `ON CONFLICT DO NOTHING` 令客戶端那筆贏過伺服器權威版本）。已被伺服器評為答對的題目由 `findResolvedQuestionIds()` **衍生計算**為「已解除」——**不可**改成「答對就刪除錯題」（MCQ 猜中率 25%），也**不可**新增 DB 欄位（會令程式與 migration 的部署次序互相依賴）。
- **AI 不可用時不得偽造評分判定**：`assessment/services/assignment-grader.ts` 在 AI 失敗時回 `result: 'ungradable'` + `countsTowardScore: false` + `scoringMethod: 'assignment-ai-unavailable'`；呼叫端據此把 `score` 設為 `null` 並留給老師批改，且不得記掌握度。**永不**以逐字比對冒充語意評分（2026-09-23 稽核：系統故障會經 `syncActivityMetrics` 直接拉低學生 `overallAccuracy`）。
- **確定性文字比對的寬鬆邊界**：`exercise/services/practice-answer-scorer.ts` 的寬鬆包含比對要求「答案鍵含可識別詞（長度 ≥ 4 或含數字）」**且**「全部答案鍵詞彙都以完整詞出現」。純功能詞答案鍵（the / not / was / an）只能精確相等 —— 舊碼的 `filter(w => w.length > 2)` 會令答案鍵塌縮，把任何含該詞的句子判為正確（2026-09-23 實測）。
- **Evidence over speculation**: Every architectural decision requires git history, metrics, or runtime evidence
- **No speculative abstractions**: Delete code that has zero runtime consumers. Restore only if proven needed.
- **AI Infra modules are independent**: `prompt-versioning/`, `regression/`, `experiments/`, `continuous-evaluation/` — never import from each other; only integrate through barrel exports. CLI and CI are the only cross-module consumers.
- **瀏覽器基線必須涵蓋校內 iPad（Safari 15.4+）**：`package.json` 的 `browserslist` **不得刪除／不得只留 Next 16 預設值**。Next.js 16 的基線是 Safari 16.4+，而 Next **自己的 client runtime**（`node_modules/next/dist/client/components/error-boundary.js`）就輸出 class static block（`static{…}`，Safari 16.4+ 才可解析）；iPad Air 2／iPad mini 4 等最高只到 **iPadOS 15.8（Safari 15.6）**，解析該 chunk 即 **SyntaxError** → React 永不 hydrate → **整個 app 所有按鈕（含 Google 登入）按了沒反應**（2026-09-23 稽核：該 chunk 由 `(public)/login` 等數十個路由的 build-manifest 載入，非只有登入頁）。**改動 `browserslist` 或升級 Next.js 後必須重新驗證建構產物**：`Get-ChildItem .next/static -Recurse -Filter *.js | Select-String -Pattern 'static\s*\{'` 必須為 0。下限為 15.4（產物使用 `Object.hasOwn`／`structuredClone`，SWC 不補 polyfill）。已知限制：Tailwind 4 的 CSS 使用 `@property`（Safari 16.4 ✗）與 `color-mix()`（Safari 16.2 ✗），iPadOS 15 上帶透明度的顏色與部分漸層會失效（`@layer` 為 15.4 ✓，`@property` 有 Tailwind 自帶 `@supports` fallback）。

