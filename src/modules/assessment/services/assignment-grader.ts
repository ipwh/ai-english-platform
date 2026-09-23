// ============================================
// R3.5: Assignment Item Grader — per-item evidence producer
// ============================================
// Faithful extraction of the grading logic from
// src/app/api/assignments/[id]/route.ts (POST). Produces explicit
// per-item evidence for persistence — NO aggregate-to-item
// reconstruction is ever performed.
//
// Authority semantics (evidence-bound):
// - MC questions:    evaluator='server', method='assignment-mc-exact-match'
// - Text questions:  evaluator='ai',     method='assignment-ai-answer-analysis'
//                    (AI via analyzeAnswer)
// - AI failure fallback: evaluator='server',
//                    method='assignment-ai-unavailable', result='ungradable',
//                    countsTowardScore=false
//   2026-09-23 稽核修正：舊碼以逐字比對偽造 'incorrect'（且 countsTowardScore=true），
//   令系統故障直接變成學生成績（經 syncActivityMetrics 進入 overallAccuracy）。
//   現在改為不評分、不計分，交由老師批改 —— 與閱讀主觀題「不可用確定性比對
//   替代語意評分」的既有原則一致。
//
// Current grading policy (verified in route code): one point per
// correctly answered item — maxScore=1, awardedScore=0|1,
// countsTowardScore=true. No marks exist on AssignmentQuestion, and
// the route counts `totalScore++` per correct answer. This policy is
// preserved exactly; no rubric is invented.
//
// Question authority: the grader receives SERVER-OWNED question
// definitions (AssignmentQuestion). The student-supplied payload is
// only an answer map; it can never override the answer key.
// ============================================

export interface AssignmentGraderQuestion {
  id: string;
  questionType: string;
  prompt: string;
  answer: string;
  orderIndex?: number;
}

/** Student answers keyed by canonical AssignmentQuestion.id */
export type AssignmentAnswerMap = Record<string, string>;

export interface AssignmentGradedItem {
  questionId: string;
  response: string;
  result: 'correct' | 'incorrect' | 'ungradable';
  awardedScore: number;
  maxScore: number;
  countsTowardScore: boolean;
  evaluator: 'server' | 'ai';
  scoringMethod: string;
  feedback: string;
  /** AI feedback part for the aggregate aiFeedback (only when AI produced feedbackZh) */
  aiFeedbackPart?: string;
}

export interface AssignmentAnswerAnalysis {
  isCorrect: boolean;
  feedbackZh?: string;
  explanation?: string;
}

export interface AssignmentAnswerAnalyzerInput {
  question: string;
  questionType: string;
  correctAnswer: string;
  studentAnswer: string;
}

export type AssignmentAnswerAnalyzer = (
  input: AssignmentAnswerAnalyzerInput,
) => Promise<AssignmentAnswerAnalysis>;

export interface AssignmentGradingResult {
  items: AssignmentGradedItem[];
  totalScore: number;
  /** 未能自動評分的題數（AI 不可用）—— 呼叫端不得發佈分數 */
  ungradableCount: number;
  /** 實際計分的題數（countsTowardScore 為 true） */
  gradedQuestionCount: number;
}

/**
 * Grade every question of an assignment against the server-owned answer
 * key. Items are produced in question order (stable evidence order).
 * The analyzer is injected — production passes analyzeAnswer.
 */
export async function gradeAssignmentItems(
  questions: AssignmentGraderQuestion[],
  answers: AssignmentAnswerMap,
  analyze: AssignmentAnswerAnalyzer,
): Promise<AssignmentGradingResult> {
  const items: AssignmentGradedItem[] = [];
  let totalScore = 0;

  for (const q of questions) {
    // R3.5 hardening: 僅真正缺鍵才視為未作答；`"0"` 等 falsy 字串保留原值
    const raw = Object.prototype.hasOwnProperty.call(answers, q.id) ? answers[q.id] : undefined;
    const studentAnswer = raw == null ? '' : String(raw);
    const isMcq = q.questionType === 'mc';

    let correct: boolean;
    let ungradable = false;
    let evaluator: 'server' | 'ai';
    let scoringMethod: string;
    let feedback: string;
    let aiFeedbackPart: string | undefined;

    if (isMcq) {
      // MC 題：直接比對（與 route 完全一致）
      correct = studentAnswer.trim().toUpperCase() === q.answer.trim().toUpperCase();
      evaluator = 'server';
      scoringMethod = 'assignment-mc-exact-match';
      feedback = correct ? '正確！' : `正確答案為 ${q.answer}`;
    } else {
      // 文字題：呼叫 AI 批改
      try {
        const analysis = await analyze({
          question: q.prompt,
          studentAnswer,
          correctAnswer: q.answer,
          questionType: q.questionType,
        });
        correct = analysis.isCorrect;
        evaluator = 'ai';
        scoringMethod = 'assignment-ai-answer-analysis';
        feedback = analysis.feedbackZh || analysis.explanation || (correct ? '正確！' : '答案不正確');
        if (analysis.feedbackZh) {
          aiFeedbackPart = `Q${(q.orderIndex ?? 0) + 1}: ${analysis.feedbackZh}`;
        }
      } catch {
        // 2026-09-23 稽核修正：AI 不可用時**不得偽造判定**。
        // 舊碼 `normalize(studentAnswer) === normalize(q.answer)` 會把任何用字不同
        // 但語意正確的散文判為 incorrect，且 countsTowardScore=true → 經
        // syncActivityMetrics 拉低學生 overallAccuracy（系統故障變成學生成績）。
        // 現改為 ungradable（不計分、不發布分數），保留學生作答交由老師批改。
        correct = false;
        ungradable = true;
        evaluator = 'server';
        scoringMethod = 'assignment-ai-unavailable';
        feedback = 'AI 批改暫時不可用，此題已保留作答並待老師批改 / Auto-grading unavailable; awaiting teacher review';
      }
    }

    if (correct && !ungradable) totalScore += 1;

    items.push({
      questionId: q.id,
      response: studentAnswer,
      result: ungradable ? 'ungradable' : correct ? 'correct' : 'incorrect',
      awardedScore: correct && !ungradable ? 1 : 0,
      maxScore: 1,
      countsTowardScore: !ungradable,
      evaluator,
      scoringMethod,
      feedback,
      ...(aiFeedbackPart !== undefined ? { aiFeedbackPart } : {}),
    });
  }

  const ungradableCount = items.filter(i => i.result === 'ungradable').length;
  const gradedQuestionCount = items.filter(i => i.countsTowardScore).length;
  return { items, totalScore, ungradableCount, gradedQuestionCount };
}
