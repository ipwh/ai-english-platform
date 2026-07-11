# AI English Platform 🇭🇰

AI 驅動的香港中學英文學習平台，依據 **ELE KLACG 2017** 課程指引及 **HKDSE English Language Level Descriptors**（Subject / Reading / Writing / Listening / Speaking）設計，支援 DeepSeek API（主）及 Vertex Gemini / Gemini API（fallback）生成 DSE 程度的練習題目、HKDSE 等級對齊的智能批改及個人化學習分析。

## 功能

### 🧑‍🎓 學生端
- **AI 練習題目** — 支援選擇題、填充題、改錯題、寫作題，3 種難度（補底/核心/挑戰）
- **個人化診斷測試** — 根據學生年級、近期練習與錯題生成診斷題目，完成後可一鍵進入弱項訓練
- **聆聽練習** — 內建 TTS 語音播放，支援聆聽理解題型
- **即時批改回饋** — AI 分析答案，對照 HKDSE Reading/Listening Descriptors 評級，提供中英雙語解釋、常見錯誤提示
- **寫作批改** — 嚴格依據 HKDSE Writing Level Descriptors（Content / Language & Style / Organization 三向度，L5→L1）評分，檢測文法錯誤、中式英文（Chinglish）、詞彙建議、結構評語，自動標示最接近的 HKDSE 等級
- **錯題本** — AI 解釋每道錯題的原因、文法規則、記憶口訣
- **進度分析** — 學習數據儀表板，AI 對照 HKDSE Subject Descriptors 提供個人化學習建議及週計劃
- **詞彙庫** — 生字學習及語音播放
- **AI 求助助手** — 讀取學生弱項、近期錯題與表現後，對照 HKDSE 各卷別等級描述提供個人化英文學習建議；回答後可一鍵生成相關練習題目，即時練習改進

### 👩‍🏫 教師端
- **題目生成** — 按文法項目、技能範疇、難度、年級生成練習題
- **教材上載** — 匯入文字教材，AI 自動分析關鍵詞彙、文法點及建議題目
- **班級管理** — 建立班級、查看學生進度
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
| MCQ 正規化 | 後端自動清除 T/F/True/False 前綴、按索引標準化 A/B/C/D 答案字母，防止 Gemini fallback 輸出格式異常 |
| 語音 | Web Speech API (TTS) |
| 認證 | NextAuth.js v5 (Google OAuth) + JWT (jose) |
| 部署 | Vercel |
| OCR | Google Cloud Vision API |
| 雲端 | Google Drive API（教材匯入）、Vertex AI（語義搜尋） |

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

## 近期更新 (2026-07-11)

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
npm test              # 執行全部測試（29 tests）
npm run test:watch    # 持續監控模式
```

測試涵蓋：
- AI JSON 解析（含 markdown 代碼塊移除、截斷修復、MCQ 選項正規化）— 11 tests
- Zod Schema 驗證（題目、答案、寫作、錯題、進度、教材）— 10 tests
- Rate Limiter（滑動窗口、隔離、超限）— 4 tests
- `validateAIResponse` 安全包裝 — 2 tests
- HKDSE prompt 對齊驗證 — 所有 6 個 AI prompt 已嵌入官方等級描述 rubric

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
| 測試 | ✅ 29 tests，覆蓋 AI 解析 + Schema + 限流 |

## 部署

專案已配置 `vercel.json`，可直接部署至 Vercel：

1. 將專案推送至 GitHub
2. 在 [Vercel](https://vercel.com) 匯入 Repo
3. 設定環境變數（`DEEPSEEK_API_KEY` 等）
4. 部署

> **注意：** Vercel 免費版有 10 秒函數執行限制。若 AI 回應較慢，建議將 `ai-service.ts` 中的 `timeoutMs` 調低至 8000，或升級至 Pro 方案。

## Known Limitations

- **新用戶尚無學習記錄**：首次登入的用戶（包括 Google OAuth）尚無練習/錯題/詞彙數據，部分頁面會顯示 empty state 或引導提示。開始練習後會自動累積真實數據。
- DSE 歷屆試題（掃描 PDF）需透過 Google Cloud Vision OCR 提取文字（見 `scripts/ocr_past_papers.py`），大型 PDF 不適合直接存入 Git
- Vercel 免費版有 10 秒函數執行限制，寫作批改等長請求可能逾時
- Web Speech API 在不同瀏覽器的語音品質不一（建議使用 Chrome）

## License

Private — 僅供教育用途
