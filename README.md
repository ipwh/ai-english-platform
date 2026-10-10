# AI English Platform 🇭🇰

AI 驅動的香港中學英文學習平台，依據 **ELE KLACG 2017** 課程指引及 **HKDSE English Language Level Descriptors** 設計的自學工具。

> **🏗️ Architecture**: [ARCHITECTURE.md](docs/ARCHITECTURE.md) | [ADRs](docs/architecture/)
> **Status**: Engineering baseline stable; formative self-study features available. Writing evaluation architecturally hardened; empirical marker calibration is not available (0/8 verified comparable pairs — `INSUFFICIENT_DATA`).
> **✅ Release Authorization (2026-08-20)**: `PRODUCTION_READINESS = GO` — see [ADR-023](docs/architecture/ADR-023-phase9-external-release-gate.md) and the [release authorization record](docs/production/release-authorization-2026-08-20.md). External conditions: OP-001 = `ACCEPTED_WITH_EXPLICIT_WAIVER` (DeepSeek rotation explicitly waived by Release Authority — never represented as rotation; Neon DB password / AUTH_SECRET / JWT_SECRET / GCP SA key rotated with old-rejected + new-active evidence; Gemini API permanently retired & revoked), OP-002 = VERIFIED (secret-bearing Git history purged, fresh-clone verified), OP-003 = VERIFIED (production migration `20260819_submission_unique_assignment_student` applied; unique `(assignmentId, studentId)` constraint live). `PRODUCTION_READINESS ≠ HKDSE SCORING VALIDITY`: HUMAN EVIDENCE = INSUFFICIENT · MARKER EQUIVALENCE = UNPROVEN · HKDSE VALIDITY = NOT ESTABLISHED.
> **Writing Evaluation**: Semantic Evaluator (evidence-only) → CLO Evaluator (sole score authority) → Deterministic Normalization
> **AI Pipeline**: `executeAI` (JSON) / `executeAIRaw` (text)
> **AI Infra**: Prompt Versioning | Regression Eval | Experiment Platform | Continuous Monitoring | Golden Benchmark Runner | Calibration Evidence Pipeline
> **Budget**: Enforced per-request ($50/month cap, 500K tokens/day)
> **Circuit Breaker**: 5 failures → open (30s) → half-open → 2 successes → closed
- **Tests**: Run `npm test` for current count. Last verified: 2026-10-08 — 204 files, 3686 tests pass (+2 gated skips; full non-E2E), including the IELTS module suite (incl. audit-invariants source scans, generation prompt/top-up contracts, the transcript-reveal contract and the student-flow contract), the `useT()` stability guard, the TTS speaker-label guard and route-security behavior tests (SEC-001..009).
- **Deployment (2026-09-21)**: apply `npx prisma migrate deploy` (includes `20260923_user_overall_accuracy_drop_default`) and run `npm run db:backfill:accuracy:apply` **before** the new revision receives traffic. The backfill recomputes the canonical projection and only rewrites the legacy "no verifiable evidence" zeros to `NULL`; a genuine 0 % is untouched. Cloud Run deployment does not apply migrations.
- **Deployment (2026-10-03 — IELTS 子系統)**: 需套用 3 個遷移（`20261003000100_ielts_module`、`20261003000200_ielts_instant_practice`、`20261003000300_ielts_assessment_rubric_version`；**2026-10-03 (XII) 更名**以修正字母序 P3018——舊名的 `..._assessment_rubric_version` 字母序排在建表遷移之前會令全新庫部署中止）。**遷移不會由 push 自動套用**（2026-10-04 查證：GitHub→Cloud Build trigger 使用**內嵌**設定，只做 `gcloud run services update --image`，不含遷移步驟；`cloudbuild.yaml` 的遷移步驟僅在手動 `gcloud builds submit --config cloudbuild.yaml` 或 `scripts/cloud-run-deploy.ps1` Step 2 時執行，且該 Secret `DIRECT_DATABASE_URL` 目前**未建立**於專案）。請先以 `.env.local` 直連套用 `npx prisma migrate deploy`（或跑 `scripts/cloud-run-deploy.ps1`）再依賴新程式碼。遷移全部為加法（僅 IELTS 新表＋可空欄位），**無需回填**；**2026-10-03 (XII) 已補套用至生產庫**。
- **Deployment (2026-09-26 — egress work)**: **no schema change / no migration.** `npx prisma migrate deploy` reports nothing pending → rollback is simply re-deploying the previous Cloud Run revision. See the egress operations section below.
- **Deployment (2026-09-26 — 生字簿修正)**: **no schema change / no migration.** 批量匯入欄位契約修正（`translation`/`example` ＋擴充欄位保存；重複單字回 409、失敗如實顯示）；PDF 匯出改用內嵌 CJK 字型（`font: ''`，不依賴 PDFKit 標準字型）、版式改為逐塊量測（內文不重疊），且 `format=pdf` 失敗回結構化 500、**永不**以 HTML 冒充。部署後請驗證（見 [CHANGELOG 2026-09-26 (IV)/(V)](CHANGELOG.md)）：① 批量匯入後生字即時出現在列表；② 下載 PDF 的回應為 `application/pdf` 且可正常開啟、內文無重疊（不應出現 corrupted）。

## 🎓 IELTS 備考子系統（2026-10-03，**測試版 BETA**）

> **這是 IELTS 風格的練習平台，並非官方考試、亦非官方分數。** 系統整體標示
> **測試版（BETA）**：尚無人工評分校準（`HUMAN_EVIDENCE = INSUFFICIENT`），
> 所有 band 均為**練習估算（範圍）**；AI 生成的題目必須經人工審核才能發佈。

### 學生（自學，隨時可用）
- 登入後前往 **`/student/ielts`**（導航：「IELTS 備考（測試版）」）。
- **即時自學練習**：無需等待審核即可出卷（閱讀／聆聽：AI 生成 → 機械屏檢＋盲解覆核 →
  只交付本人、明確標示「未經教師審核」、**永不進入題庫**；每香港日上限 8 次）。
- **完整組件練習**（2026-10-04；2026-10-08 補題）：可生成**官方全長度**組件（閱讀 3 篇／聆聽 4 部分，共 40 題；
  建議時間 60／40 分鐘），同一組品質閘門、獨立每日上限（2 次）。**每段落生成後會對同一篇章／
  逐字稿追加題目補足官方題數**（最多 3 輪、受 4 分鐘牆鐘預算限制），因此實測閱讀與聆聽
  完整組件**皆可達 40/40**（77s／103s）；若仍未足數（聆聽逐字稿逐字判準未放寬，偶爾仍
  丟棄 13–27 題），**誠實顯示**已交付／官方題數與 fail-closed 原因（**絕不放寬任何判準**、
  **絕不**為湊數加入未經覆核的題目）。
- **即時自學寫作題**（2026-10-04）：寫作頁可按所選組別／題型 **AI 生成題目**（同一 conformance
  檢查；同樣只交付本人、標示未經教師審核、**永不自動入庫**），寫完即取得四項官方準則的練習估算，
  與閱讀／聆聽即時練習共用每日上限。寫作以**單一任務**為單位（官方寫作組件＝任務 1＋任務 2，
  可分兩次生成練習）。
- **重新整理不會丟失成績**（2026-10-04）：未完成的嘗試會續用、已提交的成績會還原（含逐題作答），
  要重做須明確按「再練一次」。
- **聆聽逐字稿於提交後顯示**（2026-10-08）：作答前不顯示逐字稿（避免洩題），提交後每段的
  逐字稿（AI 語音的依據）會顯示在該段之下；重新整理仍會保留。平台以 TTS 合成語音，
  並非官方錄音。
- **起始卷**：系統首次載入時自動 provision 平台起始卷（repo 人工內容），新學生立即有卷可練。
- **批改與建議**：客觀題（閱讀／聆聽）伺服器決定性評分（逐題對錯＋答案＋解釋）；
  錯題可要求 **AI 解說**（只解釋、永不改分）；**寫作**提交後獲四項官方準則的逐項
  估算＋逐字證據＋強弱項＋改善重點（AI 估算，非考官分數）；**口說**只提供準備教學
  與 AI 準備教練（**不評分**）；進度頁追蹤練習歷史。
- **學術組 / 通用組（2026-10-07 流程改善）**：`/student/ielts` 改為**兩步流程**——① 先選組別，卡片明確標示「學術組＝**較高級的程度**（學術導向）」、「通用組＝**較適合中學生**（日常／職場導向）」；未選組別前不顯示任何卷別。② 選組後列出該組**全部卷別**（聆聽／閱讀／寫作／口說），每卷都可**即時 AI 生成**練習（未經教師審核、只交付本人、永不入庫）或選用**已發佈、經教師審核**的試卷；寫作卷的 Task 1／Task 2 按鈕會帶同組別跳到寫作頁。聆聽／口說兩組相同（官方亦相同）。**組別會被記住**（`localStorage`，`useSyncExternalStore` 讀取，無 hydration mismatch；隱私模式只失去記住能力）：下次進入直接顯示該組卷別，仍可一鍵「更改組別」。

### 教師／管理員（出題與審核台）
- **`/teacher/ielts`**：AI 生成（官方格式；`scope=set` 或 `full_component` 40 題）→
  逐題核准 → 發佈；AI **永不自動發佈**；發佈即時卷時自動納入題庫。

### 不變式（可稽核）
- HKDSE 完全隔離（雙向 import = 0；永不寫入 HKDSE 證據／XP／掌握度）；
- 客觀題一律決定性伺服器評分（`scoringMethod = DETERMINISTIC_OBJECTIVE`）；
- 寫作評估證據優先（`AI_MISSING_EVIDENCE` / `AI_EVIDENCE_MISMATCH` fail-closed；
  rubric／prompt 版本戳）；
- 口說：**零評分程式碼路徑**（`NOT_VERIFIED`）；
- 生成 fail-closed：機械屏檢＋blind-solve＋品質閘；不合格一律丟棄。

### 文件與驗證
- 規格／計分／治理／來源：[`docs/ielts/`](docs/ielts/)（SPECIFICATION、SCORING、
  ASSESSMENT_GOVERNANCE、SOURCES、COMPLIANCE_AUDIT、FULL_AUDIT 2026-10-03）。
- 驗證：`npm test`（IELTS 套件 24 檔／307 測試；全套 3686 pass／2 gated skips）。

## ✍️ 自訂練習 Custom Practice（2026-10-10，Sprint 140–143）

> **入口**：學生左側選單 →「自訂文法與詞彙練習」（在「AI 練習」之下，2026-10-10 新增），
> 或直接前往 `/student/custom-practice`。

學生用**自己的話**描述想練什麼（例：「past perfect tense」、「formal letter opening」），
平台即時生成練習、交付前驗證、伺服器評分，並給逐題回饋、參考答案與改進建議。

### 學生流程
1. `/student/custom-practice` 輸入需求（可指定文法／句型／詞彙與難度、題數）。
2. 生成結果**先過交付前驗證**（決定性缺陷篩檢 ＋ 獨立 blind-solve 覆核）；不足題數如實回報。
3. 作答 → 提交 → **伺服器評分**：客觀題決定性評分；開放式題 AI 評分且信心不足 ⇒
   標示「待覆核（needs_review）」，**永不**硬判對錯。
4. 歷史記錄可重新開啟檢視（已提交的練習會顯示分數、參考答案與解說）。

### 不變式（可稽核）
- **評分單一 owner**：`src/modules/custom-practice/services/grading-service.ts`。客觀題
  **永不**呼叫 AI；開放式題 AI 失敗時回 `needs_review`，不偽造判定。
- **作答前答案不泄露**：`services/delivery-service.ts` 是唯一交付 owner，作答前回應不含
  `answerKey`／`rubric`／`explanation`。
- **重複提交由資料庫決定**：`CustomPracticeSubmission.setId` 唯一索引 ⇒ 競爭敗者 **409**；
  評分（含 AI 呼叫）在交易外。
- **歸屬**：他人練習一律 **404**（不是 403）。
- **與 HKDSE／IELTS 完全隔離**：不寫入準確率／掌握度／錯題／XP，不使用 IELTS 配額或 band 資料。

### 評分評估基線（Sprint 143，**證據優先**）
- 資料集：`src/modules/custom-practice/evaluation/fixtures/grading-baseline-v1.json`
  （`datasetVersion = custom-practice-grading-baseline-v1`）——**27 筆 fixture**，
  每筆含題目、學生作答、預期 verdict／分數範圍／needs_review、理由與出處。
  **人類覆核 0 筆（全部 PROVISIONAL）**。
- Runner：`src/modules/custom-practice/evaluation/grading-evaluation-runner.ts` —— 呼叫
  **生產**評分入口（與提交服務同一函式）、**永不**呼叫 provider。
- 執行方式（不需憑證）：
  ```bash
  npx vitest run src/modules/custom-practice/__tests__/grading-baseline.test.ts
  ```
  分母明列：deterministic 19（實測 agreement 19/19、false accept 0、false reject 0、
  分數範圍違反 0、needs_review 1/19）／provider-dependent 8（只計數、不評分）。
- **限制**：以上是「契約一致性」，**不是**評分效度；人類覆核為 0 時不得對外宣稱準確率。

### 瀏覽器驗證（實際執行）
```bash
npx playwright test e2e/custom-practice.spec.ts --project=chromium-desktop --workers=1
npx playwright test e2e/custom-practice.spec.ts --project=chromium-mobile  --workers=1
```
桌面與行動（Pixel 7）皆 **8/8 通過**；涵蓋作答前不泄露答案、跨學生 404、重複提交 409、
網路中斷／重試（離線提交不留任何痕跡、重試僅產生一筆、重新載入還原已持久化結果）。
前置條件：`BASE_URL`（預設 `http://localhost:3000`）、可用的 `TEST_DATABASE_URL`、
應用程式已啟動；每輪**只做一次真實登入**（登入端點限流 5 次／分鐘／IP）。

## 📉 Neon Egress 維運（2026-09-26，ADR-046）

### 背景
Neon 只計算「經 proxy 送出的位元組」（egress），與 DB 大小無關。2026-09-25 曾達
**4 GB / 5 GB（80 %）**，而資料庫僅 **30.9 MB** —— 原因是**全歷史投影被反覆重讀**，
不是資料量。現已改為伺服器端 SQL 聚合（每次回傳每名學生／技能**一列**數字）。

### 量測工具（均為唯讀）

| 指令 | 用途 |
|---|---|
| `npm run db:diagnose:egress` | egress 分布、計費週期消耗推算、主要消耗者（`--used-gb 4 --limit-gb 5`） |
| `npm run db:query-stats` | `pg_stat_statements` 排行（`--enable` 建立擴充、`--reset` 清空觀測窗） |
| `npm run report:usage` | 最近 N 個香港日的使用狀況（使用人數／練習次數／每級最活躍班別／每班最活躍學生；`--days=7`）；`--unassigned` 列出未分班學生；`--json` 輸出機器可讀 JSON |
| `npm run profile:requests` | Cloud Run 日誌：每端點請求數與回應位元組（可指定歷史時段） |

### 等價性／部署閘門（修改證據規則或聚合路徑後**必須**重跑）

```
npm run db:verify:evidence-sql     # SQL 聚合 vs TS 正典投影（真實資料，要求完全一致）
npm run db:verify:metrics-parity   # 部署閘門：新舊路徑逐欄比對，要求 0 差異
```

### 部署指令

本批改動**不含 schema 變更／migration**；`npx prisma migrate deploy` 應回報無待套用。
回滾 = 切回上一個 Cloud Run revision。

```
npm run build:prod                 # 正式建構（必須 exit 0）
powershell -ExecutionPolicy Bypass -File scripts/cloud-run-deploy.ps1 -ProjectId "amiable-nirvana-500300-a0"
```

脚本經 **Cloud Build** 建構並部署（不需本機 Docker）；region 預設 `asia-east2`。

> ⚠️ **部署前必讀（2026-09-26 生產事故）**
>
> Cloud Run 環境變數**不在** repo 裡（`cloud-run.yaml` 只有 `NODE_ENV`）。
> `scripts/cloud-run-deploy.ps1` 曾使用 `gcloud run deploy --set-env-vars`，而該旗標的
> 語意是**取代整組**環境變數（非合併）→ `JWT_SECRET` / `AUTH_SECRET` / `DATABASE_URL` /
> `AUTH_GOOGLE_*` / `CRON_SECRET` / `DEEPSEEK_API_KEY` / `NEXTAUTH_URL` 全被清空 →
> 模組載入時 config 驗證拋錯 → **全站 500（含 `/api/health`）**。
> 已修正為 `--update-env-vars`（合併）。
>
> - **任何部署後，先驗證 `GET /api/health` 回 200**（不要只看部署指令的「成功」）。
> - 若變數再次被清空：`scripts/cloud-run-restore-env.ps1 -SourceRevision <已知良好 revision>`
>   會從既有 revision 複製純值變數回服務範本（**全程不輸出機密值**，含逗號／引號的
>   值會中止並要求改用 Secret Manager）。
> - 應急回滾（不動範本）：`gcloud run services update-traffic english-platform --region asia-east2 --to-revisions <良好 revision>=100`
> - **回滾後必須收斂回 `--to-latest`**：應急回滾使用的 `--to-revisions <rev>=100` 會**飩選（pin）**
>   流量設定，之後的部署只會建立新 revision 而**不會**接手流量 —— 服務會與最新程式碼**漂移**
>   （2026-09-26 實例：最新為 `00121`，但流量仍在 `00118`）。收斂指令：
>   `gcloud run services update-traffic english-platform --region asia-east2 --to-latest`
> - 安全預覽單一 revision（不動流量）：`--set-tags candidate=<revision>` 後開 `https://candidate---<service-url>`。
>   預覽完畢請 `--clear-tags`。
>
> 注意：自動部署（GitHub→Cloud Build trigger）自 2026-10-04 起使用 repo 的
> `cloudbuild.yaml`（`filename=cloudbuild.yaml`）：push 到 `main` 會**先套用遷移**
> （Step `Migrate`：`prisma migrate deploy`，經 Secret Manager `DIRECT_DATABASE_URL`；
> 失敗即中止 ⇒ 不會出現「新程式碼＋舊 schema」），再 docker build（`--no-cache`）→ push
> → `gcloud run deploy`（帶 timeout 900s／併發 50／記憶體 1Gi，不再只繼承服務範本）。
> 該 Secret 由 build SA `694494166764-compute@developer.gserviceaccount.com` 以
> `roles/secretmanager.secretAccessor` 讀取。

### 部署前後量測流程

1. **部署前（基準）**：`npm run db:diagnose:egress --used-gb <本期已用> --limit-gb 5`
   → 記錄「全校跑一次全歷史投影」與「寫入路徑」的規模
2. **部署前（驗收閘門）**：`npm run db:verify:metrics-parity` → 必須 **0 差異**
3. **部署**：見上方指令
4. **部署後（確認下降）**：上課時段跑 `npm run db:query-stats`
   → 觀察 `PracticeSession` / `PracticeAnswer` 的 `rows` 佔比是否下降；
   同時 `npm run profile:requests` 確認請求分布（通知那 94 % 不應變）
5. **回報差異**：若 `PracticeSession` / `PracticeAnswer` 仍高，先確認新 revision 確实已接流量

### 已知限制（實測）

- **scale-to-zero 會清空 `pg_stat_statements`**（compute 啟動時間與 `stats_reset` 相同）：
  要累積涵蓋上課日的窗口，需在 Console 暫時關閉 scale-to-zero；上課時段的持續輪詢本身
  會讓 compute 保持喚醒，通常無需調整。
- **計費週期每月 1 日重置**；Neon **無逐查詢位元組統計**，`rows` 是唯一可得的代理指標。
- `profile:requests` 走 **Logging REST API**（filter 置於 JSON body）：PowerShell 5.1 會弄壞
  含 `>` / `<` 的原生指令參數內層引號，故**不得**改回 `gcloud logging read`（且
  `httpRequest.requestUrl!=""` 語法無效，存在性要用 `:*`）。需先 `gcloud auth login`。
- **通知輪詢不是 egress 目標**（實測）：`/api/notifications` 佔 94 % 的請求，但其查詢回傳
  **0 列**。要動它請先以 `db:query-stats` 提出證據。

## 🔐 依賴安全與工具鏈（2026-10-09，Sprint 132）

| 項目 | 現況 |
|---|---|
| Node | **>= 22.12.0**（`package.json` `engines` ＋ 根目錄 `.nvmrc`（22）＋ 全部 workflow `node-version: '22'`；CI 與 Cloud Build 必須同版） |
| `npm audit` | **25 → 12**（0 critical）。其餘 12 條的「修復」全部是**降級**（Prisma → 6.x、mammoth → 0.3.29、eslint-config-next → 14.x）⇒ **不採用**；`npm audit fix --force` 一律禁用 |
| 安全下限 | `src/shared/__tests__/dependency-security.test.ts`：14 個套件的最低安全版本 ＋ **Prisma CLI／client／engines 版本必須一致** ＋ Safari 15.4 基線不得退出 |
| 傳遞依賴 | 以 `package.json` 的 `overrides` 在**同一 major** 內拉高（`@xmldom/xmldom`／`fast-uri`／`js-yaml`／`@grpc/grpc-js`／`browserslist`／`source-map-js`） |
| Prisma | **7.10.0 精確釘版**（CLI／client／engines／adapters 四者同版）。`npm audit fix` 曾**兩次**只把 CLI／engines 拉高而 client 不動 ⇒ 以 `--save-exact` 封住漂移 |
| 遷移安全 | `src/shared/db/__tests__/migration-safety.test.ts`：破壞性操作必須列入 `REVIEWED_DESTRUCTIVE_MIGRATIONS` 並附理由（**過期條目亦失敗**）；遷移可加不可減 |
| Lint 棘輪 | `npx eslint . --max-warnings 259` ＋ `npm run lint:budget`（per-rule 預算；**只可下調**） |

> ⚠️ **Safari 15.4 基線**：`browserslist` 的 `safari 15.4`／`ios_saf 15.4` **不得刪除或改高**
> （校內 iPad 最高 iPadOS 15.8）。升級 Next.js 或動 `browserslist` 後**必須**重跑產物閘門：
> `.next/static` 全掃 `static\s*\{` 必須為 **0**（該語法 Safari 16.4+ 才可解析）。

## 🏗️ Architecture Overview

```
Routes (115) → AIFacade → UseCases (13) → executeAI / executeAIRaw
                 ├─ Prompts (PromptRegistry)
                 ├─ Providers (6-model chain + circuit-breaker + budget)
                 ├─ Services (RAG, TTS, evaluator, enrichment)
                 ├─ Schemas (Zod validation)
                 ├─ AI Infra: prompt-versioning (SemVer + 7-state lifecycle)
                 ├─ AI Infra: regression (rubric/semantic/structural scoring)
                 ├─ AI Infra: experiments (A/B/C + cross-provider/version/dataset)
                 ├─ AI Infra: continuous-evaluation (drift + regression + alerts)
                 └─ AI Infra: golden-benchmark (infrastructure ready; requires human-labelled data)

Writing Evaluation (Sprints 127-130):
  Semantic Evaluator (evidence-only) → CLO Evaluator (score authority) → Deterministic Normalization
    └─ RAG → reference context only (never scoring)
    └─ CLO_RUBRIC / CLO_RUBRIC_ZH → single canonical source (writing-rubric.ts)
```

## 📋 Architecture Decisions

| ADR | Decision | Status |
|---|---|---|
| ADR-001 | Single AI pipeline (`executeAI` + `executeAIRaw`) | ✅ Accepted |
| ADR-002 | No application service layer (Route → Facade → UseCase) | ✅ Accepted |
| ADR-003 | Hardcoded providers, not config-based | ✅ Accepted |
| ADR-004 | RAG is optional enhancement (graceful degradation) | ✅ Accepted |
| ADR-005 | Centralized schemas, not split by skill | ✅ Accepted |
| ADR-006 | TypeScript prompt builders, not structured templates | ✅ Accepted |
| ADR-007 | Hardcoded rule engines, not plugin-based | ✅ Accepted |
| ADR-008 | LLM budget enforcement required | ✅ Accepted (d3e6f41) |
| ADR-009 | Manual barrel exports, not auto-discovery | ✅ Accepted |
| ADR-022 | Release Governance, Feature Flags & Deployment Safety | ✅ Accepted |
| ADR-023 | Phase 9 External Release Gate & Credential Rotation Waiver Policy (VERIFIED ≠ ACCEPTED_WITH_EXPLICIT_WAIVER; release decision rule; DeepSeek waiver scope) | ✅ Accepted (2026-08-20) |
| ADR-041 | Mistake Skill Attribution & Review Layering | ✅ Accepted (2026-09-14) |
| ADR-042 | Generated Answer Verification — independent pre-delivery answer-key audit | ✅ Accepted (2026-09-20) |
| ADR-043 | Delivery Integrity, Replay Safety & Teacher Roster Authorization | ✅ Accepted (2026-09-21) |
| ADR-044 | Measurable Practice, Honest Empty States & Teacher Monitoring Signals | ✅ Accepted (2026-09-21) |
| ADR-045 | Server-Owned Listening Question Store (listening becomes measurable) | ✅ Accepted (2026-09-21) |
| ADR-046 | Server-Side Evidence Aggregation (Neon egress) & Fail-Closed Metric Sync | ✅ Accepted (2026-09-26) |
| ADR-047 | Practice Content Must Not Repeat — Cross-Request Dedupe & Content-Fingerprint XP Keys | ✅ Accepted (2026-10-01) |
| ADR-048 | Teacher Eligibility by School Domain & Class Auto-Link | ✅ Accepted (2026-10-08) |
| ADR-049 | Database-Enforced Concurrency Guards (IELTS practice, attempts, submissions, generations) | ✅ Accepted (2026-10-08) |
| ADR-050 | Architecture-Rule Integrity, Cross-Platform Enforcement & Explicit Corpus Gating | ✅ Accepted (2026-10-08) |

> 詳細架構請見 [ARCHITECTURE.md](docs/ARCHITECTURE.md) 及 [ADRs](docs/architecture/)

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 |
| Language | TypeScript 5 (strict) |
| Database | PostgreSQL (Neon) + Prisma 7 |
| Auth | JWT (jose) + NextAuth v5 — dual auth, `verifyApiAuth()` on all routes |
| AI | DeepSeek (primary) → Grok (fallback); Claude/OpenAI placeholders; Vertex embeddings via GCP service account (RAG 向量檢索用，非 LLM 供應商)。Gemini API key **retired 2026-08-20**（revoked, configuration removed） |
| Validation | Zod v4 |
| Testing | Vitest + Playwright E2E |
| Architecture | Enforcement tests (import direction, service size, provider isolation, cache ownership, repository isolation) |
| Documentation | 47 ADRs (ADR-001–047) in `docs/architecture/` |
| State | Zustand |
| CSS | Tailwind 4 |
| Deployment | **Cloud Run** (asia-east2, 900s timeout, auto-deploy via `cloudbuild.yaml`) — Vercel 部署已於 2026-09-15 移除 |

## 功能

### 🧑‍🎓 學生端
- **AI 練習題目** — 支援選擇題、填充題、寫作題，3 種難度（補底/核心/挑戰），自動從學生 profile 載入年級；開放式文法主題（疑問句形式、情態動詞、介詞、連接詞等）自動改用選擇題，確保單一答案鍵公平批改
- **📖 閱讀理解 (DSE Paper 1)** — 生成 DSE 風格閱讀篇章（3–5 段、段落分佈檢查、主題多樣化），涵蓋 Literal → Inferential → Evaluative 漸進式題型（MCQ / 填充 / True-False-NG / 語調態度 / 詞彙 / 摘要 / 代詞指涉 / 推斷 / 短答），AI 語意批改依 HKDSE 評分原則（評估 prompt 為通用考官原則，不包含官方 descriptors 文本）；題目支援中英切換
- **🔥 每日挑戰 (Daily Challenge)** — 每日一題（文法選擇／填充），開放式文法主題一律以選擇題呈現；完成獲得連續學習 streak 加成與 XP；題目由伺服器持有，提交時以伺服器答案鍵批改
- **個人化診斷測試** — 根據學生年級、近期練習與錯題生成診斷題目，完成後可一鍵進入弱項訓練
- **聆聽練習** — 內建 TTS 語音播放，支援聆聽理解題型；DSE Paper 3 風格對話（含 distraction、synonym replacement、speaker attitude 等真實考試陷阱），題型涵蓋 MCQ / fill-blank / form-filling / inference / matching
- **🎧✍️ Integrated Skills 綜合訓練 v6** — 完整模擬 DSE Paper 3 Part B 考試流程。**9 種 DSE 文體**、**Data File 資料夾模擬**、**平台診斷分析**、**真實考試陷阱**（distraction、synonym replacement、speaker attitude、numerical precision、number confusion、date correction）、**12 種速記符號面板**、**抄襲偵測強化**、步驟鎖定（聆聽→筆記→寫作）、**Note-taking 中英雙語指引**（英文 + 繁體中文切換按鈕）、**AI 參考範本答案**（平台教學參考，非官方評分樣本）、**PDF 匯出**（完整報告含聆聽原文/Data File/筆記/學生寫作/AI 分析/範本答案）、AudioPlayer 播放控制、完整 AI 分析結果展示、桌面 Sidebar + 行動裝置 Bottom Tabs、15 秒自動儲存草稿
  - **⚠️ Integrated Skills 診斷分析是平台內部評估，並非 HKEAA 官方評分。** 百分比權重及等級對照為平台教學參考，並非來自官方文件。此聲明已直接顯示於批改結果頁面。
- **🗄️ 完整資料持久化** — 逐題答案儲存（`PracticeAnswer`）、XP 審計記錄（`XpTransaction`）、詞彙掌握度歷史（`VocabMasteryLog`）、錯題複習記錄（`MistakeReviewLog`）、診斷結果儲存（`DiagnosticResult`）、每週進度快照（`WeeklySnapshot`）。練習、作業**提交**沿用 client `clientSubmissionId` 作重播鍵；**XP 發放的去重鍵則一律由伺服器建立**（依 `questionId`／`wordId`／`mistakeId`／`sessionId` 或香港日，並按學生界定；客戶端自報鍵一律忽略）；同一練習 session 的 mastery 以持久化 claim 原子套用一次，失去回應後重送不會重複累加，未完成的更新可安全復原。
- **即時批改回饋** — AI 分析答案（依 HKDSE Reading/Listening Descriptors 原則），提供中英雙語解釋、常見錯誤提示。**評分權威單一**：正確性只由評分器（`isCorrect` / `isPartiallyCorrect`）決定，抄襲／詞形／語調等規則式訊號只作「品質提示」（`qualityFlags`），永不改寫判決——診斷徽章與上方分數同源
- **寫作批改** — 平台提供以 HKDSE English Writing descriptors 為參考的英文寫作自學回饋。評估流程包括：(1) 題目要求及語義證據分析、(2) Content / Language / Organization 三向度平台評估（各 0-7 分，總分 21 分）、(3) 確定性分數標準化、(4) 具原文證據的教育回饋、(5) 優先改進行動、忠實修正與示範強化。**平台分數是寫作練習診斷估算，並非 HKEAA 官方評級，亦不代表公開考試成績預測。**
- **錯題本** — AI 解釋每道錯題的原因、文法規則、記憶口訣；**每道錯題都有技能／題型歸屬**（由伺服器持有的 `ReadingQuestion.dseType` / `GrammarQuestion.grammarItem` 解析，非前端自報）
- **🎯 題型弱項（錯題本）** — 錯題按技能／題型聚合（例如「閱讀・推論」），附**確定性雙語策略卡**（常見錯因 + 下次作答步驟）。**閱讀／聆聽錯題依附特定篇章，無法重考同一題**，因此該類項目不再提供無效的「重做」，改為「練 DSE 閱讀（涵蓋此題型）」；文法／詞彙則練同項目新題，語境詞義錯題可一鍵加入生字簿
- **進度分析** — 學習數據儀表板，AI 對照 HKDSE Subject Descriptors 提供個人化學習建議及週計劃
- **詞彙庫** — 生字學習及語音播放
- **📚 智能生字簿 2.0** — AI 一鍵分析單字（詞性、中英意思、例句、同義字、反義字、搭配詞），浮動按鈕快速加入，右鍵選取文字即時加入，批量匯入，CSV/Anki/PDF 匯出，個人化複習建議，掌握度 ★ 評級（0-5），自動去重。**2026-09-26 修正**：批量匯入成功計數只計伺服器確認新增（重複字回 409、失敗可重試），AI 分析擴充欄位（詞性變化／例句翻譯／同反義／搭配）完整保存；PDF 匯出以內嵌字型生成、逐塊量測版式（內文不重疊），失敗回結構化錯誤（不再產生「corrupted」檔案）
- **📝 生字簿 2.1 強化** — API 分頁支援（`page`/`limit`/`search`/`familiarity`/`pos`/`sort`）、`/api/vocabulary/example` 專用例句生成、`/api/vocabulary/quiz` 互動式詞彙測驗（MCQ + 配對題）、VocabCard 策略提示根據掌握度動態推導
- **✏️ 串字練習 (Spelling Practice)** — 看中文意思及英文例句提示，自行輸入正確英文單詞；支援 5 種選字模式（最新/隨機/最弱/到期/自選）、即時批改、錯誤重試、SRS 掌握度自動更新；完成後顯示成績及逐字結果回顧（`SpellingSession` + `SpellingAttempt` DB 模型）
- **➕ 無縫添加生字** — 任何 AI 輸出（passage、寫作分析、詞彙建議、改寫版本、Integrated Skills 評語）均可一鍵加入生字簿：`InlineWordBadge`（hover/+ 按鈕）、`TextSelectionPopup`（選取文字浮動加入）、`VocabEnabledText`（包裝任何文字區域）；寫作頁詞彙建議旁直接顯示 + 按鈕
- **AI 求助助手** — 🆕 **個人化求助與建議 v2**：讀取學生練習紀錄、錯題數據及連續學習天數後，自動計算**建議信心度**（0-100 分，四維度加權）；AI 對照 HKDSE 各卷別等級描述提供**具體量化**的個人化英文學習建議（含改善目標及時間表）；**弱項驅動 FAQ 動態排序**（文法/詞彙/寫作/閱讀分類按相關性自動排列，弱項類別標記 🔴 優先關注）；**AI 建議問題**（根據弱項自動生成 2-3 條建議提問，一鍵發問）；**個人化 FAQ**（從 AI 分析結果生成針對性 Q&A，附具體量化改善步驟）；**數據不足提示**（練習少於 3 次或作答少於 30 題時顯示基本英語提升建議，提示多用平台累積數據）；回答後可一鍵生成相關練習題目，即時練習改進；**生成題目附篇章 (2026-10-07)**：文法／無法判斷的問題走文法出題（不再誤當閱讀題），閱讀／聆聽題連同篇章／對話一併顯示（舊碼丟棄篇章，令「According to the passage」的題目無法作答）
- **🎮 遊戲化學習** — XP 經驗值與等級系統（Lv.1-20）、18 款成就徽章（連續學習、正確率、練習量、寫作、詞彙、初中友善徽章）、匿名班級排行榜、每日連續學習火焰動畫
- **🧠 間隔重溫 (SRS)** — 基於 SM-2 演算法，詞彙與錯題自動排程每日複習，支援 Easy/Hard/Again 評分，動態調整複習間隔，確保長期記憶。錯題卡片只抽「**到期且可重考**」的項目（閱讀／聆聽篇章題目不在 flashcard 隊列），每次評分以 SM-2 排定下次複習日
- **✍️ 互動寫作** — AI 批改後一鍵改寫作文，原文與改寫版左右對比 (Diff View)，分層反饋（簡潔 / 詳細），一鍵採用 AI 改寫內容
- **🧮 AI 生成練習的數量與品質契約（2026-09-25）** — 學生選 5 題就會拿到 5 題：生成迴圈在交付前逐題把關（結構驗證 → 獨立答案覆核 → 交付條件 → 逐題品質閘），被丟棄的題目會**自動補題**而不是讓練習提早完結；補題**只增加嘗試次數、永不降低合格標準**（不可公平批改的題目寧缺勿濫：只有一行的「對話」、缺篇章、四個選項全錯等一律不交付）。每次回應的 `_meta` 誠實回報 `requestedCount` / `deliveredCount` / `shortfall`，不會假裝數量足夠。
- **🔍 歷屆試題 RAG (DSE RAG)** — AI 出題、批改、解說時自動檢索真實 DSE 歷屆試題內容與官方 Marking Schemes 作為參考上下文。RAG 檢索結果僅用於提示詞接地（prompt grounding），不直接決定學生評分。（Feature Flag: `DSE_RAG_ENABLED=true`）
- **🗣️ 口語練習** — 支援 transcript 文字輸入分析（DSE Speaking rubric L1-L5 評級），可選 S1-S6 年級及補底/核心/挑戰難度，未來擴展 STT 語音辨識
- **� 手寫作文上傳 (OCR)** — 上傳手寫作文圖片，AI 文字辨識後自動載入編輯器（寫作頁面與教師教材上載）
- **�👨‍👩‍👧 家長報告** — 教師可一鍵生成雙語 HTML 學習報告（KPI/錯題分佈/建議），適合家長日使用
- **🔔 通知中心** — 智慧輪詢（有未讀 15s／無未讀 60s），支援 batch mark-read
- **📋 作業 (Assignments)** — 查看教師指派的作業、作答提交、查看教師回饋與分數；重送或重載後沿用提交 key，避免重複 submission attempt、通知或 XP。
- **⏱️ 作業倒數計時** — 截止日期紅色閃爍提醒（>24h 藍色/<24h 琥珀色/<1h 紅色）
- **🧠 SRS 專用複習 UI** — 翻卡式 SM-2 評分（Easy/Hard/Again），進度條 + 完成摘要
- **🗺️ 知識圖譜視覺化** — 互動式 DAG 節點圖，SVG 連線顯示前置/強化/延伸關聯，支援技能篩選、年級篩選、關鍵字搜尋、縮放、Focus Mode（點擊節點高亮相依路徑並淡化無關節點）、節點 hover 顯示學習目標、邊線 hover 顯示關係類型、詳情面板（學習目標 + 前置/後續知識 + 常見錯誤 + 範例題目 + 學習時長），自動載入學生掌握度數據，顏色標記已掌握/未解鎖狀態
- **⚙️ 偏好設定 (Settings)** — 語言/主題/通知偏好，即時同步並跨裝置一致

### 🚀 v4.1 Learning Intelligence (Sprints 31-40)
- **🎯 學生掌握度模型 (S31)** — 6 維度技能追蹤（Grammar/Vocabulary/Reading/Writing/Listening/Speaking），基於準確度(60%)+新近度(25%)+練習量(15%)的加權公式
- **🔍 錯題智能引擎 (S32)** — 縱向錯題分析、持續性弱點檢測、改善/惡化趨勢判定（線性回歸）；弱項類別現以「技能／題型」分桶（`reading:inference` / `grammar:tenses-simple`），不再落入單一 `general`，舊弱項會被標記為已掌握
- **📊 DSE 文法考點權重** — 16 個文法主題的 HKDSE 考試頻率權重（時態 very-high → 虛擬語氣 low）
- **🌍 多元題材資料庫** — 200+ 閱讀主題、90+ 聆聽場景、90+ 寫作類別，涵蓋本地特色（香港街頭小吃、天星小輪、郊野公園、茶餐廳文化、社區重建、非遺保育、公共房屋）及國際視野（氣候正義、數位貨幣、AI 倫理、四天工作週、孤獨流行病、公平貿易、難民教育、全球糧食安全、跨境網購權益），確保出題內容豐富不重複
- **🧠 推薦引擎 2.0 (S33)** — 弱點(40%)+近期錯誤(30%)+考試重要性(20%)+記憶衰減(10%)自適應推薦
- **🗺️ 知識圖譜 (S34)** — 59 節點 DAG（文法 31 + 詞彙 5 + 閱讀 6 + 寫作 7 + 聆聽 5 + 口說 5）、4 種邊類型、CEFR/HKDSE 雙向對應、7 個 API endpoints、🆕 前端視覺化頁面（`/student/knowledge-graph`）
- **📚 詞彙智能 (S35)** — 6 種狀態判定（known/learning/weak/forgotten/mastered/need-review）、CEFR 難度估算、詞族分組
- **寫作教練 2.0 (S36)** — AI 寫作批改、即時寫作提示與改寫對照（原 8 維度啟發式診斷已移除，統一以 canonical CLO 評分取代）

### Writing Evaluation（自學導向）

平台提供以 HKDSE English Writing descriptors 為參考的英文寫作自學回饋。

評估流程：

1. **Semantic / task-coverage evaluator** — 提取題目要求及 verbatim evidence，只輸出證據，不產出分數/懲罰/上限
2. **CLO evaluator** — 獨立評估 Content、Language、Organization，是平台 CLO 分數的唯一來源
3. **Deterministic normalization** — 標準化每個 CLO 分數至 0–7（half-point rounding），計算平台 CLO 總分及練習估算
4. **Educational feedback** — 顯示具原文證據的優點與弱點，提供優先改進行動，分離忠實修正與示範強化，支援修改後再次批改

平台分數是寫作練習診斷估算（platform practice estimate），依據 HKDSE English Writing descriptors 作為參考框架。平台分數並非 HKEAA 官方評級，亦不代表公開考試成績預測。

Golden benchmark infrastructure 已就緒（17 個 golden fixtures：5 sample + 12 calibration；全部 expected scores 為 null），但 empirical metrics（MAE/RMSE/bias）需要 human-labelled data 才能計算。目前所有 calibration fixture 的 expected scores 均為 null。

**Human-Marker Evidence Pipeline（Phase 9，fail-closed）** — 證據生命週期：`calibration:intake`（HUMAN_AUTHORED 強制、level-only 拒絕）→ `calibration:verify`（需 verifiedBy + verifiedAt + confirmedSourceHash）→ `calibration:marker-pack` / `marker-intake`（append-only，無 AI 欄位）→ `calibration:adjudicate`（永不改動 original marks）→ `calibration:freeze`（manifest+inventory+fingerprint 一致性；unverified comparable 阻擋 freeze）。Gate 需 ≥8 **verified overall-comparable pairs**；sufficiency 數 pairs 而非 fixtures。

Phase 9 真實證據審計結論：官方 exemplar booklets 只公佈 level（LEVEL_ONLY），HKEAA 從不公佈 per-script marks；公開渠道不存在 script+score dataset。因此平台不會從 Level 推算分數、不用 AI 補分 — calibrated marker agreement 需招募 human markers 對 authentic scripts 做 blind CLO marking 才能建立。
- **📈 學習分析 (S37)** — 學生趨勢儀表板 + 教師班級分析（弱項/強項/進度/風險預測/雷達圖）
- **👨‍🏫 教師 Copilot (S38)** — AI 生成教案/家課/工作紙/小測/溫習卷、班級分析、考試預測、🆕 專屬前端頁面（`/teacher/copilot`）含 6 大功能分頁。教師資料權限以正典「主班級 ∪ `StudentClass`」關係判定；教師只可查看、建立組別或指派其任教學生，Demo 班別/帳戶不會出現在日常 roster、selector 或 Copilot 概覽。
- **🆕 行為監察 (S133)** — 教師端監察由「看分數」升級為「看行為」：失聯偵測（14天+ 未活動／從未開始紅燈）、活動度徽章（活躍／低活躍／失聯）、主要練習難度（暴露「題太易」）、寫作提交數欄位、教師首頁真實風險名單（失聯優先）與「失聯學生」KPI；Copilot 概覽真實活躍人數與待交作業數
- **🛡️ XP 反刷分 + 獎勵再平衡 (2026-09-28)** — XP 發放收歸伺服器權威：事件白名單、去重鍵由伺服器依識別碼（`questionId`／`wordId`／`mistakeId`／`sessionId`）或香港日建立並按學生界定，難度與連續天數一律伺服器解析（客戶端自報值全數忽略）；完成練習需對應真實場次。數值再平衡使深層行為 ≥ 淺層（完成 45、寫作 40、複習錯題 20、掌握生字 25、學新字 12；答錯 0）；`streakBonus` 加 7 日上限。實證事故：一名學生反覆切換單字熟悉度刷得 95,904 XP（佔其總分 94.7%），已回調 5,456 列 / 130,944 XP
- **🆕 初中誘因再平衡 (S133)** — 遊戲化獎「深度」不獎「點擊」：初中 1.2× 加成只適用於複習錯題／生字掌握；每日目標必須含一項深度（今日挑戰／複習 3 錯題／掌握 3 生字），5 題 MC 無法達標；streak 加碼只隨練習日遞增；新增初中友善徽章（掌握 20 生字／複習 10 錯題／本週 5 次挑戰）；S1-S3 不頒「寫作 5 篇」；初中排行榜按「本週活躍日數」而非總 XP；學生儀表板新增班級排行榜與深度目標進度、極短寫作（<100 字）偵測
- **🔄 自適應學習引擎 (S39)** — Facade 模式 5 階段 Pipeline：Mastery→Mistakes→KnowledgeGraph→Recommendations→ExerciseGen
- **🏛️ 統一 LearningFacade (S40)** — 所有學習模組的單一入口點，零重複業務邏輯

### 👩‍🏫 教師端
- **題目生成** — 按文法項目、技能範疇、難度、年級生成練習題
- **教材上載** — 匯入文字教材，AI 自動分析關鍵詞彙、文法點及建議題目
- **班級管理** — 建立班級、查看學生進度（按班號數字排序）、學生名單（含學號欄位，按班別→學號排序）
- **🆕 學生名單班別篩選可保留 (2026-10-07)** — 教師學生名單（`/teacher/students`）的**班別篩選會同步寫回網址**（`?class=`）：點入學生詳情後按返回（或瀏覽器上一頁）仍停留在同一班別，不再重設為「全部班別」；若網址帶入的班別已不存在，自動回退「全部班別」（不會出現永遠空白的列表）
- **🆕 各班級練習總覽 (2026-10-01；圖表 2026-10-07 補上練習次數)** — 教師主頁顯示全校每個班別的完成次數、參與人數、參與率及正確率（全歷史累計；正確率只計已驗證題目，「—」＝暫時未有數據）；長條圖（練習次數＋參與率／正確率；練習次數另設右軸，單位是「次」）＋可滾動明細表；資料由伺服器端單一 SQL 聚合（每生一列），不再以「最新 8 班」或作業完成率在客戶端拼圖
- **學生詳情** — 個別學生完整學習數據：XP/徽章/技能準確率/錯題分布/每週趨勢/逐題答案/CSV 匯出
- **課業管理** — 指派練習、查看完成狀況
- **組別管理** — 建立跨班級自訂組別（如拔尖組/補底組），作業可指派至組別
- **AI 批改覆核** — 教師查看 AI 評分，可修正分數/評語、接受或退回學生作業
- **成績報告** — 班級及個別學生成績分析
- **🆕 AI Copilot 教學助手** — 專屬前端頁面（`/teacher/copilot`），6 大功能分頁：概覽（班級狀態 + 真實活躍人數 + 待交作業 + 緊急行動）、教案生成（一週教學計劃含每日活動與家課）、班級分析（技能分佈 + 風險學生（失聯優先） + 建議）、考試預測（DSE 合格率 + 各卷預測 + 學生等級預測）、教材生成（工作紙/家課/小測/溫習卷/補底練習）、學生分析（個人技能詳情 + 進度 + 百分位）

### 🛡️ 管理員後台（`/admin`）
- **Google Sheets 同步** — 一鍵從 Google Sheets 同步全校學生班別名單（真相來源），支援 dry-run 預覽；**自動反向同步**：在平台新增班級或學生時，自動寫入 Google Sheets（班級列表 + 學生名單分頁），支援批量匯入批次同步
- **批量匯入** — CSV 批量匯入學生與教師資料（支援模板下載、Zod 驗證、upsert、dry-run 預覽、錯誤報告）
- **使用者管理** — 分頁查看、搜尋、篩選所有使用者（依角色/年級/班級），可編輯單筆資料（姓名、email、班級、科目、部門、學年等）
- **學生個人分析** — 搜尋學生列表，點擊進入個人分析儀表板：6 大統計卡片（準確率/練習次數/錯題數/連續學習/經驗值/詞彙量）、6 維技能掌握度進度條、弱點分析（頻率/嚴重程度/改善趨勢/建議）、每週學習趨勢圖、各技能練習統計表、最近練習記錄、最近錯題（含正誤答案對比）、詞彙概覽（熟悉度分佈）、診斷評估結果、寫作提交概覽
- **數據儀表板** — Recharts 圖表：各年級平均準確率長條圖、各班級準確率、月度練習趨勢折線圖、準確率分佈環形圖
- **全校匯出** — 一鍵匯出學生完整數據 CSV（含進度、準確率、練習次數、錯題數、詞彙數）及教師數據 CSV（含任教科目、班級、作業數）
- **班級修復** — 一鍵修復班級關聯（支援強制重新分配模式）
- **跨學年追蹤** — `academicYear` 欄位支援跨學年數據查詢與匯出
- **權限控制** — Middleware + API 雙層驗證，僅 `role === 'admin'` 可存取後台

### 📱 行動裝置支援
- **統一側欄佈局**（`SidebarLayout`）：教師端與學生端共用，桌面可收合為圖標模式，手機為抽屜式滑入 + 遮罩
- **學生手機底部快捷列**：5 個常用功能快速切換（主頁、練習、錯題、進度、更多）
- **全平台觸控優化**：所有按鈕 ≥ 36px 觸控面積、長按支援（HighlightContextMenu 600ms long-press）、文字選取彈出加入（`mouseup` + `touchend` + `pointerup` 三模式，涵蓋 Desktop / Android / iPad）、模態框 `max-w-[calc(100vw-2rem)]`、iPhone safe-area（`safe-bottom`）、iOS 鍵盤縮放防護（`text-base`）
- **響應式網格系統**：全站網格已適配 `grid-cols-1 sm:grid-cols-N` 模式（統計、CLO 評分、KPI、過濾列等）
- **瀏覽器基線（校內 iPad）**：`package.json` 的 `browserslist` 設為 `safari 15.4` / `ios_saf 15.4`，**此清單不可刪除**。Next.js 16 預設基線是 Safari 16.4+，其 client runtime 會輸出 class static block（`static{…}`）；iPadOS 15（iPad Air 2 / iPad mini 4 等，最高 iPadOS 15.8）解析該 chunk 即 SyntaxError → React 永不 hydrate → **所有按鈕（含 Google 登入）按了沒反應**。改動此清單或升級 Next.js 後必須重驗建構產物：`.next/static/**/*.js` 內 `static\s*\{` 必須為 0。
- **已知限制（iPadOS 15 的 CSS）**：Tailwind 4 的產物使用 `@property`（需 Safari 16.4）與 `color-mix()`（需 Safari 16.2），故 iPadOS 15 上**帶透明度的顏色與部分漸層會失效**；版面與多數樣式仍正常。功能下限為 iPadOS 15.4（產物使用 `Object.hasOwn` / `structuredClone`）。
- 手機／桌面功能一致；iPadOS 15.4+ 可完整操作，iPadOS ≤ 15.3 不在支援範圍

## 域架構 (v4.1)

| 域 | Facade | 子域 |
|----|--------|------|
| Student | `student/` | Mastery, Profile, Memory, Progress, Twin |
| Learning | `learning/` | Engine, Recommendation, KnowledgeGraph, Science, MistakeIntel, AdaptivePipeline |
| AI | `ai/` | Providers, Generation, Analysis, RAG, TTS, Cache, Cost, Eval, Experiment, Foundation, PromptVersioning, Regression, ContinuousEval |
| Knowledge Graph | `knowledge-graph/` | Graph Engine, Service, Repository, Visualization, WeaknessLocator, Traversal |
| Writing | `ai/usecases/analyze-writing.ts` + `writing-coach/repositories/` | CLO Scoring, Evidence Feedback, Draft Storage |
| Teacher | `teacher/` | Copilot, Monitoring, Student Access |
| Platform | `platform/` | Cache, Reliability, FeatureFlags, Health, Notification |

> 詳細技術棧見上方 [Layer | Technology](#-architecture-overview) 表格。域審計見 [DOMAIN_AUDIT.md](docs/DOMAIN_AUDIT.md)。

## 個人化學習流程

### 診斷測試 → 弱項訓練

1. 學生進入 `/student/diagnostic`
2. 系統讀取學生年級、近期練習記錄與錯題資料
3. AI 根據弱項自動生成個人化診斷題組（文法 / 詞彙 / 閱讀 / 寫作）
4. 完成診斷後，系統計算各技能分數並生成 AI 分析報告
5. 頁面提供「立即開始弱項訓練」按鈕，會自動帶入推薦技能、難度、題型與年級到 `/student/practice`
6. 練習頁收到診斷推薦參數後，直接為學生生成對應弱項訓練題組

### AI 求助助手 v2

`/student/help` 已全面升級，不再只是靜態 FAQ + AI 問答：

- **建議信心度系統**：根據練習次數（30 分）、總作答題數（30 分）、技能覆蓋數（20 分）、連續使用天數（20 分）四維度計算 0-100 分信心度，分為高/中/低/不足四級
- **數據不足智能提示**：當練習次數 < 3 或作答 < 30 題時，自動顯示基本英語提升建議（每日閱讀、每週寫作、錯題溫習、沉浸式學習），引導學生多用平台累積數據
- **弱項驅動 FAQ 排序**：靜態 FAQ 四大分類按學生弱項相關性自動排序，相關分類標記 🔴 優先關注標籤
- **AI 建議問題**：根據弱項自動生成 2-3 條建議提問（chip 形式），點擊即自動填入
- **個人化 FAQ 生成**：AI 分析後自動生成 2-3 條針對性 Q&A，附具體量化改善目標及時間表
- **個人化建議卡片**：先用學生自己的 `practice sessions`、`mistakes`、`level`、`streakDays` 建立學習上下文，自動生成個人化建議與急需改善項目
- **AI 問答**：學生輸入問題後，系統把問題連同弱項、近期錯題與近期表現送到 `/api/ai/study-help`，AI 回答附帶後續建議（follow-up tips）與建議聚焦主題（recommended focus）
- **即時練習生成**：AI 回答後，點擊「生成相關練習題」按鈕，系統根據學生問題自動生成 3 道相關練習題（MCQ），包含答案與解釋；亦可一鍵跳轉至完整練習模式

## 🚀 生產部署 Checklist

> 📋 完整長期維護與監控策略請見 [`docs/MAINTENANCE.md`](./docs/MAINTENANCE.md)
> 🔍 Prompt 驗證腳本：`npx tsx scripts/validate-prompts.ts`

### 環境變數（Cloud Run 服務環境變數 / Secret Manager）

| 變數 | 說明 | 必填 |
|------|------|------|
| `DEEPSEEK_API_KEY` | DeepSeek API key (`sk-...`) | ✅ |
| `JWT_SECRET` | JWT signing secret（32+ 字元隨機字串） | ✅ |
| `AUTH_SECRET` | NextAuth JWT secret (`openssl rand -base64 32`) | ✅ |
| `AUTH_GOOGLE_ID` | Google OAuth Client ID | ✅ |
| `AUTH_GOOGLE_SECRET` | Google OAuth Client Secret | ✅ |
| `DATABASE_URL` | PostgreSQL 連線字串 (`postgresql://...`) | ✅ |
| `GCP_PROJECT_ID` | Google Cloud Project ID | ⬜ |
| `GCP_SERVICE_ACCOUNT_JSON` | GCP Service Account JSON (Base64) | ⬜ |
| ~~`GEMINI_API_KEY` / `GEMINI_MODEL` / `GEMINI_LITE_MODEL`~~ | Gemini API retired 2026-08-20（已撤銷，不再使用） | — |
| `VERTEX_AI_LOCATION` | Vertex AI region (預設 `global`) | ⬜ |
| `DEEPSEEK_BASE_URL` | DeepSeek base URL (預設 `https://api.deepseek.com/v1`) | ⬜ |
| `DEEPSEEK_MODEL` | DeepSeek model（預設 `deepseek-flash`；可選 `deepseek-v4-pro`） | ⬜ |
| `GOOGLE_SHEETS_CLASS_ROSTER_ID` | 學生名單 Google Sheet ID（`/api/admin/sync-sheets` 班別同步用） | ⬜ |
| `GOOGLE_SHEETS_ID` | Google Sheets spreadsheet ID | ⬜ |
| `GOOGLE_DRIVE_FOLDER_ID` | Google Drive folder ID for materials | ⬜ |
| `DSE_RAG_ENABLED` | 啟用歷屆試題 RAG 檢索（`true`，強烈建議） | ⬜ |
| `AI_TIMEOUT_MS` | AI API 呼叫 timeout（ms），預設 dev=30000 / prod=20000（僅為安全下限，呼叫端應明確指定） | ⬜ |
| `AI_CACHE_ENABLED` | 啟用 AI 回應快取（預設 `true`，降低 API 費用） | ⬜ |
| `AI_CACHE_TTL_MS` | AI 快取 TTL（毫秒，預設 3600000 = 1 小時） | ⬜ |
| `LOG_LEVEL` | 日誌等級：`trace`/`debug`/`info`/`warn`/`error`/`fatal`（生產預設 `info`，開發預設 `debug`） | ⬜ |
| `AI_RATE_LIMIT_MAX` | AI API 每 IP 每分鐘最大請求數（預設 60，約支援 2 班同時使用） | ⬜ |
| `CRON_SECRET` | Cron Job 驗證密鑰（生產環境必須設定，`openssl rand -base64 32`） | ⬜ (prod) |

### 部署步驟

1. **資料庫**: 在 [Neon](https://neon.tech) / [Supabase](https://supabase.com) 建立免費 PostgreSQL，複製 `DATABASE_URL`
   - **pgvector**：執行 `CREATE EXTENSION IF NOT EXISTS vector;` 以啟用原生向量搜尋（可選但強烈建議，大幅提升 RAG 效能）
2. **Google OAuth**: [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Credentials → Create OAuth 2.0 Client ID
   - Authorized redirect URIs: `https://你的網域/api/auth/callback/google`
3. **DeepSeek API**: [platform.deepseek.com](https://platform.deepseek.com) → API Keys
4. **Cloud Run 環境變數**: 設定上述變數（建議用 Secret Manager 管理機密值）
5. **Prisma 遷移**: 映像檔建構期間不執行 migration；請以 `npx prisma migrate deploy` 套用（`scripts/production-build.js` 在 CI/本機建構時即為此流程）
6. **首次部署**: `npm run cloud-run:deploy:win -- -ProjectId <PROJECT_ID>`（此路徑先跑遷移再部署；**push 到 `main` 只觸發映像更新**，不會套用遷移）
7. **驗證**: 
   - 訪問 `/login` → Google 登入 → 角色選擇 → Dashboard
   - 測試 AI 練習生成（至少 3 題）
   - 檢查 `/api/ai/status` 回傳 `{ configured: true }`

### Smoke Tests
- [ ] `npm run smoke` — 49 項自動化檢查通過
- [ ] Google OAuth 登入成功
- [ ] AI 生成練習題（MCQ + 聽力）
- [ ] 寫作批改與改寫（CLO rubric 21 分制）
- [ ] Integrated Skills 三步驟流程（聆聽→筆記→寫作）
- [ ] 診斷測試 → 弱項訓練一鍵流程
- [ ] 中英語言切換（所有頁面，19 個 i18n 檔案 / 1661 個 key（中英各一），`npm run check:i18n` exit 0）
- [ ] 教師建立任務 → 學生提交 → AI 批改
- [ ] 管理員 CSV 批量匯入
- [ ] 生字簿 CRUD + PDF 匯出 + 串字練習
- [ ] AI fallback 驗證（DeepSeek fail → Grok 接手）
- [ ] PWA 安裝（manifest.json + SVG icons）

### Cloud Run 部署要點
- **自動部署**: push 到 `main` 觸發 GitHub→Cloud Build trigger，使用 repo 的 `cloudbuild.yaml`（`prisma migrate deploy` → docker build `--no-cache` → push → `gcloud run deploy`，帶 timeout 900s／併發 50／記憶體 1Gi；**不會覆蓋環境變數**）；或 `npm run cloud-run:deploy:win -- -ProjectId ...`（**先遷移後部署**）
- **建構**: Dockerfile 多階段建構（`next build` + standalone output），建構時用 placeholder DB，**不會**在映像檔建構期間執行 migration
- **資料庫遷移**: 已內含於 push 自動部署（遷移失敗即中止）；亦可手動 `npx prisma migrate deploy`（詳見 [`docs/CLOUD_RUN_MIGRATION.md`](./docs/CLOUD_RUN_MIGRATION.md)）
- **GCP 憑證**: 映像檔**不包含**任何憑證檔案；在 Cloud Run 設定 `GCP_SERVICE_ACCOUNT_JSON` 環境變數（建議 Secret Manager）
- **機密**: `cloud-run-env.yaml` 僅保留在本地（已加入 `.gitignore`），勿 commit
- **健康檢查**: `/api/health`（liveness probe）+ TCP 8080（startup probe）


## 近期更新

> 📋 所有更新記錄已移至 **[CHANGELOG.md](./CHANGELOG.md)**。

## 快速上手

### 🧑‍🎓 學生 3 步開始
1. **登入**：使用學校 Google 帳號登入
2. **設定年級**：前往「個人檔案」設定你的年級（S1–S6）
3. **開始練習**：到「AI 練習」選擇文法/技能，AI 自動生成題目；或在「診斷測驗」先測試弱項

### 👩‍🏫 教師 3 步開始
1. **登入**：使用學校 Google 帳號登入，選擇「教師」身份
2. **建立班級**：前往「班級管理」建立任教班級；或使用 CSV 批量匯入學生
3. **查看進度**：在「儀表板」查看各班準確率、**失聯學生**與**需要關注的學生**名單；在「報告」下載 CSV 成績表

### 🔄 Google Sheets 同步
- **匯入**：管理員可從 Google Sheets 一鍵同步全校學生班別名單
- **匯出**：系統可自動將學生學習數據（準確率、練習量、錯題數）寫回 Google Sheets，方便教師無需登入平台即可查看

## 快速開始

### 前置要求
- Node.js 18+
- DeepSeek API 金鑰（[取得 API Key](https://platform.deepseek.com/api_keys)）
- Google Cloud 專案（OAuth 憑證 + Vision API + Vertex AI）

### 安裝

```bash
# 1. 安裝依賴
npm install

# 2. 設定環境變數
cp .env.example .env.local
# 編輯 .env.local，填入 DEEPSEEK_API_KEY、AUTH_GOOGLE_ID、AUTH_GOOGLE_SECRET

# 3. 初始化資料庫
npm run db:push -- --accept-data-loss
npm run db:seed

# 4. 啟動開發伺服器
npm run dev
```

開啟 [http://localhost:3000](http://localhost:3000) 即可使用。

### 登入方式

| 方式 | 說明 |
|------|------|
| 🔵 Google OAuth | 使用學校 Google 帳號一鍵登入（推薦） |


#### Google OAuth 自動角色識別

系統根據 email **網域與格式**自動判斷身份（規則單一 owner：[`src/shared/auth/sign-in-role.ts`](src/shared/auth/sign-in-role.ts)）：

| Email 格式 | 角色 | 登入後 |
|-----------|------|--------|
| **校內網域**且學號形式（`s` + 7 位數字，如 `s2024146@pochiu.edu.hk`） | 學生 | → 直接進入學生主頁 |
| **校內網域**的其他帳號（如 `abc@pochiu.edu.hk`） | 教師 | → 角色選擇頁（學生/教師/管理員） |
| 管理員帳號（`ADMIN_EMAILS`，目前為 `ipwh@pochiu.edu.hk`） | 管理員 | → 角色選擇頁（學生/教師/管理員） |
| **非校內網域**（如 `xxx@gmail.com`、`xxx@hateroblox.com`） | 學生 | → 直接進入學生主頁（**永不**取得教師權限） |

- **只有校內網域帳號可以是教師／管理員**（2026-10-08 政策）。非校內網域一律視為學生 —— 修正前「凡非 `s\d{7}` 即為教師」，令校外 Google 帳號可取得教師權限（含匯出全校學生資料）。網域比對要求**完整網域標籤**，故 `x@notpochiu.edu.hk`、`x@pochiu.edu.hk.evil.com` 一律判為學生。
- 新教師首次 Google OAuth 登入時會自動建立帳號、設為教師角色，並**自動連結所有現行班級**（不含 Demo），令教師端立即看得到學生名單與作答情況。學生需先透過 [Google Sheets 同步](#google-sheets-班別同步-🔄) 匯入。
- 新增校內網域時改 `SCHOOL_EMAIL_DOMAINS`；教師 CSV 匯入（`/api/import`、`/api/admin/import/teachers`）會**拒絕**非校內網域的列。

## 環境變數

參考 `.env.example`，所有可用環境變數已完整列於上方「🚀 生產部署 Checklist」表格中。主要必填變數：

| 變數 | 說明 | 必填 |
|------|------|------|
| `DEEPSEEK_API_KEY` | DeepSeek API 金鑰（主要 AI 供應商） | ✅ |
| `JWT_SECRET` | JWT 簽署密鑰 | ✅ |
| `AUTH_SECRET` | NextAuth 加密密鑰 | ✅ |
| `AUTH_GOOGLE_ID` | Google OAuth 用戶端 ID | ✅ |
| `AUTH_GOOGLE_SECRET` | Google OAuth 用戶端密碼 | ✅ |
| `DATABASE_URL` | PostgreSQL 連線字串 | ✅ |
| `GCP_PROJECT_ID` | Vertex AI 所屬 GCP Project ID | ⬜ |
| `GCP_SERVICE_ACCOUNT_JSON` | GCP 服務帳號 JSON (Base64) | ⬜ |
| ~~`GEMINI_API_KEY`~~ | Gemini API 已於 2026-08-20 退役（無需設定） | — |

## 專案結構

```
src/
├── app/                      # Next.js App Router
│   ├── api/                  # 113 API route files
│   ├── student/              # 學生端頁面
│   ├── teacher/              # 教師端頁面
│   └── admin/                # 管理員後台
├── modules/                  # 🆕 模組化架構 (21 modules + __tests__)
│   ├── ai/                   # AI 服務 (19 子目錄, 208 files: providers, prompts, services, schemas, foundation, prompt-versioning, regression, experiments, continuous-evaluation, evaluation, assessment, benchmark, runtime, types, usecases, repositories, core)
│   ├── knowledge-graph/      # 知識圖譜 (59-node DAG, 7 API endpoints, 視覺化)
│   ├── learning/             # 學習引擎 (grammar DAG, mastery, recommendations, adaptive pipeline)
│   ├── student/              # 學生 mastery/profile/memory
│   ├── mistake/              # 錯題智能 (tracking, analytics, SRS)
│   ├── vocabulary/           # 詞彙智能 (word families, CEFR, SRS)
│   ├── writing-coach/        # 寫作草稿儲存 (writing-draft repository)
│   ├── curriculum/           # 課程資料 (HKDSE descriptors, CEFR)
│   ├── assessment/           # 評量服務 (Integrated Skills, diagnostic)
│   ├── reading/              # 閱讀服務
│   ├── exercise/             # 練習題庫與作答服務 (grammar-question store, practice submission)
│   ├── learning-analytics/   # 學習分析 (trends, teacher dashboard)
│   ├── admin/                # 管理員服務
│   ├── teacher/              # 教師 Copilot
│   ├── cache/                # 快取層
│   ├── ai-cost/              # AI 成本追蹤
│   ├── experiment/           # 實驗平台
│   ├── llm-eval/             # LLM 評測
│   ├── notification/         # 通知服務
│   ├── platform/             # 平台基礎 (feature flags, health, reliability)
│   ├── production/           # 生產工具
│   ├── index.ts              # 模組聚合入口
│   └── repositories.ts       # 共享 Repository 實例
├── shared/                   # 共享工具
│   ├── auth/                 # JWT + NextAuth
│   ├── config/               # 集中設定
│   ├── db/                   # Prisma 7
│   ├── logger/               # 結構化日誌
│   ├── utils/                # 通用工具
│   └── validation/           # Zod schemas (21 schemas, 17 routes)
├── components/               # React 元件
├── hooks/                    # React Hooks
├── store/                    # Zustand state
└── types/                    # TypeScript types
```

> 📖 完整模組文檔: [docs/MODULES.md](docs/MODULES.md) | 架構圖: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

## CSV 批量匯入格式

管理員可透過 `/admin/import` 頁面下載模板並上傳 CSV 進行批量匯入。

### 學生 CSV 欄位 (`students_template.csv`)

| 欄位 | 必填 | 格式 / 範例 | 說明 |
|------|------|------------|------|
| `studentId` | ✅ | `s10001` | `s` + 數字 |
| `email` | ✅ | `student1@school.edu.hk` | 有效 email |
| `nameZh` | ✅ | `陳大文` | 中文姓名 |
| `nameEn` | ✅ | `Chan Tai Man` | 英文姓名 |
| `level` | ✅ | `S4` | S1–S6 |
| `className` | ✅ | `4A` | 數字+英文字母 |
| `classNumber` | ❌ | `15` | 班號 |
| `gender` | ❌ | `M` / `F` | 性別 |
| `joinedAt` | ❌ | `2025-09-01` | 入學日期（預設今天） |

### 教師 CSV 欄位 (`teachers_template.csv`)

| 欄位 | 必填 | 格式 / 範例 | 說明 |
|------|------|------------|------|
| `teacherId` | ✅ | `chantm` | 英文姓氏+名字縮寫（e.g. 陳大文 → `chantm`） |
| `email` | ✅ | `teacher1@school.edu.hk` | 有效 email |
| `nameZh` | ✅ | `陳大文` | 中文姓名 |
| `nameEn` | ✅ | `Chan Tai Man` | 英文姓名 |
| `subjects` | ❌ | `"[""English Language""]"` 或 `English Language\|History` | JSON 陣列或 `\|` 分隔 |
| `department` | ❌ | `English` | 所屬部門 |
| `gender` | ❌ | `M` / `F` | 性別 |

### 匯入行為
- **Upsert**：email 已存在則更新，不存在則新增
- **跨角色保護**：若 email 已被其他角色使用，拒絕匯入並報告原因
- **自動建立班級**：CSV 中的 `className` 若不存在，自動建立
- **Dry-run 預覽**：勾選「預覽模式」可查看匯入結果而不實際寫入
- **錯誤報告**：逐列顯示成功/更新/失敗筆數及詳細原因

## Google Sheets 班別同步 🔄

管理員可從 Google Sheets **一鍵同步**全校學生的班別名單。教師在 Sheets 中維護學生名單（真相來源），平台讀取後自動更新資料庫（upsert：email 已存在則更新班別，不存在則建立新學生）。

### 前置條件

1. **Service Account 權限**：把 Google Sheet「共用」給服務帳號（只讀檢視即可；若需平台回寫名單則給編輯權限）：
   ```
   vision-api-user@amiable-nirvana-500300-a0.iam.gserviceaccount.com
   ```
2. **環境變數**（Cloud Run）：
   - `GOOGLE_SHEETS_CLASS_ROSTER_ID` = 學生名單 Sheet 的 ID（網址列 `/spreadsheets/d/【ID】/edit` 中間那段）
   - `GCP_SERVICE_ACCOUNT_JSON` = 上列服務帳號的 JSON（與 OCR/Vision/TTS 共用）

### Sheet 格式（第一個分頁）

| 欄位標題 | 對應欄位 | 必填 | 備註 |
|---------|---------|------|------|
| `EMAIL` | email | ✅ | 永久識別碼，**不可修改**；接受 `email`/`電郵`/`電郵地址`/`e-mail`（❌ 不接受 `GMAIL`，需先改名） |
| `CLASSCODE` | 班級 | ✅ | 如 `1A`；接受 `class`/`班級`/`classname`/`classcode`/`班別` |
| `CLASSNO` | 班號 | ⬜ | 接受 `classnumber`/`班號`/`classno`/`學號` |
| `CHNAME` | 中文名 | ⬜ | 接受 `namezh`/`中文姓名`/`chname`/`中文名`/`姓名` |
| `ENNAME` | 英文名 | ⬜ | 接受 `nameen`/`英文姓名`/`enname`/`英文名` |
| `LEVEL` | 年級 | ⬜ | 省略時由班級自動推斷（`1A` → `S1`） |

### 同步指令

```javascript
// 1. dry-run 預覽（不寫入）
fetch('/api/admin/sync-sheets', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ dryRun: true })
}).then(r => r.json()).then(console.log)

// 2. 確認 created / classFixed 合理、errors 為空後，正式同步
fetch('/api/admin/sync-sheets', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({})
}).then(r => r.json()).then(console.log)
```

> 需以管理員身份登入並在網站頁面執行（瀏覽器帶上 admin cookie）；rate limit 3 次/60 秒。

## 📋 更新日誌

> 完整更新記錄已移至 **[CHANGELOG.md](./CHANGELOG.md)**。

## 學年轉換 🔄

每年 9 月開學時需完成兩件事：**(A) 更新學生名單**（同步 Google Sheet）與 **(B) 更新學年**（例：2025-2026 → 2026-2027）。**所有學生的學習紀錄（錯題、練習、寫作）自動跟隨學生保留，不受升班影響。**

---

### A. 更新學生名單（Google Sheet 同步）

#### Step 1：把 .xlsx 轉成原生 Google Sheet

新學年的 `.xlsx`（如 `26-27_students_gmail.xlsx`）**必須轉成原生 Google Sheet**——Sheets API 只能讀原生 Sheet，讀不到 Office 檔：

1. 把 `.xlsx` 上傳到 Google Drive。
2. 用 Google Sheets 開啟該檔。
3. **檔案 → 另存為 Google 試算表**（`File → Save as Google Sheets`），產生原生 Sheet。

> ⚠️ 轉檔後 ID 會變，要用**新的** ID。
> ⚠️ 未轉檔直接同步會回 `400 FAILED_PRECONDITION "This operation is not supported for this document. The document must not be an Office file."`

#### Step 2：整理欄位與內容

確認第一個分頁的標題列符合平台格式（對照見「Google Sheets 班別同步」）。學校原始檔常見標題 `CLASSCODE / CLASSNO / ENNAME / CHNAME / SEX / GMAIL`：

- `GMAIL` **必須改名為 `EMAIL`**（否則回「找不到 Email 欄位」）。
- `SEX` 會被忽略，可保留。
- `LEVEL` 可省略（由 `CLASSCODE` 自動推斷 `1A`→`S1`）。

學生資料變更原則：

| 操作 | 做法 |
|------|------|
| **S6 畢業生** | 刪除該列，或移到另一個分頁歸檔 |
| **升班（如 S5→S6）** | 將 `CLASSCODE` 從 `5A` 改為 `6A` |
| **新 S1 學生** | 新增資料列，`CLASSCODE` = `1A`~`1D` |
| **轉班學生** | 直接修改 `CLASSCODE` |
| **EMAIL 不變** | ❗ EMAIL 是永久識別碼，**絕對不可修改** |

#### Step 3：共用與環境變數

1. 把 Sheet「共用」給服務帳號（檢視即可）：`vision-api-user@amiable-nirvana-500300-a0.iam.gserviceaccount.com`
2. Cloud Run → `english-platform` → 編輯並部署新修訂版本 → 把 `GOOGLE_SHEETS_CLASS_ROSTER_ID` 改為新 Sheet ID → 部署。

#### Step 4：dry-run 預覽 → 正式同步

以管理員登入網站，在瀏覽器 Console 執行：

```javascript
// 1. dry-run（不寫入），檢查 created / classFixed / errors
fetch('/api/admin/sync-sheets', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ dryRun: true })
}).then(r => r.json()).then(console.log)

// 2. 數字合理且 errors 為空，正式同步
fetch('/api/admin/sync-sheets', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({})
}).then(r => r.json()).then(console.log)
```

#### Step 5：檢查結果

| 指標 | 說明 |
|------|------|
| `created` | 新學生數（主要是新 S1，自動建立帳號） |
| `classFixed` | 升班/轉班被修正班別的舊生數 |
| `updated` | 班別不變、僅刷新資料的學生數 |
| `unassigned` | 不在名單中被解除班別的學生數（畢業生/轉校生） |
| `errors` | 應為空陣列 `[]` |

- `totalRows` 應等於 `created + classFixed + updated`。
- **畢業生 / 轉校生**：同步後會自動解除班別（`classId = null`），保留在資料庫中（學習紀錄完整），不再出現在新學年課堂名單。

> 💡 若平台尚未部署「自動解除班別」邏輯，或舊資料已同步過一次，可手動補跑：`npx tsx scripts/unassign-non-roster.ts --apply`（dry-run 不加 `--apply`）。此腳本會把不在名單中的學生解除班別，但完整保留其學習紀錄。

---

### B. 更新學年

學年值儲存在 `Class.academicYear` 與 `User.academicYear`。同步名單**不會**自動更新學年，需另外執行：

```bash
# dry-run 預覽
npx tsx scripts/set-academic-year.ts 2027-2028

# 正式寫入（更新資料 + Class 欄位預設值）
npx tsx scripts/set-academic-year.ts 2027-2028 --apply
```

同時把程式碼中的硬編碼舊學年全數改為新學年（每年 9 月固定動作）：
- `prisma/schema.prisma`（`Class.academicYear` 的 `@default`）
- `src/app/admin/classes/page.tsx`、`src/app/admin/users/page.tsx`
- `src/app/api/admin/classes/route.ts`、`src/app/api/admin/export/**`
- `src/modules/admin/services/{admin-operations,import-service,sync-service}.ts`
- `src/modules/student/repositories/user-repo.ts`
- `src/shared/google/sheets-sync.ts`、`src/shared/validation/schemas/admin.schema.ts`

並新增 migration（參考 `prisma/migrations/20260901_set_academic_year_2026_2027/`）。

> 💡 `scripts/set-academic-year.ts` 依序讀取 `.env.local` → `.env` → `cloud-run-env.yaml` 的 `DATABASE_URL`。
>
> 💡 2026-09-14：`prisma.config.ts` 現已採用相同順序（`.env.local` → `.env`），因此 `npx prisma migrate deploy` / `npx prisma db execute` 在本機可直接連線（此前只讀 `.env`，會以過期密碼得到 P1000）。真實環境變數（Cloud Run）永遠優先，部署行為不變。
>
> 💡 2026-09-14：`.env.local`、`.env`、`cloud-run-env.yaml` 三處的 `DATABASE_URL` **已同步為同一組有效憑證**（此前 Neon 密碼重設後只有 `.env.local` 更新）。下次由此 yaml 部署時不會再帶入過期密碼。

---

### C. 修復教師 ↔ 班級對照（TeacherClass）

教師端的**學生名單、班級清單與作答情況**一律以 `TeacherClass`（教師 ↔ 班級）為授權來源；沒有關聯的教師會看到空名單（`/api/teacher/students` 直接回空）、`/api/classes` 回 0 班，學生詳情與逐題答案回 403。只有 `role = 'admin'` 繞過這些檢查。

2026-10-08 生產庫曾為 **0 列**：教師帳號由「首次 Google 登入」自動建立（只寫 `User`，不建關聯），而 `/api/import`／`bulkImportTeachers()` 只在**新建教師**時連結班級（既有教師重匯不入帳），教師自助設定頁的班級清單又取自 `/api/classes`（非管理員只回自己任教的班級）⇒ 教師無法自救。

```bash
# dry-run 預覽（只報告缺少多少配對）
npm run db:link:teacher-classes

# 正式寫入（冪等：只補缺少的 teacherId × classId 配對）
npm run db:link:teacher-classes:apply

# 只處理指定班級
npx tsx scripts/link-teachers-to-classes.ts --class=4A --apply
```

- 語意：**每個班級**（不含 `Demo`）連結到**所有**教師與管理員，等同管理員在「班級管理」逐一重新儲存班級時的自動連結（`POST /api/admin/classes` 與本腳本共用 `adminLinkEducators()`）。
- **學校網域政策**：只有**校內網域**帳號可以是教師／管理員（規則單一 owner：[`src/shared/auth/sign-in-role.ts`](src/shared/auth/sign-in-role.ts)）；`adminFindEducators()` 已按網域過濾，`--apply` 亦會**清除不合法的既有關聯**（帳號非教師／管理員或非校內網域，例：曾被自動判為教師的校外帳號），dry-run 會先列出。
- **新教師會自動連結**：`auth-next.ts` 的 signIn callback 在**建立教師帳號**時呼叫 `adminLinkTeacherToAllClasses()`（同樣 fail-closed：非校內網域／非教師角色一律不連結），自動連結所有現行班級。刻意**只**在建立時連結 —— 管理員日後移除該教師的全部班級即可收回權限，之後的登入不會自動復原。
- 由 CSV 匯入的教師只取得 CSV 指定的班級（可能比自動連結更窄）；需要放寬時跑本腳本。
- 既有教師若在任何介面仍看到空名單，跑一次 `npm run db:link:teacher-classes:apply` 即可（冪等，只補缺少的配對）。

---

### 常見錯誤速查

| 錯誤 | 原因 | 解法 |
|------|------|------|
| `400 FAILED_PRECONDITION ... must not be an Office file` | Sheet 是 .xlsx 原始檔，非原生 Sheet | 「檔案 → 另存為 Google 試算表」轉原生 Sheet |
| `找不到「Email」欄位` | 標題是 `GMAIL` | 把標題改成 `EMAIL` |
| `500 無法讀取 Google Sheet 資訊 (403)` | 服務帳號無權限或 ID 錯 | 共用給服務帳號；確認 ID 正確 |
| `缺少環境變數 GOOGLE_SHEETS_CLASS_ROSTER_ID` | 變數未設定/未生效 | Cloud Run 設定後重新部署 revision |
| `password authentication failed` | 用了過期的 DB 連線字串 | 改用 `.env.local` 的 `DATABASE_URL` |

## 資料庫指令

```bash
npm run db:generate   # 生成 Prisma Client
npm run db:push       # 推送 Schema 到資料庫（初次使用需加 --accept-data-loss）
npm run db:migrate    # 建立 Migration
npm run db:seed       # 匯入種子資料（4 班級、1 教師、10 學生、1 管理員）
npm run db:studio     # 開啟 Prisma Studio
npm run db:reset      # 重置資料庫
```

> **注意：** 資料庫檔案預設存放於 `%TEMP%/english-platform-dev.db`。可透過 `.env.local` 的 `DATABASE_URL` 自訂路徑。

## 測試

```bash
npm test              # 執行全部測試
npm run test:watch    # 持續監控模式
```

測試涵蓋：AI 服務、學習引擎、學生檔案、錯題資料庫、詞彙關聯圖、領域事件、快取、AI 成本、效能、安全、可觀測性、評量、練習、回饋、學生、進度、詞彙、學習科學、知識圖譜、學習記憶、學生數位分身、教師副駕駛、寫作分析、LLM 評測、實驗平台等模組。

> 目前測試數量會隨開發變動，執行 `npm test` 取得最新統計。最後驗證：2026-09-26，166 files，3203 tests pass（+2 gated skips）。

## 目前狀態

> **最後更新**: 2026-08-19 | Sprints 1-130 + R3.10-K Phases 5-9

| 層級 | 狀態 |
|------|------|
| 架構 | ✅ 模組化架構 (Routes → Zod → Services → Repositories → DB) |
| AI 服務層 | ✅ DeepSeek（primary）→ Grok（fallback）fallback chain（Gemini Flash / Flash-Lite 註冊入口保留但 API 金鑰已於 2026-08-20 退役；Claude/OpenAI placeholder）, MCQ 正規化, provider registry DI |
| API 路由 | ✅ 113 routes（Zod-validated），Edge Runtime middleware（NextAuth + JWT） |
| 學習引擎 | ✅ 31-skill grammar DAG, mastery calculator, weakness analyzer, learning path generator |
| 詞彙關聯圖 | ✅ 動態詞族（首三字母 root 分組）、per-vocab 搭配詞、CEFR↔HKDSE mapping |
| 錯題資料庫 | ✅ SRS tracking, mistake analytics, personalized recommendations |
| 領域事件 | ✅ pub/sub event bus, 7 achievements, progress/achievement handlers |
| 快取 | ✅ TTL Map cache-aside, 6 cache namespaces |
| AI 成本 | ✅ 5 models priced, prompt dedup, usage reports |
| 安全 | ✅ prompt injection (11 patterns), XSS (9), PII (5), SQL injection (8), CSP |
| 可觀測性 | ✅ counters/histograms/gauges, distributed tracing, latency/error monitors, health reports |
| 資料庫 | ✅ Prisma 7（SQLite 開發 / PostgreSQL 生產，pgvector） |
| 認證 | ✅ NextAuth Google OAuth + JWT 雙支援，email 自動角色識別，Middleware 路由保護 |
| HKDSE 對齊 | ✅ KLACG 2017 Level Descriptors, Content/Language/Organization 三向度平台評估 |
| DSE RAG | ✅ 歷屆試題已匯入，7 個 usecase + 閱讀路由共 8 個流程已接入（Feature Flag: `DSE_RAG_ENABLED`）；RAG 僅作為提示詞接地參考，不直接決定評分 |
| 寫作評估 | ✅ 3 評估器架構（Semantic 證據層→CLO 評分層→確定性標準化）。8 條架構不變量由合約測試強制執行。Golden benchmark infrastructure 就緒（17 fixtures，全部 expected=null）；empirical metrics (MAE/RMSE/bias) 需要 human-labelled data |
| 校準（Calibration） | ✅ 校準基礎設施就緒（三態 release gate、執行歸因、序數 level 指標、C/L/O 維度門檻、evidence 驗證政策）。**基礎設施存在不建立 HKDSE 評分有效性**：目前 `overall-comparable = 0` → `INSUFFICIENT_DATA`，`ASSESSMENT VALIDITY NOT ESTABLISHED`（平台不宣稱 marker-equivalence） |
| 測試 | ✅ 142 files, 2973 tests pass（2026-09-17） |

## 部署

### Cloud Run（唯一部署目標）
專案已配置 `Dockerfile` + `cloudbuild.yaml`，可自動部署至 Google Cloud Run（asia-east2, 900s timeout, 1 vCPU/1GiB）。
詳見 [`docs/CLOUD_RUN_MIGRATION.md`](docs/CLOUD_RUN_MIGRATION.md) 及 `scripts/cloud-run-deploy.ps1` / `cloud-run-deploy.sh`。

> **2026-09-15 — Vercel 部署已移除**：`vercel.json`、`@vercel/kv`、middleware 的 `_vercel_jwt` 處理及所有 `VERCEL*` 環境變數分支皆已刪除。
> `scripts/vercel-build.js` 已更名為 `scripts/production-build.js`（`npm run build:prod`），供 Docker build / CI 使用。

## 歷屆試題 RAG 設定 🔍

> **DSE RAG** 讓 AI 在出題、批改、解說時自動參考真實 DSE 歷屆試題與官方 Marking Schemes，大幅提升題目品質與評分準確度。

### 啟用步驟

```bash
# 1. 匯入歷屆試題到資料庫（含自動 RAG 向量索引）
npx tsx scripts/import-past-papers.ts

# 預覽模式（不寫入，先檢查）
npx tsx scripts/import-past-papers.ts --dry-run

# 只匯入特定檔案
npx tsx scripts/import-past-papers.ts --file "Paper 1_Part A"

# 只建立 Material 不索引（之後再手動索引）
npx tsx scripts/import-past-papers.ts --skip-rag
```

```bash
# 2. 設定環境變數（.env.local 或 Cloud Run 環境變數）
DSE_RAG_ENABLED=true
```

```bash
# 3. 驗證 RAG 狀態
curl http://localhost:3000/api/rag?action=stats
# 預期回傳: { "totalMaterials": 20, "indexedMaterials": 20, "totalChunks": 150+ }
```

### 涵蓋的 AI 流程

| AI 功能 | RAG 注入內容 | 效果 |
|---------|-------------|------|
| **題目生成** `generateQuestions` | 相關歷屆試題段落 + Marking Scheme | 提示詞接地（prompt grounding） |
| **答案批改** `analyzeAnswer` | 對應卷別 Marking Scheme | 參考 Acceptable Answers |
| **寫作批改** `analyzeWriting` | Paper 2 Writing Marking Scheme | 參考上下文（不決定評分） |
| **錯題解說** `explainMistake` | 相關 Marking Scheme | 引用 model answer 對比說明 |
| **學習求助** `answerStudyHelp` | 弱項對應歷屆試題 + MS | 指出 DSE 對應題型與評分重點 |

### 架構

```
materials/_extracted/*.txt  →  import-past-papers.ts  →  Material + MaterialChunk (DB)
                                                              ↓
學生出題/批改請求  →  src/modules/ai/services/ai-service.ts  →  retrievePastPaperContent()  →  Cosine Similarity
                                                        retrieveMarkingScheme()         ↓
                                                            ↓                    DeepSeek Embedding
                                                     buildDSEContextPrompt()
                                                            ↓
                                                    注入 System Prompt  →  DeepSeek / Grok
```

### 注意事項
- **Feature Flag**: 預設關閉（`DSE_RAG_ENABLED=false`），不影響現有功能
- **Fallback**: RAG 檢索失敗時自動回退純 prompt 模式，不中斷服務
- **DeepSeek Embedding API**: 需要有效的 `DEEPSEEK_API_KEY`
- 匯入約 20 份文件預計產生 150-300 個向量 chunks，每次 API 呼叫約需 1-3 秒
- 首次匯入後建議重新部署 Cloud Run 服務以確保環境變數生效

## Known Limitations

### 平台設計限制（非 bug，屬設計取捨）
- **新用戶尚無學習記錄**：首次登入的用戶尚無練習/錯題/詞彙數據，部分頁面會顯示 empty state 或引導提示。開始練習後會自動累積真實數據。
- **Speaking Practice**：目前僅支援文字 transcript 輸入分析（文法/詞彙/內容），無法評估流暢度、發音及互動表現。未來可整合 STT（語音辨識）。
- **Cloud Run 部署**：AI 函數需要足夠 timeout（Cloud Run 請求上限 900s，見 `cloud-run.yaml`；2026-10-04 由 300s 提升，因 IELTS 完整組件生成需 4 次生成＋4 次盲解覆核）。程式內部的 AI 時間預算仍保守設為 115s（`provider-registry.ts`）。
- **Web Speech API Fallback**：Google Cloud TTS 不可用時自動降級至瀏覽器 Web Speech API，不同瀏覽器的語音品質不一（建議使用 Chrome）。
- **Rate Limiter（多實例限制）**：`src/shared/utils/rate-limiter.ts` 目前為 per-instance in-memory 計數。Cloud Run 最多 20 instances（`cloud-run.yaml`），故實際全域上限約為 `maxRequests × instance 數`。原本的 Vercel KV 分散式後端已隨 Vercel 一起移除；如需全域精確限流，需接入 Redis / Memorystore。
- **AI Hallucination Guard**: 集中式 10 規則 guard（`src/modules/ai/services/hallucination-guard.ts`），所有 prompt 模板統一引用，防止 AI 生成虛構內容。
- **ESLint warnings**：6 條非關鍵規則降級為 warning，可在 code review 時逐步清理。見 `eslint.config.mjs`。
