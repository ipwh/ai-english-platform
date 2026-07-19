# 長期維護與監控策略

> AI English Platform — Production Maintenance & Monitoring Strategy
> 最後更新：2026-07-19 | 32 Sprints | 669 tests | 29 modules | 98% Ready

---

## 一、快速健康檢查

```bash
npm run smoke     # 45 項自動化檢查（0 需 DB）
npm test          # 669 單元測試
npm run build     # TypeScript 編譯檢查
```

## 二、每月/每季維護 Checklist

### 📅 每週（5 分鐘）

| # | 任務 | 難度 | 工具 |
|---|------|------|------|
| W1 | `npm run smoke` — 45 項自動化檢查 | Easy | Terminal |
| W2 | 檢查 Vercel Logs 中 `logger.error` 數量 | Easy | Vercel Dashboard → Logs |
| W3 | 確認 DeepSeek API 餘額（platform.deepseek.com → Billing） | Easy | DeepSeek Dashboard |
| W4 | 快速手動 smoke test：登入 → 生成 1 題 → 批改 | Easy | 手動 |

### 📅 每月（30 分鐘）

| # | 任務 | 難度 | 類別 |
|---|------|------|------|
| M1 | 執行 `npm run test` 確認全部 74+ tests 通過 | Easy | 測試 |
| M2 | 檢查 Vercel Analytics：AI 生成平均耗時、p99 延遲 | Easy | 效能 |
| M3 | 檢查 Prisma 資料庫：學生數、錯題數、詞彙數增長趨勢 | Easy | 資料 |
| M4 | 抽查 10 題最新 AI 生成的 Listening 題目，人工核對答案一致性 | Medium | AI Prompt |
| M5 | 檢查 i18n 翻譯完整性：`grep -r "硬編碼中文" src/` 零結果 | Easy | i18n |
| M6 | 清理超過 90 天未登入的測試學生帳號（如有 mock data） | Easy | 資料清理 |
| M7 | 更新 `DEEPSEEK_MODEL` 到最新版本（如有新版釋出） | Easy | AI |

### 📅 每季（2 小時）

| # | 任務 | 難度 | 類別 |
|---|------|------|------|
| Q1 | **AI Prompt Review**：檢查 `STRICT_ANSWER_RULES` + HKDSE rubric 是否需要更新 | Medium | AI Prompt |
| Q2 | **答案一致性批次測試**：用 50 組不同 grammar/languageSkill 組合自動生成並驗證 | Medium | AI 品質 |
| Q3 | **安全性審查**：檢查 npm audit、依賴更新、JWT secret rotation | Medium | 安全 |
| Q4 | **資料庫優化**：檢查 slow queries（Prisma `$queryRaw`），必要時加 index | Medium | 效能 |
| Q5 | **i18n 審查**：確認所有新增頁面/功能有完整中英翻譯 | Easy | i18n |
| Q6 | **寫作批改校準**：用 5 篇已知 HKDSE 等級的範文測試 AI 評分準確度 | Hard | AI 品質 |
| Q7 | **成本分析**：DeepSeek API 月費 vs Gemini fallback 用量比例 | Easy | 成本 |
| Q8 | **備份**：匯出 PostgreSQL 完整備份（Neon/Supabase 自動備份確認） | Easy | 資料 |

---

## 二、AI Prompt 版本管理機制

### 2.1 Prompt 檔案結構

```
prompts/
├── README.md                    # 版本說明 + 變更記錄
├── v1/
│   ├── generate-questions.txt   # 題目生成 system prompt
│   ├── analyze-answer.txt       # 答案分析 system prompt
│   ├── analyze-writing.txt      # 寫作批改 system prompt
│   └── CHANGELOG.md
├── v2/
│   └── ... (下一版本)
├── current -> v1/               # symlink 指向現行版本
└── validate.ts                  # 自動驗證腳本
```

### 2.2 Prompt 版本追蹤

每個 prompt 檔案開頭必須包含：

```markdown
# Prompt: generate-questions
# Version: 2.1.0
# Date: 2026-07-11
# Author: AI Platform Team
# Changes: 強化答案一致性規則、新增 Self-Check 指令
# A/B Test ID: AB-2026-Q3-01 (若進行中)
```

### 2.3 自動驗證腳本

`scripts/validate-prompts.ts` — 使用新 prompt 生成 10 組題目並自動檢查：

```typescript
// 核心邏輯：對每個 grammarItem + languageSkill 組合生成題目並驗證
const TEST_COMBINATIONS = [
  { grammarItem: 'tenses', difficulty: 'core', gradeLevel: 'S4' },
  { languageSkill: 'listening', difficulty: 'core', gradeLevel: 'S4' },
  { languageSkill: 'reading', difficulty: 'core', gradeLevel: 'S4' },
  { grammarItem: 'conditionals', difficulty: 'challenge', gradeLevel: 'S5' },
];

async function validatePrompts() {
  for (const combo of TEST_COMBINATIONS) {
    const questions = await generateQuestions({ ...combo, count: 3, questionType: 'mc' });
    for (const q of questions) {
      const result = validateAndFixQuestion(q, 0);
      if (result.warnings.length > 0) {
        console.error(`FAIL: ${combo.grammarItem || combo.languageSkill} — ${result.warnings.join('; ')}`);
        process.exit(1);
      }
    }
    console.log(`PASS: ${combo.grammarItem || combo.languageSkill}`);
  }
}
```

執行：`npx tsx scripts/validate-prompts.ts`

### 2.4 HKDSE 更新流程

當 HKDSE 考試大綱或 Level Descriptors 更新時：

1. 在 `prompts/v{N}/` 建立新版本
2. 更新 `STRICT_ANSWER_RULES`、HKDSE rubric 段落
3. 執行 `npx tsx scripts/validate-prompts.ts` 驗證
4. 手動生成 20 題並人工評分（至少 2 位英文教師）
5. 若通過率 > 95%，更新 `current` symlink
6. 部署後監控 48 小時內的答案一致性警告

---

## 三、監控與警報系統

### 3.1 關鍵指標 (KPI)

| 指標 | 目標值 | 警報閾值 | 來源 |
|------|--------|----------|------|
| AI 生成成功率 | > 98% | < 95% | `aiLog('call_success')` / `aiLog('call_failed')` 比值 |
| 答案一致性警告率 | < 5% | > 10% | `console.warn('[Listening Consistency]')` 計數 |
| AI 平均回應時間 | < 8s | p95 > 25s | Vercel Analytics |
| Gemini fallback 使用率 | < 10% | > 30% | `wasFallbackUsed()` 計數 |
| 學生每日活躍數 | 增長中 | 連續 7 天下降 | DB query `User.lastLoginAt` |
| API Rate Limit 觸發次數 | < 5/天 | > 20/天 | `checkRateLimit` 429 回應計數 |

### 3.2 Vercel Logs 結構化查詢

`aiLog()` 輸出格式：`{"service":"ai-service","event":"call_success","provider":"deepseek","latencyMs":1234}`

**常用 Logs 查詢**（Vercel Dashboard → Logs → 搜尋框）：

| 查詢 | 用途 |
|------|------|
| `ai-service call_failed` | 查看所有 AI 呼叫失敗 |
| `ai-service fallback:true` | Gemini fallback 觸發次數 |
| `[Listening Consistency]` | 聆聽題答案不一致警告 |
| `Answer auto-fix` | 自動修正的 MCQ 答案 |
| `normalizeMcqAnswer: could not match` | 無法匹配的 AI 答案 |

### 3.3 建議加入 Sentry（難度：Easy）

```bash
npm install @sentry/nextjs
```

`next.config.ts` 中設定：

```typescript
const { withSentryConfig } = require('@sentry/nextjs');
// ... 在 module.exports 包裝 withSentryConfig(config, { ... })
```

### 3.4 Vercel Analytics 設定

已在專案中透過 `@vercel/analytics`（若未安裝：`npm install @vercel/analytics`），在 `layout.tsx` 加入 `<Analytics />`。

---

## 四、數據分析與學習成效追蹤

### 4.1 現有 Dashboard 擴展建議

| 功能 | 難度 | 效益 | 說明 |
|------|------|------|------|
| SRS 複習成效圖表 | Medium | High | 顯示學生使用 SRS 後的詞彙記憶留存率（7天/30天/90天） |
| HKDSE 等級預測 | Hard | High | 基於練習準確率 + 難度分佈，估算最接近的 HKDSE Level（L1-L5） |
| 全校常錯題型熱圖 | Medium | High | 依 grammarItem × difficulty 矩陣顯示錯誤率，教師可針對性教學 |
| 班級排行榜（匿名） | Easy | Medium | 按 XP 或正確率排名，促進良性競爭 |
| 教師教學成效對比 | Hard | Medium | 比較不同班級在同一作業的表現分佈 |

### 4.2 SQL 查詢範例（Prisma）

```typescript
// 全校常錯題型熱圖
const mistakeHeatmap = await db.$queryRaw`
  SELECT "grammarItem", "difficulty", COUNT(*) as count
  FROM "Mistake"
  WHERE "createdAt" > NOW() - INTERVAL '30 days'
  GROUP BY "grammarItem", "difficulty"
  ORDER BY count DESC
  LIMIT 20
`;

// SRS 記憶留存率（7 天後仍標記為 mastered 的比例）
const srsRetention7d = await db.$queryRaw`
  SELECT COUNT(*) FILTER (WHERE familiarity = 'mastered') * 100.0 / COUNT(*) as retention_pct
  FROM "VocabItem"
  WHERE "lastReviewedAt" < NOW() - INTERVAL '7 days'
`;
```

---

## 五、成本與規模化考量

### 5.1 AI API 成本優化

| 策略 | 難度 | 預期節省 | 說明 |
|------|------|----------|------|
| **題目快取** | Medium | 30-50% | 相同 (grammarItem, difficulty, gradeLevel) 組合 24 小時內重用 |
| **降低 maxTokens** | Easy | 10-20% | 寫作批改從 4096 → 2048 tokens |
| **DeepSeek 批次優惠** | Easy | 10% | DeepSeek 夜間時段（UTC+8 2:00-8:00）有折扣 |
| **Prompt 精簡** | Medium | 5-10% | 減少 system prompt 中不必要範例 |
| **Gemini fallback 限流** | Easy | — | 當 DeepSeek 可用時降低 Gemini 優先級 |

### 5.2 題目快取策略

```typescript
// 簡易記憶體快取（可替換為 Redis）
const questionCache = new Map<string, { questions: GeneratedQuestion[]; timestamp: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 小時

function getCacheKey(input: GenerateQuestionsInput): string {
  return `${input.grammarItem || ''}|${input.languageSkill || ''}|${input.difficulty}|${input.gradeLevel}|${input.questionType}|${input.count}`;
}
```

### 5.3 多校擴展架構

當從 1 校擴展到 N 校時：

| 階段 | 架構變更 | 難度 |
|------|----------|------|
| 1-3 校 | 單一 PostgreSQL + Vercel Pro（目前） | Easy |
| 4-10 校 | 加入 Redis 快取（Upstash）+ 讀寫分離 | Medium |
| 10+ 校 | 微服務拆分：AI Service 獨立部署（避免 cold start）+ DB sharding by schoolId | Hard |

---

## 六、接下來 30 天行動計劃

| 週次 | 行動 | 難度 |
|------|------|------|
| **第 1 週** | 1. 完成 Vercel 環境變數設定 2. 首次生產部署 3. 執行 Smoke Test checklist | Easy |
| **第 2 週** | 1. 設定 Vercel Log Drain → Axiom（免費 tier）2. 建立每週 Logs 檢查習慣 3. 安裝 `@vercel/analytics` | Easy |
| **第 3 週** | 1. 執行每月 checklist M1-M7 2. 抽查 10 題 AI Listening 答案一致性 3. 匯出 PostgreSQL 備份 | Easy |
| **第 4 週** | 1. 建立 `prompts/v1/` 目錄 + prompt 檔案 2. 執行 `validate-prompts.ts` 腳本 3. 規劃 Q3 功能：SRS 成效圖表 | Medium |

---

## 附錄：快速指令參考

```bash
# 測試
npm test                          # 執行全部 74+ tests
npm run test:watch                # watch 模式

# 資料庫
npx prisma studio                 # 視覺化資料庫瀏覽
npx prisma db push                # 推送 schema 變更
npm run db:seed                   # 填充種子資料

# AI 驗證
npx tsx scripts/validate-prompts.ts  # 驗證新 prompt 答案一致性

# 安全性
npm audit                         # 依賴安全檢查
npx eslint .                      # 程式碼品質

# 部署
npx vercel                        # 預覽部署
npx vercel --prod                 # 生產部署
```
