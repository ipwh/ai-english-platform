// Sprint 35: HintGenerator — progressive 3-level hint system
import type {
  PersonalizationContext, AdaptiveHintLevel,
} from '../types';

// ============================================
// HintGenerator
// ============================================

export class HintGenerator {

  /** Generate a progressive 3-level hint for a question */
  generate(opts: {
    question: string;
    questionZh?: string;
    correctAnswer: string;
    studentAnswer?: string;
    studentLevel: string;
    mistakeType?: string;
    currentAttempt: number; // 1-based
    ctx: PersonalizationContext;
  }): AdaptiveHintLevel {
    const { question, questionZh, correctAnswer, studentAnswer, mistakeType, currentAttempt, ctx } = opts;

    // Determine hint level based on attempt count and mastery
    const studentMastery = ctx.masteryScores[opts.question] ?? 50;
    const level = this.determineLevel(currentAttempt, studentMastery, ctx.mood);

    const hint = this.buildHint(level, {
      question, questionZh, correctAnswer, studentAnswer, mistakeType,
    });

    const hintZh = this.buildHintZh(level, {
      question: questionZh || question, correctAnswer, studentAnswer, mistakeType,
    });

    return {
      level: level as 1 | 2 | 3,
      hint,
      hintZh,
      escalationCondition: level < 3
        ? 'After 1 more incorrect attempt'
        : 'This is the most detailed hint available',
    };
  }

  /** Determine hint level: more help for struggling students, cooler hints for strong ones */
  private determineLevel(attempt: number, mastery: number, mood?: number): number {
    if (attempt >= 3 || mastery < 30) return 3;
    if (attempt >= 2 || mastery < 60 || (mood !== undefined && mood <= 2)) return 2;
    return 1;
  }

  private buildHint(level: number, ctx: {
    question: string;
    questionZh?: string;
    correctAnswer: string;
    studentAnswer?: string;
    mistakeType?: string;
  }): string {
    switch (level) {
      case 1:
        return this.level1Hint(ctx);
      case 2:
        return this.level2Hint(ctx);
      case 3:
        return this.level3Hint(ctx);
      default:
        return this.level1Hint(ctx);
    }
  }

  private buildHintZh(level: number, ctx: {
    question: string;
    correctAnswer: string;
    studentAnswer?: string;
    mistakeType?: string;
  }): string {
    switch (level) {
      case 1:
        return this.level1HintZh(ctx);
      case 2:
        return this.level2HintZh(ctx);
      case 3:
        return this.level3HintZh(ctx);
      default:
        return this.level1HintZh(ctx);
    }
  }

  // ============================================
  // Level 1: Gentle nudge — direction only
  // ============================================

  private level1Hint(ctx: { question: string; mistakeType?: string }): string {
    if (ctx.mistakeType === 'tense') {
      return `Think about when this action happened. Is it in the past, present, or future?`;
    }
    if (ctx.mistakeType === 'subject-verb-agreement') {
      return `Check the subject of the sentence. Is it singular or plural?`;
    }
    if (ctx.mistakeType === 'preposition') {
      return `Consider the relationship between the words. Is it about location, time, or direction?`;
    }
    return `Take another look at the key words in the question. What are they asking for?`;
  }

  private level1HintZh(ctx: { question: string; mistakeType?: string }): string {
    if (ctx.mistakeType === 'tense') {
      return `想一想這個動作發生的時間。是過去、現在還是將來？`;
    }
    if (ctx.mistakeType === 'subject-verb-agreement') {
      return `檢查句子的主語。是單數還是複數？`;
    }
    return `再看看問題的關鍵詞。它們在問什麼？`;
  }

  // ============================================
  // Level 2: Partial guidance — narrow the focus
  // ============================================

  private level2Hint(ctx: { question: string; correctAnswer: string; studentAnswer?: string; mistakeType?: string }): string {
    if (ctx.studentAnswer) {
      return `Your answer "${ctx.studentAnswer}" is close, but not quite right. The correct answer has ${ctx.correctAnswer.length} characters. Try to identify which part of your answer is different.`;
    }
    if (ctx.mistakeType === 'tense') {
      return `The correct answer uses a specific tense. Look for time markers like "yesterday", "already", or "next week".`;
    }
    return `The answer is related to "${ctx.correctAnswer.slice(0, 3)}...". Think about what word fits the context.`;
  }

  private level2HintZh(ctx: { correctAnswer: string; studentAnswer?: string; mistakeType?: string }): string {
    if (ctx.studentAnswer) {
      return `你的答案「${ctx.studentAnswer}」很接近，但不太對。正確答案有 ${ctx.correctAnswer.length} 個字母。試試找出哪部分不同。`;
    }
    return `答案與「${ctx.correctAnswer.slice(0, 3)}...」有關。想想哪個詞符合上下文。`;
  }

  // ============================================
  // Level 3: Near-answer — almost giving it away
  // ============================================

  private level3Hint(ctx: { correctAnswer: string; mistakeType?: string }): string {
    const masked = this.maskAnswer(ctx.correctAnswer);
    return `The answer is "${masked}". The first letter is "${ctx.correctAnswer[0]}" and the last letter is "${ctx.correctAnswer[ctx.correctAnswer.length - 1]}".`;
  }

  private level3HintZh(ctx: { correctAnswer: string }): string {
    const masked = this.maskAnswer(ctx.correctAnswer);
    return `答案是「${masked}」。第一個字母是「${ctx.correctAnswer[0]}」，最後一個字母是「${ctx.correctAnswer[ctx.correctAnswer.length - 1]}」。`;
  }

  private maskAnswer(answer: string): string {
    if (answer.length <= 2) return '_'.repeat(answer.length);
    return answer[0] + '_'.repeat(answer.length - 2) + answer[answer.length - 1];
  }
}

export const hintGenerator = new HintGenerator();
