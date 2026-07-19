// Sprint 35: FeedbackComposer — personalized, level-adapted feedback
import type {
  PersonalizationContext, FeedbackSpec, FeedbackLevel,
} from '../types';
import type { SkillDimension } from '@/modules/profile/types';

// ============================================
// FeedbackComposer
// ============================================

export class FeedbackComposer {

  /** Compose personalized feedback based on student context */
  compose(opts: {
    ctx: PersonalizationContext;
    questionText: string;
    studentAnswer: string;
    correctAnswer: string;
    isCorrect: boolean;
    skill: SkillDimension;
    nodeId?: string;
  }): {
    feedback: string;
    feedbackZh: string;
    level: FeedbackLevel;
    spec: FeedbackSpec;
  } {
    const { ctx, questionText, studentAnswer, correctAnswer, isCorrect, skill, nodeId } = opts;

    // Determine feedback level from mastery
    const mastery = nodeId ? (ctx.masteryScores[nodeId] ?? 50) : 50;
    const level = this.determineLevel(mastery, isCorrect, ctx.recentMistakes.length);

    const spec: FeedbackSpec = {
      level,
      includeRubric: level !== 'minimal',
      includeSuggestions: true,
      includeModelAnswer: level === 'detailed' || !isCorrect,
      highlightErrors: !isCorrect,
      positiveReinforcement: true,
    };

    const feedback = this.buildFeedback({ isCorrect, studentAnswer, correctAnswer, skill, level, spec });
    const feedbackZh = this.buildFeedbackZh({ isCorrect, studentAnswer, correctAnswer, skill, level, spec });

    return { feedback, feedbackZh, level, spec };
  }

  private determineLevel(mastery: number, isCorrect: boolean, mistakeCount: number): FeedbackLevel {
    if (mistakeCount > 10 || mastery < 30) return 'detailed';
    if (!isCorrect) return 'balanced';
    if (mastery > 80) return 'minimal';
    return 'balanced';
  }

  private buildFeedback(opts: {
    isCorrect: boolean; studentAnswer: string; correctAnswer: string;
    skill: SkillDimension; level: FeedbackLevel; spec: FeedbackSpec;
  }): string {
    const { isCorrect, studentAnswer, correctAnswer, skill, level, spec } = opts;
    const parts: string[] = [];

    // 1. Positive reinforcement
    if (spec.positiveReinforcement) {
      parts.push(isCorrect
        ? `✅ Correct! "${correctAnswer}" is the right answer.`
        : `Your answer "${studentAnswer}" isn't quite right. Don't worry — this is how we learn!`);
    }

    // 2. Error analysis
    if (spec.highlightErrors && !isCorrect) {
      parts.push(`The correct answer is "${correctAnswer}". Let's see why:`);
    }

    // 3. Skill-specific guidance
    if (spec.includeSuggestions) {
      parts.push(this.skillTip(skill, isCorrect));
    }

    // 4. Model answer (detailed only)
    if (spec.includeModelAnswer && !isCorrect && level === 'detailed') {
      parts.push(`🔍 Model answer: "${correctAnswer}". Compare this with your answer to understand the difference.`);
    }

    return parts.join('\n\n');
  }

  private buildFeedbackZh(opts: {
    isCorrect: boolean; studentAnswer: string; correctAnswer: string;
    skill: SkillDimension; level: FeedbackLevel; spec: FeedbackSpec;
  }): string {
    const { isCorrect, studentAnswer, correctAnswer, skill, level, spec } = opts;
    const parts: string[] = [];

    if (spec.positiveReinforcement) {
      parts.push(isCorrect
        ? `✅ 正確！「${correctAnswer}」是正確答案。`
        : `你的答案「${studentAnswer}」不太對。別擔心——這就是學習的過程！`);
    }

    if (spec.highlightErrors && !isCorrect) {
      parts.push(`正確答案是「${correctAnswer}」。讓我們看看為什麼：`);
    }

    if (spec.includeSuggestions) {
      parts.push(this.skillTipZh(skill, isCorrect));
    }

    if (spec.includeModelAnswer && !isCorrect && level === 'detailed') {
      parts.push(`🔍 模範答案：「${correctAnswer}」。比較你的答案，找出不同的地方。`);
    }

    return parts.join('\n\n');
  }

  private skillTip(skill: SkillDimension, isCorrect: boolean): string {
    if (isCorrect) {
      const tips: Record<string, string> = {
        grammar: 'Great grammar! Try explaining the rule you used to a friend — teaching reinforces learning.',
        vocabulary: 'Excellent word choice! Add this word to your vocabulary list for spaced repetition.',
        reading: 'Good comprehension! Try summarizing the passage in your own words.',
        writing: 'Well written! Review your sentence structure — variety makes writing engaging.',
        listening: 'Good listening! Try to catch the speaker\'s tone and attitude next time.',
        speaking: 'Well expressed! Practice saying this aloud with natural intonation.',
      };
      return tips[skill] || 'Keep up the great work!';
    }
    const tips: Record<string, string> = {
      grammar: '💡 Grammar tip: Identify the tense first, then check subject-verb agreement.',
      vocabulary: '💡 Vocabulary tip: Consider the context — which word best fits the meaning?',
      reading: '💡 Reading tip: Look for keywords in the question, then scan the passage.',
      writing: '💡 Writing tip: Check your paragraph structure — topic sentence, supporting details, conclusion.',
      listening: '💡 Listening tip: Focus on keywords and note down numbers, names, and dates.',
      speaking: '💡 Speaking tip: Organize your thoughts with a quick intro-body-conclusion structure.',
    };
    return tips[skill] || '💡 Review the material and try again.';
  }

  private skillTipZh(skill: SkillDimension, isCorrect: boolean): string {
    if (isCorrect) {
      const tips: Record<string, string> = {
        grammar: '文法很棒！試試向朋友解釋你使用的規則——教學能鞏固學習。',
        vocabulary: '詞彙選擇出色！把這個詞加入生字簿進行間隔複習。',
        reading: '理解力很好！試試用自己的話總結文章內容。',
        writing: '寫得很好！檢查你的句子結構——多樣性能讓文章更吸引。',
        listening: '聆聽力不錯！下次試試留意說話者的語氣和態度。',
        speaking: '表達得很好！練習用自然語調大聲讀出。',
      };
      return tips[skill] || '繼續保持！';
    }
    const tips: Record<string, string> = {
      grammar: '💡 文法提示：先確定時態，然後檢查主謂一致。',
      vocabulary: '💡 詞彙提示：考慮上下文——哪個詞最符合意思？',
      reading: '💡 閱讀提示：先找出問題關鍵詞，然後掃描文章。',
      writing: '💡 寫作提示：檢查段落結構——主題句、支持細節、結論。',
      listening: '💡 聆聽提示：專注關鍵詞，記下數字、名稱和日期。',
      speaking: '💡 口語提示：用簡單的引言-主體-結論結構組織你的想法。',
    };
    return tips[skill] || '💡 複習內容後再試一次。';
  }
}

export const feedbackComposer = new FeedbackComposer();
