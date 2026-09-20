// ============================================
// Answer Verification Prompt — independent answer-key audit (v1)
//
// Why this exists (2026-09-20 incident):
//   The same LLM that writes the question also writes the explanation, so it
//   will happily "explain" an item whose four options contain NO correct
//   answer at all. Real case delivered to a student:
//
//     "Always ___ ___ your passwords regularly."
//     A. update in  B. update up  C. update with  D. update on
//     💡 「update up 不是正確片語…但選項中沒有正確的，因此題目有誤。」
//
//   Structural validation (question-validator.ts) cannot catch this: the key
//   resolves to a real option, the option count is 4, and the answer appears
//   in context. Only a SECOND, independent pass can tell that none of the
//   options is real English.
//
// Contract:
//   - The generator's answer key is NEVER shown to the verifier (blind solve).
//   - `mode: 'option'` (mc) → verifier returns the letter of the correct option;
//     `mode: 'option-error'` (error-correction) → the key is the option CONTAINING
//     the mistake, so the verifier returns the letter of the faulty option;
//     `mode: 'text'` (fill-blank) → verifier returns the exact answer string.
//   - The verifier must also judge soundness, so items with no correct option
//     ("flawed") or with several defensible options ("ambiguous") are rejected
//     even when the verifier happens to agree with the key.
// ============================================

export const ANSWER_VERIFICATION_VERSION = 'v1';

/** One item handed to the verifier — note the absence of the answer key. */
export interface AnswerVerificationPromptItem {
  /** 1-based index echoed back by the verifier */
  index: number;
  /**
   * 'option'       → the key is the letter of the CORRECT option (MC)
   * 'option-error' → the key is the letter of the option CONTAINING the mistake
   *                  (error-correction: the other three are correct)
   * 'text'         → fill-blank: reply with the answer string
   */
  mode: 'option' | 'option-error' | 'text';
  prompt: string;
  promptZh?: string;
  choices?: string[];
  /** readingContent / listeningContent — required to judge an item fairly */
  contexts?: string[];
}

export const ANSWER_VERIFICATION_SYSTEM_PROMPT = `你是香港中學文憑試（HKDSE）英文科的獨立審題員。你的唯一工作是把關：判斷每道選擇題／填充題是否**只有一個站得住腳的答案**，以及題目陳述的答案鍵是否可信。

【最高原則】
1. 你看到的題目**沒有**提供答案鍵，也不得推測出題者的意圖。你必須自己作答（blind solve）。
2. 不要因為題目「看似合理」而通過。你必須逐項檢查語法、詞形、搭配（collocation）、慣用語與語意。
3. 寧可嚴格：不確定、無法判定、缺少必要資訊 → 一律視為有問題（flawed 或 ambiguous）。

【逐題要求】
A. 先自己回答（blindAnswer）：
   - mode = "option"（MC）→ 填你認為正確的選項字母 "A"–"D"。
   - mode = "option-error"（改錯題）→ 填你認為**含有錯誤**的那個選項字母 "A"–"D"（見下方 B-2）。
   - mode = "text"（填充題）→ 填你會接受的答案文字（必須唯一；若可接受多於一個答案，見 B 的 ambiguous）。
   - 若**沒有任何**選項成立（option）／四個選項都沒有錯（option-error）→ blindAnswer 填 "NONE"。
B. 再判斷 soundness：
   - "ok"：恰好一個選項成立；其餘選項在語法、詞形、搭配或語意上**明確**錯誤（不是「較不理想」，而是真的錯）。
   - "ambiguous"：多於一個選項在語法及語意上都成立（題目有兩個以上可接受答案），或填充題有多個可接受答案。
   - "flawed"：沒有任何選項成立（例如四個選項都是憑空拼出的片語）、題目本身語法錯誤、語意不通、兩個空格但答案無法同時成立、或缺少判斷所需的資訊。

B-2. 【mode = "option-error"（改錯題）— 方向與一般選擇題相反】
   此類題目要求學生指出**包含錯誤**的那個選項（其餘三個選項是正確的）。
   - 你必須獨立判斷哪一個選項含有文法／詞形／搭配錯誤，將該選項字母填入 blindAnswer。
   - soundness = "ok"：**恰好一個**選項有明確錯誤，其餘三個選項完全正確。
   - 多於一個選項有明確錯誤 → "ambiguous"。
   - 四個選項都沒有錯、或你無法確定錯在哪 → "flawed"（改錯題必須真的有一個錯處）。

【重點陷阱 — 必須主動檢查】
- 「動詞 + 介詞／助詞」組合題：選項中的組合必須是**真實存在的英語片語**。憑空拼出的組合（例如 "update up"、"update in"、"discuss about"）一律是錯誤選項。若四個選項全部都是憑空拼出的組合 → soundness = "flawed"，blindAnswer = "NONE"。
- 及物動詞誤加介詞：update / discuss / enter / reach / contact / marry 等及物動詞**不接介詞**；若題目要求填入介詞才通順，則該題設計有錯 → "flawed"。
- 片語動詞、搭配詞、慣用語題：必須確認為真實英語用法（例如 "give up"、"look after"），不得因貌似合理而通過。
- 干擾選項若與正確答案在語法與語意上同樣成立 → "ambiguous"。
- 選項若為系統補位文字（例如 "Check the sentence structure carefully."）→ "flawed"。

【輸出格式 — 必須 100% 遵守】
只輸出一個純 JSON 物件，不要 markdown、不要程式碼區塊、不要 JSON 以外的任何文字：
{"verdicts":[{"index":1,"blindAnswer":"C","soundness":"ok","reason":"Only 'were' fits the Type 2 conditional."}]}
- index：題號（由 1 開始，必須逐一對應輸入題目，不得遺漏或新增）
- blindAnswer："A"–"D"（mode = "option" 或 "option-error"）、答案文字（mode = "text"）或 "NONE"
- soundness："ok" | "ambiguous" | "flawed"
- reason：一句英文說明你的判斷依據`;

/**
 * Builds the verifier user prompt. The generated answer key is deliberately
 * excluded — a verifier that is told the key tends to defend it.
 */
export function buildAnswerVerificationUserPrompt(items: AnswerVerificationPromptItem[]): string {
  const blocks = items.map((item) => {
    const lines: string[] = [`── 題目 ${item.index} ──`, `type/mode: ${item.mode}`];
    if (item.mode === 'option-error') {
      lines.push('task: 找出【含有錯誤】的那個選項（其餘三個選項是正確的）');
    }
    lines.push(`prompt: ${item.prompt}`);
    if (item.promptZh) lines.push(`promptZh: ${item.promptZh}`);
    if (item.contexts && item.contexts.length > 0) {
      lines.push(`context: ${item.contexts.filter(Boolean).join('\n')}`);
    }
    if (item.choices && item.choices.length > 0) {
      const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
      lines.push(
        `choices: ${item.choices.map((c, i) => `${letters[i] || String(i + 1)}. ${c}`).join(' | ')}`,
      );
    } else {
      lines.push('choices: （填充題，無選項）');
    }
    return lines.join('\n');
  });

  return `請逐一審核以下 ${items.length} 道題目，並依系統指示回覆純 JSON 物件 {"verdicts":[...]}。

${blocks.join('\n\n')}

提醒：輸入**沒有**答案鍵。你必須自己作答，並對每題給出 soundness（ok / ambiguous / flawed）。`;
}
