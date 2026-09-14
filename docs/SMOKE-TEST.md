# Staging 環境 Smoke Test 清單

> **自動化 Smoke Test**: `npm run smoke`（49 項檢查，無需 DB）— 詳見下方 Part D
> **環境**: Cloud Run（`*.run.app` 或自訂網域）  
> **測試帳號**: `test-student@school.edu.hk` / `test-teacher@school.edu.hk`（密碼: `test1234`）  
> **執行頻率**: 每次 staging deploy 後執行一次  
> **預計時間**: ~20 分鐘  
> **通過標準**: 全部 ✅，0 個 ❌

---

## 🧑‍🎓 Part A: 學生端（~10 min）

### A1. 登入與初始化

| # | 步驟 | 預期結果 | 通過 |
|---|------|----------|------|
| A1.1 | 瀏覽器開啟 staging URL → `/login` | 登入頁面顯示，中/EN 切換正常 | ⬜ |
| A1.2 | 輸入 `test-student@school.edu.hk` + `test1234` → 登入 | 跳轉到角色選擇頁 (`/role-select`) | ⬜ |
| A1.3 | 點擊「學生」按鈕 | 跳轉到 `/student/dashboard`，顯示「學習主頁」、KPI 卡片 | ⬜ |
| A1.4 | 重整頁面 (F5) | 登入狀態保持，不跳回 `/login` | ⬜ |
| A1.5 | 切換語言（點擊語言按鈕）→ 重整 | 語言保持，UI 文字正確切換（中↔EN） | ⬜ |
| A1.6 | `F12` → Application → localStorage | `lang`、`darkMode`、`notif-settings` 存在且值有效 | ⬜ |

### A2. Listening 聆聽練習

| # | 步驟 | 預期結果 | 通過 |
|---|------|----------|------|
| A2.1 | 導航到 `/student/integrated-skills` | 顯示 Integrated Skills 設定頁面 | ⬜ |
| A2.2 | 選擇 S4 → Core → Summary → 點擊「AI 生成」 | Loading spinner 顯示，然後跳到任務頁面 | ⬜ |
| A2.3 | 確認 Step 1 (Listening) 為啟用狀態 | 步驟指示器顯示 1=active，Step Indicator 可見 | ⬜ |
| **🎧 音頻檢查** | | | |
| A2.4 | 確認**文稿預設隱藏** | 應看到「顯示聆聽文字」按鈕（而非「隱藏」），文稿區塊不可見 | ⬜ |
| A2.5 | 點擊「播放」按鈕 | 音頻開始播放，**文稿自動隱藏**（如之前已展開） | ⬜ |
| A2.6 | 聆聽 5-10 秒 → 點擊暫停 | 音頻暫停，按鈕變為「繼續」 | ⬜ |
| A2.7 | 點擊「繼續」→ 聽完整段 | 音頻播放完整，沒有「播完人聲後繼續空播」現象 | ⬜ |
| A2.8 | 播放結束後點擊「顯示聆聽文字」 | 文稿展開，內容為英文對話（含 Woman:/Man: 角色標籤） | ⬜ |
| **📝 筆記檢查** | | | |
| A2.9 | 確認 **Note-taking 區塊在聆聽時已可見** | 筆記 textarea 在 Step 1 內已展開，可直接輸入 | ⬜ |
| A2.10 | 在筆記區輸入 `Test note: Meeting at 3pm, Room 302` | 文字成功輸入，15 秒後自動儲存指示器顯示「Saved」 | ⬜ |
| **✍️ 寫作檢查** | | | |
| A2.11 | 往下滾動到 Writing 區塊 | 寫作任務 prompt 顯示，textarea 可輸入 | ⬜ |
| A2.12 | 輸入寫作內容（至少 30 字）→ 點擊「提交 AI 批改」 | Loading spinner → AI 批改結果顯示 | ⬜ |
| A2.13 | 檢查批改結果 | 顯示 Overall Score、Listening Recall %、Writing Quality %、Captured/Missed Points、AI Feedback | ⬜ |
| A2.14 | AI Feedback 中選取一個英文字 → 確認「加入生字簿」popup 出現 | TextSelectionPopup 浮動按鈕顯示 | ⬜ |
| A2.15 | 點擊 popup 中的「加入」 | 顯示成功動畫（✓），單字加入生字簿 | ⬜ |

### A3. Writing 寫作練習

| # | 步驟 | 預期結果 | 通過 |
|---|------|----------|------|
| A3.1 | 導航到 `/student/writing` | 寫作頁面顯示，題目生成按鈕可見 | ⬜ |
| A3.2 | 點擊「生成題目」 | AI 生成 DSE 風格寫作題目，顯示 prompt + word limit | ⬜ |
| A3.3 | 輸入寫作內容（至少 50 字） | Textarea 正常輸入，word count 即時更新 | ⬜ |
| A3.4 | 點擊「AI 分析」 | CLO 三維評分卡片顯示（Content/Language/Organization），DSE Level 徽章顯示 | ⬜ |
| A3.5 | 點擊「改寫」 | 左右對比 Diff View 顯示，原文 vs AI 改寫版 | ⬜ |
| A3.6 | 重整頁面 | 草稿自動儲存恢復（如有 auto-save） | ⬜ |

### A4. 生字簿與進度

| # | 步驟 | 預期結果 | 通過 |
|---|------|----------|------|
| A4.1 | 導航到 `/student/vocabulary` | 生字簿頁面顯示，統計卡片可見（Total/Mastered/Learning/Avg Mastery） | ⬜ |
| A4.2 | 從 A2.15 加入的單字應出現在列表 | 生字卡片顯示 word、詞性、中文意思、📅 加入日期 | ⬜ |
| A4.3 | 點擊「選取生字」按鈕 | 每個生字左側出現 checkbox，按鈕文字變為「已選: 0」 | ⬜ |
| A4.4 | 勾選 2-3 個生字 → 點擊「測驗所選」 | 只對選取的單字生成測驗題目 | ⬜ |
| A4.5 | 切換排序為「加入日期」 | 生字按 createdAt 最新→最舊排序 | ⬜ |
| A4.6 | 點擊 AudioPlayer 小喇叭 | 單字發音播放正常 | ⬜ |
| A4.7 | 導航到 `/student/progress` | 進度頁面顯示練習統計、技能準確率 | ⬜ |

### A5. 通知與設定

| # | 步驟 | 預期結果 | 通過 |
|---|------|----------|------|
| A5.1 | 導航到 `/student/settings` | 設定頁面顯示三個區塊：語言、外觀、通知設定 | ⬜ |
| A5.2 | 切換深色模式 | 頁面即時變為深色主題，重整後保持 | ⬜ |
| A5.3 | 關閉「作業通知」開關 | Toggle 變灰色，重整後保持關閉狀態 | ⬜ |
| A5.4 | F12 → Application → localStorage → `notif-settings` | `assignment: false` 已寫入 | ⬜ |
| A5.5 | 切換語言 → 確認通知區塊文字變化 | 「作業通知」↔「Assignments」等五項全部正確翻譯 | ⬜ |

---

## 👩‍🏫 Part B: 教師端（~10 min）

### B1. 登入

| # | 步驟 | 預期結果 | 通過 |
|---|------|----------|------|
| B1.1 | 開啟無痕視窗 → staging URL → `/login` | 登入頁面顯示 | ⬜ |
| B1.2 | 輸入 `test-teacher@school.edu.hk` + `test1234` → 登入 → 選擇「教師」 | 跳轉到 `/teacher/dashboard` | ⬜ |
| B1.3 | Dashboard 顯示教師 KPI | 顯示班級數、學生數、作業完成率等 | ⬜ |

### B2. 組別管理

| # | 步驟 | 預期結果 | 通過 |
|---|------|----------|------|
| B2.1 | 導航到 `/teacher/groups` | 組別列表顯示 | ⬜ |
| B2.2 | 點擊「建立組別」→ 輸入 `Smoke Test Group` → 儲存 | 新組別出現在列表中 | ⬜ |
| B2.3 | 點擊該組別 → 加入學生 | 學生 `test-student@school.edu.hk` 可搜尋並加入 | ⬜ |

### B3. 作業指派

| # | 步驟 | 預期結果 | 通過 |
|---|------|----------|------|
| B3.1 | 導航到 `/teacher/assignments/new` | 作業建立表單顯示 | ⬜ |
| B3.2 | 輸入作業名稱 `Smoke Test Assignment` | 名稱欄位正常輸入 | ⬜ |
| B3.3 | 選擇班別 → 選擇文法項目 → 難度 Core → 數量 5 | 下拉選單正常運作 | ⬜ |
| B3.4 | 點擊「生成題目」 | Loading → 題目預覽顯示 | ⬜ |
| **DSE 標準檢查** | | | |
| B3.5 | 檢查生成的題目內容 | 題目使用 DSE 實證主題（social/education/technology 等），非泛型主題 | ⬜ |
| B3.6 | 檢查題目格式 | MCQ 4 選項 + 正確答案標記 | ⬜ |
| B3.7 | 點擊「確認派發」 | 成功訊息顯示，作業出現在作業列表 | ⬜ |

### B4. 通知驗證

| # | 步驟 | 預期結果 | 通過 |
|---|------|----------|------|
| B4.1 | 點擊通知 bell icon | 通知下拉顯示（如有學生提交，應有相關通知） | ⬜ |
| B4.2 | 檢查通知語言 | 通知文字與目前 UI 語言一致（中/EN） | ⬜ |

### B5. 寫作覆核

| # | 步驟 | 預期結果 | 通過 |
|---|------|----------|------|
| B5.1 | 導航到 `/teacher/review` | 覆核列表顯示待覆核項目 | ⬜ |
| B5.2 | 點擊第一個待覆核項目 | 顯示學生答案 + AI 評分 + AI feedback | ⬜ |
| B5.3 | 修改 AI 評分（如可編輯）→ 儲存 | 教師覆核分數儲存成功 | ⬜ |

### B6. 報告

| # | 步驟 | 預期結果 | 通過 |
|---|------|----------|------|
| B6.1 | 導航到 `/teacher/reports` | 報告頁面顯示 | ⬜ |
| B6.2 | 點擊「產生報告」/「匯出 CSV」 | CSV 檔案下載，內容含學生名稱/準確率/練習次數 | ⬜ |
| B6.3 | 導航到 `/teacher/students` → 點擊 `test-student` | 學生詳情頁顯示 XP、徽章、技能準確率、錯題分佈 | ⬜ |

---

## 🔬 Part C: 技術檢查點

### C1. 資料持久化

| # | 檢查項目 | 方法 | 預期 | 通過 |
|---|----------|------|------|------|
| C1.1 | 寫作草稿持久化 | 寫作頁輸入內容 → 重整 → 草稿恢復 | 內容保留 | ⬜ |
| C1.2 | Integrated Skills 草稿 | 筆記/寫作輸入 → 重整 → 草稿恢復 | 內容保留 | ⬜ |
| C1.3 | 偏好設定跨裝置 | 設定頁修改 → 無痕視窗登入同帳號 → 重整 | 設定同步（remote wins） | ⬜ |
| C1.4 | 生字簿持久化 | 加入生字 → 重整 → 生字仍在 | 單字保留，含 createdAt | ⬜ |
| C1.5 | 練習歷史 | 完成練習 → `/student/progress` → 數據更新 | 練習次數 +1，準確率更新 | ⬜ |

### C2. AI 內容 DSE 標準

| # | 檢查項目 | 方法 | 預期 | 通過 |
|---|----------|------|------|------|
| C2.1 | 題目主題 | 連續生成 3 次練習 → 檢查主題 | 使用 DSE Empirical Topics（social media, education, environment 等） | ⬜ |
| C2.2 | Reading Passage | Integrated Skills listening content | 對話長度 200-400 words，含 distraction/paraphrase | ⬜ |
| C2.3 | Writing Prompt | 寫作題目 | 符合 DSE Paper 2 格式（letter/article/report/short writing），含 word limit | ⬜ |
| C2.4 | RAG 注入 | 檢查 API response headers 或 AI log | DSE_RAG_ENABLED=true 時，AI 回應引用真實 DSE past paper 內容 | ⬜ |
| C2.5 | 評分對齊 | 寫作批改結果 | CLO 三維 0-7 分 + DSE Level 1-5** 對應表顯示 | ⬜ |

### C3. 音頻穩定性

| # | 檢查項目 | 方法 | 預期 | 通過 |
|---|----------|------|------|------|
| C3.1 | Cloud TTS 可用 | Integrated Skills 播放音頻 | 音頻使用 Google Cloud TTS（檢查 Network tab → `/api/tts` 回傳 200 + `audio/mpeg`） | ⬜ |
| C3.2 | 多人對話語音 | 聆聽含 Woman:/Man: 對話 | 男/女聲不同（pitch 差異），段落間有短暫停頓 | ⬜ |
| C3.3 | Web Speech fallback | 關閉 Network → 播放 | 瀏覽器 TTS 啟動，fallback banner 顯示 | ⬜ |
| C3.4 | 音頻進度條 | 播放時觀察進度條 | 進度條按實際音頻長度前進，播完停在 100%，不繼續空跑 | ⬜ |
| C3.5 | 語速切換 | 點擊 0.75×/1×/1.25× | 語速按鈕切換正常，音頻速度對應變化 | ⬜ |

### C4. 通知 i18n

| # | 檢查項目 | 方法 | 預期 | 通過 |
|---|----------|------|------|------|
| C4.1 | 中/EN 通知文字 | 切換語言 → 查看通知 | 通知標題與內文跟隨 UI 語言 | ⬜ |
| C4.2 | 五種通知類型 | `/student/settings` → 通知區塊 | 五個切換（作業/提交/批改/成就/系統）均可獨立開關 | ⬜ |
| C4.3 | 偏好 API | `GET /api/user/preferences` | 回傳 `notifAssignment`, `notifSubmission`, `notifFeedback`, `notifAchievement`, `notifSystem` 全部欄位 | ⬜ |

### C5. 響應式與跨裝置

| # | 檢查項目 | 方法 | 預期 | 通過 |
|---|----------|------|------|------|
| C5.1 | Desktop (1280×800) | Chrome DevTools | 所有頁面正常顯示，Sidebar 可見 | ⬜ |
| C5.2 | Tablet (768×1024) | Chrome DevTools → iPad | Sidebar 收合為圖標或抽屜式 | ⬜ |
| C5.3 | Mobile (412×915) | Chrome DevTools → Pixel 7 | 底部快捷列顯示，所有按鈕≥36px 觸控面積 | ⬜ |

---

## 📊 結果記錄

| 日期 | 執行人 | Part A | Part B | Part C | 總通過率 | 備註 |
|------|--------|--------|--------|--------|----------|------|
| | | /15 | /13 | /16 | /44 | |

### 🔴 Blocker 定義
- 任何 ❌ 導致核心功能無法使用（登入失敗、AI 無回應、DB 錯誤）
- 音頻完全無法播放
- 資料丟失（重整後草稿/設定消失）

### 🟡 Warning 定義
- UI 顯示異常但不影響功能
- 非關鍵 API fallback（如 Gemini API key 未設定但 Vertex 可用）
- 次要翻譯缺失

---

## 🛠️ 快速診斷指令

```bash
# 環境變數檢查
node scripts/devops-check.js

# RAG 索引狀態
npx tsx scripts/check-rag.js

# AI 連線狀態（需 dev server 運行）
curl http://localhost:3000/api/ai/status
```
