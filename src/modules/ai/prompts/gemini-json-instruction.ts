// ============================================
// Gemini JSON 格式指引
// 提取自 ai-service.ts，用於確保 Gemini fallback 輸出 JSON
// ============================================

export const GEMINI_JSON_INSTRUCTION = `
---
CRITICAL OUTPUT FORMAT:
- Output ONLY a valid JSON object (start with {, end with }) or JSON array (start with [, end with ]).
- Do NOT wrap in markdown code blocks (no \`\`\`json).
- Do NOT add any text, explanation, or notes before or after the JSON.
- EVERY string field must contain meaningful, complete, substantive content.
- NO empty strings "". NO placeholder values like "N/A", "todo", "TBD".
- For Chinese text, use Traditional Chinese (繁體中文), NOT Simplified.
- The response must be parseable by JSON.parse() directly.`.trim();
