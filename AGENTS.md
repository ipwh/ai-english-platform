<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Project: AI English Platform

See `CLAUDE.md` for full architecture documentation.

## Quick Start (New Maintainer)
1. Read `CLAUDE.md` for architecture, ownership, and conventions
2. Read `CHANGELOG.md` for the latest changes (2026-09-20 (II): 無可驗證資料時準確率寫 null（不再顯示「0%」）＋診斷自評標示；(I): 連續天數與技能掌握度「越用越少」（UTC 日界線 + 最新 N 筆截斷）；2026-09-18: AI 額度閘門改為持久化全域帳本（503「今日 AI 額度已用完」）；2026-09-17 (II): 聆聽錄音只播第一句即停（段間停頓破壞 MP3 位元流）；2026-09-17: 閱讀診斷評分權威單一化／每空格字數判定；2026-09-16: 校徽與校名品牌（登入／學生／老師／管理員）；2026-09-15 (III): 學生分析頁崩潰修復、弱項／錯題語境；2026-09-15 (II): 開放式寫作題不自動評分)
3. Read `README.md` for features and ADRs
4. Reference `docs/architecture/ADR-*.md` for architectural decisions
5. Run `npm test` — expect 3027 pass / 1 skipped (147 files passed, 1 skipped; core files: semantic-evaluator, analyze-writing)
6. DB migrations: `npx prisma migrate deploy`（本機 DATABASE_URL 由 `.env.local` 優先載入；勿只信 `.env`）
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
- **錯題技能歸屬**: 錯題的技能／題型一律由正典題目定義解析（`exercise/services/mistake-skill-identity.ts`）；客戶端自報值只作後備且須通過白名單。閱讀／聆聽題目依附篇章 → 不得當 flashcard（`listDueMistakesForReview` 排除）- **閱讀診斷 verdict 單一權威**：`reading-feedback-builder.ts` 的 `verdict` 只能由評分器（`isCorrect` / `isPartiallyCorrect`）決定；抄襲／詞形／語調／詞性等規則式訊號只能寫入 `qualityFlags`（＋ `qualityAdvice`），**永不改寫 verdict**。UI 徽章須與上方分數同源- **TTS 多角色音訊不得自行拼接位元**：`tts-service.ts` 的 `multiSpeaker` 段間停頓必須用該段自己的 SSML `<break>`（開頭，結尾會被裁剪）產生；**永不**手寫／拼接 MP3 frame（格式不符會令 Chromium 在第一段後 `MEDIA_ERR_DECODE` 並停止播放）- **累積指標不得由「最新 N 筆」推算**：學生端的「累積」數字（連續天數、技能掌握度題數、每週統計、整體準確率）一律由**日期界線查詢／全歷史分頁**或正典投影（`shared/utils/hk-date.ts`、`student/progress/services/streak-service.ts`、`exercise/services/practice-history-service.ts`、`student/state/StudentStateMutationService.collectVerifiedActivities`）產生。任何 `take: N` ／ `.slice(0, N)` 切片只可作「最近記錄清單」顯示，**永不**作為累積或連續指標的來源（2026-09-20 稽核：最新 50／90／200 筆視窗令香港連續 6 天顯示為 1、技能題數遞減至 0、累積準確率被截斷）。
- **無資料 ≠ 0**：可為空的分數欄位（`User.overallAccuracy` 等）在「沒有可驗證資料」時必須寫 `null` 並顯示「—」，**不得**以 0 代替（2026-09-20 稽核：舊碼寫 0 → 837/852 學生顯示「準確率 0%」、班平均被拉低）。診斷的自評分數需明確標示不計入準確率；「未評估」不得 clamp 成 0 分。
- **日界線必須是香港日**：所有「今日／昨日／本週」判定經 `hkDayKey()`（UTC+8，無夏令）。**禁止**以 `toISOString().slice(0, 10)` 當「日」（雲端為 UTC → 香港 08:00 才換日，且會令早上練習歸入前一日而產生假缺口）。
- **Budget enforced**: LLM calls are gated by `getBudgetStatus()` in `provider-registry.ts`. Usage is counted in the `AiDailyUsage` table (`ai/runtime/ai-usage-store.ts`), so the limit is **global across instances and survives cold starts** — never reintroduce a per-process counter. Limits: `AI_DAILY_TOKEN_LIMIT` (default 20M) / `AI_MONTHLY_COST_LIMIT` (default 50 USD); over budget ⇒ 503 until the next UTC day (HKT 08:00). Ledger outages degrade to in-process counters (fail-open, logged) rather than failing AI calls.
- **Evidence over speculation**: Every architectural decision requires git history, metrics, or runtime evidence
- **No speculative abstractions**: Delete code that has zero runtime consumers. Restore only if proven needed.
- **AI Infra modules are independent**: `prompt-versioning/`, `regression/`, `experiments/`, `continuous-evaluation/` — never import from each other; only integrate through barrel exports. CLI and CI are the only cross-module consumers.

