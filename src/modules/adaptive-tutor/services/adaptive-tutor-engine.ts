// Sprint 35: AdaptiveTutorEngine — orchestrates all personalization
import type {
  PersonalizationContext, TutorOutput, TutorActionType,
  TutorSessionRecord,
} from '../types';
import { exerciseSelector } from './exercise-selector';
import { hintGenerator } from './hint-generator';
import { feedbackComposer } from './feedback-composer';
import { explanationAdapter } from './explanation-adapter';
import { challengeCurator } from './challenge-curator';
import { confidenceEstimator } from '@/modules/learning-science/services/confidence-estimator';
import { learningPathGenerator } from '@/modules/knowledge-graph/services/learning-path-generator';

// ============================================
// AdaptiveTutorEngine
// ============================================

export class AdaptiveTutorEngine {

  /**
   * Generate a personalized tutor action.
   * This is the main entry point — it selects the right action type
   * and delegates to the appropriate sub-service.
   */
  generate(ctx: PersonalizationContext, requestedAction?: TutorActionType): TutorOutput {
    const action = requestedAction || this.selectAction(ctx);
    const sessionId = `tutor_${Date.now()}`;

    switch (action) {
      case 'exercise': return this.generateExercise(ctx, sessionId);
      case 'hint': return this.generateHint(ctx, sessionId);
      case 'feedback': return this.generateFeedback(ctx, sessionId);
      case 'explanation': return this.generateExplanation(ctx, sessionId);
      case 'review': return this.generateReview(ctx, sessionId);
      case 'challenge': return this.generateChallenge(ctx, sessionId);
      case 'support': return this.generateSupport(ctx, sessionId);
      default: return this.generateExercise(ctx, sessionId);
    }
  }

  /**
   * Select the best action type based on the student's context
   */
  private selectAction(ctx: PersonalizationContext): TutorActionType {
    // If no recent sessions → diagnostic exercise
    if (ctx.recentSessions.length === 0) return 'exercise';

    // If many due reviews → review
    const dueCount = ctx.reviewSchedule.filter(r =>
      new Date(r.nextReviewAt) <= new Date() && !r.isMastered
    ).length;
    if (dueCount > 5) return 'review';

    // If many recent mistakes → explanation
    if (ctx.recentMistakes.length > 5) return 'explanation';

    // If low mood → challenge (gamification boost)
    if (ctx.mood !== undefined && ctx.mood <= 2) return 'challenge';

    // Default: exercise
    const lastAction = ctx.recentSessions[0];
    if (lastAction && lastAction.correctCount / Math.max(1, lastAction.totalCount) > 0.8) {
      return 'challenge';
    }

    return 'exercise';
  }

  // ============================================
  // Action generators
  // ============================================

  private generateExercise(ctx: PersonalizationContext, sessionId: string): TutorOutput {
    const spec = exerciseSelector.select(ctx);
    const difficulty = exerciseSelector.getDifficultyRecommendation(ctx);

    const content = `Generate ${spec.questionCount} ${spec.format} questions on ${spec.topicNodeId} at ${spec.difficulty} difficulty.`;
    const contentZh = `生成 ${spec.questionCount} 題${spec.format}練習，主題為 ${spec.topicNodeId}，難度為 ${spec.difficulty}。`;

    return {
      studentId: ctx.studentId, sessionId,
      generatedAt: new Date().toISOString(),
      action: 'exercise',
      content, contentZh,
      personalization: { difficulty },
      confidence: 0.85,
      reason: `Selected ${spec.format} format based on skill focus (${spec.skillFocus}) and energy level`,
      reasonZh: `根據技能重點（${spec.skillFocus}）和精力水平選擇 ${spec.format} 格式`,
      learningGain: this.estimateGain('exercise', spec.difficulty),
      estimatedCompletionTime: spec.estimatedTime,
      followUp: {
        nextAction: 'feedback',
        nextActionDescription: 'Submit your answers to get personalized feedback',
        nextActionDescriptionZh: '提交答案以獲得個人化反饋',
      },
    };
  }

  private generateHint(ctx: PersonalizationContext, sessionId: string): TutorOutput {
    const lastMistake = ctx.recentMistakes[0];
    const question = lastMistake?.questionText || 'the current question';
    const questionZh = lastMistake?.questionTextZh;

    const hint = hintGenerator.generate({
      question,
      questionZh,
      correctAnswer: lastMistake?.correctAnswer || '',
      studentAnswer: lastMistake?.studentAnswer,
      studentLevel: ctx.gradeLevel,
      mistakeType: lastMistake?.mistakeType,
      currentAttempt: 1,
      ctx,
    });

    return {
      studentId: ctx.studentId, sessionId,
      generatedAt: new Date().toISOString(),
      action: 'hint',
      content: hint.hint,
      contentZh: hint.hintZh,
      personalization: {
        difficulty: { level: 'core', reason: '', reasonZh: '', targetAccuracy: 0.8 },
        hintLevel: hint,
      },
      confidence: 0.9,
      reason: `Level ${hint.level} hint based on ${ctx.recentMistakes.length} recent mistakes`,
      reasonZh: `根據 ${ctx.recentMistakes.length} 個近期錯誤提供第 ${hint.level} 級提示`,
      learningGain: 0.3,
      estimatedCompletionTime: 1,
      followUp: {
        nextAction: hint.level < 3 ? 'hint' : 'explanation',
        nextActionDescription: hint.level < 3 ? 'Try again with a more detailed hint' : 'Get a full explanation',
        nextActionDescriptionZh: hint.level < 3 ? '用更詳細的提示再試一次' : '獲取完整解釋',
      },
    };
  }

  private generateFeedback(ctx: PersonalizationContext, sessionId: string): TutorOutput {
    const lastSession = ctx.recentSessions[0];
    const lastMistake = ctx.recentMistakes[0];

    const fb = feedbackComposer.compose({
      ctx,
      questionText: lastMistake?.questionText || 'the exercise',
      studentAnswer: lastMistake?.studentAnswer || '',
      correctAnswer: lastMistake?.correctAnswer || '',
      isCorrect: lastSession ? lastSession.correctCount / Math.max(1, lastSession.totalCount) > 0.7 : true,
      skill: lastSession?.skillFocus || 'grammar',
      nodeId: lastMistake?.nodeId,
    });

    return {
      studentId: ctx.studentId, sessionId,
      generatedAt: new Date().toISOString(),
      action: 'feedback',
      content: fb.feedback,
      contentZh: fb.feedbackZh,
      personalization: {
        difficulty: { level: 'core', reason: '', reasonZh: '', targetAccuracy: 0.8 },
      },
      confidence: 0.9,
      reason: `${fb.level} feedback level — ${ctx.recentMistakes.length} recent mistakes`,
      reasonZh: `${fb.level === 'detailed' ? '詳細' : fb.level === 'balanced' ? '均衡' : '簡潔'}反饋 — ${ctx.recentMistakes.length} 個近期錯誤`,
      learningGain: fb.spec.includeModelAnswer ? 0.5 : 0.3,
      estimatedCompletionTime: 2,
    };
  }

  private generateExplanation(ctx: PersonalizationContext, sessionId: string): TutorOutput {
    const lastMistake = ctx.recentMistakes[0];
    const topic = lastMistake?.mistakeType || 'grammar';

    const exp = explanationAdapter.adapt({
      ctx,
      topic,
      topicZh: topic,
      concept: lastMistake?.questionText || topic,
      conceptZh: lastMistake?.questionTextZh,
      mistakeType: lastMistake?.mistakeType,
    });

    return {
      studentId: ctx.studentId, sessionId,
      generatedAt: new Date().toISOString(),
      action: 'explanation',
      content: `${exp.explanation}\n\nExamples:\n${exp.examples.map((e, i) => `${i + 1}. ${e}`).join('\n')}\n\n${exp.memoryTip}`,
      contentZh: `${exp.explanationZh}\n\n例子：\n${exp.examplesZh.map((e, i) => `${i + 1}. ${e}`).join('\n')}\n\n${exp.memoryTipZh}`,
      personalization: {
        difficulty: { level: 'core', reason: '', reasonZh: '', targetAccuracy: 0.8 },
      },
      confidence: 0.85,
      reason: `${exp.complexity} complexity — adapted to ${ctx.cefrLevel || ctx.gradeLevel} level`,
      reasonZh: `${exp.complexity === 'basic' ? '基礎' : exp.complexity === 'intermediate' ? '中級' : '進階'}複雜度 — 根據 ${ctx.cefrLevel || ctx.gradeLevel} 水平調整`,
      learningGain: 0.4,
      estimatedCompletionTime: 3,
      followUp: {
        nextAction: 'exercise',
        nextActionDescription: 'Practice with exercises to apply what you learned',
        nextActionDescriptionZh: '練習題目以應用所學',
      },
    };
  }

  private generateReview(ctx: PersonalizationContext, sessionId: string): TutorOutput {
    const dueItems = ctx.reviewSchedule.filter(r =>
      new Date(r.nextReviewAt) <= new Date() && !r.isMastered
    );

    const content = `You have ${dueItems.length} items due for review. ` +
      `Prioritized list:\n${dueItems.slice(0, 5).map((r, i) =>
        `${i + 1}. ${r.title || r.itemId} (urgency: ${r.reviewUrgency}, retention: ${Math.round(r.retentionProbability * 100)}%)`
      ).join('\n')}`;

    const contentZh = `你有 ${dueItems.length} 個項目需要複習。\n優先列表：\n${dueItems.slice(0, 5).map((r, i) =>
      `${i + 1}. ${r.titleZh || r.itemId}（緊急度：${r.reviewUrgency}，保留率：${Math.round(r.retentionProbability * 100)}%）`
    ).join('\n')}`;

    return {
      studentId: ctx.studentId, sessionId,
      generatedAt: new Date().toISOString(),
      action: 'review',
      content, contentZh,
      personalization: {
        difficulty: { level: 'core', reason: '', reasonZh: '', targetAccuracy: 0.8 },
      },
      confidence: 0.95,
      reason: `${dueItems.length} items due, ${dueItems.filter(r => r.reviewUrgency === 'critical').length} critical`,
      reasonZh: `${dueItems.length} 個項目到期，${dueItems.filter(r => r.reviewUrgency === 'critical').length} 個緊急`,
      learningGain: 0.6,
      estimatedCompletionTime: Math.min(ctx.availableTimeMinutes, dueItems.length * 3),
    };
  }

  private generateChallenge(ctx: PersonalizationContext, sessionId: string): TutorOutput {
    const challenge = challengeCurator.curate(ctx);

    return {
      studentId: ctx.studentId, sessionId,
      generatedAt: new Date().toISOString(),
      action: 'challenge',
      content: challenge.challenge,
      contentZh: challenge.challengeZh,
      personalization: {
        difficulty: {
          level: challenge.difficulty,
          reason: `Challenge in ${challenge.skill} — pushing beyond comfort zone`,
          reasonZh: `${challenge.skill} 挑戰 — 突破舒適區`,
          targetAccuracy: 0.7,
        },
      },
      confidence: 0.75,
      reason: `${challenge.difficulty} challenge in ${challenge.skill}`,
      reasonZh: `${challenge.skill} 的${challenge.difficulty === 'challenge' ? '挑戰級' : '練習'}`,
      learningGain: 0.5,
      estimatedCompletionTime: challenge.timeEstimate,
      followUp: {
        nextAction: 'feedback',
        nextActionDescription: 'Complete the challenge to see your results',
        nextActionDescriptionZh: '完成挑戰以查看結果',
      },
    };
  }

  private generateSupport(ctx: PersonalizationContext, sessionId: string): TutorOutput {
    const weakness = ctx.learningMemory?.weaknesses;
    const weakTopics = weakness?.persistentWeaknesses?.slice(0, 3).map(w => w.topic).join(', ') || 'various topics';

    return {
      studentId: ctx.studentId, sessionId,
      generatedAt: new Date().toISOString(),
      action: 'support',
      content: `Based on your learning profile, I recommend focusing on: ${weakTopics}. ` +
        `You've made progress in ${ctx.recentSessions.filter(s => s.correctCount / Math.max(1, s.totalCount) > 0.7).length} out of ${Math.max(1, ctx.recentSessions.length)} recent sessions. Keep going!`,
      contentZh: `根據你的學習檔案，建議專注於：${weakTopics}。` +
        `你在最近 ${ctx.recentSessions.length} 次練習中，有 ${ctx.recentSessions.filter(s => s.correctCount / Math.max(1, s.totalCount) > 0.7).length} 次表現良好。繼續努力！`,
      personalization: {
        difficulty: { level: 'core', reason: '', reasonZh: '', targetAccuracy: 0.8 },
      },
      confidence: 0.8,
      reason: 'Support based on learning memory and recent performance',
      reasonZh: '根據學習記憶和近期表現提供支援',
      learningGain: 0.2,
      estimatedCompletionTime: 1,
      followUp: {
        nextAction: 'exercise',
        nextActionDescription: 'Start a focused exercise on your weak topics',
        nextActionDescriptionZh: '開始弱項主題的針對性練習',
      },
    };
  }

  // ============================================
  // Helpers
  // ============================================

  private estimateGain(action: TutorActionType, difficulty: string): number {
    const base: Record<string, number> = {
      exercise: 0.5, hint: 0.2, feedback: 0.3,
      explanation: 0.4, review: 0.6, challenge: 0.5, support: 0.15,
    };
    const multiplier = difficulty === 'challenge' ? 1.2 : difficulty === 'core' ? 1.0 : 0.8;
    return Math.round((base[action] || 0.3) * multiplier * 100) / 100;
  }
}

export const adaptiveTutorEngine = new AdaptiveTutorEngine();
