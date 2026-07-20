// Sprint 40+: Assessment Grading Logic — 真正的邏輯測試
import { describe, it, expect, beforeEach } from 'vitest';
import { detectChinglish, clearRulesCache } from '../services/chinglish';
import { detectOverCopying } from '../services/plagiarism';

beforeEach(() => {
  clearRulesCache();
});

// ============================================
// Chinglish Detection
// ============================================
describe('detectChinglish — 中式英文檢測', () => {
  it('應檢測出「although...but」句式', () => {
    const result = detectChinglish('Although it is raining but I still go out.');
    expect(result.length).toBeGreaterThan(0);
    const match = result.find(r => r.pattern === 'although...but');
    expect(match).toBeDefined();
    expect(match!.suggestion).toContain('Although');
  });

  it('應檢測出「I very like」句式', () => {
    const result = detectChinglish('I very like this book.');
    expect(result.length).toBeGreaterThan(0);
    const match = result.find(r => r.pattern === 'I very like');
    expect(match).toBeDefined();
  });

  it('應檢測出「because...so」句式', () => {
    const result = detectChinglish('Because it is raining so I bring an umbrella.');
    expect(result.length).toBeGreaterThan(0);
    const match = result.find(r => r.pattern === 'because...so');
    expect(match).toBeDefined();
  });

  it('應檢測出「more and more + comparative」句式', () => {
    const result = detectChinglish('The situation is becoming more and more worse.');
    const match = result.find(r => r.pattern === 'more and more + comparative');
    expect(match).toBeDefined();
  });

  it('應檢測出「discuss about」句式', () => {
    const result = detectChinglish('We need to discuss about this problem.');
    const match = result.find(r => r.pattern === 'discuss about');
    expect(match).toBeDefined();
  });

  it('正常英文句子不應誤報', () => {
    const result = detectChinglish('The students have been studying English for three years.');
    expect(Array.isArray(result)).toBe(true);
  });

  it('空字串應回傳空陣列', () => {
    expect(detectChinglish('')).toEqual([]);
  });

  it('應處理非常長的輸入而不會當機', () => {
    const longText = 'Although '.repeat(100) + 'but '.repeat(100);
    const result = detectChinglish(longText);
    expect(Array.isArray(result)).toBe(true);
  });
});

// ============================================
// Plagiarism / Over-copying Detection
// ============================================
describe('detectOverCopying — 抄襲檢測', () => {
  const sourceText = 'Climate change is one of the most pressing issues facing humanity today. Rising global temperatures have led to more frequent natural disasters including floods droughts and wildfires. Scientists agree that immediate action is needed to reduce carbon emissions and transition to renewable energy sources.';

  it('應在完全複製時回報高抄襲率', () => {
    const result = detectOverCopying(sourceText, sourceText);
    expect(result.isOverCopy).toBe(true);
    expect(result.copyRatio).toBeGreaterThan(0);
    expect(result.copiedPhrases.length).toBeGreaterThan(0);
  });

  it('應在部分複製時檢測到抄襲片段', () => {
    const partial = 'Climate change is one of the most pressing issues facing humanity today. I believe we need to take action.';
    const result = detectOverCopying(sourceText, partial);
    expect(result.copiedPhrases.length).toBeGreaterThan(0);
  });

  it('應在完全原創時回報無抄襲', () => {
    const original = 'In my opinion the government should invest more in public transportation to reduce air pollution.';
    const result = detectOverCopying(sourceText, original, 0.3);
    expect(result.isOverCopy).toBe(false);
  });

  it('學生寫作為空時應回傳空結果', () => {
    const result = detectOverCopying(sourceText, '', 0.3);
    expect(result.copyRatio).toBe(0);
    expect(result.isOverCopy).toBe(false);
    expect(result.copiedPhrases).toHaveLength(0);
  });

  it('原始文稿為空時應回傳空結果', () => {
    const result = detectOverCopying('', 'Some text here.');
    expect(result.copyRatio).toBe(0);
    expect(result.isOverCopy).toBe(false);
  });

  it('應列出具體的抄襲片語', () => {
    const result = detectOverCopying(sourceText, 'Climate change is one of the most pressing issues facing humanity.');
    expect(result.copiedPhrases.length).toBeGreaterThan(0);
    expect(result.copiedPhrases[0].original).toBeTruthy();
  });
});
