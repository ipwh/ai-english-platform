# AI English Platform 🇭🇰

AI 驅動的香港中學英文學習平台，依據 **ELE KLACG 2017** 課程指引及 **HKDSE English Language Level Descriptors**（Subject / Reading / Writing / Listening / Speaking）設計，支援 DeepSeek API（主）及 Vertex Gemini / Gemini API（fallback）生成 DSE 程度的練習題目、HKDSE 等級對齊的智能批改及個人化學習分析。

## 功能

### 🧑‍🎓 學生端
- **AI 練習題目** — 支援選擇題、填充題、改錯題、寫作題，3 種難度（補底/核心/挑戰）
- **個人化診斷測試** — 根據學生年級、近期練習與錯題生成診斷題目，完成後可一鍵進入弱項訓練
- **聆聽練習** — 內建 TTS 語音播放，支援聆聽理解題型；DSE Paper 3 風格對話（含 distraction、synonym replacement、speaker attitude 等真實考試陷阱），題型涵蓋 MCQ / fill-blank / form-filling / inference / matching
- **🎧✍️ Integrated Skills 綜合訓練 v4** — 模擬 DSE Paper 3 Part B「先聽後寫」完整流程。**步驟鎖定**（聆聽完成→解鎖筆記→解鎖寫作）、StepIndicator 環型進度指示器、AudioPlayer 播放控制（暫停/繼續/停止/語速）、Note-taking 引導問題、寫作任務（Summary / Email Reply / Short Article / Report）、**AI 雙維度批改**（Listening Recall + Writing Quality）、內容要點分析（Captured/Missed Points）、過度抄襲檢測、文法錯誤詳解、HKDSE 等級估算、**桌面 Sidebar + 行動裝置 Bottom Tabs**、返回修改重新提交、15 秒自動儲存草稿
- **🗄️ 完整資料持久化** — 逐題答案儲存（`PracticeAnswer`）、XP 審計記錄（`XpTransaction`）、詞彙掌握度歷史（`VocabMasteryLog`）、錯題複習記錄（`MistakeReviewLog`）、診斷結果儲存（`DiagnosticResult`）、每週進度快照（`WeeklySnapshot`）
- **即時批改回饋** — AI 分析答案，對照 HKDSE Reading/Listening Descriptors 評級，提供中英雙語解釋、常見錯誤提示
- **寫作批改** — 嚴格依據 HKDSE Paper 2 Writing CLO 7 分制（Content / Language / Organization 各 0-7 分，總分 21 分）評分，含五大鋪墊法（現況切入→他人意見→表達立場→理據→讓步）、評卷員雙關卡流程（Layout & Clarity → CLO 三維評分）、中式英文 10 項高頻檢測、詞彙升級建議、結構評語、文體格式驗證、HKDSE Level 對應（1→5**）及 100 分制換算，前端顯示 CLO 三維評分卡片及 DSE Level 徽章
- **錯題本** — AI 解釋每道錯題的原因、文法規則、記憶口訣
- **進度分析** — 學習數據儀表板，AI 對照 HKDSE Subject Descriptors 提供個人化學習建議及週計劃
- **詞彙庫** — 生字學習及語音播放
- **📚 智能生字簿 2.0** — AI 一鍵分析單字（詞性、中英意思、例句、同義字、反義字、搭配詞），浮動按鈕快速加入，右鍵選取文字即時加入，批量匯入，CSV/Anki/PDF 匯出，個人化 AI 複習建議，掌握度 ★ 評級（0-5），自動去重
- **📝 生字簿 2.1 強化** — API 分頁支援（`page`/`limit`/`search`/`familiarity`/`pos`/`sort`）、`/api/vocabulary/suggest` 練習自動建議生字、`/api/vocabulary/example` 專用例句生成、`/api/vocabulary/quiz` 互動式詞彙測驗（MCQ + 配對題）、VocabCard 策略提示根據掌握度動態推導
- **✏️ 串字練習 (Spelling Practice)** — 看中文意思及英文例句提示，自行輸入正確英文單詞；支援 4 種選字模式（最新/隨機/最弱/到期）、即時批改、錯誤重試、SRS 掌握度自動更新；完成後顯示成績及逐字結果回顧（`SpellingSession` + `SpellingAttempt` DB 模型）
- **➕ 無縫添加生字** — 任何 AI 輸出（passage、寫作分析、詞彙建議、改寫版本、Integrated Skills 評語）均可一鍵加入生字簿：`InlineWordBadge`（hover/+ 按鈕）、`TextSelectionPopup`（選取文字浮動加入）、`VocabEnabledText`（包裝任何文字區域）；寫作頁詞彙建議旁直接顯示 + 按鈕
- **AI 求助助手** — 讀取學生弱項、近期錯題與表現後，對照 HKDSE 各卷別等級描述提供個人化英文學習建議；回答後可一鍵生成相關練習題目，即時練習改進
- **🎮 遊戲化學習** — XP 經驗值與等級系統（Lv.1-20）、12 款成就徽章（連續學習、正確率、練習量、寫作、詞彙）、匿名班級排行榜、每日連續學習火焰動畫
- **🧠 間隔重溫 (SRS)** — 基於 SM-2 演算法，詞彙與錯題自動排程每日複習，支援 Easy/Hard/Again 評分，動態調整複習間隔，確保長期記憶
- **✍️ 互動寫作** — AI 批改後一鍵改寫作文，原文與改寫版左右對比 (Diff View)，分層反饋（簡潔 / 詳細），一鍵採用 AI 改寫內容
- **🔍 歷屆試題 RAG (DSE RAG)** — AI 出題、批改、解說時自動檢索真實 DSE 歷屆試題內容與官方 Marking Schemes，確保題目風格、難度、評分標準貼近真實 HKDSE 考試（Feature Flag: `DSE_RAG_ENABLED=true`）
- **🗣️ 口語練習** — 支援 transcript 文字輸入分析（DSE Speaking rubric L1-L5 評級），未來擴展 STT 語音辨識
- **👨‍👩‍👧 家長報告** — 教師可一鍵生成雙語 HTML 學習報告（KPI/錯題分佈/建議），適合家長日使用
- **🔔 即時通知 (SSE)** — 輕量 polling API 取代固定 15s interval，支援 batch mark-read
- **⏱️ 作業倒數計時** — 截止日期紅色閃爍提醒（>24h 藍色/<24h 琥珀色/<1h 紅色）
- **🧠 SRS 專用複習 UI** — 翻卡式 SM-2 評分（Easy/Hard/Again），進度條 + 完成摘要

### 👩‍🏫 教師端
- **題目生成** — 按文法項目、技能範疇、難度、年級生成練習題
- **教材上載** — 匯入文字教材，AI 自動分析關鍵詞彙、文法點及建議題目
- **班級管理** — 建立班級、查看學生進度（按班號數字排序）、學生名單（含學號欄位，按班別→學號排序）
- **學生詳情** — 個別學生完整學習數據：XP/徽章/技能準確率/錯題分布/每週趨勢/逐題答案/CSV 匯出
- **課業管理** — 指派練習、查看完成狀況
- **成績報告** — 班級及個別學生成績分析

### 🛡️ 管理員後台（`/admin`）
- **Google Sheets 同步** — 一鍵從 Google Sheets 同步全校學生班別名單（真相來源），支援 dry-run 預覽
- **批量匯入** — CSV 批量匯入學生與教師資料（支援模板下載、Zod 驗證、upsert、dry-run 預覽、錯誤報告）
- **使用者管理** — 分頁查看、搜尋、篩選所有使用者（依角色/年級/班級），可編輯單筆資料（姓名、email、班級、科目、部門、學年等）
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

## Tech Stack

| 類別 | 技術 |
|------|------|
| 框架 | Next.js 16 (App Router + Turbopack) |
| 語言 | TypeScript |
| 樣式 | Tailwind CSS 4 |
| 資料庫 | Prisma 7 + SQLite (開發) / PostgreSQL (生產) |
| 狀態管理 | Zustand |
| 國際化 | 自訂 i18n（useT hook + Zustand language store，支援繁體中文/English，含變數插值） |
| 圖表 | Recharts |
| AI | DeepSeek API (primary) + Vertex Gemini (service account fallback) + Gemini API (optional fallback) + Vertex AI Embeddings |
| 評分標準 | HKDSE English Language Level Descriptors（Subject / Reading / Writing / Listening / Speaking）— 所有 AI prompt 已嵌入官方等級描述 rubric |
| 驗證 | Zod（API 輸入驗證） + `ai-schema.ts`（AI 輸出驗證） |
| 語音 | Google Cloud Text-to-Speech（多人對話分段合成）+ Web Speech API（fallback） |
| 遊戲化 | XP 經驗值、等級系統、成就徽章、SRS 間隔重溫 (SM-2) |
| 認證 | NextAuth.js v5 (Google OAuth) + JWT (jose) |
| 部署 | Vercel |
| OCR | Google Cloud Vision API |
| 雲端 | Google Drive API（教材匯入）、Vertex AI（語義搜尋） |
| DSE RAG | DeepSeek Embedding + pgvector (PostgreSQL native vector search, auto-fallback to in-memory cosine similarity) + 歷屆試題注入（Feature Flag: `DSE_RAG_ENABLED`） |
| 日誌 | 結構化 Logger（`src/lib/logger.ts`，Pino-style JSON / human-readable 雙格式，`LOG_LEVEL` 控制） |
| 快取 | AI 回應快取（`src/lib/ai-cache.ts`，Vercel KV / in-memory 雙後端，`AI_CACHE_ENABLED` 開關） |

## 個人化學習流程

### 診斷測試 → 弱項訓練

1. 學生進入 `/student/diagnostic`
2. 系統讀取學生年級、近期練習記錄與錯題資料
3. AI 根據弱項自動生成個人化診斷題組（文法 / 詞彙 / 閱讀 / 寫作）
4. 完成診斷後，系統計算各技能分數並生成 AI 分析報告
5. 頁面提供「立即開始弱項訓練」按鈕，會自動帶入推薦技能、難度、題型與年級到 `/student/practice`
6. 練習頁收到診斷推薦參數後，直接為學生生成對應弱項訓練題組

### AI 求助助手

`/student/help` 不再只是靜態 FAQ：

- 先用學生自己的 `practice sessions`、`mistakes`、`level`、`streakDays` 建立個人化學習上下文
- 自動生成個人化建議卡片與急需改善項目
- 學生輸入問題後，系統會把問題連同弱項、近期錯題與近期表現送到 `/api/ai/study-help`
- AI 回答會附帶後續建議（follow-up tips）與建議聚焦主題（recommended focus）
- **🆕 即時練習生成**：AI 回答後，點擊「生成相關練習題」按鈕，系統根據學生問題自動生成 3 道相關練習題（MCQ），包含答案與解釋；亦可一鍵跳轉至完整練習模式

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
| `GEMINI_MODEL` | Gemini model（預設 `gemini-2.5-flash`） | ⬜ |

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
- [ ] Google OAuth 登入成功
- [ ] AI 生成練習題（MCQ + 聽力）
- [ ] 寫作批改與改寫
- [ ] 診斷測試 → 弱項訓練一鍵流程
- [ ] 中英語言切換（所有頁面）
- [ ] 教師建立任務 → 學生提交 → AI 批改
- [ ] 管理員 CSV 批量匯入
- [ ] Vercel Logs 中無 `[ai-service]` 錯誤

### Vercel 配置要點
- **AI 函數**: maxDuration 30s + memory 1024MB（`vercel.json`）
- **Pro 方案建議**: 60s maxDuration 更適合長寫作批改
- **Log Drain**: 建議設定 → Logs → External Log Draining（Datadog / Axiom）
- **Cron Jobs** (Pro): 可設定每日清理過期 rate-limit、SRS 複習提醒


## 近期更新

> 📋 完整更新記錄已移至 **[CHANGELOG.md](./CHANGELOG.md)**。以下僅保留最新摘要。

### 🔒 2026-07-17 — Security Hardening
- **授權修復**：11 個 API route 加入 resource-level ownership 檢查（mistakes/vocabulary/gamification/spelling/review-suggestions/suggest/daily-challenge/assignments/teacher-students），修復 pi-auth.ts role=undefined 繞過漏洞
- **AudioPlayer**：修復 React Hooks 規則違反（條件式 early return）
- **CI/CD**：新增 GitHub Actions CI pipeline（typecheck + test + lint）
- **生產部署**：ercel-build.js 改用 prisma migrate deploy、修正 CORS header、修正 rate-limiter 註解
- **測試**：178 tests 全通過，修復 2 條 WritingAnalysisSchema 漂移測試

### 🏗️ 2026-07-16 — Code Quality v2
- RAG pgvector 向量檢索、AI 回應快取、結構化日誌系統、單元測試擴充 (55 tests)

### 📚 2026-07-15 — Vocabulary 3.0 & Infrastructure
- 串字練習、無縫添加生字、全平台流動裝置審計、集中式設定、安全審計 (P0-P2)

<details>
<summary>📋 更早的更新記錄 (2026-07-11 ~ 2026-07-14)</summary>

詳見 **[CHANGELOG.md](./CHANGELOG.md)**，涵蓋：
- DSE 實證主題資料庫、部署前 Must-Fix/Should-Fix/Nice-to-Have 全面修復
- Integrated Skills v4、安全加固、Cloud TTS 整合、遊戲化系統
- 國際化 (i18n) 330+ keys、生字簿 2.0、寫作功能升級、DSE RAG 整合
- 聆聽音頻穩定性修復、AudioPlayer 播放控制、E2E 測試計劃

</details>

## 快速上手

### 🧑‍🎓 學生 3 步開始
1. **登入**：使用學校 Google 帳號登入
2. **設定年級**：前往「個人檔案」設定你的年級（S1–S6）
3. **開始練習**：到「AI 練習」選擇文法/技能，AI 自動生成題目；或在「診斷測驗」先測試弱項

### 👩‍🏫 教師 3 步開始
1. **登入**：使用學校 Google 帳號登入，選擇「教師」身份
2. **建立班級**：前往「班級管理」建立任教班級；或使用 CSV 批量匯入學生
3. **查看進度**：在「儀表板」查看各班準確率；在「報告」下載 CSV 成績表

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

參考 `.env.example`，主要變數：

| 變數 | 說明 | 必填 |
|------|------|------|
| `DEEPSEEK_API_KEY` | DeepSeek API 金鑰（主要供應商） | ❌ |
| `GCP_PROJECT_ID` | Vertex/Gemini 所屬 GCP Project ID（service account 路徑必填） | ❌ |
| `VERTEX_AI_LOCATION` | Vertex 區域（預設 `asia-east2`） | ❌ |
| `VERTEX_GEMINI_MODEL` | Vertex Gemini 模型（預設 `gemini-2.5-flash`） | ❌ |
| `GEMINI_API_KEY` | Gemini API 金鑰（可選，僅當 Vertex 不可用時備援） | ❌ |
| `AUTH_GOOGLE_ID` | Google OAuth 用戶端 ID | ✅（Google 登入） |
| `AUTH_GOOGLE_SECRET` | Google OAuth 用戶端密碼 | ✅（Google 登入） |
| `AUTH_SECRET` | NextAuth 加密密鑰 | ✅（Google 登入） |
| `DEEPSEEK_BASE_URL` | API 端點（預設 `https://api.deepseek.com/v1`） | ❌ |
| `DEEPSEEK_MODEL` | 模型名稱（預設 `deepseek-chat`） | ❌ |
| `GEMINI_MODEL` | Gemini 模型名稱（預設 `gemini-2.5-flash`） | ❌ |
| `DATABASE_URL` | Prisma 連線字串（SQLite 或 PostgreSQL） | ❌ |
| `JWT_SECRET` | JWT 簽署密鑰 | ❌ |
| `GOOGLE_APPLICATION_CREDENTIALS` | GCP 服務帳號 JSON 路徑 | ❌ |
| `GOOGLE_SHEETS_CLASS_ROSTER_ID` | Google Sheets 班別名單 ID（用於同步學生班別） | ❌ |
| `GCP_SERVICE_ACCOUNT_JSON` | GCP 服務帳號 JSON 內容（Vercel 用，替代檔案路徑） | ❌ |

## 專案結構

```
src/
├── app/                      # Next.js App Router 頁面
│   ├── api/
│   │   ├── ai/               # AI API 端點（server-side only）
│   │   │   ├── generate-questions/   # 題目生成
│   │   │   ├── analyze-answer/       # 答案分析
│   │   │   ├── analyze-writing/      # 寫作批改
│   │   │   ├── explain-mistake/      # 錯題解說
│   │   │   ├── analyze-progress/     # 進度分析
│   │   │   └── analyze-material/     # 教材分析
│   │   ├── assignments/       # 課業 CRUD
│   │   ├── classes/           # 班級 CRUD
│   │   ├── practice/          # 練習記錄
│   │   ├── mistakes/          # 錯題記錄
│   │   ├── vocabulary/        # 詞彙庫
│   │   ├── auth/              # 認證（NextAuth + JWT login/logout/session/role）
│   │   ├── drive/             # Google Drive 教材下載
│   │   ├── import/            # CSV 匯入（舊版，保留相容）
│   │   ├── admin/             # 管理員 API
│   │   │   ├── import/        #   批量匯入（template + students + teachers）
│   │   │   ├── users/         #   使用者 CRUD
│   │   │   ├── export/        #   數據匯出（students + teachers CSV）
│   │   │   ├── stats/         #   全校統計數據
│   │   │   ├── sync-sheets/   #   Google Sheets 班別同步
│   │   │   └── fix-classes/   #   班級修復工具
│   │   └── rag/               # RAG 向量檢索（DeepSeek + Vertex AI）
│   ├── (public)/             # 公開頁面（登入、角色選擇）
│   ├── student/              # 學生端頁面（10 頁，sidebar + 手機底部導航）
│   ├── teacher/              # 教師端頁面（11 頁，sidebar 佈局）
│   └── admin/                # 管理員後台（5 頁：總覽、匯入、使用者管理、數據分析、班級管理）
├── components/
│   ├── shared/               # 共用元件（AudioPlayer、Modal、Toast 等）
│   ├── student/              # 學生端專用元件
│   ├── teacher/              # 教師端專用元件
│   └── layout/               # 佈局元件（SidebarLayout、StudentLayout、TeacherLayout）
├── lib/
│   ├── ai-service.ts         # AI 服務層（6 個 AI 函數 + JSON 解析）
│   ├── ai-schema.ts          # Zod Schema 驗證（6 組）
│   ├── rate-limiter.ts       # 滑動窗口限流
│   ├── auth.ts               # JWT 認證邏輯（Prisma DB 查詢）
│   ├── auth-next.ts          # NextAuth.js v5 設定（Google OAuth）
│   ├── db.ts                 # Prisma 7（自動 SQLite/PostgreSQL 切換）
│   ├── vertex-embeddings.ts  # Vertex AI 向量嵌入 + 語義搜尋
│   ├── types.ts              # 核心型別定義（KLACG 2017 對齊）
│   ├── import-utils.ts        # CSV 解析、Zod 驗證、模板生成
│   ├── use-ai.ts             # 前端 AI React Hooks
│   ├── rag-service.ts        # RAG 嵌入與相似度搜尋
│   └── utils.ts              # 通用工具函數
├── store/
│   └── appStore.ts           # Zustand 全域狀態（含 dark mode localStorage）
├── lib/__tests__/
│   └── ai-service.test.ts    # 29 個單元測試
└── middleware.ts              # 路由守衛（NextAuth + JWT 雙支援）
```

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
npm test              # 執行全部測試（178 tests）
npm run test:watch    # 持續監控模式
```

測試涵蓋：
- AI JSON 解析（含 markdown 代碼塊移除、截斷修復、MCQ 選項正規化）— 11 tests
- Zod Schema 驗證（題目、答案、寫作、錯題、進度、教材）— 10 tests
- Rate Limiter（滑動窗口、隔離、超限）— 4 tests
- SRS SM-2 演算法（複習排程、熟悉度映射、到期卡片、每日目標）— 27 tests
- 詞彙 Schema + SRS 整合（分析驗證、序列化、去重、UI helpers）— 22 tests
- 答案一致性（MCQ 正規化、聆聽驗證、i18n 完整性）— 41 tests
- `validateAIResponse` 安全包裝 — 2 tests
- 其他輔助工具 — 6 tests
- HKDSE prompt 對齊驗證 — 所有 AI prompt 已嵌入官方等級描述 rubric

## 目前狀態

| 層級 | 狀態 |
|------|------|
| AI 服務層 | ✅ 完整（6 個函數 + Zod 驗證 + 限流 + HKDSE descriptor rubric 對齊 + MCQ 正規化 + Gemini prompt 適配） |
| API 路由 | ✅ 完整（AI × 6 + CRUD × 5 + 認證 + Drive + 匯入 + RAG + 管理員 API × 8） |
| 資料庫 | ✅ Prisma 7（SQLite 開發 / PostgreSQL 生產，自動切換） |
| 認證 | ✅ NextAuth Google OAuth + JWT 雙支援，email 格式自動識別學生/教師角色，Middleware 路由保護 |
| 前端頁面 | ✅ 核心頁面已接 API + 全站 i18n 中英切換 + 診斷→弱項訓練流程 + 管理員後台 5 頁 + MCQ 選項按索引渲染（防 T/F 全選 bug） |
| HKDSE 對齊 | ✅ 全部 AI prompt 已嵌入官方 Level Descriptors（Subject / Reading / Writing / Listening / Speaking），作文批改嚴格依 Content / Language & Style / Organization 三向度評級 |
| 管理員功能 | ✅ CSV 批量匯入、使用者 CRUD、全校數據匯出、Recharts 儀表板、跨學年追蹤、Google Sheets 同步、班級修復、管理工具一鍵執行 |
| 行動裝置 | ✅ 統一 SidebarLayout（學生/教師）、手機抽屜式側欄、學生底部快捷導航 |
| Google 整合 | ✅ OAuth 登入（自動角色識別）+ Drive 匯入 + Vertex AI Embeddings + Vision OCR + Sheets 同步 + Drive 報告上傳 + RAG 語義索引 |
| 隱私合規 | ✅ PDPO 去識別化（sanitizeForAI），傳送 AI 前自動移除身份證、電話、電郵 |
| 測試 | ✅ 178 tests，覆蓋 AI 解析 + Schema + 限流 + SRS + 詞彙 + 答案一致性 + 遊戲化 + i18n |
| DSE RAG | ✅ 歷屆試題已匯入 + RAG 索引完成 + 5 個 AI 流程已接入（Feature Flag: `DSE_RAG_ENABLED`） |

## 部署

專案已配置 `vercel.json`，可直接部署至 Vercel：

1. 將專案推送至 GitHub
2. 在 [Vercel](https://vercel.com) 匯入 Repo
3. 設定環境變數（`DEEPSEEK_API_KEY` 等）
4. 部署

> **注意：** Vercel 免費版有 10 秒函數執行限制。若 AI 回應較慢，建議將 `ai-service.ts` 中的 `timeoutMs` 調低至 8000，或升級至 Pro 方案。

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
| **題目生成** `generateQuestions` | 相關歷屆試題段落 + Marking Scheme | 題型、難度、選項設計模仿真實 DSE |
| **答案批改** `analyzeAnswer` | 對應卷別 Marking Scheme | 參考 Acceptable Answers 評分 |
| **寫作批改** `analyzeWriting` | Paper 2 Writing Marking Scheme | 依 band descriptors 三向度評級 |
| **錯題解說** `explainMistake` | 相關 Marking Scheme | 引用 model answer 對比說明 |
| **學習求助** `answerStudyHelp` | 弱項對應歷屆試題 + MS | 指出 DSE 對應題型與評分重點 |

### 架構

```
materials/_extracted/*.txt  →  import-past-papers.ts  →  Material + MaterialChunk (DB)
                                                              ↓
學生出題/批改請求  →  ai-service.ts  →  retrievePastPaperContent()  →  Cosine Similarity
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
- **Vercel 部署**：AI 函數需要 Vercel Pro（30s maxDuration）或 Enterprise。Hobby 方案（10s）可能導致寫作批改等長請求逾時。見 `vercel.json`。
- **Web Speech API Fallback**：Google Cloud TTS 不可用時自動降級至瀏覽器 Web Speech API，不同瀏覽器的語音品質不一（建議使用 Chrome）。
- **Rate Limiter 預設為 in-memory**：`rate-limiter.ts` 支援 Vercel KV 分散式限流，但需設定 `VERCEL_KV_URL` + `VERCEL_KV_TOKEN` 環境變數才會啟用。未設定時為 per-instance in-memory，多實例下無法做到全域精確限流。見 `src/lib/rate-limiter.ts` 的 `getKvClient()`。

### 技術債（非阻塞，後續 sprint）
- **`process.env → config` 遷移未完成**：`src/lib/config.ts` 已建立集中式設定，但 API routes 層 ~12 處仍直接讀取 `process.env`（主要為 GCP 憑證、NODE_ENV 判斷）。
- **`ai-service.ts` 巨型檔案**：~4,373 行，包含所有 AI provider 呼叫、13 個 AI 功能、prompt 模板、DSE 主題驗證。Chinglish 規則及 AI 快取已拆分，但主檔案仍過大，建議按功能域繼續拆分。
- **prompt-injection 防護為 regex-based**：`sanitizeForAI()` 使用正則表達式過濾（L1-L3 三層），屬於深度防禦層，無法防止所有注入攻擊。見 `src/lib/ai-service.ts`。
- **ESLint warnings**：6 條非關鍵規則降級為 warning，可在 code review 時逐步清理。見 `eslint.config.mjs`。

### ✅ 已修復技術債（2026-07-17）
- **`console.log → logger`**：`logger.ts` 新增 `patchConsole()`，生產環境自動攔截 `console.log/error/warn` 並路由至結構化 logger，**無需逐檔遷移**。開發環境保留原生 console。
- **認證碎片化**：`admin-auth.ts` 重構為薄封裝，委託 `verifyApiAuth(['admin'])`，消除重複的 JWT + NextAuth 驗證邏輯（−32 行）。

### ✅ 已修復（2026-07-17）

| 類別 | 項目 |
|------|------|
| 🔴 授權 | 11 個 API route 加入 resource-level ownership 檢查（mistakes/vocabulary/gamification/spelling/review-suggestions/suggest/daily-challenge/assignments/teacher-students）；`api-auth.ts` role=undefined 繞過漏洞 |
| 🔴 React | `AudioPlayer.tsx` 條件式 Hook 違反（移至 `isClient` state pattern） |
| 🟠 測試 | 2 條 `WritingAnalysisSchema` 漂移測試修復（補 `dseLevel` 欄位）；178 tests 全通過 |
| 🟠 CI/CD | GitHub Actions CI pipeline（typecheck + test + lint） |
| 🟠 部署 | `vercel-build.js` 改用 `prisma migrate deploy`；CORS header 修正；`db.ts` ESLint 註解補全；rate-limiter 過時註解修正 |
| 🟡 安全 | `sanitizeForAI()` 升級為 L1-L3 三層防護（PII + 12+ injection patterns + 長度截斷） |
| 🟡 程式碼 | `logger.ts` `module` 變數改名；`rate-limiter.ts` KV 整合強化（dual env check + monitoring） |
| 📋 文件 | `CHANGELOG.md` 新建；`README.md` 從 1,395 行縮減至 456 行（−67%） |

> 原始分析報告的 10 項優先修復清單中，**8 項已完成**，2 項為技術債（`ai-service.ts` 拆分、rate-limiter KV 設定），不阻塞上線。
