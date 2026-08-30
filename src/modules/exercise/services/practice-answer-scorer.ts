// ============================================
// R3.3: Server-Authoritative Practice Answer Scorer
// ============================================
// Deterministic server-side port of the client's `checkAnswer()` logic
// (src/app/student/practice/[id]/page.tsx). The client copy remains for
// immediate UI feedback ONLY — it is no longer authoritative.
//
// SCOPE: practice (grammar) question types only:
//   mc | fill-blank | error-correction | short-writing | matching | reordering | cloze
// Binary scoring: correct → 1/1, incorrect → 0/1 (the runtime's real
// semantics — no per-question marks exist in the practice flow).
//
// Reading/writing/speaking/integrated answers are NOT scored here —
// those paths are explicitly deferred (R3.3 only hardens the
// deterministic practice trust boundary).
// ============================================

const MCQ_LETTERS = ['A', 'B', 'C', 'D'] as const;

/** 數字詞彙對照表（英文→數字），用於答案比對時正規化 "fifteen" ↔ "15" */
const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40,
  fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100,
};

/** 將答案中的數字詞彙統一轉為數字，例："fifteen" → "15", "15" → "15" */
function normalizeNumbers(text: string): string {
  return text.replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred)\b/gi,
    (match) => String(NUMBER_WORDS[match.toLowerCase()] ?? match),
  );
}

/** 正規化文字以進行精確比對（與客戶端 checkAnswer 使用相同規則） */
function normalizeAnswer(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')           // 多空格 → 單空格
    .replace(/['']/g, "'")          // 統一撇號
    .replace(/[""]/g, '"')          // 統一引號
    .replace(/[–—]/g, '-')          // 統一破折號
    .replace(/[.!?,;:]$/, '');      // 移除尾部標點
}

export interface PracticeScoreInput {
  studentAnswer: string;
  correctAnswer: string;
  questionType: string;
  /** Choices are required for full-text MC answer resolution */
  choices?: string[];
}

export interface PracticeScoreOutput {
  result: 'correct' | 'incorrect';
  awardedScore: number;
  maxScore: number;
  countsTowardScore: boolean;
}

/**
 * Deterministic binary scoring — faithful port of the client's checkAnswer:
 *  - MCQ: 比對字母 (A/B/C/D) 或完整選項文字
 *  - 文字題: 正規化後比對，支援部分匹配（至少一個關鍵詞匹配）
 *  - 改錯題有選項時視為 MC 題處理
 *  - 改錯題 "X → Y" 格式：檢查學生答案是否包含 Y 且不含 X
 */
export function checkAnswer(
  student: string,
  correct: string,
  type: string,
  choices?: string[],
): boolean {
  // 改錯題若有 MC 選項，視為 MC 題進行比對
  const effectiveType = (type === 'error-correction' && choices && choices.length > 0) ? 'mc' : type;

  if (effectiveType === 'mc') {
    const studentUpper = student.trim().toUpperCase();
    const correctUpper = correct.trim().toUpperCase();

    // 字母比對
    if (studentUpper === correctUpper) return true;

    // 學生可能輸入了完整選項文字而非字母
    const correctLetterIndex = MCQ_LETTERS.indexOf(correctUpper as typeof MCQ_LETTERS[number]);
    if (choices && correctLetterIndex >= 0 && correctLetterIndex < choices.length) {
      const correctText = normalizeAnswer(choices[correctLetterIndex]);
      const normalizedStudent = normalizeAnswer(student);
      if (normalizedStudent === correctText) return true;
    }

    return false;
  }

  // 改錯題 "X → Y" 格式：檢查學生答案是否包含改正後的部分 Y，且不含錯誤 X
  if (type === 'error-correction') {
    const arrowMatch = correct.match(/^(.+?)\s*[→>]\s*(.+)$/);
    if (arrowMatch) {
      const wrongPart = normalizeAnswer(arrowMatch[1]);   // e.g. "what"
      const rightPart = normalizeAnswer(arrowMatch[2]);    // e.g. "that/which"
      const normStudent = normalizeAnswer(student);
      // 檢查學生答案包含改正（that 或 which），且不含錯誤（what）
      const rightOptions = rightPart.split('/').map(s => s.trim());
      const hasCorrection = rightOptions.some(opt => containsWord(normStudent, opt));
      const hasError = containsWord(normStudent, wrongPart);
      if (hasCorrection && !hasError) return true;
      // 即使仍含錯誤部分但已包含改正，也給通過（學生可能寫了完整句子但保留了部分原句）
      if (hasCorrection) return true;
    }
  }

  // 文字題：正規化後比對（含數字格式正規化）
  const normStudent = normalizeNumbers(normalizeAnswer(student));
  const normCorrect = normalizeNumbers(normalizeAnswer(correct));

  if (normStudent === normCorrect) return true;

  // 部分匹配：若學生答案包含正確答案的主要詞彙（詞邊界比對 — 避免 "the" 匹配 "weather"）
  const correctWords = normCorrect.split(' ').filter(w => w.length > 2);
  if (correctWords.length >= 2 && correctWords.every(w => containsWord(normStudent, w))) {
    return true;
  }

  // 單詞匹配：若正確答案只有一個關鍵詞，且學生答案包含它（適用於填充題）
  if (correctWords.length === 1 && containsWord(normStudent, correctWords[0])) {
    return true;
  }

  return false;
}

/**
 * 詞邊界包含檢查 — 2026-08-30 audit (R5)：防止子字串誤判。
 * 例：正確答案 "the" 不得因 "weather" 包含子字串而判對；"cat" 不得匹配 "category"。
 */
function containsWord(text: string, word: string): boolean {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`, 'i').test(text);
}

/**
 * Authoritative practice scoring. The server is the sole authority for
 * deterministic practice answers; client-supplied scoring fields are
 * ignored at the API boundary.
 */
export function scorePracticeAnswer(input: PracticeScoreInput): PracticeScoreOutput {
  const correct = checkAnswer(input.studentAnswer, input.correctAnswer, input.questionType, input.choices);
  return {
    result: correct ? 'correct' : 'incorrect',
    awardedScore: correct ? 1 : 0,
    maxScore: 1,
    countsTowardScore: true,
  };
}
