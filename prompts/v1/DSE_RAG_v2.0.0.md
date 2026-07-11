# DSE RAG Prompt Enhancement — v2.0.0

## 概述
此版本將歷屆 DSE 試題（Past Papers）及官方 Marking Schemes 透過 RAG（Retrieval-Augmented Generation）
注入所有 AI 流程中，讓 AI 出題、批改、解說時能參考真實 DSE 內容，而非僅靠通用 Level Descriptors。

## 受影響的 AI 流程

### 1. `generate-questions` (題目生成)
- **新增**: 根據學生選擇的技能（Reading/Writing/Listening/Speaking）、難度、年級，
  自動透過 RAG 檢索相關歷屆試題段落及 Marking Scheme
- **DSE Context Prompt**: 指示 AI 「嚴格參考上方真實 DSE 歷屆試題內容」來設計題型、
  難度、選項風格
- **Fallback**: RAG 失敗或未啟用時，自動回退原有純 prompt 模式

### 2. `analyze-answer` (答案批改)
- **新增**: 根據題型自動檢索對應卷別的 Marking Scheme
  - 閱讀/聆聽/文法題 → Paper 1 Marking Scheme
  - 寫作題 → Paper 2 Marking Scheme
- **DSE Context Prompt**: 指示 AI 比對 marking scheme 中的 Acceptable Answers，
  引用評分標準來解釋扣分原因

### 3. `analyze-writing` (寫作批改)
- **新增**: 檢索 Paper 2 Writing Marking Scheme（含 Content / Language & Style / Organization 三向度 band descriptors）
- **DSE Context Prompt**: 指示 AI 嚴格依據 marking scheme 的 band descriptors 評分，
  參考各 band 的字數、內容深度、語言準確度要求

### 4. `explain-mistake` (錯題解說)
- **新增**: 檢索相關 Marking Scheme，對照 Acceptable Answers 說明扣分原因
- **DSE Context Prompt**: 指示 AI 引用 marking scheme 中的 model answer 作為對比

### 5. `study-help` (學習求助)
- **新增**: 檢索學生弱項對應的歷屆試題與 Marking Scheme
- **DSE Context Prompt**: 指示 AI 指出弱項在 DSE 中的對應題型，
  引用真實 marking scheme 說明評分重點

## Feature Flag
- 環境變數 `DSE_RAG_ENABLED=true` 啟用 RAG（預設 `false`）
- 設定後，所有上述流程自動注入 DSE 歷屆試題內容
- RAG 失敗時自動 fallback 純 prompt，不影響服務可用性

## 使用前準備
1. 執行 `npx tsx scripts/import-past-papers.ts` 匯入歷屆試題到資料庫
2. 設定 `DSE_RAG_ENABLED=true` 環境變數
3. 重新部署

## 驗證
```bash
# 檢查 RAG 狀態
curl /api/rag?action=stats

# 測試 DSE 檢索
curl -X POST /api/rag -H "Content-Type: application/json" \
  -d '{"action":"query","query":"reading comprehension main idea","topK":3}'
```
