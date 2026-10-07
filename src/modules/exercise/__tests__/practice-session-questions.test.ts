// ============================================
// 2026-10-07：練習場次題目身分與前進規則的契約測試
//
// 病根（學生回報「作答後，題目重複出現」）：
// 練習 runner 以題目 id 推導 URL 前進，而 `handleNext()` 會在 push 之後立刻
// 清空本機作答狀態。只要場次內出現重複題目（同一 id，或同一內容經洗牌後以
// 不同 id 交付），「下一題」就可能指向當前題目 —— 導覽不發生、狀態卻被清空，
// 學生剛答完的題目便以未作答的樣子再次出現。
//
// 契約：
//   1. 建立場次時去除重複題目（同一 id 或同一內容只保留第一筆）
//   2. 不下一個指向當前題目（原地不動）的題目
//   3. 內容指紋對選項次序不敏感（洗牌後同一題仍判為同一題）
// ============================================
import { describe, it, expect } from 'vitest';
import {
  dedupeSessionQuestions,
  findNextSessionQuestionIndex,
  questionContentKey,
} from '../services/practice-session-questions';
import type { PracticeQuestion } from '@/shared/types/types';

function mc(id: string, prompt: string, choices: string[], answer = 'A'): PracticeQuestion {
  return {
    id,
    type: 'mc',
    strand: 'knowledge',
    prompt,
    choices,
    answer,
    explanationZh: '',
    explanationEn: '',
    difficulty: 'core',
    gradeLevel: 'S4',
    hintLevels: [],
  } as unknown as PracticeQuestion;
}

const JUNK_FOOD_PROMPT = 'You are discussing whether the school should ban junk food from the canteen. Which of the following is a counterargument to the ban?';
const JUNK_FOOD_CHOICES = [
  'Junk food is often high in sugar, fat, and salt.',
  'Banning junk food may lead students to buy it outside school.',
  'Healthy food can be tasty if prepared well.',
  'The school has responsibility to promote student health.',
];

describe('questionContentKey', () => {
  it('洗牌後的同一題內容指紋相同（選項次序不敏感）', () => {
    const a = mc('q1', JUNK_FOOD_PROMPT, JUNK_FOOD_CHOICES);
    const shuffled = mc('q2', JUNK_FOOD_PROMPT, [JUNK_FOOD_CHOICES[2], JUNK_FOOD_CHOICES[0], JUNK_FOOD_CHOICES[3], JUNK_FOOD_CHOICES[1]]);
    expect(questionContentKey(shuffled)).toBe(questionContentKey(a));
  });

  it('忽略大小寫、多餘空白與選項字母前置', () => {
    const a = mc('q1', JUNK_FOOD_PROMPT, JUNK_FOOD_CHOICES);
    const messy = mc('q2', `  ${JUNK_FOOD_PROMPT.toUpperCase()}  `, [
      'A. Junk food is often high in sugar, fat, and salt.',
      'B) Banning junk food may lead    students to buy it outside school.',
      '(C) Healthy food can be tasty if prepared well.',
      'D. The school has responsibility to promote student health.',
    ]);
    expect(questionContentKey(messy)).toBe(questionContentKey(a));
  });

  it('不同題目有不同的指紋', () => {
    const a = mc('q1', JUNK_FOOD_PROMPT, JUNK_FOOD_CHOICES);
    const b = mc('q2', 'Another prompt entirely?', JUNK_FOOD_CHOICES);
    expect(questionContentKey(b)).not.toBe(questionContentKey(a));
  });
});

describe('dedupeSessionQuestions', () => {
  it('同一 id 只保留第一筆（保留伺服器正典 id，不改寫）', () => {
    const first = mc('same-id', JUNK_FOOD_PROMPT, JUNK_FOOD_CHOICES);
    const duplicate = mc('same-id', 'A completely different prompt?', ['1', '2']);
    const { questions, dropped } = dedupeSessionQuestions([first, duplicate]);

    expect(questions).toHaveLength(1);
    expect(questions[0].id).toBe('same-id');
    expect(questions[0].prompt).toBe(JUNK_FOOD_PROMPT);
    expect(dropped).toEqual([{ id: 'same-id', reason: 'duplicate-id' }]);
  });

  it('同一內容但不同 id 也只保留第一筆（洗牌／重新交付的同一題）', () => {
    const first = mc('id-1', JUNK_FOOD_PROMPT, JUNK_FOOD_CHOICES);
    const reshuffled = mc('id-2', JUNK_FOOD_PROMPT, [JUNK_FOOD_CHOICES[3], JUNK_FOOD_CHOICES[1], JUNK_FOOD_CHOICES[2], JUNK_FOOD_CHOICES[0]]);
    const { questions, dropped } = dedupeSessionQuestions([first, reshuffled]);

    expect(questions.map(q => q.id)).toEqual(['id-1']);
    expect(dropped).toEqual([{ id: 'id-2', reason: 'duplicate-content' }]);
  });

  it('保留順序，且不影響彼此不同的題目', () => {
    const qs = [
      mc('a', 'Prompt A?', ['1', '2']),
      mc('b', 'Prompt B?', ['1', '2']),
      mc('c', 'Prompt C?', ['1', '2']),
    ];
    const { questions, dropped } = dedupeSessionQuestions(qs);

    expect(questions.map(q => q.id)).toEqual(['a', 'b', 'c']);
    expect(dropped).toEqual([]);
  });

  it('空陣列安全', () => {
    expect(dedupeSessionQuestions([])).toEqual({ questions: [], dropped: [] });
  });
});

describe('findNextSessionQuestionIndex', () => {
  it('正常情況回傳下一題', () => {
    const qs = [mc('a', 'A?', ['1', '2']), mc('b', 'B?', ['1', '2']), mc('c', 'C?', ['1', '2'])];
    expect(findNextSessionQuestionIndex(qs, 0)).toBe(1);
    expect(findNextSessionQuestionIndex(qs, 1)).toBe(2);
  });

  it('跳過與當前題目同 id 的項目（否則 push 會指向當前 URL → 原地不動）', () => {
    const qs = [
      mc('a', 'A?', ['1', '2']),
      mc('b', 'B?', ['1', '2']),
      mc('b', 'B? (duplicate id)', ['3', '4']),
      mc('c', 'C?', ['1', '2']),
    ];
    // 學生在 index 1（id=b）：index 2 亦是 id=b → 必須直接跳到 index 3
    expect(findNextSessionQuestionIndex(qs, 1)).toBe(3);
  });

  it('後面全部同 id 時回傳 -1（呼叫端視為完成練習，不困住學生）', () => {
    const qs = [mc('a', 'A?', ['1', '2']), mc('a', 'A? (dup)', ['3', '4'])];
    expect(findNextSessionQuestionIndex(qs, 0)).toBe(-1);
    expect(findNextSessionQuestionIndex(qs, 1)).toBe(-1);
  });

  it('最後一題之後回傳 -1', () => {
    const qs = [mc('a', 'A?', ['1', '2']), mc('b', 'B?', ['1', '2'])];
    expect(findNextSessionQuestionIndex(qs, 1)).toBe(-1);
  });

  it('可跳過本場次已作答的題目（避免把已作答題目當成新題重問）', () => {
    const qs = [mc('a', 'A?', ['1', '2']), mc('b', 'B?', ['1', '2']), mc('c', 'C?', ['1', '2'])];
    const answered = new Set(['b']);
    expect(findNextSessionQuestionIndex(qs, 0, id => answered.has(id))).toBe(2);
    expect(findNextSessionQuestionIndex(qs, 0, () => true)).toBe(-1);
  });

  it('currentIndex 無效時回傳 -1', () => {
    const qs = [mc('a', 'A?', ['1', '2'])];
    expect(findNextSessionQuestionIndex(qs, -1)).toBe(-1);
    expect(findNextSessionQuestionIndex([], 0)).toBe(-1);
  });
});
