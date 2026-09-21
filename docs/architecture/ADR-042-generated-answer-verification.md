# ADR-042: Generated Answer Verification — Independent Pre-Delivery Verification

- **Status**: Accepted
- **Date**: 2026-09-20
- **Related**: ADR-006 (usecase architecture), ADR-024 (AI quality layer), ADR-028 (assessment quality layer), ADR-034 (question quality enhancement), ADR-005 (centralized schemas), R3.10-L (never fabricate an answer key)

## Context

學生端出現一道「四個選項全錯」的詞彙題（AI 生成、已交付）：

```
Always ___ ___ your passwords regularly to keep your accounts safe.
A. update in   B. update up   C. update with   D. update on
💡 update up 不是正確片語。update 作為及物動詞，直接接受詞，無需介詞。
   實際上正確用法是 update 直接加受詞。但選項中沒有正確的，因此題目有誤。
```

題目、答案鍵與解說**由同一次 LLM 生成**，因此模型會為一個沒有正確答案的題目
「寫出解說」，並在解說中自認題目有誤，平台仍照樣交付並讓學生作答。

既有的交付前檢查（`ai/services/question-validator.ts` +
`question-normalizer.ts`）在此題上**全部通過**：

| 檢查 | 結果 | 原因 |
|---|---|---|
| 答案鍵可對應選項 | ✅ 通過 | `B` 確實是「update up」 |
| 選項數目 = 4 | ✅ 通過 | 4 個 |
| 選項非空白／非數字碎片／非 All-of-the-above | ✅ 通過 | 都是看起來像片語的字串 |
| 選項不重複（正規化後） | ✅ 通過 | 4 個都不同 |
| 填充／聆聽答案逐字出現 | ✅ 通過 | 題目無篇章 |
| 題目與答案一致性（LLM 解說） | ✅ 通過 | **解說由同一次生成產生 → 必然「自圓其說」** |

**結構檢查只能證明題目「形狀正確」，不能證明題目「語言正確」。**
問題的來源是「生成者同時是解說者」，任何以生成者自身輸出為證據的檢查都會被繞過。

2026-09-20 的相關決定（D2b/D3）已把閱讀／文法題目在交付前持久化為伺服器
正典題目、以伺服器答案鍵評分 —— 一旦錯誤答案鍵被持久化，就會同時污染
「可驗證證據」（準確率、技能掌握度、診斷）。因此錯誤答案鍵的成本不再只是
一道爛題，而是錯誤的學習訊號。

## Decision

1. **交付前必須有第二次、獨立、blind 的答案覆核**
   新模組 `ai/services/answer-verification.ts`；提示詞
   `ai/prompts/grammar/answer-verification.ts`（PromptRegistry 名稱
   `GenerateQuestionsAnswerVerification`）。
   呼叫點在 `ai/usecases/generate-questions.ts`（生成 → 標準化 → 結構驗證 →
   **答案覆核** → 計數／重試），格式修復（repair）路徑同樣必須通過覆核。

2. **驗證器永不看到答案鍵（blind solve）**
   送給驗證器的資料只有題目、選項與篇章／對話內容。已告知答案鍵的驗證器
   會傾向為該答案鍵辯護（同一家族的 generation bias），無法作為獨立證據。
   驗證器必須**自己作答**，再判斷題目是否成立：
   - `ok`：恰好一個選項成立，其餘選項在語法／詞形／搭配／語意上明確錯誤。
   - `ambiguous`：多於一個選項成立（題目有兩個以上可接受答案）。
   - `flawed`：沒有任何選項成立、題目本身不通、或缺少判斷所需資訊。

3. **兩個條件同時成立才可交付**
   `soundness === 'ok'` **且** 驗證器的 blind 答案等於題目答案鍵。
   - `soundness !== 'ok'` → 丟棄（即使驗證器「猜中」答案鍵）。
   - blind 答案 ≠ 答案鍵 → 丟棄（答案鍵不可信）。
   - 填充題以正規化文字比對（`STRICT_ANSWER_RULES` 要求填充題答案唯一）；
     驗證器回「多個可接受答案」⇒ `ambiguous` ⇒ 丟棄。
   - **改錯題（`mode: 'option-error'`）方向相反**：改錯題的答案鍵是「**含有錯誤**的那個
     選項」（其餘三個正確，見 `grammar/v1.ts`）。若用一般 MC 的判斷方向（找正確選項），
     每個合法改錯題都會被判為 `flawed` 而全部丟棄 —— 因此 `option-error` 明示要求驗證器
     找出含錯選項，`ok` = 恰好一個選項有錯且其餘三個完全正確，多於一個有錯 ⇒ `ambiguous`，
     四個都無錯 ⇒ `flawed`。`practice-answer-scorer.ts` 同樣把有選項的改錯題視為 MC 評分
     （比對字母），兩者方向一致。

4. **決定性缺陷螢幕（Layer A）永遠先跑，零成本、不呼叫 AI**
   - 選項數目 ≠ 4、選項重複、答案鍵不是 A–D／指向不存在的選項。
   - 選項是系統補位文字（`mcq-filters.ts` 的 fallback filler 被當成真實選項交付）。
   - **解說自認題目有誤**（「選項中沒有正確的…因此題目有誤」、
     「none of the options is correct」等）—— 以上述事件為正典案例。
     模式刻意收窄：合法解說「B 不是正確的片語」（說明干擾項為何錯）**不得**誤判。

5. **無條件 fail-closed（2026-09-21 修訂）**
  - 個別題目沒有 verdict、verdict 無法解讀、答案不符 → **丟棄**（無法確認即不交付）。
  - 驗證器呼叫失敗（格式／供應商逾時／不可用）→ **丟棄所有需要 blind solve 的客觀題**；不再以設定或呼叫選項降級。
  - `AI_ANSWER_VERIFY_DISABLED` 與 `AI_ANSWER_VERIFY_STRICT` 已移除；部署環境不得繞過獨立答案覆核。
  - short-writing 為主觀寫作，不以單一文字 key blind-solve；有答案鍵的無選項 error-correction 則以文字 blind solve。

6. **被丟棄的題目必須驅動重試，而不是靜默少幾題**
   `generate-questions.ts` 以 `kept.length` 作為「實際題數」，令既有重試機制
   在題數不足時重新出題；重試提示會附上被否決的原因
   （`summarizeVerificationDrops()`），避免重犯同一種錯誤（例如憑空拼出的片語）。

7. **覆核是生成流程的既有責任，不是新管線**
   沿用 `executeAI()`（JSON）單一管線與既有預算帳本；驗證呼叫同樣計入
   `AiDailyUsage`。沒有新增 provider、沒有新增繞過管線的路徑。

## Consequences

**正面**
- 「四個選項全錯」的題目在**交付前**被丟棄，且不會被持久化為正典題目
  （持久化發生在 route 層，晚於 usecase 的覆核）。
- 錯誤答案鍵不再污染可驗證證據（準確率／技能掌握度／診斷）。
- 每次生成多一次 LLM 呼叫（`temperature: 0`、批次一次、上限 4096 tokens），
  以 2026-09-18 的額度帳本計入，不會繞過 `AI_DAILY_TOKEN_LIMIT`。

**負面／取捨**
- 生成延遲增加一次呼叫（批次，`temperature: 0`、`maxTokens ≤ 4096`、`timeoutMs 20000`）。
- 可能丟棄「其實正確但驗證器判斷失準」的題目 → 觸發重試（成本上升）。
  客觀題供應商故障時會減少可交付題目或要求重試；此取捨刻意優先於交付未經確認的答案鍵。
- 選擇題必須恰好 4 個選項：`question-normalizer` 在過濾後剩 2–3 個選項時會補 fallback filler
  （2 個）或直接交付（3 個），兩者現在都不再交付 → 學生可能偶爾拿到較少題目或需要重試。
  此取捨是刻意的：filler 是「Check the sentence structure carefully.」這類提示文字，不是答案，
  而錯誤答案鍵會污染練習、錯題本、準確率與診斷等可驗證證據。
- 驗證器為 LLM → 非決定性；因此 Layer A 保留全部決定性檢查，
  且驗證器**只可否決、不可改寫**答案鍵（與 `reading-feedback-builder.ts` 的
  「規則式訊號不得改寫 verdict」同一原則：AI 輸出不得成為新的評分權威）。

## Evidence

- 事件題目（學生端）：`Always ___ ___ your passwords regularly…`
  `update in / update up / update with / update on`，解說自認「選項中沒有正確的，因此題目有誤」。
- 既有檢查在此題全部通過（見 Context 表）—— 結構驗證無法覆蓋語法／搭配正確性。
- `src/modules/ai/__tests__/answer-verification.test.ts`（33 個測試）覆蓋：
  自認有誤、重複選項、補位選項、答案鍵不合法、`flawed`／`ambiguous`／
  覆核答案不符／無 verdict／verdict 無法解讀 → 丟棄；填充題文字比對；
  改錯題 `option-error` 反向驗證及無選項改錯題文字 blind solve；short-writing 不送覆核；
  驗證器不可用時無條件 fail-closed；丟棄題目的原始索引對應；
  驗證器輸入**不含**答案鍵；驗證器輸入的 mode 正確（改錯題 ⇒ `option-error`）；
  以及 5 個反向測試（合法解說干擾項為何錯**不得**誤判）。
  全套測試：3067 passed / 1 skipped（149 files passed, 1 skipped）。
