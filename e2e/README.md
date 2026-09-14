# E2E 測試完整文件 — AI 英語學習平台

> 最後更新：2026-07-14 | Playwright v1.x | 測試帳號見 `helpers.ts`

---

## 🗺️ 測試架構總覽

```
e2e/
├── README.md                  ← 本文件
├── playwright.config.ts       ← Playwright 設定（desktop + mobile）
├── helpers.ts                 ← 共用 helpers（login, waitForLoadingDone, ...）
├── student-flow.spec.ts       ← TC-S01~S05: 學生學習流程
├── teacher-flow.spec.ts       ← TC-T01~T05: 教師工作流程
├── edge-cases.spec.ts         ← TC-E01~E06: 邊界案例
├── auth-security.spec.ts      ← TC-A01~A05: 認證與安全 (NEW)
├── integrated-skills.spec.ts  ← TC-IS01~IS04: Integrated Skills v4 (NEW)
└── data-persistence.spec.ts   ← TC-DP01~DP04: 資料持久化 (NEW)
```

---

## 🧑‍🎓 一、新學生完整學習週期

### TC-S01: 登入 → Dashboard
| 步驟 | 動作 | 預期結果 | 檢查點 |
|-----|------|---------|--------|
| 1 | `page.goto('/login')` | 登入頁面顯示 | email/password 輸入框可見 |
| 2 | 輸入 `test-student@school.edu.hk` / `test1234` | 可輸入 | — |
| 3 | 點擊「登入」 | 跳轉 `/role-select` | URL 包含 `/role-select` |
| 4 | 點擊「學生」 | 跳轉 `/student/dashboard` | 標題「學習主頁」可見 |
| 5 | 檢查 KPI 卡片 | 4 張卡片全部顯示 | 練習次數 ≥0，正確率顯示 |

### TC-S02: AI 練習 — 生成 MC 題 → 作答 → 總結
| 步驟 | 動作 | 預期結果 | 檢查點 |
|-----|------|---------|--------|
| 1 | 導航到 `/student/practice` | 練習表單顯示 | Grammar/Skill 下拉選單存在 |
| 2 | 選擇「Tenses」+「Core」難度，數量 3 | 表單值已設定 | — |
| 3 | 點擊「生成練習」 | Loading spinner → 跳轉第一題 | URL 變為 `/student/practice/[id]` |
| 4 | 題目顯示 A/B/C/D 選項 | 至少 2 個選項可見 | MCQ 按鈕存在 |
| 5 | 點擊任意選項 → 提交 | 顯示正確/錯誤反饋 | 綠色✓或紅色✗可見 |
| 6 | 點擊「下一題」3 次 | 每題正常載入 | — |
| 7 | 到達總結頁 | 顯示正確率、回顧按鈕 | 「完成練習」或百分比文字存在 |

### TC-S03: Diagnostic 診斷測驗
| 步驟 | 動作 | 預期結果 | 檢查點 |
|-----|------|---------|--------|
| 1 | 導航到 `/student/diagnostic` | 自動生成題目 | 「AI 正在生成」loading 文字 → 消失 |
| 2 | 第一題出現 | 題目 + 選項可見 | MCQ 按鈕或文字輸入框存在 |
| 3 | 作答全部題目（~5-8 題） | 每題提交後顯示反饋 | — |
| 4 | 到達診斷結果頁 | 顯示各技能分數 + AI 分析 | 「AI 學習建議」區塊存在 |
| 5 | 點擊「開始弱項訓練」 | 跳轉 `/student/practice?mode=diagnostic` | URL 含 `diagnostic` 參數 |

### TC-S04: Integrated Skills v4 — 聽→記→寫 完整流程
| 步驟 | 動作 | 預期結果 | 檢查點 |
|-----|------|---------|--------|
| 1 | 導航到 `/student/integrated-skills` | Config 頁面顯示 | 年級/難度/任務類型表單存在 |
| 2 | 選擇 S4 + Core + Summary → 生成 | Loading → 任務頁面 | Step indicator 顯示 Step 1 active |
| 3 | 點擊 AudioPlayer 播放按鈕 | 音頻開始播放 | Play 按鈕變為 Pause |
| 4 | 等待播放結束 | `listeningCompleted = true` | Step 1 顯示 ✓，Step 2 解鎖 |
| 5 | 展開 Step 2 筆記區 | 筆記指引清單可見 | Note guide items 存在 |
| 6 | 輸入筆記文字（>20 chars） | 文字區域填充 | 「開始寫作」按鈕出現 |
| 7 | 點擊「開始寫作」 | Step 3 展開 | 寫作任務提示可見 |
| 8 | 輸入寫作內容（>50 chars） | Word count 更新 | 字數顯示正確 |
| 9 | 點擊「提交 AI 批改」 | Loading → Result View | 雙維度分數 (Listening + Writing) 顯示 |
| 10 | 檢查 ResultView | Captured/Missed Points 顯示 | 分數 >0，comment 非空 |

### TC-S05: Writing 寫作 — 生成 → 輔助 → 批改 → 匯出
| 步驟 | 動作 | 預期結果 | 檢查點 |
|-----|------|---------|--------|
| 1 | 導航到 `/student/writing` | 寫作配置表單顯示 | Grade/Text Type/Word Limit 存在 |
| 2 | 選擇 S4 + Article + 150 words → 生成 | Prompt 出現 | Topic 文字顯示 |
| 3 | 輸入 >50 字草稿 | 即時輔助提示出現 | Writing tips / Vocab suggestions 可見 |
| 4 | 檢查自動儲存指示器 | 15 秒內綠點出現 | 「已自動儲存」文字可見 (v4) |
| 5 | 點擊「提交 AI 批改」 | Loading → 分析結果 | Overall Score + Strengths/Errors 顯示 |
| 6 | 切換 Detailed 模式 | 詳細分析顯示 | Grammar errors + Chinglish warnings |
| 7 | 點擊「AI Rewrite」 | 改寫版本 + diff 對比 | 原文 vs 改寫版並排顯示 |
| 8 | 點擊「Export PDF」 | 下載觸發 | 瀏覽器下載對話框出現 |

### TC-S06: Vocabulary 生字簿 — 加入 → SRS 複習 → 測驗 → 匯出
| 步驟 | 動作 | 預期結果 | 檢查點 |
|-----|------|---------|--------|
| 1 | 導航到 `/student/vocabulary` | 生字簿列表顯示 | 搜尋框 + Filter 存在 |
| 2 | 點擊「加入單字」 | 輸入框/Modal 出現 | Word/POS/Meaning 欄位存在 |
| 3 | 輸入 "ubiquitous" + adjective + "無處不在的" → 儲存 | 單字加入列表 | 列表出現新單字 |
| 4 | 點擊「AI 分析」 | 顯示詞性、例句、同義詞 | Example sentence 非空 |
| 5 | 點擊 SRS 每日複習 | 複習卡片顯示 | Due cards count >0 |
| 6 | 標記 familiarity 為 "familiar" | 下次複習日期更新 | `nextReviewDate` 改變 |
| 7 | 進入 Vocab Quiz | 5 題測驗生成 | MCQ/Matching 題目顯示 |
| 8 | 作答全部 → 查看分數 | Quiz 結果顯示 | Accuracy 百分比 |
| 9 | 點擊「Export CSV」 | 下載 CSV | 檔案含 word/meaning/pos 欄位 |

### TC-S07: Mistakes 錯題本 — 題型弱項 → AI 解說 → SRS 複習
| 步驟 | 動作 | 預期結果 | 檢查點 |
|-----|------|---------|--------|
| 1 | 導航到 `/student/mistakes` | 錯題列表顯示 | 如有錯題，每列含題目/答案/類型 |
| 2 | 檢查「🎯 題型弱項」面板 | 按技能／題型聚合的卡片顯示 | 每卡含錯題次數；閱讀／聆聽類標示「篇章題目 — 不能重考同一題」 |
| 3 | 點擊弱項卡的「策略卡」 | 展開常見錯因 + 下一步步驟 | 文字非空，可再點擊收合 |
| 4 | 點擊弱項卡的練習 CTA | 導向正確目標 | 閱讀 → `/student/reading`；文法／聆聽 → `/student/practice?...`；詞彙 → `/student/vocabulary` |
| 5 | 點擊某錯題的「AI 解說」 | AI 解釋載入 | Explanation 文字出現 |
| 6 | 按類型篩選（grammar） | 僅顯示 grammar 錯題 | Filtered count ≤ total count |
| 7 | 點擊「標記已溫習」 | 下次複習日期建立 | 該錯題下次複習日 = 今日 + SM-2 間隔（不應再是「今日」） |
| 8 | SRS 每日複習（錯題） | 卡片顯示 | **只含可重考的錯題**（閱讀／聆聽篇章題目不得出現）；卡片正面為題目文字 |

### TC-S08: Progress 進度 — 圖表 → AI 分析
| 步驟 | 動作 | 預期結果 | 檢查點 |
|-----|------|---------|--------|
| 1 | 導航到 `/student/progress` | 進度頁面顯示 | 技能準確率圖表可見 |
| 2 | 檢查週進度趨勢 | 長條圖顯示近週數據 | 至少 1 個 bar 存在 |
| 3 | 點擊「AI 分析我的進度」 | AI 建議顯示 | Analysis summary 文字非空 |

---

## 👩‍🏫 二、教師完整工作流程

### TC-T01: Dashboard → KPI + AI 建議
| 步驟 | 動作 | 預期結果 | 檢查點 |
|-----|------|---------|--------|
| 1 | 教師登入 → Dashboard | KPI 卡片顯示 | Student count > 0 |
| 2 | 點擊「AI Teaching Advice」 | AI 建議載入 | Analysis text 顯示 |
| 3 | Error banner 測試 | API 失敗時顯示 error banner (v4) | `AlertTriangle` icon + reload 按鈕 |

### TC-T02: 建立作業 → 指派班級 → 預覽 → 發布
| 步驟 | 動作 | 預期結果 | 檢查點 |
|-----|------|---------|--------|
| 1 | 導航到 `/teacher/assignments/new` | 作業建立表單顯示 | Title/Target/Grade/Skill 欄位 |
| 2 | 填寫 Title + 選 Class + 選 Tenses + Core + MC 5 題 | — | — |
| 3 | 點擊「Generate Questions」 | Loading → Preview Modal | 5 題顯示，答案高亮 |
| 4 | 點擊「Publish」 | Success toast → Redirect | URL 變為 `/teacher/assignments` |
| 5 | 檢查通知系統 | 學生鈴鐺出現紅點 | `.notification-badge` 存在 |

### TC-T03: 作業詳情 → 查看提交 → 教師回饋
| 步驟 | 動作 | 預期結果 | 檢查點 |
|-----|------|---------|--------|
| 1 | 導航到 `/teacher/assignments` | 作業列表 | 剛建立的作業存在 |
| 2 | 點擊作業 | 詳情頁面 | 題目列表 + Submissions 區塊 |
| 3 | 展開學生提交 | 每題答案 vs 正確答案 | Correct/Incorrect 標記 |
| 4 | 輸入 Teacher Feedback → 儲存 | Feedback saved | 無 error toast 出現 (v4 fix) |
| 5 | 模擬儲存失敗 | Error toast 顯示 | `AlertTriangle` + 錯誤訊息 (v4) |

### TC-T04: Classes 班級管理
| 步驟 | 動作 | 預期結果 | 檢查點 |
|-----|------|---------|--------|
| 1 | 導航到 `/teacher/classes` | 班級卡片網格 | Loading spinner → 卡片出現 (v4) |
| 2 | 點擊某班級 | 班級詳情 | 學生列表 + 準確率 |
| 3 | Error state | API 失敗時 error banner | `AlertTriangle` + reload (v4) |
| 4 | Empty state | 無班級時顯示 empty | `GraduationCap` icon (v4) |

### TC-T05: Groups 組別管理
| 步驟 | 動作 | 預期結果 | 檢查點 |
|-----|------|---------|--------|
| 1 | 導航到 `/teacher/groups` | 組別列表 | Create button 存在 |
| 2 | 點擊「建立組別」 | Modal 打開 | Name + Student multi-select |
| 3 | 輸入名稱 + 選擇學生 → 建立 | 新組別加入列表 | Group card 出現 |
| 4 | 點擊組別展開 | 成員列表顯示 | Member names 可見 |

### TC-T06: Reports 報告匯出
| 步驟 | 動作 | 預期結果 | 檢查點 |
|-----|------|---------|--------|
| 1 | 導航到 `/teacher/reports` | 報告頁面 | Generate button 存在 |
| 2 | 點擊「Generate CSV」 | 下載觸發 | 檔案名含 `.csv` |
| 3 | 驗證 CSV 內容 | 含 header row + data rows | 不為空檔案 |

---

## 🔀 三、混合班級情境

### TC-M01: 教師建立跨班級組別 → 指派 → 學生完成 → 教師查看
| 步驟 | 動作 | 預期結果 | 檢查點 |
|-----|------|---------|--------|
| 1 | 教師建立 Group「拔尖組」 | Group 建立成功 | API 回傳 201 |
| 2 | 加入學生 A (4A) + 學生 B (4B) | 2 名成員 | Member count = 2 |
| 3 | 建立作業，targetType = group，選「拔尖組」 | Assignment 建立 | Target group 正確 |
| 4 | 學生 A 登入 → 查看作業 | 作業出現在列表中 | `/student/assignments` 可見 |
| 5 | 學生 A 完成作業 → 提交 | Submission 儲存 | Status → "submitted" |
| 6 | 教師查看作業詳情 | 學生 A 提交可見 | 學生 B 尚未提交 |
| 7 | 教師收到通知 | Notification badge | Red dot on bell icon |

---

## ⚠️ 四、邊界與錯誤情境

### TC-E01: 無數據新學生
| 步驟 | 動作 | 預期結果 |
|-----|------|---------|
| 1 | 新學生登入 | Dashboard KPI 顯示 0，不 crash |
| 2 | 進入 Diagnostic | 顯示「尚無足夠練習數據」(v4 fix) |
| 3 | 進入 Mistakes | 顯示「暫無錯題」empty state |
| 4 | 進入 Vocabulary | 顯示「暫無詞彙」empty state |

### TC-E02: RAG / AI 失敗 fallback
| 步驟 | 動作 | 預期結果 |
|-----|------|---------|
| 1 | 設定 `DSE_RAG_ENABLED=false` | 無 RAG 內容仍正常生成題目 |
| 2 | 設定 `DEEPSEEK_API_KEY=''` | API 503 → UI 顯示友善錯誤訊息 |
| 3 | Grok fallback 觸發 | `X-AI-Provider: grok-api` header 確認（Gemini API 已於 2026-08-20 退役） |

### TC-E03: Listening 音頻不可用
| 步驟 | 動作 | 預期結果 |
|-----|------|---------|
| 1 | 設定 `GCP_SERVICE_ACCOUNT_JSON=''` | Cloud TTS 不可用 |
| 2 | 進入 Integrated Skills | AudioPlayer 顯示 Web Speech fallback |
| 3 | 點擊播放 | 使用瀏覽器內建 TTS 播放 |

### TC-E04: API 逾時 / 網路中斷
| 步驟 | 動作 | 預期結果 |
|-----|------|---------|
| 1 | `page.route('**/api/ai/**', route => route.abort())` | API 請求中斷 |
| 2 | 點擊生成按鈕 | Error message 顯示，非白屏 |
| 3 | 恢復網路 | Retry 按鈕可用 |

### TC-E05: 權限錯誤
| 步驟 | 動作 | 預期結果 |
|-----|------|---------|
| 1 | 學生登入 → 直接訪問 `/teacher/dashboard` | Middleware redirect → `/login?error=admin_only` |
| 2 | 未登入 → 訪問 `/student/dashboard` | Redirect → `/login` |
| 3 | 學生嘗試 POST `/api/admin/ensure-admin` | 生產環境 → 404 (v4 fix) |

### TC-E06: Login rate limit 觸發
| 步驟 | 動作 | 預期結果 |
|-----|------|---------|
| 1 | 連續 6 次錯誤密碼登入 | 第 6 次回傳 429 + `Retry-After` header |
| 2 | 等待 60 秒後重試 | 登入恢復正常 |

### TC-E07: 資料持久化驗證
| 步驟 | 動作 | 預期結果 |
|-----|------|---------|
| 1 | 學生完成練習 → 重整頁面 | Practice history 仍存在 |
| 2 | 學生加入生字 → 重整頁面 | 生字仍在列表中 |
| 3 | Integrated Skills 草稿 | 重整後 localStorage draft 恢復 (24h 內) |
| 4 | 寫作 auto-save | 重整後草稿恢復 |

### TC-E08: Mobile 響應式
| 步驟 | 動作 | 預期結果 |
|-----|------|---------|
| 1 | Pixel 7 viewport (412×915) | Sidebar 消失，hamburger menu 出現 |
| 2 | Integrated Skills mobile tabs | Bottom tabs 顯示 (Task/Points/Notes) |
| 3 | 所有按鈕 min-h-[44px] | Touch target 符合 WCAG |

---

## 🔐 五、認證與安全測試 (NEW)

### TC-A01: 未授權 API 訪問被拒絕
| # | API | Method | 預期 |
|---|-----|--------|------|
| 1 | `/api/diagnostic?studentId=xxx` | GET | 401 (v4 fix) |
| 2 | `/api/mistakes?studentId=xxx` | GET | 401 (v4 fix) |
| 3 | `/api/vocabulary?studentId=xxx` | GET | 401 (v4 fix) |
| 4 | `/api/practice?studentId=xxx` | GET | 401 (v4 fix) |
| 5 | `/api/gamification?studentId=xxx` | GET | 401 (v4 fix) |
| 6 | `/api/srs/review?studentId=xxx` | GET | 401 (v4 fix) |
| 7 | `/api/admin/ensure-admin` | POST | 404 (v4 fix) |
| 8 | `/api/auth/debug` | GET | 404 (v4 fix) |

---

## 📋 完整 E2E Checklist (人工 + 自動化)

### 🤖 自動化測試 (Playwright) — `npx playwright test`

| 檔案 | 測試數 | 覆蓋範圍 |
|-----|:-----:|---------|
| `student-flow.spec.ts` | 5 | 登入、練習、Integrated Skills、生字簿、作業 |
| `teacher-flow.spec.ts` | 5 | 登入、建立作業、查看提交、覆核、報告 |
| `edge-cases.spec.ts` | 6 | 新學生、無錯題、無生字、網路中斷、重整、mobile |
| `auth-security.spec.ts` | 5 | 401/404 驗證、rate limit、middleware redirect |
| `integrated-skills.spec.ts` | 4 | v4 步驟鎖定、auto-save、雙維度批改、back confirm |
| `data-persistence.spec.ts` | 4 | Practice 持久化、Vocab 持久化、Draft 恢復、Writing auto-save |

### ✋ 人工測試 Checklist

| # | 情境 | 步驟摘要 | ☐ |
|---|------|---------|----|
| 1 | 深色模式切換 | 點擊 toggle → 所有頁面 dark 樣式正確 | ☐ |
| 2 | 語言切換 ZH↔EN | 點擊 toggle → 所有文字切換 | ☐ |
| 3 | Google OAuth 登入 | 點擊「Sign in with Google」→ 授權 → 選角色 | ☐ |
| 4 | 通知鈴鐺互動 | 教師發作業 → 學生鈴鐺紅點 → 點擊標記已讀 | ☐ |
| 5 | Profile 編輯 | 編輯中/英文名 → 儲存 → 重整後保持 | ☐ |
| 6 | OCR 上傳寫作 | 上傳手寫圖片 → 文字辨識 → 寫入編輯器 | ☐ |
| 7 | 長時間閒置後重整 | 30 分鐘後重整 → session 仍有效 (JWT 7 天) | ☐ |
| 8 | 同時開多個 Tab | 2 Tab 同時答題 → 不重複儲存 | ☐ |
| 9 | 列印 Integrated Skills 結果 | Ctrl+P → 格式正確 | ☐ |
| 10 | Keyboard navigation | Tab/Enter/Space 可操作主要按鈕 | ☐ |

---

## 🚨 常見失敗點預防措施

### 1. AI 生成逾時 (>30s)
- **根因**: DeepSeek API 回應慢或 prompt 過長
- **預防**: `maxTokens` 已限制 (4096 listening, 2048 others)，timeout 30s
- **檢查**: API route 有 `AbortController` + retry logic
- **Playwright**: 所有 AI 相關測試 timeout 設為 60s

### 2. TTS 音頻失敗
- **根因**: GCP credentials 過期或 quota 耗盡
- **預防**: Cloud TTS → Web Speech API fallback
- **檢查**: `AudioPlayer.tsx` 的 `handlePlayWebSpeech()` 分支
- **Playwright**: Integrated Skills 測試使用 `page.waitForTimeout()` 等待音頻

### 3. Prisma 連線池耗盡 (Neon serverless)
- **根因**: 過多 concurrent connection
- **預防**: `@prisma/adapter-pg` + Neon pooler URL
- **檢查**: `prisma.config.ts` 的 `datasourceUrl`

### 4. localStorage 滿 (5MB limit)
- **根因**: 大量 draft 資料堆積
- **預防**: 所有 `localStorage.setItem` 有 try/catch；DRAFT_KEY 有 24h TTL
- **檢查**: 每個 spec 的 `afterEach` 清理 localStorage

### 5. Race condition (雙重點擊)
- **根因**: 按鈕未立即 disabled
- **預防**: 所有 async 按鈕有 `disabled={loading}` + loading spinner
- **檢查**: Playwright `expectButtonDisabled()` helper

### 6. JWT Token 過期
- **根因**: Token 7 天後過期
- **預防**: middleware redirect → `/login`；user-friendly error message
- **測試**: 不涵蓋（需時間模擬）

### 7. Vercel cold start
- **根因**: Serverless function 閒置後冷啟動
- **預防**: 第一個請求可能慢 2-5s，不應視為 failure
- **Playwright**: 測試前先 warm-up request

### 8. Vercel Deployment Protection
- **根因**: `_vercel_jwt` cookie 可能阻擋 auth flow
- **預防**: middleware 有 Vercel protection 處理邏輯
- **檢查**: 如部署在 Vercel 且有 protection，測試前需關閉或設定 bypass

---

## 📦 Playwright 執行指令

```bash
# 安裝 Playwright
npx playwright install chromium

# 執行所有測試
npx playwright test

# 執行特定檔案
npx playwright test e2e/student-flow.spec.ts

# UI 模式（可視化除錯）
npx playwright test --ui

# 產生 HTML 報告
npx playwright show-report

# 只跑 desktop
npx playwright test --project=chromium-desktop

# 只跑 mobile
npx playwright test --project=chromium-mobile

# 除錯模式（逐步執行）
npx playwright test --debug

# 重跑失敗的測試
npx playwright test --last-failed
```

## 🔧 CI/CD 整合 (GitHub Actions)

```yaml
name: E2E Tests
on: [push, pull_request]
jobs:
  e2e:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: english_platform_test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports: ['5432:5432']
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - run: npx prisma generate
      - run: npx prisma db push
      - run: npx tsx prisma/seed.ts
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/english_platform_test
      - run: npx playwright install --with-deps chromium
      - run: npm run build
      - run: npx playwright test
        env:
          BASE_URL: http://localhost:3000
          DATABASE_URL: postgresql://test:test@localhost:5432/english_platform_test
          AUTH_SECRET: test-secret-do-not-use-in-prod
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/
```
