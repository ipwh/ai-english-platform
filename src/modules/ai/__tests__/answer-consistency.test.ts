// ============================================
// Tests: Answer Consistency, MCQ Normalization, i18n
// ============================================

import { describe, it, expect } from 'vitest';

// ============================================
// 一、答案正規化函數 (normalizeAnswer)
// ============================================

// Inline normalizeAnswer for pure unit testing
function normalizeAnswer(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[\u2018\u2019\u201C\u201D]/g, "'")  // smart single/double quotes → straight
    .replace(/[""]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')               // en/em dashes → hyphen
    .replace(/[.!?,;:]$/, '');
}

// Inline stripMcqPrefix for pure unit testing
function stripMcqPrefix(choice: string): string {
  return choice
    .trim()
    // A. / (A) / A) / 1. / (1) / A: / A：
    .replace(/^\s*\(?\s*(?:[A-Da-d]|[1-4])\s*\)?\s*[.\]:：)\-、]\s*/u, '')
    // A followed by space (looser match, only after stricter ones fail)
    .replace(/^\s*\(?\s*(?:[A-Da-d])\s*\)?\s+/u, '')
    // T: / F) / True: / False. — but only when followed by content
    .replace(/^\s*\(?\s*(?:True|False|T|F)\s*\)?\s*[.\]:：)\-、]\s*/iu, '')
    .trim();
}

describe('normalizeAnswer', () => {
  it('should normalize multiple spaces', () => {
    expect(normalizeAnswer('4   o\'clock')).toBe("4 o'clock");
  });

  it('should normalize smart quotes to straight quotes', () => {
    expect(normalizeAnswer("it\u2019s 4 o\u2019clock")).toBe("it's 4 o'clock");
  });

  it('should normalize em dashes to hyphens', () => {
    expect(normalizeAnswer('well\u2014known')).toBe('well-known');
  });

  it('should strip trailing punctuation', () => {
    expect(normalizeAnswer('4 o\'clock.')).toBe("4 o'clock");
  });

  it('should be case-insensitive', () => {
    expect(normalizeAnswer('FOUR O\'CLOCK')).toBe("four o'clock");
  });

  it('should handle time expressions consistently', () => {
    expect(normalizeAnswer('at 4 o\'clock')).toBe("at 4 o'clock");
    expect(normalizeAnswer('4 o\'clock')).toBe("4 o'clock");
  });

  it('should handle money expressions', () => {
    expect(normalizeAnswer('15 dollars')).toBe('15 dollars');
    expect(normalizeAnswer('$ 15 dollars')).toBe('$ 15 dollars');
  });
});

// ============================================
// 二、MCQ Prefix Stripping 測試
// ============================================

describe('stripMcqPrefix', () => {
  it('should strip "A." prefix', () => {
    expect(stripMcqPrefix('A. Paris')).toBe('Paris');
  });

  it('should strip "(B)" prefix', () => {
    expect(stripMcqPrefix('(B) London')).toBe('London');
  });

  it('should strip "C:" prefix', () => {
    expect(stripMcqPrefix('C: Berlin')).toBe('Berlin');
  });

  it('should strip "4." prefix', () => {
    expect(stripMcqPrefix('4. Madrid')).toBe('Madrid');
  });

  it('should strip "T:" prefix (True/False)', () => {
    expect(stripMcqPrefix('T: This is correct')).toBe('This is correct');
  });

  it('should strip "False." prefix', () => {
    expect(stripMcqPrefix('False. This is wrong')).toBe('This is wrong');
  });

  it('should preserve text without prefix', () => {
    expect(stripMcqPrefix('4 o\'clock in the morning')).toBe("4 o'clock in the morning");
  });

  it('should handle Chinese punctuation in prefix', () => {
    expect(stripMcqPrefix('A：巴黎')).toBe('巴黎');
  });

  it('should handle Japanese/Korean-style prefix markers', () => {
    expect(stripMcqPrefix('A、Tokyo')).toBe('Tokyo');
  });
});

// ============================================
// 三、答案一致性驗證 (validateAndFixQuestion logic)
// ============================================

const MCQ_LETTERS = ['A', 'B', 'C', 'D'] as const;

function toMcqLetter(index: number): string {
  return MCQ_LETTERS[index] || 'A';
}

interface TestQuestion {
  type: string;
  prompt: string;
  choices: string[];
  answer: string;
  listeningContent?: string;
  readingContent?: string;
  explanationZh: string;
  explanationEn: string;
  commonMistake: string;
}

function validateAndFixQuestion(q: TestQuestion, index: number): { fixed: TestQuestion; warnings: string[] } {
  const warnings: string[] = [];
  const fixed = { ...q };

  // MCQ: 答案必須指向 choices 中的某個選項
  if (fixed.type === 'mc' && fixed.choices && fixed.choices.length > 0) {
    const answerRaw = (fixed.answer || '').trim();
    const answerLetter = answerRaw.toUpperCase();
    const letterIndex = MCQ_LETTERS.indexOf(answerLetter as typeof MCQ_LETTERS[number]);

    if (letterIndex >= 0 && letterIndex < fixed.choices.length) {
      // 答案字母有效
    } else {
      const normAnswer = normalizeAnswer(answerRaw);
      const matchIndex = fixed.choices.findIndex(c =>
        normalizeAnswer(stripMcqPrefix(c)) === normAnswer
      );
      if (matchIndex >= 0) {
        fixed.answer = toMcqLetter(matchIndex);
        warnings.push(`Q${index}: auto-fixed answer "${answerRaw}" → "${fixed.answer}"`);
      } else {
        warnings.push(`Q${index}: answer "${answerRaw}" does not match any choice`);
      }
    }
  }

  // 聆聽題: 答案文字必須出現在 listeningContent 中
  if (fixed.listeningContent && fixed.answer) {
    const answerToCheck = fixed.choices && fixed.choices.length > 0
      ? (() => {
          const letterIndex = MCQ_LETTERS.indexOf(fixed.answer.trim().toUpperCase() as typeof MCQ_LETTERS[number]);
          return letterIndex >= 0 && letterIndex < fixed.choices.length ? fixed.choices[letterIndex] : fixed.answer;
        })()
      : fixed.answer;

    const normListening = normalizeAnswer(fixed.listeningContent);
    const normAnswer = normalizeAnswer(answerToCheck);

    if (!normListening.includes(normAnswer)) {
      const words = normAnswer.split(' ');
      const lastTwo = words.slice(-2).join(' ');
      const lastThree = words.slice(-3).join(' ');
      if (!normListening.includes(lastThree) && !normListening.includes(lastTwo)) {
        warnings.push(`Q${index} (LISTENING): answer "${answerToCheck}" not found in listeningContent`);
      }
    }
  }

  return { fixed, warnings };
}

describe('validateAndFixQuestion — MCQ consistency', () => {
  const baseQuestion: TestQuestion = {
    type: 'mc',
    prompt: 'What time is it?',
    choices: ['3 o\'clock', '4 o\'clock', '5 o\'clock', '6 o\'clock'],
    answer: 'B',
    explanationZh: '解釋',
    explanationEn: 'Explanation',
    commonMistake: '常犯錯誤',
  };

  it('should keep valid answer letter when it points to correct choice', () => {
    const { fixed, warnings } = validateAndFixQuestion(baseQuestion, 1);
    expect(fixed.answer).toBe('B');
    expect(warnings).toHaveLength(0);
  });

  it('should auto-fix when answer is the full text of a choice', () => {
    const q = { ...baseQuestion, answer: '4 o\'clock' };
    const { fixed, warnings } = validateAndFixQuestion(q, 1);
    expect(fixed.answer).toBe('B');
    expect(warnings.length).toBeGreaterThan(0);
  });

  it('should auto-fix even with smart quotes in answer text', () => {
    const q = { ...baseQuestion, answer: "4 o\u2019clock" }; // smart quote
    const { fixed, warnings } = validateAndFixQuestion(q, 1);
    // After normalization, smart quotes become straight quotes → should match "4 o'clock"
    expect(fixed.answer).toBe('B');
  });

  it('should warn when answer does not match any choice', () => {
    const q = { ...baseQuestion, answer: 'midnight' };
    const { fixed, warnings } = validateAndFixQuestion(q, 1);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toContain('does not match');
  });
});

describe('validateAndFixQuestion — Listening consistency', () => {
  const listeningQuestion: TestQuestion = {
    type: 'mc',
    prompt: 'What time does the train arrive?',
    choices: ['3 o\'clock', '4 o\'clock', '5 o\'clock', '6 o\'clock'],
    answer: 'B',
    listeningContent: 'Man: What time does the train arrive?\nWoman: It arrives at 4 o\'clock in the afternoon.',
    explanationZh: '解釋',
    explanationEn: 'Explanation',
    commonMistake: '常犯錯誤',
  };

  it('should pass when answer text appears verbatim in listeningContent', () => {
    const { warnings } = validateAndFixQuestion(listeningQuestion, 1);
    // "4 o'clock" should be found in the listeningContent
    expect(warnings.filter(w => w.includes('LISTENING'))).toHaveLength(0);
  });

  it('should warn when answer text does NOT appear in listeningContent', () => {
    const q = {
      ...listeningQuestion,
      answer: 'C', // "5 o'clock" — not in the listening content
    };
    const { warnings } = validateAndFixQuestion(q, 1);
    expect(warnings.some(w => w.includes('LISTENING'))).toBe(true);
  });

  it('should handle fill-blank listening questions (non-MC)', () => {
    const q: TestQuestion = {
      type: 'fill-blank',
      prompt: 'The train arrives at ___.',
      choices: [],
      answer: '4 o\'clock',
      listeningContent: 'The train arrives at 4 o\'clock.',
      explanationZh: '解釋',
      explanationEn: 'Explanation',
      commonMistake: '常犯錯誤',
    };
    const { warnings } = validateAndFixQuestion(q, 1);
    expect(warnings.filter(w => w.includes('LISTENING'))).toHaveLength(0);
  });

  it('should warn on non-MC listening with wrong answer', () => {
    const q: TestQuestion = {
      type: 'fill-blank',
      prompt: 'The train arrives at ___.',
      choices: [],
      answer: '5 o\'clock', // wrong!
      listeningContent: 'The train arrives at 4 o\'clock.',
      explanationZh: '解釋',
      explanationEn: 'Explanation',
      commonMistake: '常犯錯誤',
    };
    const { warnings } = validateAndFixQuestion(q, 1);
    expect(warnings.some(w => w.includes('LISTENING'))).toBe(true);
  });

  it('should match time expressions with slight formatting differences via last-word matching', () => {
    // Case where answer is "4 o'clock" but listening says "at about 4 o'clock"
    const q = {
      ...listeningQuestion,
      answer: 'B',
      choices: ['3 o\'clock', '4 o\'clock', '5 o\'clock', '6 o\'clock'],
      listeningContent: 'The train arrives at about 4 o\'clock.',
    };
    const { warnings } = validateAndFixQuestion(q, 1);
    // "4 o'clock" should match via last-two-words check
    expect(warnings.filter(w => w.includes('LISTENING'))).toHaveLength(0);
  });
});

// ============================================
// 四、i18n 翻譯函數測試
// ============================================

import { t } from '@/shared/utils/i18n';

describe('i18n — t() function', () => {
  it('should return Chinese by default', () => {
    expect(t('nav.dashboard')).toBe('學習主頁');
  });

  it('should return English when lang="en"', () => {
    expect(t('nav.dashboard', 'en')).toBe('Dashboard');
  });

  it('should return key itself when not found', () => {
    expect(t('nonexistent.key')).toBe('nonexistent.key');
  });

  it('should return empty string for empty key', () => {
    expect(t('')).toBe('');
  });

  it('should translate student pages', () => {
    expect(t('mistakes.title', 'en')).toBe('📝 My Mistakes');
    expect(t('vocab.title', 'en')).toBe('📚 Vocabulary');
    expect(t('progress.title', 'en')).toBe('\u{1F4C8} Learning Progress');
  });

  it('should translate teacher pages', () => {
    expect(t('teacher.dashboard.title', 'en')).toBe('Teacher Dashboard');
    expect(t('teacher.classes.title', 'en')).toBe('📊 Class Progress');
  });

  it('should translate difficulty labels', () => {
    expect(t('difficulty.remedial', 'en')).toBe('Remedial');
    expect(t('difficulty.core', 'en')).toBe('Core');
    expect(t('difficulty.challenge', 'en')).toBe('Challenge');
  });

  it('should translate status labels', () => {
    expect(t('status.pending', 'en')).toBe('Pending');
    expect(t('status.done', 'en')).toBe('Done');
  });

  it('should translate common labels', () => {
    expect(t('common.save', 'en')).toBe('Save');
    expect(t('common.cancel', 'en')).toBe('Cancel');
    expect(t('common.loading', 'en')).toBe('Loading...');
  });

  it('should translate login labels', () => {
    expect(t('login.title', 'en')).toBe('AI English Learning Platform');
    expect(t('login.signIn', 'en')).toBe('Sign In');
  });

  it('should translate assignment keys used by assignment detail page', () => {
    expect(t('assignment.scoreLabel', 'en')).toBe('Score');
    expect(t('assignment.questionCountLabel', 'en')).toBe('Questions');
    expect(t('assignment.dueDateLabel', 'en')).toBe('Due Date');
    expect(t('assignment.timeLimitLabel', 'en')).toBe('Time Limit');
    expect(t('assignment.submissionCountLabel', 'en')).toBe('Submissions');
    // These keys are in the base i18n (not the new block)
    expect(t('assignment.noDeadline', 'en')).toBe('No deadline');
    expect(t('assignment.minutes', 'en')).toBe('min');
    expect(t('assignment.noLimit', 'en')).toBe('No limit');
  });

  it('should translate writing page keys', () => {
    expect(t('writing.title', 'en')).toBe('✍️ Writing Support');
    expect(t('writing.yourWriting', 'en')).toBe('Your Writing');
  });

  it('should have all defined keys return non-empty strings in both languages', () => {
    // Spot-check critical navigation keys
    const navKeys = ['nav.dashboard', 'nav.practice', 'nav.mistakes', 'nav.vocabulary', 'nav.writing'];
    for (const key of navKeys) {
      expect(t(key, 'zh')).toBeTruthy();
      expect(t(key, 'zh').length).toBeGreaterThan(0);
      expect(t(key, 'en')).toBeTruthy();
      expect(t(key, 'en').length).toBeGreaterThan(0);
    }
  });
});

// ============================================
// 五、Skill Labels & Difficulty Labels i18n
// ============================================

import { skillLabels, skillLabelsEn, difficultyLabels, getDifficultyLabel, gradeLabels, getGradeLabel, statusLabels } from '@/shared/utils/nav';

describe('nav — label maps', () => {
  it('skillLabels should contain common grammar items', () => {
    expect(skillLabels['tenses']).toBe('時態');
    expect(skillLabels['conditionals']).toBe('條件句');
  });

  it('skillLabelsEn should contain English translations', () => {
    expect(skillLabelsEn['tenses']).toBe('Tenses');
    expect(skillLabelsEn['conditionals']).toBe('Conditionals');
  });

  it('getDifficultyLabel should return bilingual labels', () => {
    expect(getDifficultyLabel('remedial')).toBe('補底');
    expect(getDifficultyLabel('remedial', 'en')).toBe('Remedial');
    expect(getDifficultyLabel('core', 'en')).toBe('Core');
    expect(getDifficultyLabel('challenge', 'en')).toBe('Challenge');
  });

  it('getGradeLabel should return bilingual labels', () => {
    expect(getGradeLabel('S4')).toBe('中四');
    expect(getGradeLabel('S4', 'en')).toBe('S4');
    expect(getGradeLabel('S6')).toBe('中六');
  });

  it('difficultyLabels should have 3 levels', () => {
    expect(Object.keys(difficultyLabels)).toHaveLength(3);
    expect(difficultyLabels['remedial']).toBeTruthy();
    expect(difficultyLabels['core']).toBeTruthy();
    expect(difficultyLabels['challenge']).toBeTruthy();
  });

  it('gradeLabels should have S1-S6', () => {
    expect(Object.keys(gradeLabels)).toHaveLength(6);
    expect(gradeLabels['S1']).toBe('中一');
    expect(gradeLabels['S6']).toBe('中六');
  });

  it('statusLabels should have all required statuses', () => {
    expect(statusLabels['not-started']).toBe('未開始');
    expect(statusLabels['completed']).toBe('已完成');
    expect(statusLabels['pending']).toBe('待覆核');
    expect(statusLabels['overdue']).toBe('已逾期');
  });
});
