// ============================================
// Sprint 114: Adaptive Rules (12 rules)
// Deterministic personalized learning. No AI.
// ============================================

import type { AdaptiveRule, AdaptiveCheck, StudentProfile, AdaptiveContext } from '../adaptive-types';
import { DIFFICULTY_ORDER, ALL_SKILLS } from '../adaptive-types';
import { getWeakestSkills, getStrongestSkills, isSessionFatigued } from '../adaptive-profile';
import { getIncorrectVocabulary, getIncorrectGrammar, getRecentAccuracy } from '../adaptive-history';

const ok = (id: string): AdaptiveCheck => ({ ruleId: id, passed: true, score: 1, priority: 'low' });
const adj = (id: string, detail: string, p: AdaptiveCheck['priority'] = 'medium'): AdaptiveCheck =>
  ({ ruleId: id, passed: false, score: 0.5, detail, priority: p });

// ═══ 1. DifficultyAdjustmentRule ═══
export const difficultyAdjustmentRule: AdaptiveRule = {
  id: 'adp:difficulty-adjustment', name: 'Difficulty Adjustment', description: 'Adjusts difficulty using streaks and accuracy', priority: 'critical',
  evaluate(profile, ctx) {
    const config = profile.config;

    // Decrease after repeated failures
    if (profile.currentLossStreak >= config.failureThreshold) {
      const idx = DIFFICULTY_ORDER.indexOf(profile.currentLevel);
      if (idx > 0) {
        return adj(this.id, `Difficulty decreased ${profile.currentLevel}→${DIFFICULTY_ORDER[idx - 1]} after ${profile.currentLossStreak} failures`, 'critical');
      }
    }

    // Increase after sustained success
    if (profile.currentStreak >= config.streakThreshold && profile.rollingAccuracy >= config.masteryThreshold) {
      const idx = DIFFICULTY_ORDER.indexOf(profile.currentLevel);
      if (idx < DIFFICULTY_ORDER.length - 1) {
        return adj(this.id, `Difficulty increased ${profile.currentLevel}→${DIFFICULTY_ORDER[idx + 1]} after ${profile.currentStreak} streak`, 'high');
      }
    }

    return ok(this.id);
  },
};

// ═══ 2. WeakSkillFocusRule ═══
export const weakSkillFocusRule: AdaptiveRule = {
  id: 'adp:weak-skill-focus', name: 'Weak Skill Focus', description: 'Prioritizes weakest skill domains', priority: 'critical',
  evaluate(profile, ctx) {
    const weakest = getWeakestSkills(profile, 2);
    const strongest = getStrongestSkills(profile, 2);

    // Check if there's a significant gap
    const weakestScore = profile.skills.find(s => s.domain === weakest[0])?.score ?? 50;
    const strongestScore = profile.skills.find(s => s.domain === strongest[0])?.score ?? 50;
    const gap = strongestScore - weakestScore;

    if (gap >= 30) {
      return adj(this.id, `Large skill gap (${gap}pts): focus on ${weakest[0]} (${weakestScore})`, 'critical');
    }
    if (gap >= 15) {
      return adj(this.id, `Moderate skill gap (${gap}pts): prioritize ${weakest[0]}`, 'high');
    }
    return ok(this.id);
  },
};

// ═══ 3. MasteryProgressionRule ═══
export const masteryProgressionRule: AdaptiveRule = {
  id: 'adp:mastery-progression', name: 'Mastery Progression', description: 'Gradually increases challenge on mastery', priority: 'high',
  evaluate(profile, ctx) {
    const masteredSkills = profile.skills.filter(s => s.score >= profile.config.masteryThreshold * 100);
    const totalSkills = profile.skills.length;

    if (masteredSkills.length === totalSkills && profile.rollingAccuracy >= 0.9) {
      return adj(this.id, `All ${totalSkills} skills mastered (avg ${Math.round(profile.rollingAccuracy * 100)}%), ready to advance`, 'high');
    }
    if (masteredSkills.length >= totalSkills * 0.7) {
      return adj(this.id, `${masteredSkills.length}/${totalSkills} skills mastered, consider increasing challenge`, 'medium');
    }
    return ok(this.id);
  },
};

// ═══ 4. RepeatedMistakeRule ═══
export const repeatedMistakeRule: AdaptiveRule = {
  id: 'adp:repeated-mistake', name: 'Repeated Mistake Detection', description: 'Detects recurring errors for targeted practice', priority: 'high',
  evaluate(profile, ctx) {
    const recent = profile.recentPerformance.slice(-20);
    const failures = recent.filter(r => !r.correct);

    if (failures.length >= 3) {
      // Find most common failing domain
      const domainCounts: Record<string, number> = {};
      for (const f of failures) {
        domainCounts[f.domain] = (domainCounts[f.domain] || 0) + 1;
      }
      const topDomain = Object.entries(domainCounts).sort((a, b) => b[1] - a[1])[0];

      if (topDomain && topDomain[1] >= 3) {
        return adj(this.id, `${topDomain[1]} recent failures in ${topDomain[0]}, targeted practice recommended`, 'high');
      }
    }
    return ok(this.id);
  },
};

// ═══ 5. VocabularyRecyclingRule ═══
export const vocabularyRecyclingRule: AdaptiveRule = {
  id: 'adp:vocabulary-recycling', name: 'Vocabulary Recycling', description: 'Recycles incorrect vocabulary with spaced repetition', priority: 'high',
  evaluate(profile, ctx) {
    const incorrectVocab = getIncorrectVocabulary();

    if (incorrectVocab.length >= 3) {
      // Check if it's time for spaced repetition
      const intervals = profile.config.spacedRepetitionIntervals;
      const now = Date.now();

      // Find vocab items due for review
      const dueItems: string[] = [];
      for (const vocab of [...new Set(incorrectVocab)]) {
        const lastAttempt = profile.recentPerformance
          .filter(r => r.domain === 'vocabulary' && r.questionType === vocab)
          .slice(-1)[0];

        if (lastAttempt) {
          const hoursSince = (now - new Date(lastAttempt.timestamp).getTime()) / (1000 * 60 * 60);
          const attemptCount = profile.recentPerformance.filter(r => r.questionType === vocab).length;
          const interval = intervals[Math.min(attemptCount, intervals.length - 1)];

          if (hoursSince >= interval) {
            dueItems.push(vocab);
          }
        }
      }

      if (dueItems.length > 0) {
        return adj(this.id, `${dueItems.length} vocabulary items due for spaced repetition review`, 'high');
      }
    }
    return ok(this.id);
  },
};

// ═══ 6. GrammarRecyclingRule ═══
export const grammarRecyclingRule: AdaptiveRule = {
  id: 'adp:grammar-recycling', name: 'Grammar Recycling', description: 'Recycles weak grammar structures', priority: 'high',
  evaluate(profile, ctx) {
    const incorrectGrammar = getIncorrectGrammar();

    if (incorrectGrammar.length >= 3) {
      // Find most common grammar topic
      const topicCounts: Record<string, number> = {};
      for (const g of incorrectGrammar) {
        topicCounts[g] = (topicCounts[g] || 0) + 1;
      }
      const topTopic = Object.entries(topicCounts).sort((a, b) => b[1] - a[1])[0];

      if (topTopic && topTopic[1] >= 2) {
        return adj(this.id, `Grammar topic "${topTopic[0]}" needs review (${topTopic[1]} errors)`, 'high');
      }
    }
    return ok(this.id);
  },
};

// ═══ 7. QuestionVarietyAdaptationRule ═══
export const questionVarietyAdaptationRule: AdaptiveRule = {
  id: 'adp:question-variety', name: 'Question Variety Adaptation', description: 'Avoids repeating same question types', priority: 'medium',
  evaluate(profile, ctx) {
    const recent = profile.recentPerformance.slice(-10);
    const types = recent.map(r => r.questionType || 'unknown');

    // Check if 4+ of last 5 are the same type
    const last5 = types.slice(-5);
    const typeCounts: Record<string, number> = {};
    for (const t of last5) typeCounts[t] = (typeCounts[t] || 0) + 1;

    for (const [type, count] of Object.entries(typeCounts)) {
      if (count >= 4 && type !== 'unknown') {
        return adj(this.id, `Question type "${type}" appears ${count}/5 times, add variety`, 'medium');
      }
    }
    return ok(this.id);
  },
};

// ═══ 8. ConfidenceAdjustmentRule ═══
export const confidenceAdjustmentRule: AdaptiveRule = {
  id: 'adp:confidence-adjustment', name: 'Confidence Adjustment', description: 'Adjusts difficulty after repeated failures/successes', priority: 'high',
  evaluate(profile, ctx) {
    // Reduce after failures
    if (profile.currentLossStreak >= 3) {
      return adj(this.id, `Confidence low: ${profile.currentLossStreak} consecutive failures, reduce difficulty`, 'high');
    }

    // Increase after sustained high accuracy
    if (profile.currentStreak >= 8 && profile.rollingAccuracy >= 0.9) {
      return adj(this.id, `Confidence high: ${profile.currentStreak} streak at ${Math.round(profile.rollingAccuracy * 100)}% accuracy`, 'medium');
    }

    return ok(this.id);
  },
};

// ═══ 9. ChallengeBalanceRule ═══
export const challengeBalanceRule: AdaptiveRule = {
  id: 'adp:challenge-balance', name: 'Challenge Balance', description: 'Maintains 70/20/10 challenge distribution', priority: 'medium',
  evaluate(profile, ctx) {
    const recent = profile.recentPerformance.slice(-30);
    if (recent.length < 10) return ok(this.id);

    const counts: Record<string, number> = { comfortable: 0, challenging: 0, stretch: 0 };
    for (const r of recent) {
      if (r.difficulty === 'remedial' || r.difficulty === 'foundation') counts.comfortable++;
      else if (r.difficulty === 'core') counts.challenging++;
      else counts.stretch++;
    }

    const total = recent.length;
    const ratio = profile.config.challengeRatio;

    // Check if too easy
    if (counts.comfortable / total > ratio.comfortable + 0.15) {
      return adj(this.id, `Too many comfortable questions (${Math.round(counts.comfortable / total * 100)}% vs target ${Math.round(ratio.comfortable * 100)}%)`, 'medium');
    }
    // Check if too hard
    if (counts.stretch / total > ratio.stretch + 0.15) {
      return adj(this.id, `Too many stretch questions (${Math.round(counts.stretch / total * 100)}% vs target ${Math.round(ratio.stretch * 100)}%)`, 'medium');
    }

    return ok(this.id);
  },
};

// ═══ 10. SessionFatigueRule ═══
export const sessionFatigueRule: AdaptiveRule = {
  id: 'adp:session-fatigue', name: 'Session Fatigue', description: 'Reduces complexity for long or failing sessions', priority: 'high',
  evaluate(profile, ctx) {
    if (isSessionFatigued(profile)) {
      const reasons: string[] = [];
      if (profile.sessionQuestionsAnswered > profile.config.maxSessionQuestions) reasons.push('session too long');
      if (profile.sessionFailures >= 5) reasons.push('many failures');
      const last5 = profile.recentPerformance.slice(-5);
      if (last5.length === 5 && last5.every(r => !r.correct)) reasons.push('rapid decline');

      return adj(this.id, `Session fatigue detected: ${reasons.join(', ')}. Reduce complexity.`, 'high');
    }
    return ok(this.id);
  },
};

// ═══ 11. LearningObjectiveRule ═══
export const learningObjectiveRule: AdaptiveRule = {
  id: 'adp:learning-objective', name: 'Learning Objective Alignment', description: 'Ensures questions map to learning objectives', priority: 'medium',
  evaluate(profile, ctx) {
    // Every skill domain should have been practiced recently
    const recent = profile.recentPerformance.slice(-30);
    const practicedDomains = new Set(recent.map(r => r.domain));

    const unpracticed = ALL_SKILLS.filter(s => !practicedDomains.has(s));
    if (unpracticed.length >= 2) {
      return adj(this.id, `${unpracticed.length} skills not practiced recently: ${unpracticed.join(', ')}`, 'medium');
    }
    if (unpracticed.length === 1) {
      return adj(this.id, `Skill "${unpracticed[0]}" not practiced recently`, 'low');
    }
    return ok(this.id);
  },
};

// ═══ 12. AdaptiveRecommendationRule ═══
export const adaptiveRecommendationRule: AdaptiveRule = {
  id: 'adp:adaptive-recommendation', name: 'Adaptive Recommendation', description: 'Recommends review/practice/advance/revision', priority: 'critical',
  evaluate(profile, ctx) {
    const accuracy = profile.rollingAccuracy;
    const weakSkills = getWeakestSkills(profile, 2);
    const weakScores = weakSkills.map(s => profile.skills.find(sk => sk.domain === s)?.score ?? 50);

    // Recommend revision if many skills are weak
    if (weakScores.every(s => s < 50)) {
      return adj(this.id, 'Recommend REVISION: multiple weak skills below 50%', 'critical');
    }

    // Recommend review if accuracy declining
    const recent10 = profile.recentPerformance.slice(-10);
    const older10 = profile.recentPerformance.slice(-20, -10);
    const recentAcc = recent10.filter(r => r.correct).length / Math.max(1, recent10.length);
    const olderAcc = older10.filter(r => r.correct).length / Math.max(1, older10.length);

    if (recentAcc < olderAcc - 0.2 && recent10.length >= 5) {
      return adj(this.id, 'Recommend REVIEW: declining accuracy trend', 'high');
    }

    // Recommend practice if plateauing
    if (accuracy >= 0.5 && accuracy < 0.8 && profile.totalQuestionsAnswered > 20) {
      return adj(this.id, 'Recommend PRACTICE: moderate accuracy, more practice needed', 'medium');
    }

    // Recommend advance if mastery achieved
    if (accuracy >= 0.9 && profile.totalQuestionsAnswered > 30) {
      return adj(this.id, 'Recommend ADVANCE: high accuracy sustained', 'high');
    }

    return ok(this.id);
  },
};

// ═══ Rule Pack ═══
export const allAdaptiveRules: AdaptiveRule[] = [
  difficultyAdjustmentRule,
  weakSkillFocusRule,
  masteryProgressionRule,
  repeatedMistakeRule,
  vocabularyRecyclingRule,
  grammarRecyclingRule,
  questionVarietyAdaptationRule,
  confidenceAdjustmentRule,
  challengeBalanceRule,
  sessionFatigueRule,
  learningObjectiveRule,
  adaptiveRecommendationRule,
];
