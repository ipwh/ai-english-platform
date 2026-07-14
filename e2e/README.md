# E2E 測試完整文件

## 📋 手動測試 Checklist

### 新學生完整流程
| # | 步驟 | 檢查點 | ✓ |
|---|------|--------|---|
| 1 | 登入 `/login` | 輸入測試帳號，點擊登入後跳轉 `/role-select` | ☐ |
| 2 | 選擇「學生」角色 | 跳轉 `/student/dashboard`，顯示 KPI 卡片 | ☐ |
| 3 | 側欄導航 | 11 個連結全部可點擊，無 404 | ☐ |
| 4 | 點擊「AI 練習」 | 進入 `/student/practice`，表單可填 | ☐ |
| 5 | 生成 5 題 MC | 等待 loading → 跳轉第一題，5 題全生成 | ☐ |
| 6 | 作答全部 5 題 | 每題可選答案 → 提交 → 顯示對錯 | ☐ |
| 7 | 到達總結頁 | 顯示正確率、錯題連結、返回按鈕 | ☐ |
| 8 | 點擊「Diagnostic」 | 診斷頁面載入，點擊開始，至少 5 題 | ☐ |
| 9 | Integrated Skills | 生成任務 → 播放音頻(進度條動) → 填筆記 → 寫作區自動出現 → 填寫作 → 提交 | ☐ |
| 10 | 寫作頁面 | 生成題目 → 輸入內容 → AI 批改 → 顯示評分 | ☐ |
| 11 | 生字簿 | 加入單字 → 顯示在列表中 | ☐ |
| 12 | 錯題本 | 做完練習後有錯題 → 點擊「AI 解說」→ 顯示解釋 | ☐ |
| 13 | 個人檔案 | 編輯名稱 → 儲存 → 顯示更新 | ☐ |

### 教師流程
| # | 步驟 | 檢查點 | ✓ |
|---|------|--------|---|
| 14 | 登入教師帳號 | Dashboard 顯示班級、學生、AI 建議 | ☐ |
| 15 | 建立作業 | 填表 → 生成題目 → 預覽 → 發布 | ☐ |
| 16 | 組別管理 | 建立組別 → 加入學生 → CSV 匯入 | ☐ |
| 17 | 查看作業詳情 | 學生提交列表可見，點擊展開答案 | ☐ |
| 18 | 教師回饋 | 展開學生 → 輸入回饋 → 儲存 | ☐ |
| 19 | 覆核頁面 | 查看 AI 批改 → Accept/Return | ☐ |
| 20 | 報告匯出 | 點擊產生 → 下載 CSV | ☐ |

### 通知系統
| # | 步驟 | 檢查點 | ✓ |
|---|------|--------|---|
| 21 | 教師發布作業後 | 學生鈴鐺出現紅點 | ☐ |
| 22 | 點擊鈴鐺 | 下拉顯示通知列表 | ☐ |
| 23 | 點擊通知 | 標記已讀 + 導航到對應頁面 | ☐ |
| 24 | 全部已讀 | 紅點消失 | ☐ |
| 25 | 學生提交作業後 | 教師鈴鐺出現紅點 | ☐ |

### 邊界案例
| # | 步驟 | 檢查點 | ✓ |
|---|------|--------|---|
| 26 | 新學生無數據 | Dashboard 不 crash，KPI 顯示 0 | ☐ |
| 27 | 無錯題 | 錯題頁顯示「暫無錯題」空狀態 | ☐ |
| 28 | 語言切換 中↔EN | 所有文字正確切換 | ☐ |
| 29 | 暗色模式 | 切換後 UI 正確顯示 | ☐ |
| 30 | 行動裝置 | 側欄變漢堡選單、單欄佈局 | ☐ |
| 31 | AI 服務不可用 | 顯示錯誤訊息而非白屏 | ☐ |
| 32 | 重整頁面 | Draft 草稿恢復（Integrated Skills） | ☐ |

## 🚨 常見失敗點預防

### 1. AI 生成逾時
- **症狀**: 等待 >30s 無回應
- **預防**: `maxTokens` 已調至 4096（聆聽）、2048（其他），timeout 設為 25s
- **檢查**: API route 有 rate limiting + retry logic

### 2. TTS 音頻失敗
- **症狀**: 播放按鈕無反應或報錯
- **預防**: Cloud TTS 失敗時 fallback 到 Web Speech API
- **檢查**: `AudioPlayer.tsx` 的 `handlePlayWebSpeech()` fallback

### 3. Prisma 連線池耗盡
- **症狀**: `PrismaClientInitializationError`
- **預防**: Neon serverless 使用 `@prisma/client/edge` + connection pooling
- **檢查**: `prisma.config.ts` 的 `datasourceUrl` 指向 pooler

### 4. localStorage 滿
- **症狀**: Draft 儲存失敗
- **預防**: try/catch 包裹所有 localStorage 操作
- **檢查**: `saveDraft()` 函式

### 5. Race condition (雙重點擊)
- **症狀**: 重複提交、重複建立作業
- **預防**: 所有 async 按鈕有 `disabled` + loading state
- **檢查**: 之前審計中已修復的 publish/submit 按鈕

### 6. JWT Token 過期
- **症狀**: 401 Unauthorized
- **預防**: middleware.ts 會 redirect 到 `/login`
- **檢查**: `verifySessionToken()` 有錯誤處理

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
```

## 🔧 CI/CD 整合 (GitHub Actions)

```yaml
# .github/workflows/e2e.yml
name: E2E Tests
on: [push, pull_request]
jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npx prisma generate
      - run: npx playwright install --with-deps chromium
      - run: npm run build
      - run: npx playwright test
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/
```
