// ============================================
// STRICT_ANSWER_RULES — 答案準確性保障規則
// 注入 generateQuestions 的 system prompt 中
// 提取自 ai-service.ts 以保持檔案模組化
// ============================================

export const STRICT_ANSWER_RULES = `
【嚴格答案一致性規則 — 必須 100% 遵守 (CRITICAL)】
- MCQ：'answer' 必須是 "A"/"B"/"C"/"D" 之一，且完整對應 choices 陣列中對應選項的文字內容。
- Listening：'answer' 指向的選項文字必須逐字 (verbatim) 出現在該題的 listeningContent 中。
  每題獨立生成 listeningContent，再據此產生問題和答案。禁止 hallucinate。

⚠️ 聆聽題時間表達強制規範 (CRITICAL for Listening Questions)：
- 對話中所有時間必須使用標準英文**文字**表達，嚴禁使用數字格式。
  ✅ 正確："three o'clock", "half past two", "a quarter to four", "two thirty", "five forty-five"
  ✅ 正確："at noon", "in the afternoon", "ten minutes past three"
  ❌ 錯誤："3:00", "2:30 PM", "4:00", "2:45"（這些數字格式會造成 TTS 朗讀混亂）
  ❌ 錯誤："3 o'clock"（數字+文字混雜）、"2:45 PM"（數字格式）
- 若答案涉及時間，listeningContent 中該時間必須以文字形式精確出現，
  且 choices 陣列中的對應選項也必須使用相同文字表達。
  例：對話說 "half past two in the afternoon" → 選項為 "A. half past two"、"B. two o'clock"、"C. three o'clock"、"D. two thirty"
  嚴禁選項出現 "A. 2:30 PM" 或 "A30 PM" 等數字/縮寫混雜格式。

⚠️ 聆聽題選項格式強制規範：
- 選項必須是完整、可讀的英文短語，不得為數字碎片。
  ✅ 正確：選項陣列為 ["two o'clock", "half past two", "three o'clock", "two thirty"]
  ❌ 錯誤：["00", "30", "o'clock"]、["A30 PM"]、["2:00"]、["PM"]
- 每個選項至少 5 個字元。
- 若答案為數字資訊（價格、電話號碼、門牌號碼），選項必須以完整格式呈現：
  ✅ ["fifty dollars", "sixty-five dollars", "forty dollars", "eighty dollars"]
  ❌ ["50", "65", "40"]

- Reading：'answer' 指向的選項文字必須可從 readingContent 直接推斷或引用。
- 時間、金錢、數字、專有名詞必須完全一致（包括標點和空格）。
  ⚠️ 時間選項反例（這些格式會被系統過濾，導致題目廢棄）：
  ❌ "00 PM"、"30 PM"、"5:00"（無 AM/PM）、"00"、"30"、裸數字
  ✅ "two o'clock"、"half past three"、"four o'clock"
- ⚠️ choices 陣列必須恰好 4 個元素。少於 4 個會被系統自動補位；被補位的選項可能不是 DSE 格式。
- 輸出前自我檢查 (Self-Check)：確認 answer 對應的選項文字確實存在於該題的 listeningContent/readingContent 中。
  如不一致，必須修正後再輸出。`;
