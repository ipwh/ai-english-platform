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
//                    method='assignment-fallback-exact-match'
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
  result: 'correct' | 'incorrect';
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
        // AI 不可用時 fallback 到簡單比對（與 route 完全一致）
        const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
        correct = normalize(studentAnswer) === normalize(q.answer);
        evaluator = 'server';
        scoringMethod = 'assignment-fallback-exact-match';
        feedback = correct ? '正確！' : `參考答案：${q.answer}`;
      }
    }

    if (correct) totalScore += 1;

    items.push({
      questionId: q.id,
      response: studentAnswer,
      result: correct ? 'correct' : 'incorrect',
      awardedScore: correct ? 1 : 0,
      maxScore: 1,
      countsTowardScore: true,
      evaluator,
      scoringMethod,
      feedback,
      ...(aiFeedbackPart !== undefined ? { aiFeedbackPart } : {}),
    });
  }

  return { items, totalScore };
}
