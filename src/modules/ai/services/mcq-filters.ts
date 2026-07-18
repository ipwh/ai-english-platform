// ============================================
// MCQ 選項過濾規則 — DSE 不相容選項 + 時間碎片檢測 + 補位選項
// 提取自 ai-service.ts 的 normalizeGeneratedQuestions() 函式
// ============================================

/** 過濾 DSE 不相容的選項（All/None of the above、碎片數字等） */
export const BANNED_PATTERNS: RegExp[] = [
  /^all\s*of\s*the\s*above\.?\s*$/i,
  /^none\s*of\s*the\s*above\.?\s*$/i,
  /^all\s*the\s*above\.?\s*$/i,
  /^not\s*mentioned/i,
  /^cannot\s*be\s*determined/i,
];

/** 時間碎片模式 — AI 常生成不完整的時間選項（如 "00 PM", "30 PM", "4:00"） */
export const TIME_FRAGMENT_PATTERNS: RegExp[] = [
  /^\d{1,2}:\d{2}\s*(?:AM|PM)?$/i,     // "4:00", "4:00 PM" 等時間格式（無上下文過於狹窄）
  /^\d{1,2}\s*(?:AM|PM)$/i,             // "4 PM", "00 PM", "30 PM" 等破碎時間
  /^\d{1,2}\s*o'?clock$/i,              // "4 oclock", "4 o'clock"
  /^(?:at\s+)?\d{1,2}(?::\d{2})?\s*(?:AM|PM|in the (?:morning|afternoon|evening))$/i, // "at 4 PM"
];

/** 聆聽題補位選項（當過濾後選項不足 4 個時使用） */
export const LISTENING_FALLBACK_FILLERS = [
  'The information is not provided in the recording.',
  'The speaker did not mention this.',
  'This detail was changed during the conversation.',
  'Listen carefully to the exact words used.',
] as const;

/** 閱讀題補位選項 */
export const READING_FALLBACK_FILLERS = [
  'The passage does not mention this detail.',
  'This idea is not supported by the text.',
  'The author does not discuss this point.',
  'Re-read the relevant paragraph carefully.',
] as const;

/** 預設補位選項（非聽非讀題） */
export const DEFAULT_FALLBACK_FILLERS = [
  'The correct answer depends on the grammar rule.',
  'Check the sentence structure carefully.',
  'Eliminate obviously incorrect options first.',
  'Review the key concept before answering.',
] as const;

/** 根據題型選擇補位選項 */
export function getFallbackFillers(isListening: boolean, isReading: boolean): readonly string[] {
  return isListening
    ? LISTENING_FALLBACK_FILLERS
    : isReading
      ? READING_FALLBACK_FILLERS
      : DEFAULT_FALLBACK_FILLERS;
}
