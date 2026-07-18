// ============================================
// AI JSON Utilities — robust parsing of LLM JSON output
// Extracted from ai-service.ts (Sprint 0.5)
// ============================================

/**
 * Attempt to repair a truncated JSON array/object by closing
 * unclosed brackets and braces.
 */
export function repairTruncatedJSON(json: string): string | null {
  let depth = 0;
  let lastComplete = -1;

  for (let i = 0; i < json.length; i++) {
    if (json[i] === '{') depth++;
    else if (json[i] === '}') {
      depth--;
      if (depth === 0) lastComplete = i;
    }
  }

  if (lastComplete > 0) {
    const truncated = json.substring(0, lastComplete + 1);
    const openBrackets = (truncated.match(/\[/g) || []).length;
    const closeBrackets = (truncated.match(/\]/g) || []).length;
    return truncated + ']'.repeat(Math.max(0, openBrackets - closeBrackets));
  }
  return null;
}

/**
 * Extract the first balanced JSON block from a string that may
 * contain surrounding noise.
 */
export function extractBalancedJson(raw: string): string | null {
  const startIndex = raw.search(/[\[{]/);
  if (startIndex < 0) return null;

  const openChar = raw[startIndex];
  const closeChar = openChar === '{' ? '}' : ']';
  const stack: string[] = [];
  let inString = false;
  let escaped = false;

  for (let i = startIndex; i < raw.length; i++) {
    const char = raw[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{' || char === '[') {
      stack.push(char);
      continue;
    }

    if (char === '}' || char === ']') {
      const last = stack[stack.length - 1];
      if (!last) return null;
      if ((last === '{' && char !== '}') || (last === '[' && char !== ']')) {
        return null;
      }
      stack.pop();
      if (stack.length === 0 && char === closeChar) {
        return raw.slice(startIndex, i + 1);
      }
    }
  }

  return null;
}

/**
 * Robustly parse AI-returned JSON, handling markdown code blocks,
 * truncation, and surrounding noise. Tries multiple strategies in sequence:
 *
 * 1. Direct JSON.parse
 * 2. Extract balanced JSON block
 * 3. Match object pattern
 * 4. Match array pattern
 * 5. Repair truncation and retry
 *
 * @throws Error with a retry-friendly message if all strategies fail
 */
export function parseAIJSON<T>(raw: string): T {
  const cleaned = raw
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();

  // Strategy 1: direct parse
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    /* continue */
  }

  // Strategy 2: balanced JSON extraction
  const balanced = extractBalancedJson(cleaned);
  if (balanced) {
    try {
      return JSON.parse(balanced) as T;
    } catch {
      /* continue */
    }
  }

  // Strategy 3: object pattern
  const objMatch = cleaned.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try {
      return JSON.parse(objMatch[0]) as T;
    } catch {
      /* continue */
    }
  }

  // Strategy 4: array pattern
  const arrMatch = cleaned.match(/\[[\s\S]*\]/);
  if (arrMatch) {
    try {
      return JSON.parse(arrMatch[0]) as T;
    } catch {
      /* continue */
    }
  }

  // Strategy 5: repair truncation
  const repaired = repairTruncatedJSON(cleaned);
  if (repaired) {
    try {
      return JSON.parse(repaired) as T;
    } catch {
      /* continue */
    }
  }

  throw new Error('AI 回傳格式無法解析，請重試。');
}
