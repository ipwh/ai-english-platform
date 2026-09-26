// ============================================
// 選項字母重對應（洗牌後解說一致性）
//
// 回報（2026-09-26）：閱讀題解說寫「學生可能誤選B，因為 70,000 是今天的乘客量」，
// 但洗牌後 **B 正是正確答案** → 解說叫學生不要選的，正是答案本身。
//
// 根因：`shuffleMCAnswers()` 重排選項並更新答案鍵字母，卻沒有重對應解說文字裡
// 引用的字母（`explanationZh` / `explanationEn` / `commonMistake`）。
// 修復：洗牌時一併以完整「舊→新」字母對應改寫上述文字，並在交付前的確定性螢幕
// （`inspectGeneratedQuestion`）加一道防線攔截殘餘矛盾。
// ============================================
import { describe, it, expect, vi, afterEach } from 'vitest';

// 切斷通往 DB 的 import 鏈：`generate-questions` 經 rag-service 載入 material-repo，
// 而 material-repo 在模組層就建立 Prisma client；測試環境沒有 DATABASE_URL 會落到
// SQLite fallback，與 schema 的 postgres provider 不符而拋錯（同 `generate-questions-topup` 的作法）。
vi.mock('@/modules/ai/services/rag-service', () => ({
  isDSERAGEnabled: () => false,
  retrievePastPaperContent: vi.fn(),
  retrieveMarkingScheme: vi.fn(),
  buildDSEContextPrompt: vi.fn(() => ''),
}));
vi.mock('@/shared/logger/logger', () => ({
  logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
}));

import { shuffleMCAnswers, remapOptionLetters } from '@/modules/ai/usecases/generate-questions';
import { inspectGeneratedQuestion } from '@/modules/ai/services/answer-verification';
import type { GeneratedQuestion } from '@/modules/ai/types/generation-types';

/**
 * 固定洗牌結果：`Math.random()` 恆為 0 ⇒ Fisher-Yates 的 order 由 [0,1,2,3] 變成
 * [1,2,3,0] ⇒ 舊→新字母對應為 A→D、B→A、C→B、D→C。
 */
function freezePermutation() {
  return vi.spyOn(Math, 'random').mockReturnValue(0);
}

/** 1×1 洗牌（Math.random()=0）的字母對應 */
const A_TO_D: Record<string, string> = { A: 'D', B: 'A', C: 'B', D: 'C' };

function mc(overrides: Partial<GeneratedQuestion> = {}): GeneratedQuestion {
  return {
    type: 'mc',
    prompt: 'Choose the correct option: She ___ to school every day.',
    promptZh: '選擇正確答案',
    choices: ['goes', 'go', 'going', 'gone'],
    answer: 'A',
    explanationZh: '第三人稱單數用 goes。',
    explanationEn: 'Third person singular takes "goes".',
    commonMistake: '學生常忘記加 -es。',
    ...overrides,
  };
}

afterEach(() => vi.restoreAllMocks());

describe('remapOptionLetters — 只改「選項參照」語境中的字母', () => {
  it('中文語境（誤選／錯答）', () => {
    expect(remapOptionLetters('學生可能誤選A，因為數字不同。', A_TO_D))
      .toBe('學生可能誤選D，因為數字不同。');
    expect(remapOptionLetters('學生常錯答B。', A_TO_D)).toBe('學生常錯答A。');
  });

  it('「選項」與括號寫法（含全形括號）', () => {
    expect(remapOptionLetters('選項A 是干擾項（A）', A_TO_D)).toBe('選項D 是干擾項（D）');
  });

  it('英文 option / choice / answer 寫法', () => {
    expect(remapOptionLetters('Students may choose option A by mistake.', A_TO_D))
      .toBe('Students may choose option D by mistake.');
    expect(remapOptionLetters('The answer C is wrong here.', A_TO_D))
      .toBe('The answer B is wrong here.');
  });

  it('**不得**誤改英文句首冠詞 A（無選項語境）', () => {
    const text = 'A short trip offers the best view of the Hong Kong skyline.';
    expect(remapOptionLetters(text, A_TO_D)).toBe(text);
  });

  it('未提供對應時保持原樣（例如對應為恆等）', () => {
    expect(remapOptionLetters('誤選B', {})).toBe('誤選B');
    expect(remapOptionLetters('誤選B', { A: 'A', B: 'B', C: 'C', D: 'D' })).toBe('誤選B');
  });

  it('空字串／undefined 安全', () => {
    expect(remapOptionLetters(undefined, A_TO_D)).toBe('');
    expect(remapOptionLetters('', A_TO_D)).toBe('');
  });
});

describe('shuffleMCAnswers — 洗牌後解說必須仍指向同一「選項」', () => {
  it('回報案例：新的正確答案不得被解說當成誤選', () => {
    freezePermutation();

    const question = mc({
      prompt: 'According to the passage, what did the Star Ferry originally carry when it began service in 1888?',
      promptZh: '根據文章，天星小輪 1888 年開始服務時載什麼？',
      choices: ['Over 70,000 passengers', 'few passengers', 'Only tourists', 'Cars and buses'],
      answer: 'B', // 洗牌前：few passengers
      explanationZh: '文章第一段明確指出 1888 年開始服務時只載少數乘客。',
      explanationEn: 'The passage says it carried only a few passengers each day.',
      commonMistake: '學生可能誤選A，因為70,000是今天的乘客量，不是1888年的數字。',
    });

    const shuffled = shuffleMCAnswers(question);
    const choices = shuffled.choices ?? [];

    // 答案鍵仍指向「同一段文字」
    expect(choices[shuffled.answer.charCodeAt(0) - 65]).toBe('few passengers');
    // 干擾項 70,000 移到 D（order [1,2,3,0]）
    expect(choices[3]).toBe('Over 70,000 passengers');
    // 解說要跟著指向**同一個干擾項**（D），而不是仍寫 A
    expect(shuffled.commonMistake).toContain('誤選D');
    expect(shuffled.commonMistake).not.toContain('誤選A');
    // 解說原本就沒提到正確答案，洗牌後亦不得變成提到正確答案
    expect(shuffled.commonMistake).not.toContain(`誤選${shuffled.answer}`);
  });

  it('英文解說的 option 字母同樣重對應', () => {
    freezePermutation();

    const shuffled = shuffleMCAnswers(mc({
      choices: ['goes', 'go', 'going', 'gone'],
      answer: 'A',
      explanationEn: 'Students often pick option B here.',
    }));

    // 舊 B → 新 A
    expect(shuffled.explanationEn).toBe('Students often pick option A here.');
  });

  it('非 mc 或缺漏欄位時原樣回傳（不得破壞既有行為）', () => {
    const fillBlank = mc({ type: 'fill-blank', answer: 'goes' });
    expect(shuffleMCAnswers(fillBlank)).toBe(fillBlank);

    const noChoices = mc({ choices: [] });
    expect(shuffleMCAnswers(noChoices)).toBe(noChoices);
  });
});

describe('inspectGeneratedQuestion — 解說與答案鍵矛盾的交付前防線', () => {
  it('解說把「正確答案的字母」說成誤選 → 列為缺陷', () => {
    const defects = inspectGeneratedQuestion(mc({
      answer: 'B',
      commonMistake: '學生可能誤選B，因為70,000是今天的乘客量，不是1888年的數字。',
    }));

    expect(defects.some(d => d.includes('正確答案（B）'))).toBe(true);
  });

  it('解說指向干擾項（正確用法）→ 不算缺陷', () => {
    const defects = inspectGeneratedQuestion(mc({
      answer: 'B',
      commonMistake: '學生可能誤選A，因為70,000是今天的乘客量，不是1888年的數字。',
    }));

    expect(defects.some(d => d.includes('正確答案'))).toBe(false);
  });
});
