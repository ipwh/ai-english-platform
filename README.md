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
| DSE RAG | DeepSeek Embedding + 向量相似度檢索 + 歷屆試題注入（Feature Flag: `DSE_RAG_ENABLED`） |

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
| `AI_TIMEOUT_MS` | AI API 呼叫 timeout（ms），預設 8000（Vercel Hobby 建議） | ⬜ |
| `CRON_SECRET` | Cron Job 驗證密鑰（用於 `/api/admin/sync-sheets/cron`） | ⬜ |

### 部署步驟

1. **資料庫**: 在 [Neon](https://neon.tech) / [Supabase](https://supabase.com) 建立免費 PostgreSQL，複製 `DATABASE_URL`
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

### 🏗️ 基礎架構重構 — 集中式設定 + 安全性強化 + 輸入驗證 — 2026-07-15

經過深度程式碼分析後，針對 8 項關鍵問題進行全面改善：

#### 🔴 高優先級修復

| # | 項目 | 檔案 |
|---|------|------|
| 1 | **集中式環境變數管理**：新增 `src/lib/config.ts`，統一 DeepSeek/Gemini/Vertex/JWT/RateLimit/Upload/DB/Cache 設定，終結分散在 5+ 模組中重複讀取 `process.env` 的模式 | `config.ts` (new) |
| 2 | **Middleware AUTH_SECRET 安全修復**：移除 `'default-secret-change-me'` 硬編碼 fallback；生產環境強制拋出錯誤，開發環境顯示明確警告 | `middleware.ts` |
| 3 | **legacySimpleHash 遷移追蹤**：新增 `trackLegacyUsage()` 計數器 + `getLegacyHashStats()` 監控 API；前 5 次舊版雜湊比對顯示遷移警告，之後抑制；`simpleHash` 別名加入 2026-09-01 移除期限 | `crypto.ts` |

#### 🟡 中優先級修復

| # | 項目 | 檔案 |
|---|------|------|
| 4 | **Body Size 驗證**：`materials/route.ts` POST 加入檔案大小上限 (10MB)、副檔名白名單 (pdf/docx/txt)、JSON body 大小檢查；回傳正確 HTTP status (413/415) | `api/materials/route.ts` |
| 5 | **Zod 輸入驗證**：`materials/route.ts` 新增 `materialBodySchema` 完整驗證（title/type/gradeLevel/strand/content/tags/fileSize 全欄位）| `api/materials/route.ts` |
| 6 | **API Cache Headers**：`GET /api/materials` 加入 `ETag` + `Cache-Control: public, max-age=30, must-revalidate` | `api/materials/route.ts` |

#### 🟢 低優先級修復

| # | 項目 | 檔案 |
|---|------|------|
| 7 | **getDemoUsers() 生產環境防護**：加入 `NODE_ENV === 'production'` guard，生產環境回傳空陣列 | `auth.ts` |
| 8 | **移除 `as any` 型別斷言**：`ai-service.ts` 改用 `keyof typeof pool`；`api-auth.ts` 改用 `Record<string, unknown>`；`tts-service.ts` 加入原因註解 | 3 files |

#### 📦 重構至集中式 config 的模組（6 個）

`ai-service.ts`, `rag-service.ts`, `rate-limiter.ts`, `vertex-embeddings.ts`, `db.ts`, `api/materials/route.ts`

#### 📊 修正統計
- **新增檔案**：1 (`src/lib/config.ts`)
- **修改檔案**：11
- **測試**：123 passed / 0 failed
- **TypeScript 錯誤**：0

### 🔐 部署前安全審計 + 全面品質修復 (P0-P2) — 2026-07-15

經過全專案 67 個 API routes、28 個頁面、10 個核心 lib 的深度審計，修復 **26 項**關鍵問題，涵蓋安全性、i18n、UX、API 認證。

#### 🔴 P0 關鍵安全修復
| # | 項目 | 檔案 |
|---|------|------|
| 1 | **API 認證全面補強**：`POST /api/classes`、`PATCH/DELETE /api/vocabulary`、`GET /api/admin/login-logs` 加入認證 | 3 API routes |
| 2 | **12 個 AI API routes** 加入 `verifyApiAuth()` JWT 認證 | `api/ai/*/route.ts` × 12 |
| 3 | **通知系統 i18n**：`getUserLang()` 動態查詢用戶語言，雙語訊息模板 `MSG.xxx[lang]` 取代 hardcoded 中文 | `src/lib/notifications.ts` |
| 4 | **DSE 主題驗證**：`validateDSEtopicMatch()` post-generation 驗證確保 AI 輸出符合真實 DSE 主題庫 | `src/lib/ai-service.ts` |
| 5 | **Materials CRUD**：API 新增 PATCH/DELETE，UI 新增編輯/刪除按鈕 + modal | `api/materials/route.ts` + page |

#### 🟡 P1 高優先修復
| # | 項目 | 檔案 |
|---|------|------|
| 6 | **Global Error Boundary**：全站錯誤攔截，雙語 fallback UI + dev mode stack trace | `src/components/shared/GlobalErrorBoundary.tsx` |
| 7 | **Integrated Skills 後端草稿持久化**：`IntegratedSkillsDraft` DB 模型 + API GET/POST/DELETE + Store `saveDraft/loadDraft/clearDraft` | schema + API + Store |
| 8 | **AudioPlayer**：新增 `fallbackMode` 狀態 + 瀏覽器 TTS fallback 視覺指示器 | `AudioPlayer.tsx` |
| 9 | **UI Bugs**：Teacher Students `colSpan=5→6` + 移除重複 `.sort()`；Teacher Review race condition `await updateReview()` | 2 pages |
| 10 | **Writing `alert()`→Toast**：3 處 `alert()` 改用 `toast('error', ...)` | `writing/page.tsx` |
| 11 | **Integrated Skills 全頁 i18n**：8 個新翻譯 keys + 全雙語化 | `integrated-skills/page.tsx` |

#### 🟢 P2 中優先修復
| # | 項目 | 檔案 |
|---|------|------|
| 12 | **DSE 黑名單持久化**：`MAX_BLACKLIST_SIZE=50` + `cleanupBlacklistIfNeeded()` | `ai-service.ts` |
| 13 | **QuickAddVocab 關閉按鈕**：增強 `p-1.5 rounded-lg hover:bg-gray-100` + `aria-label` | `QuickAddVocab.tsx` |
| 14 | **Writing auto-save 指示器**：dot 加大 + glow shadow + `●/◌/○` 前綴 + tooltip | `writing/page.tsx` |
| 15 | **Vocab PDF export**：改用 `format: 'pdf'` → blob download (pdfkit) | `vocabulary/page.tsx` |

#### 📋 部署前 Should-Fix（全數完成）
| # | 項目 | 檔案 |
|---|------|------|
| 16 | **`analyzeWord()` export**：AI 單字分析函數封裝 | `ai-service.ts` |
| 17 | **Chinglish 整合**：`detectChinglish()` 合併進 `analyzeWriting()`，與 AI 檢測去重 | `ai-service.ts` |
| 18 | **徽章通知串接**：`checkNewBadges()` + `notifyAchievement()` 在 `completeSession` 後自動觸發 | `appStore.ts` |
| 19 | **Groups 全頁 i18n**：29 個新翻譯 keys，`catch(()=>{})`→`console.error`，`dark:bg-gray-750`→`dark:bg-gray-700` | `groups/page.tsx` |
| 20 | **Materials 6 silent catches**：全部改為 `console.error` + `setUploadError()` 用戶提示 | `materials/page.tsx` |
| 21 | **Notifications page i18n**：3 個 hardcoded → `t()` | `notifications/page.tsx` |
| 22 | **Vocabulary 錯誤狀態**：`loadError` 現有可見 UI（AlertCircle + reload 按鈕） | `vocabulary/page.tsx` |
| 23 | **Materials i18n keys**：17 個新翻譯 keys（dropzone/upload/save/delete/ocr/drive） | `i18n.ts` |

#### 📊 修正統計
- **修改檔案**：65 個
- **新增 i18n keys**：60+
- **安全修補**：19 個 API routes
- **TypeScript 錯誤**：0

### 🎯 題材多樣性 v2.1 + DSE 實證主題資料庫 — 2026-07-14

#### DSE Empirical Topic Database（基於 2012-2024 真實歷屆試題歸納）

- **Writing (Paper 2)**：12 類別 × 48+ 主題（food, culture, social, technology, environment, education, career, sports, arts, travel, health, hkLocal）
- **Reading (Paper 1)**：9 類別 × 45+ 主題（science, history, nature, society, psychology, technology, health, hkLocal, global）
- **Listening (Paper 3)**：6 類別 × 42+ 主題（school, community, workplace, services, hkLife, social）
- 所有主題源自真實 DSE 歷屆試題（2012-2024），包括 2020 Paper 2 全部 8 題
- 新增 getDSEEmpiricalTopics(skill, category, count) helper 函數

#### 三個生成函數 Prompt 強制引用

- **generateQuestions**：每次生成前自動注入 5 個真實 DSE 主題範例 + MANDATORY REFERENCE 標記
- **generateWritingPrompt**：強制使用實證主題資料庫取代泛型類別列表
- **generateIntegratedSkills**：聆聽規則前注入 6 個 Paper 3 實證主題

#### 主題多樣性引擎 v2.0

- **44+ Listening 主題**（10 類別 × 年級標籤）+ **33+ Reading 主題**（7 類別）
- 類別輪換機制 + 黑名單防重複 + 年級分層 + 學生偏好支援

#### 新增功能（6 項）

| 功能 | API |
|------|-----|
| Grammar 專項診斷（40 文法點雷達圖） | GET/POST /api/diagnostic/grammar |
| Daily Challenge 每日挑戰（streak bonus + XP） | GET/POST /api/daily-challenge |
| Reading Comprehension（Literal→Inferential→Evaluative） | POST /api/reading |
| AI Writing Model Essays（L3/L4/L5 三級範文） | POST /api/writing/model-essays |
| Student Topic Preferences（10 類別雙語） | GET /api/preferences/topics |
| Vocabulary Real PDF Export（pdfkit） | POST /api/vocabulary/export-pdf?format=pdf |

### 部署前終極檢查 + Must-Fix / Should-Fix / Nice-to-Have 全面修復 — 2026-07-14

#### 🔴 Must-Fix（12 項，部署前全部修復）

| # | 項目 | 檔案 |
|---|------|------|
| 1 | **Vercel Serverless Timeout**：預設 30s→8s（`AI_TIMEOUT_MS` env var 可覆蓋），DeepSeek/Gemini/Vertex 三 provider 統一 | `src/lib/ai-service.ts` |
| 2 | **Admin/Debug 端點保護**：`ensure-admin` + `auth/debug` production guard（`NODE_ENV === 'production'`→404） | 已確認有效 |
| 3 | **敏感 API 全面認證**：practice/diagnostic/mistakes/vocabulary/gamification/srs 全部使用 `verifyApiAuth()` | 已確認有效 |
| 4 | **Listening Audio 穩定性**：修復 retry race condition（Promise-based）+ `onvoiceschanged` clobbering | `src/components/shared/AudioPlayer.tsx` |
| 5 | **Integrated Skills 步驟鎖定**：`autoSaveTimerId` 從 Zustand 移至 `useRef` | `src/store/integratedSkillsStore.ts` |
| 6 | **Data Persistence**：`completeSession` 傳送逐題答案 + console.error 取代 silent fail | `src/store/appStore.ts` |
| 7 | **Notification i18n**：雙語訊息模板 + `classId` 取代 `className` 查詢 | `src/lib/notifications.ts` |
| 8 | **Teacher Dashboard KPI**：Completion Rate 改為真實平均完成率 | `src/app/teacher/dashboard/page.tsx` |
| 9 | **Teacher Students Error State**：`loadError` + 紅色卡片 + reload 按鈕 | `src/app/teacher/students/page.tsx` |
| 10 | **Materials alert→Inline**：`uploadError` + `driveMessage` state 取代 `alert()` | `src/app/teacher/materials/page.tsx` |
| 11 | **Groups Edit/Delete**：前端 inline edit + delete confirm；後端 PATCH/DELETE handlers | `src/app/teacher/groups/page.tsx` + `src/app/api/groups/route.ts` |
| 12 | **Settings Persistence**：`adaptiveDifficulty`/`hintLevelCap`/`dataRetention` 納入 save；dropdown 加入 `onChange` | `src/app/teacher/settings/page.tsx` |

#### 🟡 Should-Fix（15 項，部署後第一週）

| # | 項目 | 檔案 |
|---|------|------|
| 1 | **Zod Validation**：所有 AI route 回應通過 `validateAIResponse()` 驗證 | `src/lib/ai-schema.ts` |
| 2 | **Error UI Consistency**：Dashboard/Classes/Students/Assignments 均有 loading/error/empty 三態 | 各頁面 |
| 3 | **Writing Auto-save Indicator**：saved（綠）→ saving（琥珀閃爍）→ unsaved（紅） | `src/app/student/writing/page.tsx` |
| 4 | **Groups Search**：成員搜尋 + CSV/批次名單匯入 | `src/app/teacher/groups/page.tsx` |
| 5 | **Materials CRUD**：`alert()`→inline error/success message | `src/app/teacher/materials/page.tsx` |
| 6 | **Rate Limiter 升級**：async + `VERCEL_KV_URL` 自動偵測分散式限流 | `src/lib/rate-limiter.ts`（+ 12 routes 同步） |
| 7 | **Vocabulary PDF Export**：可列印 HTML + `@media print` CSS | `src/app/api/vocabulary/export-pdf/route.ts` |
| 8 | **Teacher Classes Error UI**：loading spinner + error + empty state | `src/app/teacher/classes/page.tsx` |
| 9 | **Assignment Feedback Error Toast**：`feedbackError` inline toast，5 秒消失 | `src/app/teacher/assignments/[id]/page.tsx` |
| 10 | **Diagnostic Empty State**：新學生顯示「尚無足夠練習數據」 | `src/app/student/diagnostic/page.tsx` |
| 11 | **HTTP Error Codes**：401/403/404/409/429/500/503 全部正確使用 | 各 API routes |
| 12 | **ErrorBoundary Key Fix**：`localStorage('language')`→`'lang'` | `src/components/shared/ErrorBoundary.tsx` |
| 13 | **Modal a11y**：Escape key + focus trap + scrollbar 補償 + `aria-modal` | `src/components/shared/Modal.tsx` |
| 14 | **Toast a11y**：`aria-live="polite"` + 上限 4 個 + pause-on-hover | `src/components/shared/Toast.tsx` |
| 15 | **RAG Memory Optimization**：`DEEPSEEK_API_KEY!`→`getApiKey()` + MAX_CHUNKS 500→200 + null guard | `src/lib/rag-service.ts` |

#### 🟢 Nice-to-Have（15 項長期優化）

| # | 項目 | 新增檔案 |
|---|------|---------|
| 1 | **CSP Header**：15 條規則防止 XSS/clickjacking | `next.config.ts` |
| 2 | **Global Error Boundary**：`error.tsx` + `loading.tsx` | `src/app/error.tsx`、`loading.tsx` |
| 3 | **Streak DB**：基於 `LoginLog`+`PracticeSession` 真實計算 | `src/lib/streak-service.ts`、`src/app/api/streak/route.ts` |
| 4 | **E2E Edge Tests**：6 tests（session expired/invalid JWT/offline/timeout/rapid nav/concurrent tabs） | `e2e/edge-cases-extended.spec.ts` |
| 5 | **Speaking Practice**：DSE rubric 文字分析 + mock question 生成 | `src/app/api/speaking/route.ts` |
| 6 | **Parent Report**：雙語 HTML 報告（KPI + 錯題分佈 + 家長建議） | `src/app/api/parent-report/route.ts` |
| 7 | **SSE Notifications**：輕量 polling API + batch mark-read | `src/app/api/notifications/sse/route.ts` |
| 8 | **pgvector Migration**：SQL migration script + query example | `prisma/migrations/pgvector-setup.sql` |
| 9 | **AI Help Conversation History**：多輪對話 GET/POST | `src/app/api/ai/study-help/conversation/route.ts` |
| 10 | **SRS Review Flow UI**：翻卡式 SM-2 三級評分（Easy/Hard/Again） | `src/components/student/SRSReviewFlow.tsx` |
| 11 | **Bulk Operations**：`markAllReviewed`/`deleteSelected`/`addAllToReview` | `src/app/api/mistakes/bulk/route.ts` |
| 12 | **Countdown Timer**：>24h 藍色/<24h 琥珀色/<1h 紅色閃爍 | `src/components/shared/CountdownTimer.tsx` |
| 13 | **Sheets Cron Sync**：Vercel Cron Job 端點 + `CRON_SECRET` | `src/app/api/admin/sync-sheets/cron/route.ts` |
| 14 | **HEIC OCR Support**：`accept` 屬性加入 `image/heic,image/heif` | 註記於 `OcrUpload.tsx` |
| 15 | **CSV Streaming Export**：批次 500 查詢避免 OOM | `src/app/api/admin/export/stream/students/route.ts` |

#### 📊 修正統計

- **Must-Fix**：13 檔案修改，0 errors
- **Should-Fix**：18 檔案修改，0 errors
- **Nice-to-Have**：14 新檔案 + 2 修改，0 errors
- **總計**：~45 檔案處理，全部 TypeScript 通過

### �🔒 部署前安全性全面加固 + Integrated Skills v4 + E2E 測試計劃 — 2026-07-14

#### 🔐 安全性 Must-Fix（部署前已修復）

- **`/api/admin/ensure-admin`**：加入 production guard（`NODE_ENV === 'production'` → 404），防止公開建立 admin 帳號
- **`/api/auth/debug`**：加入 production guard，生產環境回傳 404
- **`/api/admin/login-logs` POST**：加入雙重認證（JWT `verifySessionToken` + NextAuth `auth()` fallback）
- **`/api/auth/login`**：加入 rate limiting（5 次/60秒/IP），回傳 429 + `Retry-After` header
- **敏感 API 全面認證**：`diagnostic` / `mistakes` (GET/POST/PATCH/DELETE) / `vocabulary` (GET/POST) / `practice` (GET/POST) / `gamification` (GET/POST) / `srs/review` (GET/POST) / `classes` (GET) — 全部加入 `verifyApiAuth()` 統一認證檢查
- 新增 **`src/lib/api-auth.ts`**：統一的 API 認證 helper，支援 JWT + NextAuth 雙重驗證及 `allowedRoles` 參數

#### 🛠️ 穩定性 Should-Fix

- **HTTP 200→500 修正**：`GET /api/practice` 及 `GET /api/classes` 錯誤時回傳 500 而非 200
- **Teacher Dashboard**：新增 error banner + `AlertTriangle` icon + reload 按鈕
- **Teacher Classes**：新增 loading spinner + error state + empty state (`GraduationCap` icon)
- **Teacher Assignment 回饋儲存**：失敗時顯示 error toast（5 秒自動消失）
- **Writing 自動儲存指示器**：textarea 上方顯示綠/黃/紅三色儲存狀態（`writing.saved` / `writing.saving` / `writing.unsaved` i18n keys）
- **Diagnostic 無數據狀態**：新學生顯示專屬提示「尚無足夠練習數據」而非泛型錯誤
- **Vocabulary export-pdf**：修正文檔註解，明確標示為 printable HTML 頁面

#### 🎧✍️ Integrated Skills v4 — 全面重構

- **步驟鎖定系統**：Step 2 需聆聽完成才解鎖；Step 3 需有筆記才解鎖；未解鎖步驟顯示 `opacity-60` + disabled cursor + 鎖定提示
- **StepIndicator 元件**：三步驟環型指示器（active / done / disabled 三態），連線式進度條
- **自動跳轉提示**：聆聽完成後顯示「開始筆記」CTA；筆記完成後顯示「開始寫作」CTA
- **自動儲存升級**：從 5 秒 → 15 秒 interval，2.5 秒 visual feedback
- **ResultView 重寫**：雙維度分數（Listening Recall + Writing Quality）+ 3 維度進度條（Content / Language / Organization）+ Captured/Missed Points + Over-copy Warnings + AI Feedback
- **返回修改**：批改結果頁可一鍵返回 writing stage 修改後重新提交
- **行動裝置 Bottom Tabs**：`lg:hidden` 三按鈕（Task / Points / Notes）替代桌面 Sidebar
- **桌面 Sidebar**：寫作任務快速檢視 + Expected Points toggle + 即時筆記預覽 + Progress checklist
- **Zustand Store v4**：新增 `listeningCompleted` / `activeStep` / `playbackProgress` / `playbackSpeed` / `autoSaveTimerId` 狀態及 6 個新 actions

#### 🧪 E2E 測試計劃

- **完整測試計劃文檔**：`e2e/README.md` 全面重寫（65 項測試：40 自動化 + 25 人工）
- **新增 3 個 Playwright spec 檔案**：
  - `e2e/auth-security.spec.ts`（12 tests）：未授權 API 401/404 驗證、rate limiting、middleware redirect
  - `e2e/integrated-skills.spec.ts`（4 tests）：步驟鎖定、雙維度批改、返回修改、auto-save
  - `e2e/data-persistence.spec.ts`（4 tests）：練習記錄持久化、生字簿持久化、Draft 恢復、Dashboard KPI
- **GitHub Actions CI/CD**：含 PostgreSQL service container 的完整 E2E pipeline

### 🎧 AudioPlayer 暫停/繼續/停止 + Integrated Skills 批改修復 + 聆聽體驗優化 — 2026-07-13

#### ⏯️ AudioPlayer 播放控制強化
- **暫停/繼續**：新增 `handlePause()` / `handleResume()`，Cloud TTS 使用 `Audio.pause()` / `Audio.play()` 保留播放進度，Web Speech API 使用 `speechSynthesis.pause()` / `speechSynthesis.resume()`
- **停止按鈕**：播放中或暫停中顯示獨立 ■ 停止按鈕，點擊後完整清理音頻資源
- **三態 UI**：Idle（▶️ 播放 + 語速選擇）→ Playing（⏸️ 暫停 + ■ 停止）→ Paused（▶️ 繼續 + ■ 停止）
- 所有使用 `AudioPlayer` 的頁面自動獲得此功能（Integrated Skills、練習題、詞彙卡）

#### 🔧 Integrated Skills 修復
- **React Error #31 修復**：`noteTakingGuide` 型別從 `string[]` 修正為 `{ question: string; hint: string }[]`，正確渲染物件屬性而非原始物件
- **"Wo Man" 文字分割修復**：`normalizeListeningContent()` regex 新增 `\b` word boundary，防止 `Man` 匹配在 `Woman` 內
- **聆聽文字預設收起**：新增 `showListeningText` toggle，學生先聽後看，避免偷看答案
- **批改結果重寫**：UI 改用 `IntegratedSkillsAnalysis` 實際 AI 回應欄位（`contentCompleteness` / `languageAccuracy` / `organizationClarity` / `capturedPoints` / `missedPoints` / `overCopyWarnings` / `vocabularySuggestions` / `grammarErrors` / `structureFeedback` / `generalComment` / `improvementTips` / `estimatedLevel`），解決所有維度顯示 0/10 的問題

#### 📝 寫作支援 + 手機導航修正
- **字數上限**：從下拉式選單改為直接數字輸入（50-2000），附快速預設按鈕（100/150/200/300/400/500/800）
- **手機底部導航**：補回遺漏的 i18n keys（`nav.practice_short`、`nav.mistakes_short`、`nav.progress_short`），修正顯示原始 key 名稱的問題

### 🎧 Listening 音頻穩定性全面修復 (Round 1-3) — 2026-07-13

經過三輪全面稽核與重構，徹底解決聆聽音頻播放不穩定問題：

#### 播放狀態機重構 (`AudioPlayer.tsx`)
- **統一 Cleanup Helper** `cleanupAllPlayback()`：unmount / text-change / speed-change / handleStop / global-stop 全部共用同一 cleanup 邏輯
- **Session ID 防護** `sessionIdRef`：每次新播放遞增 ID，`speakNext()` 檢查 session ID 防止 stale callback 誤觸發 `onPlayEnd`
- **`parseDialogue()` 重構**：不再依賴 `stripSpeakerLabels` 後的雙陣列對位，直接用 regex 逐行提取 speaker + text
- **Voice Cache 強化** `voicesRef`：mount 時快取 female/male/default voice，replay 不再重新呼叫不穩定的 `getVoices()`
- **完整 Event Listener 清理**：所有 cleanup 位置統一清除 `onplay/onended/onerror`

#### 前後端一致性 (`/api/tts`)
- **`multiSpeaker` 預設值修正**：`true` → `false`，與前端實際傳值一致（前端已預處理 text）
- **Dev Debug Log**：開發模式輸出 textLen / textPreview / multiSpeaker / voiceTier / speakingRate

#### AI 生成端安全網 (`ai-service.ts`)
- **`sanitizeListeningLine()`**：逐行修正 speaker label（移除引號、映射職業標籤 → 標準角色、重建標準格式）
- **`validateListeningContent()`**：輸出前驗證（行數檢查、speaker 格式、引號檢測、空台詞、空白行過多）
- **`normalizeListeningContent()` 增強版**：三步驟 pipeline（拆分多角色 → 逐行 sanitize → 開發模式驗證）
- **`cleanListeningContent()` 安全網**（前端）：只修正格式錯誤標籤，保留正確標籤以支援 Web Speech 男女聲分離
- **Client-side safety net**：`practice/page.tsx` 在 `setQuestions` 前呼叫 `cleanListeningContent()`

#### 測試覆蓋
- 同題重播 5 次、連續 5 題、快速切題、Cloud TTS → Web Speech fallback
- speaker label 不被 TTS 朗讀、男女聲分離穩定（含 pitch 補償）
- Chrome / Edge 跨瀏覽器測試

### 🚀 生產部署就緒 (Production Readiness) — 2026-07-13

#### 安全性強化
- **密碼雜湊升級**：從 `simpleHash` → `bcryptjs`（10 rounds），舊密碼自動遷移
- **JWT Secret**：移除硬編碼 fallback，改為延遲檢查
- **PDPO 合規**：`sanitizeForAI()` 傳送 AI 前移除 HKID/電話/電郵

#### AI 品質強化
- **Listening v3.1**：`stripSpeakerLabels` 強化，TTS clean text，2 次重試，答案不匹配→拒絕，語速變更防疊聲
- **MCQ 選項過濾**：`TIME_FRAGMENT_PATTERNS` + context-aware fillers
- **Non-MC 驗證**：空答案直接 reject
- **題材多樣化**：`getRandomTopic()` 16+16 主題池，temperature 0.45
- **Rule-based Chinglish**：`detectChinglish()` 12 條規則
- **Writing 版本歷史**：`revisions` JSON 欄位，保留最近 10 版

#### 平台穩定性
- **24 silent catch**：全部加入 `console.error`
- **Vercel Build**：容錯腳本 `scripts/vercel-build.js`
- **DB 效能**：6 個 `@@index`
- **Integrated Skills RAG**：Paper 3 MS 接入
- **DiagnosticResult.completedAt**：正確設定
- **buildWeakSkills**：chinglish 獨立追蹤

#### 體驗優化
- **Admin 全面 i18n** + Practice hints i18n
- **行動裝置**：viewport + 44px touch targets + safe-area + overscroll
- **寫作頁**：手動輸入字數（50-2000）

### ☁️ Google Cloud Text-to-Speech 整合 (2026-07-12)

#### 🎙️ Server-Side TTS 引擎
- **Google Cloud TTS**：新增 `@google-cloud/text-to-speech`，使用 GCP service account 進行 server-side 語音合成
- **多人對話分段合成**：完全捨棄 SSML `<voice>` 切換（不可靠），改為逐段獨立合成 + MP3 `Buffer.concat()` 拼接
  - 每段用正確語音合成（Man→`en-US-Standard-D` 男聲、Woman→`en-US-Standard-H` 女聲）
  - 角色標籤在 `parseDialogueForTTS()` 階段被剝離，確保 TTS 不朗讀角色名稱
  - 段間自動插入短暫靜音作為停頓
- **雙模式 AudioPlayer**：新增 `useCloudTTS` prop，聆聽題自動使用 Cloud TTS（自然 intonation），詞彙播放維持 Web Speech API
- **自動 Fallback**：Cloud TTS 失敗（503/網路錯誤）→ 自動降級到瀏覽器 Web Speech API，不影響使用
- **費用**：每月 100 萬字 Standard 語音免費（GCP Free Tier），DSE 聆聽練習綽綽有餘

#### 🛡️ AI Prompt 角色標籤白名單
- **TTS 相容性強化**：AI prompt 明確限制聆聽題角色標籤只能用 `Boy / Girl / Man / Woman` 四種
- 嚴禁任何職業/身份標籤（Librarian、Student、Teacher 等），避免 TTS 無法識別
- `AudioPlayer.tsx` 防護層升級：`stripSpeakerLabels()` 改為通用 regex，可剝離任何 `單詞: ` 格式的角色標籤

### 🎧 Integrated Skills 前端 + TTS 語音強化 + 資料架構全面升級 (2026-07-12)

#### 🆕 Integrated Skills 前端頁面
- **全新頁面** `/student/integrated-skills` — DSE Paper 3 Part B「聽→記→寫」完整四階段流程：
  1. **Config**：年級 S1-S6、難度 remedial/core/challenge、4 種任務類型（Summary / Email Reply / Short Article / Report）
  2. **Listening + Notes**：AudioPlayer 播放對話 + 筆記指引 + 學生筆記區
  3. **Writing**：任務複習 + 筆記參考 + 寫作區（含字數統計）
  4. **Result**：總分 + 三維度評分（內容覆蓋 / 語言質素 / 組織結構）+ 已涵蓋/遺漏內容點 + 文法錯誤修正 + 改善建議
- 已加入學生側欄導航 🎧

#### 🔊 TTS 角色語音分離
- **男女聲分離**：`pickVoice()` 擴充至 26 個跨平台語音名稱特徵（Windows/macOS/Linux）
- **Pitch 補償**：當系統只有一個語音時，男聲 pitch=0.85、女聲 pitch=1.15，模擬對話差異
- **多角色行拆分**：AI 有時將多角色對話擠在一行（`Boy: ... Girl: ...`），`splitMultiSpeakerLine()` 自動在角色標籤前插入換行，確保每個角色獨立解析
- **雙層防護**：regex 提取角色 + `stripSpeakerLabels()` 備用清理，絕不朗讀 "Man:" "Woman:" 等標籤

#### 🗄️ 資料架構全面強化
- **逐題答案儲存**：新增 `PracticeAnswer` 模型（questionIndex / studentAnswer / correctAnswer / isCorrect / timeSpent），練習 API 支援完整逐題記錄
- **XP 審計追蹤**：新增 `XpTransaction` 模型（userId / event / xpAmount / metadata），每次 XP 變動完整記錄
- **詞彙掌握度歷史**：新增 `VocabMasteryLog` 模型，記錄每次 familiarity / masteryLevel 變更
- **錯題複習歷史**：新增 `MistakeReviewLog` 模型，記錄每次複習動作與結果
- **診斷結果持久化**：新增 `DiagnosticResult` 模型 + `/api/diagnostic` API，診斷測驗結果自動儲存到 DB
- **聆聽練習模型**：新增 `ListeningSession` + `ListeningAnswer` 模型，為未來真實音檔支援做準備
- **每週快照**：新增 `WeeklySnapshot` 模型，每週自動彙總學生練習數據

#### 👩‍🏫 教師端強化
- **學生詳情頁完整升級** `/teacher/students/[studentId]`：XP/徽章/技能準確率長條圖/錯題類型分布/每週進度趨勢/可展開逐題答案/一鍵 CSV 匯出
- **專屬 API** `/api/teacher/students/[id]`：一次查詢返回學生完整數據（基本資料 + 練習 + 錯題 + 詞彙 + 寫作 + XP 記錄 + 每週快照）
- **覆核頁修正**：AI 重新分析不再寫死 `questionType: 'mc'`，改為使用實際題型

#### 🐛 關鍵修復
- **React Error #300**：`useMemo` hooks 移至 `if (!question) return` 之前，修正 hooks 順序違規
- **登出 HTTP 405**：`/api/auth/logout` 加入 GET handler + 清除全部 6 個 auth cookies
- **聆聽題共用錄音**：AI prompt 改為第 1 題填 `listeningContent`，第 2-N 題留空；前端自動 fallback 到第一題內容
- **AI prompt 強化**：聆聽題必須 `\n` 換行（不可一行多角色）+ 題目答案必須存在於對話中
- **寫作分析持久化**：submit 後 AI 分析結果自動 PATCH 到 `/api/writing`（status → submitted）
- **`analyze-progress` DB 讀取**：API 改為從 `User` + `PracticeSession` + `Mistake` + `VocabItem` 查詢真實歷史數據
- **作業頁 i18n**：補上 `assignments.all` / `assignments.completed` / `assignments.duePrefix` / `assignments.overdueLabel`

### ⚡ XP 即時通知 + 遊戲化系統強化
- **即時 XP 獲得通知**：完成練習後頁面頂部彈出動畫 toast（"+15 XP! Lv.1 Beginner"），bounce 動畫 + 4 秒自動消失
- **XP 完整閉環**：練習 → POST /api/practice → `calculateXp()` → `db.user.update({xp: {increment}})` → Dashboard 讀取累積 XP → 等級進度條
- **雙重觸發**：答案提交時及離開頁面儲存時皆會發放 XP
### � 程式碼審查與穩定性修復 (2026-07-12 第二次審查)

基於全面程式碼審查（50 項發現：5 Critical / 16 High / 17 Medium / 12 Low），已完成以下關鍵修復：

#### Critical 修復
- **詞彙 API 錯誤碼修正**：`GET /api/vocabulary` 及 `POST /api/vocabulary/suggest` 的 catch 區塊原先回傳 HTTP 200 偽裝成空資料，改為 HTTP 500 讓前端可正確區分「無資料」vs「伺服器錯誤」
- **RAG 向量檢索記憶體保護**：`retrieveRelevantChunks()` 及 `retrieveDSERelevantChunks()` 新增 `take: 500` + `orderBy` 限制，防止 chunks 無限增長導致 OOM
- **`isDeepSeekConfigured()` 驗證**：確認函數實際呼叫 `isAIConfigured()` 檢查全部三種 AI 提供者（DeepSeek / Vertex Gemini / Gemini API），命名誤導但功能正確

#### High 修復
- **生字簿 i18n 全面化**：`BatchImportVocab` alert()、`VocabCard` 策略提示、`practice/[id]` 錯誤類型標籤全部改用 `t()` 系統，新增 8 個 i18n keys
- **ErrorBoundary i18n**：移除硬編碼 "Something went wrong" / "Reload Page"，改用 i18n keys

#### Medium 修復
- **`serializeVocab()` 去重**：從 `vocabulary/route.ts` 及 `quiz/route.ts` 提取至 `@/lib/utils.ts` 統一共享，消除重複程式碼
- **RAG 第二處 `findMany` 加 LIMIT**：`retrieveDSERelevantChunks()` 同樣新增 `take: 500`
### 🔧 型別安全強化 (2026-07-12)

消除程式碼中 48 處 `: any` / `as any`：

- **`teacher/dashboard/page.tsx`** (14 處) — 匯入 `ClassInfo`，定義 `StudentBrief` interface
- **`teacher/review/page.tsx`** (3 處) — 使用 `ReviewItem` type，移除所有 `any` 泛型
- **`teacher/students/[studentId]`** (4 處) — 定義 `StudentData` + `PracticeSessionData` interfaces
- **`student/vocabulary/page.tsx`** (6 處) — 使用 `VocabItem` type，定義 SRS card 型別
- **`vocabulary/quiz/route.ts`** (6 處) — 使用 inline 型別推斷
- **`admin/users/route.ts`** + **`admin/export/students/route.ts`** (3 處) — `Record<string,unknown>` → `Prisma.UserWhereInput`

### 🧪 測試擴充 (2026-07-12)

從 29 → 123 tests（+94 tests），覆蓋率大幅提升：

- **SRS 演算法** (`srs.test.ts`, +27 tests)：`calculateNextReview`（10 種情境）、`familiarityToQuality`、`getDueCards`、`getDailyReviewTarget`
- **`serializeVocab` 工具函數** (+4 tests)：JSON 解析、空值處理、invalid JSON 降級
- **詞彙 Schema + SRS** (`vocabulary.test.ts`, +22 tests)：`WordAnalysisSchema` 驗證、SRS 整合、UI helpers
- **答案一致性** (`answer-consistency.test.ts`, +41 tests)：MCQ 正規化、聆聽題答案驗證、i18n keys 完整性
### �🔍 歷屆試題 RAG 整合 (DSE RAG)
- **歷屆試題匯入 Script** (`scripts/import-past-papers.ts`)：一鍵將 `materials/_extracted/` 中 20 份 OCR 提取的 DSE 歷屆試題及 Marking Schemes 匯入資料庫，自動分 chunk 並建立 DeepSeek Embedding 向量索引
- **強化 RAG 檢索** (`rag-service.ts`)：
  - `retrieveDSERelevantChunks()` — 支援按卷別（Paper 1-4）、技能（Reading/Writing/Listening/Speaking）、類別（passage/QA/marking_scheme）過濾
  - `retrieveMarkingScheme()` — 自動檢索對應卷別的官方 Marking Scheme
  - `retrievePastPaperContent()` — 根據難度、年級智能檢索相關歷屆試題段落
  - `buildDSEContextPrompt()` — 將檢索結果整理為結構化 DSE context prompt，根據用途（出題/批改/解說/求助）提供不同指引
- **核心 AI 流程接入** (`ai-service.ts`)：
  - `generateQuestions` — 出題時檢索相關歷屆試題，確保題型、難度、選項設計模仿真實 DSE
  - `analyzeAnswer` — 批改時參考對應卷別的 Marking Scheme Acceptable Answers
  - `analyzeWriting` — 寫作批改時參考 Paper 2 Writing Marking Scheme 的 band descriptors
  - `explainMistake` — 錯題解說時引用 marking scheme model answer 對比
  - `answerStudyHelp` — 學習建議時指出弱項在 DSE 中的對應題型與評分重點
- **Feature Flag**: `DSE_RAG_ENABLED=true` 啟用，預設 `false`（向後相容）
- **Fallback 機制**: RAG 失敗時自動回退純 prompt 模式，不影響服務可用性

### ✍️ DSE Writing 寫作功能全面升級
- **作文出題強化** (`generateWritingPrompt`)：
  - 整合 **DSE Text Type 知識庫** — 6 大文體（Argumentative Essay / Formal Letter / Informal Letter / Speech / Article / Report / Proposal）的完整結構指引、必備元素、常見錯誤
  - 產出 **真實 DSE 風格題目**：含情境背景、寫作角色、具體任務、3 項可檢查要求、字數限制
  - 支援 `weakSkills` 參數，根據學生弱項針對性設計題目（e.g. 弱項為 organization → 出結構要求嚴謹的文體）
- **寫作批改強化** (`analyzeWriting`)：
  - **Grammar Prompt** 注入 DSE 十大常見錯誤檢查清單（審題/格式/例子/文法/詞彙/句式/段落/過渡/開頭結尾/Chinglish）
  - **Chinglish 特別檢查**：10 項高頻中式英文自動檢測（although...but...、because...so...、I very like、discuss about 等）
  - **Style Prompt** 注入 8 大高分策略（PEEL / Show Don't Tell / Concession+Rebuttal / 詞彙多樣化 / 句式變化 / 連接詞豐富化 / 首尾呼應 / 強力結論）
  - **文體特定格式檢查**：依 Formal Letter / Speech / Article / Report / Proposal / Argumentative Essay 自動驗證格式要素
  - **詞彙升級建議清單**：10 組 basic→advanced 對照（important→crucial, good→beneficial 等）
- **新增即時寫作輔助** (`generateWritingGuide` + `generateAdaptiveWritingGuide`)：
  - 靜態模式：`structureGuide[]` + `usefulPhrases[]` + `commonMistakes[]` + `vocabularyUpgrades[]`（即時查表，零 API 成本）
  - AI 自適應模式：根據學生當前草稿提供 `personalizedTips[]` + `structureIssues[]` + `suggestedNextParagraph` + `missingElements[]`
- **`generateWritingOutline` 強化**：注入文體特定結構指引 + 8 大高分策略 + 常見錯誤清單，產出 PEEL + Counter-argument + Concession/Rebuttal 完整大綱
- **Prompt 強化**：整合 DSE Writing 教學專家的核心內容

### 📝 生字簿 2.1 強化
- **API 分頁支援**：`GET /api/vocabulary` 新增 `page`/`limit`/`search`/`familiarity`/`pos`/`sort` 參數，回傳 `pagination` 物件
- **練習自動建議生字** (`POST /api/vocabulary/suggest`)：從練習內容、閱讀篇章、錯題文字中 AI 自動推薦值得加入生字簿的單字（自動跳過已有單字）
- **專用例句生成** (`POST /api/vocabulary/example`)：取代舊有的 `generate-questions` hack，年級自適應例句生成（S1-S2 簡單、S3-S4 中等、S5-S6 DSE 程度）
- **互動式詞彙測驗** (`POST /api/vocabulary/quiz`)：從學生生字簿生成 MCQ + 配對題，優先選取低掌握度單字
- **VocabCard 策略提示動態化**：根據 `masteryLevel` + `familiarity` + `nextReviewDate` 自動推導學習策略（不再依賴未使用的 DB 欄位）
- **TypeScript Schema 修復**：移除 `VocabItem` interface 中不存在於 DB 的 `topic`/`audioUrl` 欄位

### 🎧 DSE Paper 3 Listening 聆聽題 v3.0 — 自然語速 + Intonation 強化
- **自然語速與 Intonation 控制系統**：6 大因素（情緒波動、語境正式度、重點強調、語調標記、linking/reduction、情感表達）在 prompt 中完整建模
- **Intonation 文本標記系統**：【↑】上升、【↓】下降、【—】停頓、*斜體*重音、CAPS 強烈重音
- **難度分層強化**：補底 ~70% 語速+線性結構 → 核心 ~85%+1-2 陷阱 → 挑戰 ~100% 自然語速+3 陷阱+多情緒層次
- **6 種自然口語特徵強制嵌入**：linking ("gonna")、reduction ("whatcha")、hesitation ("Um...")、repetition+self-correction、fillers、emotion cues
- **6 種 DSE 陷阱規範**：Distraction / Synonym / Attitude / Numerical / Spelling / Inference — 每種有具體設計範例
- **7 種題型**：MCQ / Fill-blank / Form-filling / Matching / Inference / Speaker Attitude / Summary Completion
- **⚠️ 原創性保障**：Prompt 明確禁止複製真實 DSE 試題，只能模仿風格與難度水平

### 🎧✍️ Integrated Skills v2.0 — Note-taking 符號系統 + Data Manipulation 三層次
- **DSE Note-taking 符號系統**：+優點/−缺點/→因果/∵理由/$預算/#數字/!重點/?不確定/@時間/Δ變化（共 10 個符號，注入 prompt 引導學生使用）
- **Content Point 信號詞系統**：數據型（statistics show）、觀點型（experts argue）、建議型（it is recommended）、問題型（the main challenge）、對比型（on the other hand）
- **Data Manipulation 三層次評估**：L1 直接引用（可接受）→ L2 語法轉換（加分）→ L3 語境適應（高分）
- **寫作任務強化**：每題含 CONTEXT + ROLE + AUDIENCE + TASK + 3-4 REQUIREMENTS + WORD LIMIT + FORMAT NOTES
- **批改 prompt 升級**：PEEL 結構檢查、Audience Awareness、Note-taking 品質評估、>30% 抄襲自動扣分

## 近期更新 (2026-07-11)

### � 生字簿 2.0 全面升級

#### AI 智能分析 (`POST /api/ai/analyze-word`)
- 輸入英文單字 → AI 自動分析詞性、所有常見詞性（allPartOfSpeech）、主要/次要中文意思、年級自適應例句（S1-S6 難度遞進）、例句中文翻譯、同義字（2-5個）、反義字（2-5個）、常見搭配詞（3-6個）
- Zod Schema (`WordAnalysisSchema`) 雙層驗證確保 AI 輸出結構穩定

#### 快速加入體驗
- **浮動 ⊕ 按鈕**：右下角常駐，點擊後只需輸入單字 → AI 自動分析 → 一鍵確認加入
- **全域右鍵選取**：在任何學生頁面（練習、錯題、寫作）選取英文文字 → 右鍵 → 「加入生字簿」→ 自動帶入 AI 分析
- **錯題本整合**：詞彙類錯題卡片新增「加入生字簿」按鈕，一鍵收錄正確答案
- **批量匯入**：貼上文字清單（每行/逗號/分號分隔），AI 批量分析後一鍵全部加入（最多 30 字/次）

#### 生字卡片強化
- **可展開詳情**：同義字（綠色）、反義字（紅色）、搭配詞（藍色）、所有詞性變化
- **掌握度 ★ 評級**（0-5 星）：點擊循環切換，統計欄新增平均掌握度
- **熟悉度 + SRS**：原有 4 級熟悉度保留，SM-2 演算法驅動的間隔重溫排程
- **刪除按鈕**：每張卡片可獨立刪除

#### 進階過濾與匯出
- **搜尋 + 熟悉度 chips + 詞性下拉 + 三種排序**（最近/字母/掌握度）
- **CSV 匯出**：含所有欄位（word, POS, meaning, synonyms, antonyms, collocations, familiarity, masteryLevel），UTF-8 BOM 編碼
- **Anki 匯出**：TSV 格式，含 HTML 標記的同反義/搭配，可直接匯入 Anki
- **PDF 列印匯出**：精美排版，含 ★ 掌握度星級、發音 QR Link，適合線下背誦

#### Schema 升級
- Prisma `VocabItem` 新增欄位：`allPartOfSpeech`, `secondaryMeaningZh`, `exampleZh`, `synonyms`, `antonyms`, `collocations`, `masteryLevel`
- `@@unique([word, studentId])` 自動去重，防止重複加入相同單字
- API 層 `serializeVocab()` 自動將 JSON 字串欄位解析為陣列

#### AI 個人化複習建議 (`GET /api/vocabulary/review-suggestions`)
- 根據 SRS 排程、掌握度星級、詞彙錯題交叉分析，自動分類為 🔴 緊急 / 🟠 高優先 / 🟡 建議鞏固
- 每日建議複習量自動計算（≤20→5, ≤50→10, ≤100→15, else 20）

#### 測試覆蓋
- 22 個 Vitest 單元測試：AI schema 驗證、SRS 演算法（進階間隔/重設/批次）、序列化/反序列化（JSON parse）、去重邏輯、UI helper

### �🔧 AI 答案準確性強化
- **嚴格 Prompt 規則**：`STRICT_ANSWER_RULES` 注入 system prompt，強制答案必須逐字出現在聆聽/閱讀內容中
- **後處理驗證**：`validateAnswerConsistency()` 檢查每題答案與 listeningContent/readingContent 一致性
- **降低 temperature**：聆聽/閱讀題從 0.7 降至 0.3，大幅減少幻覺
- **前端比對升級**：`checkAnswer()` 支援 MCQ 字母+文字雙重比對、文字題正規化+關鍵詞匹配

### 🌐 第二輪國際化審查
- **教師導入頁面**：角色按鈕、錯誤訊息、格式說明全面雙語
- **教師報告頁面**：班級選擇、匯出按鈕、說明文字全面雙語
- **教師設定頁面**：個人資料區塊標籤雙語
- **教師作業詳情頁**：統計卡片、提交列表、答案區塊標籤全面雙語
- **教師班級詳情頁**：摘要卡片、學生列表標籤已使用 i18n

### 📝 生字簿手動新增功能
- **系統性審查所有學生端及教師端頁面**：逐頁檢查每個硬編碼文字，確保所有 UI 元素均可中英切換
- **修復學生端硬編碼文字**：
  - Dashboard：`'Student'` 備用名稱、`getGreeting()` 支援語言參數、日期格式根據語言動態切換
  - 錯題頁：所有按鈕標籤（重做/AI解說/加入重溫/標記已溫習）、AI 分析標題（錯因分析/文法規則/對比例句）
  - 作業頁：統計摘要（全部/未開始/進行中/已完成）、篩選標籤、截止/已逾期/尚餘天數、教師評語前綴
  - 進度頁：圖表標籤（練習量/正確率）、空狀態提示、載入失敗訊息、難度標籤、練習記錄後綴
  - 個人檔案：表單 placeholder、登出/切換身份按鈕、儲存成功判斷邏輯
  - 作業詳情：資訊卡片（題數/截止日期/限時/提交人數/無限期/無限制/分鐘）、題目標題、得分標籤
  - 寫作頁：原文/AI改寫版/主要改動標籤、改寫失敗訊息
- **修復教師端硬編碼文字**：
  - 建立任務頁：所有表單標籤、選項、按鈕、提示訊息全面使用 i18n
  - 批改覆核頁：分數單位、接受/退回按鈕、分數修正/評語修正標籤、AI 錯誤訊息
  - 班級頁：「課業數」標籤
  - 教材中心：Google Drive 匯入區塊、搜尋 placeholder、上傳失敗提示
  - 學生詳情：基本資料卡片（班級/年級/學號/準確率）、練習統計、最近練習標題
- **核心工具函數強化**：
  - `getGreeting(lang?)` 支援語言參數，根據 `language` store 返回中/英問候語
  - `skillLabels` / `difficultyLabels` / `gradeLabels` / `statusLabels` 新增 `getXxxLabel(key, lang)` 雙語輔助函數
  - `getNavLabel()` 改用 `t()` 系統而非內嵌 enLabels map
- **新增 150+ 翻譯鍵**：涵蓋所有以上修正點的翻譯
- **新增英文版標籤對照**：`skillLabelsEn`、`getDifficultyLabel()`、`getGradeLabel()`、`getStatusLabel()`

### 🔧 穩定性修復
- **消除 TypeScript 編譯錯誤**：修正 i18n.ts 中所有重複鍵（30+ 重複屬性），確保 `tsc --noEmit` 零錯誤
- **Proxy 兼容性修正**：`nav.ts` 的 `skillLabels` 恢復為純物件（非 Proxy），確保 `Object.entries()` 等迭代操作正常工作
- **SidebarLayout 備用名稱**：`'Student'` / `'Teacher'` 改為 `t('common.studentFallback')` / `t('common.teacherFallback')`

### 📝 生字簿手動新增功能
- **新增「+ 新增生字」按鈕**：學生可以手動新增生字到生字簿

### 🌐 第一輪全面國際化審查
- **系統性審查所有學生端及教師端頁面**：修正 Dashboard、錯題、作業、進度、個人檔案、作業詳情、寫作頁面中所有硬編碼文字
- **教師端全面修復**：建立任務、批改覆核、班級、教材中心、學生詳情頁面全部使用 i18n
- **核心工具強化**：`getGreeting(lang?)`、`getNavLabel()`、`getSkill/Difficulty/Grade/StatusLabel()` 雙語函數
- **新增 150+ 翻譯鍵** + `skillLabelsEn` 英文對照表

### 🧹 LuvVoice/TTS 移除
- **移除 `edge-tts` 依賴**：`edge-tts` 套件已在生產環境中持續回傳 500 錯誤，已從 `package.json` 完全移除
- **移除 `/api/tts` API 路由**：TTS 端點已刪除，不再接受任何語音合成請求
- **簡化 AudioPlayer 元件**：移除所有 LuvVoice API 呼叫邏輯（`tryLuvVoice`、`useLuvVoice` state、`audioRef`），現僅使用瀏覽器原生 Web Speech API 進行文字轉語音
- 此變更消除了控制台中大量 `/api/tts 500` 錯誤訊息

### 🐛 重大錯誤修復
- **React Error #300 修復**：修復 `/student/practice/[id]` 頁面中 `useEffect` hook 在 conditional early return 之後呼叫的問題（React hooks 必須在每次 render 中以相同順序呼叫）。將所有 hooks 及 session 進度計算移至 early return 之前，確保 hooks order 一致性
- **移除所有 LuvVoice 相關程式碼**：`AudioPlayer` 不再嘗試呼叫 `/api/tts`，消除了因 TTS 服務不可用導致的連線錯誤

### 🛡️ API 穩定性強化
- **診斷頁面空白輸入框**：修復非選擇題（填充/寫作）無輸入框的 bug — 當 AI 回傳 `choices: []`（空陣列）時，JS 將其視為 truthy 而錯誤渲染 MC 佈局（零按鈕、無輸入框）；改為 `choices && choices.length > 0` 正確判斷
- **診斷頁面全面 i18n**：所有硬編碼中文字串（載入提示、錯誤訊息、結果標籤、推薦練習區塊）改用 `t()` 函數，支援中英雙語
- **React Hydration Error #418/#300**：修復 `getGreeting()` 使用 `getHours()`（本地時間）導致 Vercel UTC 伺服器與香港 UTC+8 客戶端產生不同問候語的文字不匹配；改為 `getUTCHours() + 8` 統一使用香港時區
- **Zustand Store Hydration**：修復 `language`/`darkMode` 初始化時直接讀取 `localStorage` 導致 SSR/CSR 不一致；改為固定初始值 + `hydrateStoredPrefs()` 在 useEffect 中延遲載入
- **API 500 Errors**：修復 `gamification`、`mistakes`、`srs/review` API 因 Prisma schema 新增欄位未推送至 production DB 導致的 500 錯誤；每個查詢加入獨立 try-catch + 優雅降級
- **Gamification API**：修復 `aggregate(_sum)` 在 Prisma 7 SQLite 上失敗的問題，改為 `findMany` + `reduce`
- **Vercel 部署**：新增 `vercel-build` script 自動執行 `prisma db push` 確保 schema 同步

### 🌐 國際化強化
- 修復 Dashboard 硬編碼「徽章 Badges」→ `t('gamification.badges')`
- 修復 StudentLayout/TeacherLayout 硬編碼 subtitle → `t('layout.studentSubtitle')` / `t('layout.teacherSubtitle')`
- 修復 SidebarLayout 通知面板硬編碼「通知」「暫無通知」→ i18n keys
- 修復 ClassInfoCard 硬編碼「名學生」→ `t('generic.students')`
- `t()` 函數新增 `!key` 防護，避免 `undefined` 傳播導致 React Error #300

### 🛡️ API 穩定性強化
- **8 個 API 端點新增 try-catch**：`practice/GET`、`vocabulary/GET`、`classes/GET`、`auth/settings` (GET+PATCH)、`auth/profile/GET` — DB 故障時優雅降級，回傳空資料而非 crash
- **AI 改寫 API**：`JSON.parse` 加入獨立 try-catch，AI 格式異常時回傳 HTTP 422（而非混亂的 SyntaxError）
- **auth/profile**：移除重複 `if (!user)` 死碼

### � 全面國際化 (i18n) 強化
- **新增 330+ i18n 翻譯鍵**：覆蓋所有學生端頁面（練習、錯題、寫作、診斷、求助、進度、作業、個人檔案）、教師端頁面（儀表板、班級、學生、作業、覆核、教材、匯入、報告、設定）、管理員後台、共用 UI 元件
- **學生端全面雙語**：練習頁面（含逐題練習子頁面）、錯題頁面、個人檔案頁面、求助頁面、作業頁面 — 所有 placeholder、提示、按鈕、標籤、錯誤訊息均支援中英雙語
- **教師端全面雙語**：教材上傳、CSV 匯入、AI 批改覆核、成績報告、系統設定 — 全部 UI 元素支援中英切換
- **共用元件雙語**：側欄佈局、通知面板、語言切換器

### �🆕 重大功能更新
- **🎮 遊戲化系統**：新增 XP 經驗值、等級系統（Lv.1-20）、成就徽章系統（連續學習、正確率、練習量、寫作、詞彙等 12 款徽章）、匿名班級排行榜
- **🔄 互動寫作改寫**：AI 批改後可一鍵「AI 改寫」作文，支援原文與改寫版左右對比（Diff View），並可一鍵採用改寫內容
- **📊 分層寫作反饋**：寫作分析支援「簡潔」與「詳細」兩種模式 — 簡潔模式顯示總評 + 結構建議，詳細模式展開完整文法錯誤、中式英文、詞彙建議
- **🧠 間隔重溫系統 (SRS)**：基於 SM-2 演算法的每日複習排程 — 詞彙與錯題自動排程，根據記憶強度（Easy/Hard/Again）動態調整複習間隔，每日推送待複習卡片
- **⏳ 骨架載入**：練習頁面與寫作頁面新增 Skeleton Loader，AI 生成過程中顯示動畫骨架，提升感知速度
- **🏆 個人檔案 Gamification**：學生儀表板新增 XP 進度條、等級徽章、已解鎖成就展示、連續學習火焰動畫

### 🐛 錯誤修復
- **錯題庫**：修正 `studentId` 缺失導致錯題永不載入的問題
- **生字簿**：修正 `studentId` 缺失導致生字永不載入的問題；AI 例句生成現根據學生年級調整難度
- **錯題庫**：修正「重做」連結指向不存在的動態路由
- **登入頁**：將電郵輸入框 placeholder 改為「教師及學生請利用下方「使用 Google 帳號登入」登入」

### ✨ 功能改善
- **AI 練習頁**：年級下拉選單現自動根據學生個人資料預設（讀取 `User.level` 或 `Class.gradeLevel`）
- **求助與建議**：AI 生成的練習題現顯示完整 MCQ 選項（A/B/C/D），正確答案以綠色標記；「前往完整練習」現可根據學生問題自動生成相關練習
- **個人檔案**：新增年級下拉選單（S1–S6），學生可自行設定年級
- **寫作支援**：年級設定現從學生個人資料同步，不再固定為 S4
- **診斷測試**：非選擇題評分現忽略標點符號與多餘空白；修正 `document.querySelector` 反模式
- **儀表板**：AI 學習建議現附帶學生近期真實練習記錄，而非空數據
- **求助頁面**：年級從學生個人資料同步，練習題生成更貼合學生程度
- **教師儀表板**：KPI 卡片現使用真實學生準確率數據，不再顯示 `'—'`
- **報告頁面**：Weekly Report 現輸出班級匯總；Individual Report 輸出個別學生詳細數據；教師亦可下載
- **教材分析**：AI 分析現傳送實際教材提取文字，而非 placeholder
- **匯入功能**：現同時開放教師使用（不再限管理員）
- **AI 日誌**：新增結構化 JSON 日誌，可用 Vercel Logs 搜尋 `service: "ai-service"`
- **匯出 Sheets**：支援將學生學習數據自動寫入 Google Sheets（Dashboard 匯總 + 學生個人成績分頁）
- **Mock data 清理**：移除虛構 `accuracy: 65` 預設值；修正教師 AI 分析空數據；修正硬編碼 ID 回退值
- **教師覆核**：修正 AI 重新批改結果無法儲存的問題；教師評語現正確從 Review 表讀取
- **學生詳情頁（教師視角）**：從靜態 stub 改為完整功能頁 — 顯示學生個人資料、練習統計、最近練習記錄
- **國際化**：新增 150+ i18n keys，練習頁、診斷頁、錯題頁、生字簿頁、作業頁、個人檔案頁、教師任務建立頁主要 UI 元素現支援中英雙語切換

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

1. **建立 Google Sheet** 並填入學生資料，欄位支援多種常見名稱：

   | CLASSCODE | CLASSNO | CHNAME | ENNAME | EMAIL |
   |-----------|---------|--------|--------|-------|
   | 4A | 15 | 陳大文 | Chan Tai Man | abc@xxx.edu.hk |

   > 亦支援 `Email / Class / ClassNumber / NameZh / NameEn / Level` 等欄位名稱。系統會自動辨識標題列。

2. **共用給 Service Account**：右上角「共用」→ 加入 `vision-api-user@amiable-nirvana-500300-a0.iam.gserviceaccount.com`（檢視者權限）

3. **設定環境變數** `GOOGLE_SHEETS_CLASS_ROSTER_ID` 為 Sheet ID（從網址列 `/d/XXXX/edit` 中的 `XXXX`）

4. **重新部署** Vercel 使環境變數生效

### 同步指令

在 admin 登入後的瀏覽器 DevTools Console 中執行：

```javascript
// 預覽模式（不寫入，檢查將做的變更）
fetch('/api/admin/sync-sheets', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ dryRun: true })
}).then(r => r.json()).then(console.log)

// 正式同步
fetch('/api/admin/sync-sheets', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({})
}).then(r => r.json()).then(console.log)
```

### 回傳結果說明

| 欄位 | 說明 |
|------|------|
| `totalRows` | Sheet 中的學生總數 |
| `created` | 新增的學生數（平台中不存在） |
| `updated` | 已更新的學生數 |
| `classFixed` | 班別被修正的學生數（轉班） |
| `classDistribution` | 各班人數分布 |
| `errors` | 失敗的記錄 |

### 同步行為

- **Sheet 是真相來源**：班別以 Sheet 為準，一律覆寫資料庫中的舊值
- **不刪除學生**：只新增和更新，不會刪除平台中已有的學生
- **保留角色**：不會把教師降級為學生
- **自動建立班級**：Sheet 中出現的新班級名稱會自動建立
- **級別推斷**：若無 Level 欄位，從 CLASSCODE（如 `4A`）自動推斷為 `S4`

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
npm test              # 執行全部測試（123 tests）
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
| 測試 | ✅ 123 tests，覆蓋 AI 解析 + Schema + 限流 + SRS + 詞彙 + 答案一致性 |
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

- **新用戶尚無學習記錄**：首次登入的用戶（包括 Google OAuth）尚無練習/錯題/詞彙數據，部分頁面會顯示 empty state 或引導提示。開始練習後會自動累積真實數據。
- Vercel 免費版有 10 秒函數執行限制，寫作批改等長請求可能逾時
- Web Speech API 在不同瀏覽器的語音品質不一（建議使用 Chrome）

## License

Private — 僅供教育用途
