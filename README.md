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
- **Tests**: Run `npm test` for current count. Last verified: 2026-08-20 — 129 files, 2852 tests pass (+1 gated skip; full non-E2E), plus 34 route-security behavior tests (SEC-001..009).

## 🏗️ Architecture Overview

```
Routes (119) → AIFacade → UseCases (13) → executeAI / executeAIRaw
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

> 詳細架構請見 [ARCHITECTURE.md](docs/ARCHITECTURE.md) 及 [ADRs](docs/architecture/)

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 |
| Language | TypeScript 5 (strict) |
| Database | PostgreSQL (Neon) + Prisma 7 |
| Auth | JWT (jose) + NextAuth v5 — dual auth, `verifyApiAuth()` on all routes |
| AI | DeepSeek (primary) → Grok (fallback); Claude/OpenAI placeholders; Vertex Gemini via GCP service account. Gemini API key **retired 2026-08-20** (revoked, configuration removed) |
| Validation | Zod v4 |
| Testing | Vitest + Playwright E2E |
| Architecture | Enforcement tests (import direction, service size, provider isolation, cache ownership, repository isolation) |
| Documentation | 37 ADRs in `docs/architecture/` |
| State | Zustand |
| CSS | Tailwind 4 |
| Deployment | **Cloud Run** (asia-east2, 300s timeout, auto-deploy via `cloudbuild.yaml`) + Vercel (legacy) |

## 功能

### 🧑‍🎓 學生端
- **AI 練習題目** — 支援選擇題、填充題、寫作題，3 種難度（補底/核心/挑戰），自動從學生 profile 載入年級
- **📖 閱讀理解 (DSE Paper 1)** — 生成 DSE 風格閱讀篇章（4–5 段、段落分佈檢查、主題多樣化），涵蓋 Literal → Inferential → Evaluative 漸進式題型（MCQ / 填充 / True-False-NG / 語調態度 / 主旨推斷 / 詞彙 / 摘要 / 配對 / 排序），AI 語意批改對照 HKDSE Reading Descriptors；題目支援中英切換
- **🔥 每日挑戰 (Daily Challenge)** — 每日一題（文法選擇/填充/短文/配對），完成獲得連續學習 streak 加成與 XP；題目由伺服器持有，提交時以伺服器答案鍵批改
- **個人化診斷測試** — 根據學生年級、近期練習與錯題生成診斷題目，完成後可一鍵進入弱項訓練
- **聆聽練習** — 內建 TTS 語音播放，支援聆聽理解題型；DSE Paper 3 風格對話（含 distraction、synonym replacement、speaker attitude 等真實考試陷阱），題型涵蓋 MCQ / fill-blank / form-filling / inference / matching
- **🎧✍️ Integrated Skills 綜合訓練 v6** — 完整模擬 DSE Paper 3 Part B 考試流程。**9 種 DSE 文體**、**Data File 資料夾模擬**、**平台診斷分析**、**5 種真實考試陷阱**、**12 種速記符號面板**、**抄襲偵測強化**、步驟鎖定（聆聽→筆記→寫作）、**Note-taking 中英雙語指引**（英文 + 繁體中文切換按鈕）、**AI 參考範本答案**（平台教學參考，非官方評分樣本）、**PDF 匯出**（完整報告含聆聽原文/Data File/筆記/學生寫作/AI 分析/範本答案）、AudioPlayer 播放控制、7 種 AI 分析結果展示、桌面 Sidebar + 行動裝置 Bottom Tabs、15 秒自動儲存草稿
  - **⚠️ Integrated Skills 診斷分析是平台內部評估，並非 HKEAA 官方評分。** 百分比權重及等級對照為平台教學參考，並非來自官方文件。此聲明已直接顯示於批改結果頁面。
- **🗄️ 完整資料持久化** — 逐題答案儲存（`PracticeAnswer`）、XP 審計記錄（`XpTransaction`）、詞彙掌握度歷史（`VocabMasteryLog`）、錯題複習記錄（`MistakeReviewLog`）、診斷結果儲存（`DiagnosticResult`）、每週進度快照（`WeeklySnapshot`）
- **即時批改回饋** — AI 分析答案，對照 HKDSE Reading/Listening Descriptors 評級，提供中英雙語解釋、常見錯誤提示
- **寫作批改** — 平台提供以 HKDSE English Writing descriptors 為參考的英文寫作自學回饋。評估流程包括：(1) 題目要求及語義證據分析、(2) Content / Language / Organization 三向度平台評估（各 0-7 分，總分 21 分）、(3) 確定性分數標準化、(4) 具原文證據的教育回饋、(5) 優先改進行動、忠實修正、示範強化及再次提交比較。**平台分數是寫作練習診斷估算，並非 HKEAA 官方評級，亦不代表公開考試成績預測。**
- **錯題本** — AI 解釋每道錯題的原因、文法規則、記憶口訣
- **進度分析** — 學習數據儀表板，AI 對照 HKDSE Subject Descriptors 提供個人化學習建議及週計劃
- **詞彙庫** — 生字學習及語音播放
- **📚 智能生字簿 2.0** — AI 一鍵分析單字（詞性、中英意思、例句、同義字、反義字、搭配詞），浮動按鈕快速加入，右鍵選取文字即時加入，批量匯入，CSV/Anki/PDF 匯出，個人化 AI 複習建議，掌握度 ★ 評級（0-5），自動去重
- **📝 生字簿 2.1 強化** — API 分頁支援（`page`/`limit`/`search`/`familiarity`/`pos`/`sort`）、`/api/vocabulary/suggest` 練習自動建議生字、`/api/vocabulary/example` 專用例句生成、`/api/vocabulary/quiz` 互動式詞彙測驗（MCQ + 配對題）、VocabCard 策略提示根據掌握度動態推導
- **✏️ 串字練習 (Spelling Practice)** — 看中文意思及英文例句提示，自行輸入正確英文單詞；支援 4 種選字模式（最新/隨機/最弱/到期）、即時批改、錯誤重試、SRS 掌握度自動更新；完成後顯示成績及逐字結果回顧（`SpellingSession` + `SpellingAttempt` DB 模型）
- **➕ 無縫添加生字** — 任何 AI 輸出（passage、寫作分析、詞彙建議、改寫版本、Integrated Skills 評語）均可一鍵加入生字簿：`InlineWordBadge`（hover/+ 按鈕）、`TextSelectionPopup`（選取文字浮動加入）、`VocabEnabledText`（包裝任何文字區域）；寫作頁詞彙建議旁直接顯示 + 按鈕
- **AI 求助助手** — 🆕 **個人化求助與建議 v2**：讀取學生練習紀錄、錯題數據及連續學習天數後，自動計算**建議信心度**（0-100 分，四維度加權）；AI 對照 HKDSE 各卷別等級描述提供**具體量化**的個人化英文學習建議（含改善目標及時間表）；**弱項驅動 FAQ 動態排序**（文法/詞彙/寫作/閱讀分類按相關性自動排列，弱項類別標記 🔴 優先關注）；**AI 建議問題**（根據弱項自動生成 2-3 條建議提問，一鍵發問）；**個人化 FAQ**（從 AI 分析結果生成針對性 Q&A，附具體量化改善步驟）；**數據不足提示**（練習少於 3 次或作答少於 30 題時顯示基本英語提升建議，提示多用平台累積數據）；回答後可一鍵生成相關練習題目，即時練習改進
- **🎮 遊戲化學習** — XP 經驗值與等級系統（Lv.1-20）、12 款成就徽章（連續學習、正確率、練習量、寫作、詞彙）、匿名班級排行榜、每日連續學習火焰動畫
- **🧠 間隔重溫 (SRS)** — 基於 SM-2 演算法，詞彙與錯題自動排程每日複習，支援 Easy/Hard/Again 評分，動態調整複習間隔，確保長期記憶
- **✍️ 互動寫作** — AI 批改後一鍵改寫作文，原文與改寫版左右對比 (Diff View)，分層反饋（簡潔 / 詳細），一鍵採用 AI 改寫內容
- **🔍 歷屆試題 RAG (DSE RAG)** — AI 出題、批改、解說時自動檢索真實 DSE 歷屆試題內容與官方 Marking Schemes 作為參考上下文。RAG 檢索結果僅用於提示詞接地（prompt grounding），不直接決定學生評分。（Feature Flag: `DSE_RAG_ENABLED=true`）
- **🗣️ 口語練習** — 支援 transcript 文字輸入分析（DSE Speaking rubric L1-L5 評級），可選 S1-S6 年級及補底/核心/挑戰難度，未來擴展 STT 語音辨識
- **� 手寫作文上傳 (OCR)** — 上傳手寫作文圖片，AI 文字辨識後自動載入編輯器（寫作頁面與教師教材上載）
- **�👨‍👩‍👧 家長報告** — 教師可一鍵生成雙語 HTML 學習報告（KPI/錯題分佈/建議），適合家長日使用
- **🔔 即時通知 (SSE)** — 輕量 polling API 取代固定 15s interval，支援 batch mark-read
- **📋 作業 (Assignments)** — 查看教師指派的作業、作答提交、查看教師回饋與分數
- **⏱️ 作業倒數計時** — 截止日期紅色閃爍提醒（>24h 藍色/<24h 琥珀色/<1h 紅色）
- **🧠 SRS 專用複習 UI** — 翻卡式 SM-2 評分（Easy/Hard/Again），進度條 + 完成摘要
- **🗺️ 知識圖譜視覺化** — 互動式 DAG 節點圖，SVG 連線顯示前置/強化/延伸關聯，支援技能篩選、年級篩選、關鍵字搜尋、縮放、Focus Mode（點擊節點高亮相依路徑並淡化無關節點）、節點 hover 顯示學習目標、邊線 hover 顯示關係類型、詳情面板（學習目標 + 前置/後續知識 + 常見錯誤 + 範例題目 + 學習時長），自動載入學生掌握度數據，顏色標記已掌握/未解鎖狀態
- **⚙️ 偏好設定 (Settings)** — 語言/主題/通知偏好，即時同步並跨裝置一致

### 🚀 v4.1 Learning Intelligence (Sprints 31-40)
- **🎯 學生掌握度模型 (S31)** — 6 維度技能追蹤（Grammar/Vocabulary/Reading/Writing/Listening/Speaking），基於準確度(60%)+新近度(25%)+練習量(15%)的加權公式
- **🔍 錯題智能引擎 (S32)** — 縱向錯題分析、持續性弱點檢測、改善/惡化趨勢判定（線性回歸）
- **📊 DSE 文法考點權重** — 16 個文法主題的 HKDSE 考試頻率權重（時態 very-high → 虛擬語氣 low）
- **🌍 多元題材資料庫** — 200+ 閱讀主題、90+ 聆聽場景、90+ 寫作類別，涵蓋本地特色（香港街頭小吃、天星小輪、郊野公園、茶餐廳文化、社區重建、非遺保育、公共房屋）及國際視野（氣候正義、數位貨幣、AI 倫理、四天工作週、孤獨流行病、公平貿易、難民教育、全球糧食安全、跨境網購權益），確保出題內容豐富不重複
- **🧠 推薦引擎 2.0 (S33)** — 弱點(40%)+近期錯誤(30%)+考試重要性(20%)+記憶衰減(10%)自適應推薦
- **🗺️ 知識圖譜 (S34)** — 28 節點 DAG（含 learning 模組種子資料共 52 節點）、4 種邊類型、CEFR/HKDSE 雙向對應、7 個 API endpoints、🆕 前端視覺化頁面（`/student/knowledge-graph`）
- **📚 詞彙智能 (S35)** — 6 種狀態判定（known/learning/weak/forgotten/mastered/need-review）、CEFR 難度估算、詞族分組
- **寫作教練 2.0 (S36)** — AI 寫作批改、即時寫作提示與改寫對照（原 8 維度啟發式診斷已移除，統一以 canonical CLO 評分取代）

### Writing Evaluation（自學導向）

平台提供以 HKDSE English Writing descriptors 為參考的英文寫作自學回饋。

評估流程：

1. **Semantic / task-coverage evaluator** — 提取題目要求及 verbatim evidence，只輸出證據，不產出分數/懲罰/上限
2. **CLO evaluator** — 獨立評估 Content、Language、Organization，是平台 CLO 分數的唯一來源
3. **Deterministic normalization** — 標準化每個 CLO 分數至 0–7（half-point rounding），計算平台 CLO 總分及練習估算
4. **Educational feedback** — 顯示具原文證據的優點與弱點，提供 1–3 個優先改進行動，分離忠實修正與示範強化，支援修改及再次提交

平台分數是寫作練習診斷估算（platform practice estimate），依據 HKDSE English Writing descriptors 作為參考框架。平台分數並非 HKEAA 官方評級，亦不代表公開考試成績預測。

Golden benchmark infrastructure 已就緒（5 個 calibration fixtures），但 empirical metrics（MAE/RMSE/bias）需要 human-labelled data 才能計算。目前所有 calibration fixture 的 expected scores 均為 null。

**Human-Marker Evidence Pipeline（Phase 9，fail-closed）** — 證據生命週期：`calibration:intake`（HUMAN_AUTHORED 強制、level-only 拒絕）→ `calibration:verify`（需 verifiedBy + verifiedAt + confirmedSourceHash）→ `calibration:marker-pack` / `marker-intake`（append-only，無 AI 欄位）→ `calibration:adjudicate`（永不改動 original marks）→ `calibration:freeze`（manifest+inventory+fingerprint 一致性；unverified comparable 阻擋 freeze）。Gate 需 ≥8 **verified overall-comparable pairs**；sufficiency 數 pairs 而非 fixtures。

Phase 9 真實證據審計結論：官方 exemplar booklets 只公佈 level（LEVEL_ONLY），HKEAA 從不公佈 per-script marks；公開渠道不存在 script+score dataset。因此平台不會從 Level 推算分數、不用 AI 補分 — calibrated marker agreement 需招募 human markers 對 authentic scripts 做 blind CLO marking 才能建立。
- **📈 學習分析 (S37)** — 學生趨勢儀表板 + 教師班級分析（弱項/強項/進度/風險預測/雷達圖）
- **👨‍🏫 教師 Copilot (S38)** — AI 生成教案/家課/工作紙/小測/溫習卷、班級分析、考試預測、🆕 專屬前端頁面（`/teacher/copilot`）含 6 大功能分頁
- **🆕 行為監察 (S133)** — 教師端監察由「看分數」升級為「看行為」：失聯偵測（14天+ 未活動／從未開始紅燈）、活動度徽章（活躍／低活躍／失聯）、主要練習難度（暴露「題太易」）、寫作提交數欄位、教師首頁真實風險名單（失聯優先）與「失聯學生」KPI；Copilot 概覽真實活躍人數與待交作業數
- **🆕 初中誘因再平衡 (S133)** — 遊戲化獎「深度」不獎「點擊」：初中 1.2× 加成只適用於複習錯題／生字掌握；每日目標必須含一項深度（今日挑戰／複習 3 錯題／掌握 3 生字），5 題 MC 無法達標；streak 加碼只隨練習日遞增；新增初中友善徽章（掌握 20 生字／複習 10 錯題／本週 5 次挑戰）；S1-S3 不頒「寫作 5 篇」；初中排行榜按「本週活躍日數」而非總 XP；學生儀表板新增班級排行榜與深度目標進度、極短寫作（<100 字）偵測
- **🔄 自適應學習引擎 (S39)** — Facade 模式 5 階段 Pipeline：Mastery→Mistakes→KnowledgeGraph→Recommendations→ExerciseGen
- **🏛️ 統一 LearningFacade (S40)** — 所有學習模組的單一入口點，零重複業務邏輯

### 👩‍🏫 教師端
- **題目生成** — 按文法項目、技能範疇、難度、年級生成練習題
- **教材上載** — 匯入文字教材，AI 自動分析關鍵詞彙、文法點及建議題目
- **班級管理** — 建立班級、查看學生進度（按班號數字排序）、學生名單（含學號欄位，按班別→學號排序）
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
- 所有功能在手機與桌面完全一致，無功能缺漏

## 域架構 (v4.1)

| 域 | Facade | 子域 |
|----|--------|------|
| Student | `student/` | Mastery, Profile, Memory, Progress, Twin |
| Learning | `learning/` | Engine, Recommendation, KnowledgeGraph, Science, MistakeIntel, AdaptivePipeline |
| AI | `ai/` | Providers, Generation, Analysis, RAG, TTS, Cache, Cost, Eval, Experiment, Foundation, PromptVersioning, Regression, ContinuousEval |
| Knowledge Graph | `knowledge-graph/` | Graph Engine, Service, Repository, Visualization, WeaknessLocator, Traversal |
| Writing | `ai/usecases/analyze-writing.ts` + `writing-coach/repositories/` | CLO Scoring, Evidence Feedback, Draft Storage |
| Teacher | `teacher/` | Copilot, Analytics, Dashboard |
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

### 環境變數（Vercel Dashboard → Settings → Environment Variables）

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
| `GEMINI_API_KEY` | Gemini API key (fallback) | ⬜ |
| `GEMINI_MODEL` | Gemini model (預設 `gemini-2.5-flash`) | ⬜ |
| `GEMINI_LITE_MODEL` | Gemini Flash-Lite model (預設 `gemini-2.5-flash-lite`) | ⬜ |
| `VERTEX_AI_LOCATION` | Vertex AI region (預設 `global`) | ⬜ |
| `DEEPSEEK_BASE_URL` | DeepSeek base URL (預設 `https://api.deepseek.com/v1`) | ⬜ |
| `DEEPSEEK_MODEL` | DeepSeek model (預設 `deepseek-chat`) | ⬜ |
| `GOOGLE_SHEETS_ID` | Google Sheets spreadsheet ID | ⬜ |
| `GOOGLE_DRIVE_FOLDER_ID` | Google Drive folder ID for materials | ⬜ |
| `DSE_RAG_ENABLED` | 啟用歷屆試題 RAG 檢索（`true`，強烈建議） | ⬜ |
| `AI_TIMEOUT_MS` | AI API 呼叫 timeout（ms），預設 dev=30000 / prod=8000（Vercel Hobby 建議） | ⬜ |
| `AI_CACHE_ENABLED` | 啟用 AI 回應快取（預設 `true`，降低 API 費用） | ⬜ |
| `AI_CACHE_TTL_MS` | AI 快取 TTL（毫秒，預設 3600000 = 1 小時） | ⬜ |
| `LOG_LEVEL` | 日誌等級：`trace`/`debug`/`info`/`warn`/`error`/`fatal`（生產預設 `info`，開發預設 `debug`） | ⬜ |
| `AI_RATE_LIMIT_MAX` | AI API 每 IP 每分鐘最大請求數（預設 60，約支援 2 班同時使用） | ⬜ |
| `CRON_SECRET` | Cron Job 驗證密鑰（生產環境必須設定，`openssl rand -base64 32`） | ⬜ (prod) |

### 部署步驟

1. **資料庫**: 在 [Neon](https://neon.tech) / [Supabase](https://supabase.com) 建立免費 PostgreSQL，複製 `DATABASE_URL`
   - **pgvector**：執行 `CREATE EXTENSION IF NOT EXISTS vector;` 以啟用原生向量搜尋（可選但強烈建議，大幅提升 RAG 效能）
2. **Google OAuth**: [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Credentials → Create OAuth 2.0 Client ID
   - Authorized redirect URIs: `https://你的網域.vercel.app/api/auth/callback/google`
3. **DeepSeek API**: [platform.deepseek.com](https://platform.deepseek.com) → API Keys
4. **Vercel 環境變數**: 在專案 Settings → Environment Variables 設定上述變數，標記為 **Secret**（Production + Preview）
5. **Prisma 遷移**: `npx prisma db push`（或 `npx prisma migrate deploy`）
6. **首次部署**: 在 Vercel Dashboard 手動觸發 Deploy
7. **驗證**: 
   - 訪問 `/login` → Google 登入 → 角色選擇 → Dashboard
   - 測試 AI 練習生成（至少 3 題）
   - 檢查 `/api/ai/status` 回傳 `{ configured: true }`

### Smoke Tests
- [ ] `npm run smoke` — 45 項自動化檢查通過
- [ ] Google OAuth 登入成功
- [ ] AI 生成練習題（MCQ + 聽力）
- [ ] 寫作批改與改寫（CLO rubric 21 分制）
- [ ] Integrated Skills 三步驟流程（聆聽→筆記→寫作）
- [ ] 診斷測試 → 弱項訓練一鍵流程
- [ ] 中英語言切換（所有頁面，18 個 i18n 模組檔案 / 1655 個 key，`npm run check:i18n` exit 0）
- [ ] 教師建立任務 → 學生提交 → AI 批改
- [ ] 管理員 CSV 批量匯入
- [ ] 生字簿 CRUD + PDF 匯出 + 串字練習
- [ ] AI fallback 驗證（DeepSeek fail → Gemini 接手）
- [ ] PWA 安裝（manifest.json + SVG icons）

### Vercel 配置要點
- **AI 函數**: maxDuration 30s + memory 1024MB（`vercel.json`）
- **Pro 方案建議**: 60s maxDuration 更適合長寫作批改
- **Log Drain**: 建議設定 → Logs → External Log Draining（Datadog / Axiom）
- **Cron Jobs** (Pro): 可設定每日清理過期 rate-limit、SRS 複習提醒

### Cloud Run 部署要點
- **自動部署**: push 到 `main` 觸發 `cloudbuild.yaml`（docker build → push → `gcloud run deploy`，環境變數不覆蓋）；或 `npm run cloud-run:deploy:win -- -ProjectId ...`
- **建構**: Dockerfile 多階段建構（`next build` + standalone output），建構時用 placeholder DB，**不會**在映像檔建構期間執行 migration
- **資料庫遷移**: 部署前/後手動 `npx prisma migrate deploy`（詳見 [`docs/CLOUD_RUN_MIGRATION.md`](./docs/CLOUD_RUN_MIGRATION.md)）
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

系統根據 email 格式自動判斷身份：

| Email 格式 | 角色 | 登入後 |
|-----------|------|--------|
| `s` + 7 位數字（如 `abc@xxx.edu.hk`） | 學生 | → 直接進入學生主頁 |
| 英文姓名縮寫（如 `abc@xxx.edu.hk`） | 教師 | → 角色選擇頁（學生/教師/管理員） |
| `abc@xxx.edu.hk` | 管理員 | → 角色選擇頁（學生/教師/管理員） |

> 新教師首次 Google OAuth 登入時會自動建立帳號並設為教師角色。學生需先透過 [Google Sheets 同步](#google-sheets-班別同步-🔄) 匯入。

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
| `GCP_PROJECT_ID` | Vertex/Gemini 所屬 GCP Project ID | ⬜ |
| `GCP_SERVICE_ACCOUNT_JSON` | GCP 服務帳號 JSON (Base64) | ⬜ |
| `GEMINI_API_KEY` | Gemini API 金鑰（備援） | ⬜ |

## 專案結構

```
src/
├── app/                      # Next.js App Router
│   ├── api/                  # 119 API route files
│   ├── student/              # 學生端頁面
│   ├── teacher/              # 教師端頁面
│   └── admin/                # 管理員後台
├── modules/                  # 🆕 模組化架構 (22 modules + __tests__)
│   ├── ai/                   # AI 服務 (19 子目錄, 209 files: providers, prompts, services, schemas, foundation, prompt-versioning, regression, experiments, continuous-evaluation, evaluation, assessment, benchmark, runtime, types, usecases, repositories, core)
│   ├── knowledge-graph/      # 知識圖譜 (28-node DAG, 7 API endpoints, 視覺化)
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
│   ├── analytics/            # 數據分析
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

管理員可從 Google Sheets **一鍵同步**全校學生的班別名單。教師在 Sheets 中維護學生名單（真相來源），平台讀取後自動更新資料庫。

### 設定步驟


## 📋 更新日誌

> 完整更新記錄已移至 **[CHANGELOG.md](./CHANGELOG.md)**。

## 學年轉換 🔄

每年 9 月開學時，依以下流程更新學生名單。**所有學生的學習紀錄（錯題、練習、寫作）自動跟隨學生保留，不受升班影響。**

### 準備新學年 Sheet

在現有的 Google Sheet 中：

| 操作 | 做法 |
|------|------|
| **S6 畢業生** | 刪除該列，或移到另一個分頁歸檔 |
| **升班（如 S5→S6）** | 將 CLASSCODE 從 `5A` 改為 `6A`，Level 從 `S5` 改為 `S6` |
| **新 S1 學生** | 新增資料列，CLASSCODE = `1A`~`1D`，Level = `S1` |
| **轉班學生** | 直接修改 CLASSCODE |
| **EMAIL 不變** | ❗ EMAIL 是永久識別碼，不可修改 |

### 同步到平台

```javascript
// 1. 先 dry-run 預覽（不寫入）
fetch('/api/admin/sync-sheets', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ dryRun: true })
}).then(r => r.json()).then(console.log)

// 2. 確認 classFixed（升班人數）和 created（新 S1 人數）合理後，正式同步
fetch('/api/admin/sync-sheets', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({})
}).then(r => r.json()).then(console.log)
```

### 同步後結果

| 指標 | 說明 |
|------|------|
| `created` | 新 S1 學生數（自動建立帳號） |
| `classFixed` | 升班/轉班的學生數 |
| `updated` | 資料已刷新的學生數 |

- 畢業生保留在資料庫中（學習紀錄完整），不會出現在新學年課堂名單
- 所有練習、錯題、寫作紀錄關聯到 `studentId`（永久不變），升班後完整保留

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

> 目前測試數量會隨開發變動，執行 `npm test` 取得最新統計。最後驗證：2026-08-19，126 files，2801 tests pass。

## 目前狀態

> **最後更新**: 2026-08-19 | Sprints 1-130 + R3.10-K Phases 5-9

| 層級 | 狀態 |
|------|------|
| 架構 | ✅ 模組化架構 (Routes → Zod → Services → Repositories → DB) |
| AI 服務層 | ✅ DeepSeek → Gemini Flash → Gemini Flash-Lite → Grok（Claude/OpenAI placeholder）fallback chain, MCQ 正規化, provider registry DI |
| API 路由 | ✅ 119 routes（Zod-validated），Edge Runtime middleware（NextAuth + JWT） |
| 學習引擎 | ✅ 31-skill grammar DAG, mastery calculator, weakness analyzer, learning path generator |
| 詞彙關聯圖 | ✅ 10 curated word families, 490 DSE collocations, CEFR↔HKDSE mapping |
| 錯題資料庫 | ✅ SRS tracking, mistake analytics, personalized recommendations |
| 領域事件 | ✅ pub/sub event bus, 7 achievements, progress/achievement handlers |
| 快取 | ✅ TTL Map cache-aside, 6 cache namespaces |
| AI 成本 | ✅ 5 models priced, prompt dedup, usage reports |
| 安全 | ✅ prompt injection (11 patterns), XSS (9), PII (5), SQL injection (8), CSP |
| 可觀測性 | ✅ counters/histograms/gauges, distributed tracing, latency/error monitors, health reports |
| 資料庫 | ✅ Prisma 7（SQLite 開發 / PostgreSQL 生產，pgvector） |
| 認證 | ✅ NextAuth Google OAuth + JWT 雙支援，email 自動角色識別，Middleware 路由保護 |
| HKDSE 對齊 | ✅ KLACG 2017 Level Descriptors, Content/Language/Organization 三向度平台評估 |
| DSE RAG | ✅ 歷屆試題已匯入，5 個 AI 流程已接入（Feature Flag: `DSE_RAG_ENABLED`）；RAG 僅作為提示詞接地參考，不直接決定評分 |
| 寫作評估 | ✅ 3 評估器架構（Semantic 證據層→CLO 評分層→確定性標準化）。8 條架構不變量由合約測試強制執行。Golden benchmark infrastructure 就緒（5 fixtures）；empirical metrics (MAE/RMSE/bias) 需要 human-labelled data |
| 校準（Calibration） | ✅ 校準基礎設施就緒（三態 release gate、執行歸因、序數 level 指標、C/L/O 維度門檻、evidence 驗證政策）。**基礎設施存在不建立 HKDSE 評分有效性**：目前 `overall-comparable = 0` → `INSUFFICIENT_DATA`，`ASSESSMENT VALIDITY NOT ESTABLISHED`（平台不宣稱 marker-equivalence） |
| 測試 | ✅ 126 files, 2801 tests pass（2026-08-19） |

## 部署

### Cloud Run（主要）
專案已配置 `Dockerfile` + `cloudbuild.yaml`，可自動部署至 Google Cloud Run（asia-east2, 300s timeout, 1 vCPU/1GiB）。
詳見 [`docs/CLOUD_RUN_MIGRATION.md`](docs/CLOUD_RUN_MIGRATION.md) 及 `scripts/cloud-run-deploy.ps1` / `cloud-run-deploy.sh`。

### Vercel（legacy）
專案已配置 `vercel.json`，亦可部署至 Vercel：

1. 將專案推送至 GitHub
2. 在 [Vercel](https://vercel.com) 匯入 Repo
3. 設定環境變數（`DEEPSEEK_API_KEY` 等）
4. 部署

> **注意：** Vercel 免費版有 10 秒函數執行限制。若 AI 回應較慢，建議升級至 Pro 方案（已在 `vercel.json` 配置 `maxDuration: 30`）。

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
# 2. 設定環境變數（.env.local 或 Vercel Environment Variables）
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
                                                    注入 System Prompt  →  DeepSeek / Gemini
```

### 注意事項
- **Feature Flag**: 預設關閉（`DSE_RAG_ENABLED=false`），不影響現有功能
- **Fallback**: RAG 檢索失敗時自動回退純 prompt 模式，不中斷服務
- **DeepSeek Embedding API**: 需要有效的 `DEEPSEEK_API_KEY`
- 匯入約 20 份文件預計產生 150-300 個向量 chunks，每次 API 呼叫約需 1-3 秒
- 首次匯入後建議在 Vercel 重新部署以確保環境變數生效

## Known Limitations

### 平台設計限制（非 bug，屬設計取捨）
- **新用戶尚無學習記錄**：首次登入的用戶尚無練習/錯題/詞彙數據，部分頁面會顯示 empty state 或引導提示。開始練習後會自動累積真實數據。
- **Speaking Practice**：目前僅支援文字 transcript 輸入分析（文法/詞彙/內容），無法評估流暢度、發音及互動表現。未來可整合 STT（語音辨識）。
- **Cloud Run / Vercel 部署**：AI 函數需要足夠 timeout（Cloud Run 預設 300s；Vercel Pro 30s maxDuration）。Vercel Hobby 方案（10s）可能導致寫作批改等長請求逾時。見 `vercel.json` / `cloud-run.yaml`。
- **Web Speech API Fallback**：Google Cloud TTS 不可用時自動降級至瀏覽器 Web Speech API，不同瀏覽器的語音品質不一（建議使用 Chrome）。
- **Rate Limiter**: `src/shared/utils/rate-limiter.ts` 支援 Vercel KV / in-memory 分散式限流，需設定對應環境變數才會啟用分散式模式。未設定時為 per-instance in-memory。
- **AI Hallucination Guard**: 集中式 10 規則 guard（`src/modules/ai/services/hallucination-guard.ts`），所有 prompt 模板統一引用，防止 AI 生成虛構內容。
- **ESLint warnings**：6 條非關鍵規則降級為 warning，可在 code review 時逐步清理。見 `eslint.config.mjs`。
