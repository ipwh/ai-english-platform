// ============================================
// PDPO 去識別化 + Prompt Injection 防護
// 從 ai-service.ts 拆分 — 零依賴純函數
// ============================================

export function sanitizeForAI(text: string, maxLength = 15_000): string {
  let cleaned = text;
  cleaned = cleaned
    .replace(/[A-Za-z]\d{6}\(\d\)/g, '[HKID_REMOVED]')
    .replace(/[A-Za-z]\d{7}/g, '[HKID_REMOVED]')
    .replace(/(?<!\d)\d{8}(?!\d)/g, '[PHONE_REMOVED]')
    .replace(/[\w.-]+@[\w.-]+\.\w+/g, '[EMAIL_REMOVED]');
  cleaned = cleaned
    .replace(/ignore\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|directives?|prompts?|rules?|constraints?|guidelines?)/gi, '[INJECTION_FILTERED]')
    .replace(/(forget|disregard|override|overwrite|discard)\s+(all\s+)?(previous|prior|earlier)\s+(instructions?|directives?|prompts?|rules?)/gi, '[INJECTION_FILTERED]')
    .replace(/you\s+are\s+(now\s+)?(a\s+)?(new|different)\s+(AI|assistant|model|system|bot)/gi, '[INJECTION_FILTERED]');
  cleaned = cleaned
    .replace(/(you\s+are\s+now|act\s+as|pretend\s+(that\s+)?you\s+are|from\s+now\s+on\s+you\s+(are|will\s+be)|imagine\s+you\s+are|roleplay\s+as)\s+(DAN|jailbreak|an?\s+unrestricted|a\s+different\s+(AI|model)|someone\s+else|another\s+(AI|assistant|entity))/gi, '[INJECTION_FILTERED]')
    .replace(/\b(DAN|jailbreak|developer\s*mode|god\s*mode)\b/gi, '[INJECTION_FILTERED]');
  cleaned = cleaned
    .replace(/```[\s\S]*?```/g, '[CODE_BLOCK_REMOVED]')
    .replace(/<\|[\s\S]*?\|>/g, '[SPECIAL_TOKEN_REMOVED]');
  cleaned = cleaned
    .replace(/(?:\n|^)\s*system\s*[:：]\s*/gi, '\n[FILTERED] ')
    .replace(/<system>[\s\S]*?<\/system>/gi, '[SYSTEM_TAG_REMOVED]')
    .replace(/\[system\]/gi, '[FILTERED]')
    .replace(/<\|system\|>/gi, '[FILTERED]');
  cleaned = cleaned
    .replace(/\b(repeat\s+(after\s+me|the\s+following|this|these\s+words)|say\s+(exactly|only|just)\s+["'])/gi, '[INJECTION_FILTERED]')
    .replace(/\b(output\s+(your\s+)?(system\s+(prompt|message|instructions?)|initial\s+(prompt|instructions?)|hidden\s+(prompt|instructions?)))/gi, '[INJECTION_FILTERED]')
    .replace(/\b(what\s+(is|are|was)\s+your\s+(system\s+(prompt|message|instructions?)|initial\s+(prompt|instructions?)|original\s+(prompt|instructions?)))/gi, '[INJECTION_FILTERED]');
  if (cleaned.length > maxLength) {
    cleaned = cleaned.slice(0, maxLength) + '\n\n[TRUNCATED]';
  }
  return cleaned;
}
