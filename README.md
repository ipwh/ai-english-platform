# AI English Platform 🇭🇰

AI 驅動的香港中學英文學習平台，依據 **ELE KLACG 2017** 課程指引及 **HKDSE English Language Level Descriptors**（Subject / Reading / Writing / Listening / Speaking）設計，支援 DeepSeek API（主）及 Vertex Gemini / Gemini API（fallback）生成 DSE 程度的練習題目、HKDSE 等級對齊的智能批改及個人化學習分析。

## 功能

### 🧑‍🎓 學生端
- **AI 練習題目** — 支援選擇題、填充題、改錯題、寫作題，3 種難度（補底/核心/挑戰）
- **個人化診斷測試** — 根據學生年級、近期練習與錯題生成診斷題目，完成後可一鍵進入弱項訓練
- **聆聽練習** — 內建 TTS 語音播放，支援聆聽理解題型；DSE Paper 3 風格對話（含 distraction、synonym replacement、speaker attitude 等真實考試陷阱），題型涵蓋 MCQ / fill-blank / form-filling / inference / matching
- **🎧✍️ Integrated Skills 綜合訓練** — 模擬 DSE Paper 3 Part B「先聽後寫」完整流程：聆聽對話 → Note-taking 引導 → 寫作任務（Summary / Email Reply / Short Article / Report）；AI 雙維度批改（Listening 提取準確度 + Writing 品質），檢測過度抄襲、遺漏重點、文法錯誤、詞彙升級建議
- **即時批改回饋** — AI 分析答案，對照 HKDSE Reading/Listening Descriptors 評級，提供中英雙語解釋、常見錯誤提示
- **寫作批改** — 嚴格依據 HKDSE Writing Level Descriptors（Content / Language & Style / Organization 三向度，L5→L1）評分，檢測文法錯誤、中式英文（Chinglish，含 10 項高頻檢測）、詞彙建議（含 basic→advanced 升級）、結構評語、文體格式驗證，自動標示最接近的 HKDSE 等級
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
| 語音 | Web Speech API (瀏覽器原生 TTS) |
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
| `DSE_RAG_ENABLED` | 啟用歷屆試題 RAG 檢索（`true`/`false`，預設 `false`） | ⬜ |

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

## 近期更新 (2026-07-12)

### 🔍 歷屆試題 RAG 整合 (DSE RAG)
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
- **新增即時寫作輔助** (`generateWritingGuide`)：
  - `structureGuide[]` — 逐段結構指引（中英雙語），依文體自動生成
  - `usefulPhrases[]` — 實用開首/結尾句式（含用途標籤）
  - `commonMistakes[]` — 文體特定常見錯誤 + 修正方法
  - `vocabularyUpgrades[]` — 詞彙升級建議（basic→advanced）
  - 可根據學生當前草稿提供針對性建議
- **Prompt 強化**：整合 AfterSchool 及 Defining Education 兩大 DSE Writing 教學專家的核心內容

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

### 🎧✍️ Integrated Skills 綜合訓練 (DSE Paper 3 Part B)
- **任務生成** (`POST /api/ai/generate-integrated-skills`)：生成完整 Integrated Skills 任務
  - 聆聽材料（對話/獨白，含 DSE 陷阱）+ Note-taking 引導問題 + 寫作任務說明
  - 4 種寫作任務類型：Summary / Email Reply / Short Article / Report
  - 依難度自動調節：補底 80 字 → 核心 120 字 → 挑戰 180 字
  - 自動生成 expected content points + listening answers 供批改參考
- **雙維度批改** (`POST /api/ai/analyze-integrated-skills`)：
  - Listening 準確度（內容提取 vs 遺漏）+ Writing 品質（Content / Language / Organization）
  - 過度抄襲檢測：標記 >8 連續詞直接照搬 listeningContent 的段落
  - 逐點比對 capturedPoints / missedPoints
  - 文法錯誤 + 詞彙升級建議 + 結構評語
  - 自動估算 HKDSE Level（Level 1-5）
- **Prompt 整合 DSE Paper 3 官方評分標準**：Listening 40% + Language 35% + Organization 25%

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
- DSE 歷屆試題（掃描 PDF）需透過 Google Cloud Vision OCR 提取文字（見 `scripts/ocr_past_papers.py`），大型 PDF 不適合直接存入 Git
- Vercel 免費版有 10 秒函數執行限制，寫作批改等長請求可能逾時
- Web Speech API 在不同瀏覽器的語音品質不一（建議使用 Chrome）

## License

Private — 僅供教育用途
