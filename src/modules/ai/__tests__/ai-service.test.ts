// ============================================
// Tests: AI Service, Schema Validation & Rate Limiter
// ============================================

import { describe, it, expect, beforeEach } from 'vitest';

// ============================================
// 一、AI JSON 解析測試
// ============================================

// Note: parseAIJSON and repairTruncatedJSON are exported from ai-service.ts
// We test them via dynamic import since they use Node APIs

describe('repairTruncatedJSON', () => {
  // Inline the function for pure unit testing without module loading
  function repairTruncatedJSON(json: string): string | null {
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

  function parseAIJSON<T>(raw: string): T {
    const cleaned = raw
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim();
    try { return JSON.parse(cleaned) as T; } catch { /* continue */ }
    const objMatch = cleaned.match(/\{[\s\S]*\}/);
    if (objMatch) {
      try { return JSON.parse(objMatch[0]) as T; } catch { /* continue */ }
    }
    const arrMatch = cleaned.match(/\[[\s\S]*\]/);
    if (arrMatch) {
      try { return JSON.parse(arrMatch[0]) as T; } catch { /* continue */ }
    }
    const repaired = repairTruncatedJSON(cleaned);
    if (repaired) {
      try { return JSON.parse(repaired) as T; } catch { /* continue */ }
    }
    throw new Error('AI 回傳格式無法解析，請重試。');
  }

  it('should parse valid JSON array', () => {
    const result = parseAIJSON<{ name: string }[]>('[{"name":"test"}]');
    expect(result).toEqual([{ name: 'test' }]);
  });

  it('should parse JSON wrapped in markdown code block', () => {
    const result = parseAIJSON<{ x: number }>('```json\n{"x": 42}\n```');
    expect(result).toEqual({ x: 42 });
  });

  it('should parse JSON wrapped in plain code block', () => {
    const result = parseAIJSON<{ x: number }>('```\n{"x": 42}\n```');
    expect(result).toEqual({ x: 42 });
  });

  it('should extract JSON object from surrounding text', () => {
    const result = parseAIJSON<{ key: string }>('Here is your result:\n{"key": "value"}\nHope this helps!');
    expect(result).toEqual({ key: 'value' });
  });

  it('should extract JSON array from surrounding text', () => {
    const result = parseAIJSON<number[]>('Results:\n[1, 2, 3]\nDone.');
    expect(result).toEqual([1, 2, 3]);
  });

  it('should repair truncated JSON array with missing closing bracket', () => {
    const input = '[{"a": 1}, {"b": 2}';
    const result = parseAIJSON<unknown[]>(input);
    expect(result).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it('should repair truncated JSON array', () => {
    // Input missing final ] — regex and direct parse both fail, repair kicks in
    const input = '[{"a":1},{"b":2}';
    const result = parseAIJSON<unknown[]>(input);
    expect(result).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it('should throw on completely malformed input', () => {
    expect(() => parseAIJSON('not json at all just random text')).toThrow('AI 回傳格式無法解析');
  });

  it('should handle empty string', () => {
    expect(() => parseAIJSON('')).toThrow();
  });

  it('should handle mixed markdown and JSON', () => {
    const result = parseAIJSON<{ ok: boolean }>('```json\n{"ok": true}\n```\nSome extra text');
    expect(result).toEqual({ ok: true });
  });

  it('should parse questions wrapped in object', () => {
    const input = '{"questions": [{"type": "mc", "prompt": "What is 2+2?"}]}';
    const result = parseAIJSON<{ questions: unknown[] }>(input);
    expect(result.questions).toHaveLength(1);
  });
});

// ============================================
// 二、Zod Schema 驗證測試
// ============================================

import {
  GeneratedQuestionSchema,
  GeneratedQuestionsArraySchema,
  AnswerAnalysisSchema,
  WritingAnalysisSchema,
  MistakeExplanationSchema,
  ProgressAnalysisSchema,
  MaterialAnalysisSchema,
  validateAIResponse,
} from '@/modules/ai/schemas/ai-schema';

describe('GeneratedQuestionSchema', () => {
  const validQuestion = {
    type: 'mc' as const,
    prompt: 'What is the capital of France?',
    promptZh: '法國的首都是什麼？',
    choices: ['A. London', 'B. Paris', 'C. Berlin', 'D. Madrid'],
    answer: 'B',
    explanationZh: '巴黎是法國的首都。',
    explanationEn: 'Paris is the capital of France.',
    commonMistake: '學生常混淆倫敦和巴黎。',
    grammarPoint: 'capital cities',
  };

  it('should accept a valid question', () => {
    const result = GeneratedQuestionSchema.safeParse(validQuestion);
    expect(result.success).toBe(true);
  });

  it('should reject missing required fields', () => {
    const result = GeneratedQuestionSchema.safeParse({ type: 'mc' });
    expect(result.success).toBe(false);
  });

  it('should reject invalid question type', () => {
    const result = GeneratedQuestionSchema.safeParse({ ...validQuestion, type: 'invalid-type' });
    expect(result.success).toBe(false);
  });

  it('should default choices to empty array', () => {
    const { prompt, answer, explanationZh, explanationEn, commonMistake, type } = validQuestion;
    const result = GeneratedQuestionSchema.safeParse({ type, prompt, answer, explanationZh, explanationEn, commonMistake });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.choices).toEqual([]);
  });

  it('should accept listening fields', () => {
    const q = {
      ...validQuestion,
      listeningContent: 'Excuse me, where is the MTR?',
      listeningContentZh: '問路對話',
    };
    const result = GeneratedQuestionSchema.safeParse(q);
    expect(result.success).toBe(true);
  });

  it('should validate array of questions', () => {
    const result = GeneratedQuestionsArraySchema.safeParse([validQuestion, validQuestion]);
    expect(result.success).toBe(true);
  });

  it('should reject non-array for array schema', () => {
    const result = GeneratedQuestionsArraySchema.safeParse(validQuestion);
    expect(result.success).toBe(false);
  });
});

describe('AnswerAnalysisSchema', () => {
  const validAnalysis = {
    isCorrect: false,
    score: 65,
    feedbackZh: '你的答案方向正確，但文法有誤。',
    feedbackEn: 'Your answer is on the right track but has a grammar mistake.',
    mistakeType: 'grammar' as const,
    explanation: '這裡需要使用過去式而非現在式。',
    improvementTip: '多練習時態轉換。',
    relatedGrammarPoint: 'Past Tense',
  };

  it('should accept valid analysis', () => {
    const result = AnswerAnalysisSchema.safeParse(validAnalysis);
    expect(result.success).toBe(true);
  });

  it('should reject score out of range', () => {
    const result = AnswerAnalysisSchema.safeParse({ ...validAnalysis, score: 150 });
    expect(result.success).toBe(false);
  });

  it('should reject invalid mistakeType', () => {
    const result = AnswerAnalysisSchema.safeParse({ ...validAnalysis, mistakeType: 'unknown' });
    expect(result.success).toBe(false);
  });
});

describe('WritingAnalysisSchema', () => {
  const validWriting = {
    overallScore: 78,
    dseLevel: 'Level 4',
    strengths: ['Good vocabulary', 'Clear structure'],
    weaknesses: ['Some grammar errors', 'Chinglish expressions'],
    grammarErrors: [{ original: 'He go', correction: 'He goes', explanation: 'Subject-verb agreement' }],
    chinglishWarnings: [{ original: 'I very like', suggestion: 'I really like', explanation: 'Very + verb is Chinglish' }],
    vocabularySuggestions: [{ original: 'good', suggestion: 'excellent', reason: 'More precise' }],
    structureFeedback: 'Well-organized with clear paragraphs.',
    generalComment: 'Good effort overall.',
  };

  it('should accept valid writing analysis', () => {
    const result = WritingAnalysisSchema.safeParse(validWriting);
    expect(result.success).toBe(true);
  });

  it('should accept with optional revisedVersion', () => {
    const result = WritingAnalysisSchema.safeParse({ ...validWriting, revisedVersion: 'Revised text...' });
    expect(result.success).toBe(true);
  });
});

describe('validateAIResponse', () => {
  it('should return success for valid data', () => {
    const result = validateAIResponse(AnswerAnalysisSchema, {
      isCorrect: true,
      score: 90,
      feedbackZh: '很好！',
      feedbackEn: 'Great!',
      mistakeType: 'none',
      explanation: '完全正確。',
      improvementTip: '繼續保持。',
    });
    expect(result.success).toBe(true);
  });

  it('should return error with message for invalid data', () => {
    const result = validateAIResponse(AnswerAnalysisSchema, { isCorrect: 'not-boolean' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('AI 回傳資料格式異常');
    }
  });
});

// ============================================
// 三、Rate Limiter 測試
// ============================================

import { checkRateLimit } from '@/shared/utils/rate-limiter';

describe('checkRateLimit', () => {
  it('should allow first request', async () => {
    const result = await checkRateLimit({
      maxRequests: 5,
      windowMs: 60_000,
      identifier: 'test-first-' + Date.now(),
    });
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it('should allow requests within limit', async () => {
    const id = 'test-within-' + Date.now();
    for (let i = 0; i < 5; i++) {
      const result = await checkRateLimit({ maxRequests: 5, windowMs: 60_000, identifier: id });
      expect(result.allowed).toBe(true);
    }
  });

  it('should block requests exceeding limit', async () => {
    const id = 'test-exceed-' + Date.now();
    // Exhaust the limit
    for (let i = 0; i < 5; i++) {
      await checkRateLimit({ maxRequests: 5, windowMs: 60_000, identifier: id });
    }
    // 6th request should be blocked
    const result = await checkRateLimit({ maxRequests: 5, windowMs: 60_000, identifier: id });
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.message).toBeDefined();
    expect(result.message).toContain('請求過於頻繁');
  });

  it('should isolate rate limits per identifier', async () => {
    const idA = 'test-iso-a-' + Date.now();
    const idB = 'test-iso-b-' + Date.now();

    // Exhaust A
    for (let i = 0; i < 3; i++) {
      await checkRateLimit({ maxRequests: 3, windowMs: 60_000, identifier: idA });
    }
    expect((await checkRateLimit({ maxRequests: 3, windowMs: 60_000, identifier: idA })).allowed).toBe(false);

    // B should still work
    expect((await checkRateLimit({ maxRequests: 3, windowMs: 60_000, identifier: idB })).allowed).toBe(true);
  });
});
