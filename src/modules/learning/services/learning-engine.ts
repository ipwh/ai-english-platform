// v5: Learning Engine — The SOLE strategy decider
// Rule: LLM only generates content. Learning Engine decides strategy.
// Every exercise recommendation must flow through this engine.

import { logger } from '@/shared/logger/logger';

// ============================================
// Strategy Decision Types
// ============================================

export interface StrategyDecision {
  /** What action to take */
  action: 'practice_grammar' | 'review_vocabulary' | 'writing_exercise' | 'reading_comprehension' | 'listening_practice' | 'diagnostic_test' | 'rest_day';
  /** Bilingual labels */
  actionZh: string;
  /** WHY this was chosen (deterministic, not AI-generated) */
  reason: string;
  reasonZh: string;
  /** Confidence in this decision (0-1) */
  confidence: number;
  /** Expected mastery improvement (0-100) */
  expectedImprovement: number;
  /** The specific skill/topic to target */
  target: string;
  targetZh: string;
  /** Difficulty level for the exercise */
  difficulty: 'remedial' | 'core' | 'challenge';
  /** Current mastery before exercise */
  masteryBefore: number;
  /** Estimated mastery after exercise */
  masteryAfter: number;
  /** Related weakness being addressed */
  relatedWeakness: string;
  relatedWeaknessZh: string;
}

export interface LearningEngineInput {
  studentId: string;
  /** Current mastery profile (0-100 per skill) */
  mastery: Record<string, number>;
  /** Recent mistake categories with counts */
  mistakes: Array<{ category: string; categoryZh: string; count: number; severity: string }>;
  /** Knowledge graph readiness per node */
  readiness: Array<{ skillId: string; title: string; titleZh: string; readiness: number }>;
  /** Days since last activity */
  daysSinceLastActivity: number;
  /** DSE target level */
  targetLevel?: string;
}

// ============================================
// Decision weights (v5: deterministic, not AI)
// ============================================

const WEIGHTS = {
  WEAKNESS: 0.35,      // How weak the student is in this area
  EXAM_IMPORTANCE: 0.30, // How important for DSE
  READINESS: 0.20,     // How ready the student is (prerequisites met)
  RECENCY: 0.15,       // How recently practiced
};

export class LearningEngine {
  /**
   * Decide the next best action for a student.
   * This is PURELY deterministic — no AI, no LLM.
   */
  decide(input: LearningEngineInput): StrategyDecision {
    // Rule: If no activity for 7+ days, suggest restart with diagnostic
    if (input.daysSinceLastActivity >= 7 && input.mistakes.length === 0) {
      return {
        action: 'diagnostic_test',
        actionZh: '診斷測驗',
        reason: 'No recent activity detected. A diagnostic test will recalibrate your learning path.',
        reasonZh: '偵測到近期沒有學習活動。診斷測驗將重新校準你的學習路徑。',
        confidence: 0.9,
        expectedImprovement: 5,
        target: 'general',
        targetZh: '綜合',
        difficulty: 'core',
        masteryBefore: 0,
        masteryAfter: 0,
        relatedWeakness: 'inactivity',
        relatedWeaknessZh: '長期未學習',
      };
    }

    // Build scored candidates from readiness + weakness data
    interface Candidate {
      skillId: string;
      title: string;
      titleZh: string;
      weaknessScore: number;
      examWeight: number;
      readiness: number;
      recencyScore: number;
      masteryBefore: number;
      category: string;
      categoryZh: string;
    }

    const candidates: Candidate[] = [];

    // From knowledge graph readiness
    for (const r of input.readiness) {
      const mastery = input.mastery[r.skillId] ?? 50;
      const weaknessScore = 1 - mastery / 100;
      
      // Find matching mistake data
      const mistake = input.mistakes.find(m => 
        r.skillId.includes(m.category) || m.category.includes(r.skillId)
      );
      
      candidates.push({
        skillId: r.skillId,
        title: r.title,
        titleZh: r.titleZh,
        weaknessScore,
        examWeight: this.getExamWeight(r.skillId),
        readiness: r.readiness / 100,
        recencyScore: input.daysSinceLastActivity < 3 ? 0.8 : 0.5,
        masteryBefore: mastery,
        category: mistake?.category ?? r.skillId,
        categoryZh: mistake?.categoryZh ?? r.titleZh,
      });
    }

    // From mistakes not in readiness
    for (const m of input.mistakes) {
      if (!candidates.some(c => c.category === m.category)) {
        const mastery = input.mastery[m.category] ?? 50;
        candidates.push({
          skillId: m.category,
          title: m.category,
          titleZh: m.categoryZh,
          weaknessScore: m.count / Math.max(10, m.count + 5),
          examWeight: this.getExamWeight(m.category),
          readiness: 0.5,
          recencyScore: 0.6,
          masteryBefore: mastery,
          category: m.category,
          categoryZh: m.categoryZh,
        });
      }
    }

    // Score and rank
    const scored = candidates.map(c => ({
      ...c,
      totalScore:
        c.weaknessScore * WEIGHTS.WEAKNESS +
        c.examWeight * WEIGHTS.EXAM_IMPORTANCE +
        c.readiness * WEIGHTS.READINESS +
        c.recencyScore * WEIGHTS.RECENCY,
    }));

    scored.sort((a, b) => b.totalScore - a.totalScore);
    const best = scored[0];

    if (!best) {
      return {
        action: 'practice_grammar',
        actionZh: '文法練習',
        reason: 'Starting with grammar fundamentals.',
        reasonZh: '從文法基礎開始。',
        confidence: 0.5,
        expectedImprovement: 5,
        target: 'tenses',
        targetZh: '時態',
        difficulty: 'core',
        masteryBefore: 50,
        masteryAfter: 55,
        relatedWeakness: 'general',
        relatedWeaknessZh: '一般',
      };
    }

    // Determine action type
    const actionMap: Record<string, StrategyDecision['action']> = {
      grammar: 'practice_grammar',
      reading: 'reading_comprehension',
      writing: 'writing_exercise',
      listening: 'listening_practice',
      vocabulary: 'review_vocabulary',
    };
    
    const action = actionMap[best.category] ?? 'practice_grammar';
    const difficulty: StrategyDecision['difficulty'] =
      best.masteryBefore < 30 ? 'remedial' :
      best.masteryBefore > 70 ? 'challenge' : 'core';

    // Estimate improvement (diminishing returns as mastery increases)
    const roomForImprovement = 100 - best.masteryBefore;
    const expectedImprovement = Math.round(roomForImprovement * 0.15 * best.totalScore * 100) / 100;

    return {
      action,
      actionZh: this.actionLabelZh(action),
      reason: `Your ${best.title} mastery is at ${Math.round(best.masteryBefore)}%. ` +
        `This topic has ${best.weaknessScore > 0.5 ? 'high' : 'moderate'} priority ` +
        `(DSE weight: ${Math.round(best.examWeight * 100)}%).`,
      reasonZh: `你的${best.titleZh}掌握度為${Math.round(best.masteryBefore)}%。` +
        `此主題在DSE考試中權重為${Math.round(best.examWeight * 100)}%，優先級${best.weaknessScore > 0.5 ? '高' : '中'}。`,
      confidence: Math.round(best.totalScore * 100) / 100,
      expectedImprovement,
      target: best.skillId,
      targetZh: best.titleZh,
      difficulty,
      masteryBefore: Math.round(best.masteryBefore),
      masteryAfter: Math.round(Math.min(100, best.masteryBefore + expectedImprovement)),
      relatedWeakness: best.category,
      relatedWeaknessZh: best.categoryZh,
    };
  }

  private getExamWeight(skillId: string): number {
    const keywords: Record<string, number> = {
      tenses: 1.0, 'subject-verb': 0.95, passive: 0.85,
      conditional: 0.85, relative: 0.80, connector: 0.80,
      article: 0.65, preposition: 0.60, modal: 0.60,
      gerund: 0.55, reported: 0.55, comparative: 0.50,
      inversion: 0.35, phrasal: 0.30, subjunctive: 0.25,
    };
    for (const [key, weight] of Object.entries(keywords)) {
      if (skillId.includes(key)) return weight;
    }
    return 0.50;
  }

  private actionLabelZh(action: StrategyDecision['action']): string {
    const labels: Record<string, string> = {
      practice_grammar: '文法練習',
      review_vocabulary: '詞彙複習',
      writing_exercise: '寫作練習',
      reading_comprehension: '閱讀理解',
      listening_practice: '聽力練習',
      diagnostic_test: '診斷測驗',
      rest_day: '休息日',
    };
    return labels[action] ?? action;
  }
}

export const learningEngine = new LearningEngine();
