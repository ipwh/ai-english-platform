// Sprint 22: Recommendation Reason Generator — deterministic bilingual reasons
import type { Recommendation, RecommendationInput } from '../types';

// ============================================
// Reason Templates
// ============================================

interface ReasonTemplate {
  en: (r: Recommendation, ctx: ReasonContext) => string;
  zh: (r: Recommendation, ctx: ReasonContext) => string;
}

interface ReasonContext {
  input: RecommendationInput;
  now: Date;
}

const templates: Record<string, ReasonTemplate> = {
  'weakness-exercise': {
    en: (r, ctx) => {
      const m = ctx.input.masteryScores.find(s => s.nodeId === r.nodeId);
      const gap = m ? m.masteryThreshold - m.currentMastery : 0;
      return `Weak area identified: ${r.title} (mastery ${m?.currentMastery ?? '?'}%, needs ${m?.masteryThreshold ?? 70}%). ${gap >= 30 ? 'Critical gap — prioritize this.' : 'Moderate weakness — recommended practice.'}`;
    },
    zh: (r, ctx) => {
      const m = ctx.input.masteryScores.find(s => s.nodeId === r.nodeId);
      const gap = m ? m.masteryThreshold - m.currentMastery : 0;
      return `已識別弱項：${r.titleZh}（掌握度 ${m?.currentMastery ?? '?'}%，目標 ${m?.masteryThreshold ?? 70}%）。${gap >= 30 ? '差距較大，建議優先處理。' : '中等弱項，建議練習。'}`;
    },
  },

  'spaced-repetition': {
    en: (r, ctx) => {
      const m = ctx.input.masteryScores.find(s => s.nodeId === r.nodeId);
      return `Spaced repetition: ${r.title} was last practiced ${m?.daysSinceLastPractice ?? '?'} days ago. Regular review strengthens long-term memory.`;
    },
    zh: (r, ctx) => {
      const m = ctx.input.masteryScores.find(s => s.nodeId === r.nodeId);
      return `間隔重溫：${r.titleZh} 上次練習在 ${m?.daysSinceLastPractice ?? '?'} 天前。定期複習有助鞏固長期記憶。`;
    },
  },

  'mistake-review': {
    en: (r, ctx) => {
      const total = ctx.input.mistakeStats.totalMistakes;
      return `Based on your ${total} recent mistake${total !== 1 ? 's' : ''}: focusing on ${r.title} to address error patterns.`;
    },
    zh: (r, ctx) => {
      return `根據你近期 ${ctx.input.mistakeStats.totalMistakes} 個錯誤：專注練習 ${r.titleZh} 以改善錯誤模式。`;
    },
  },

  'topic-preference': {
    en: (r, ctx) => {
      const top = ctx.input.preferredTopics[0];
      return `Aligned with your interest in "${top?.topic ?? 'various topics'}": ${r.title}. Learning through topics you enjoy improves engagement.`;
    },
    zh: (r, ctx) => {
      const top = ctx.input.preferredTopics[0];
      return `配合你對「${top?.topic ?? '各類主題'}」的興趣：${r.titleZh}。透過感興趣的主題學習可提升投入度。`;
    },
  },

  'learning-path': {
    en: (r, _ctx) => {
      return `Next step in your curriculum progression: ${r.title}. This builds on skills you've already mastered.`;
    },
    zh: (r, _ctx) => {
      return `課程進度的下一步：${r.titleZh}。這建基於你已掌握的技能之上。`;
    },
  },

  'vocabulary-review': {
    en: (_r, ctx) => {
      const due = ctx.input.learningProfile.vocabularyStats.dueForReview;
      const mastered = ctx.input.learningProfile.vocabularyStats.mastered;
      return `Vocabulary SRS review: ${due} words due for review (${mastered} mastered). Consistent review prevents forgetting.`;
    },
    zh: (_r, ctx) => {
      const due = ctx.input.learningProfile.vocabularyStats.dueForReview;
      const mastered = ctx.input.learningProfile.vocabularyStats.mastered;
      return `詞彙 SRS 複習：${due} 個詞彙到期複習（${mastered} 個已掌握）。持續複習可防止遺忘。`;
    },
  },

  'skill-specific': {
    en: (r, _ctx) => {
      const skillNames: Record<string, string> = { reading: 'Reading', writing: 'Writing', listening: 'Listening', speaking: 'Speaking' };
      return `Focused ${skillNames[r.skill] || r.skill} practice: ${r.title}. Targeted skill development for balanced improvement.`;
    },
    zh: (r, _ctx) => {
      const skillNames: Record<string, string> = { reading: '閱讀', writing: '寫作', listening: '聆聽', speaking: '口語' };
      return `專注${skillNames[r.skill] || r.skill}練習：${r.titleZh}。針對性技能發展以達至均衡進步。`;
    },
  },

  'streak-maintenance': {
    en: (_r, ctx) => {
      const streak = ctx.input.learningProfile.currentStreak;
      return `Keep your ${streak}-day learning streak alive! A quick exercise maintains your momentum and builds consistency.`;
    },
    zh: (_r, ctx) => {
      const streak = ctx.input.learningProfile.currentStreak;
      return `保持你 ${streak} 天的連續學習記錄！快速練習可維持動力及建立持續性。`;
    },
  },
};

// ============================================
// Default template fallback
// ============================================

const defaultTemplate: ReasonTemplate = {
  en: (r, _ctx) => `Recommended: ${r.title} — based on your learning profile analysis.`,
  zh: (r, _ctx) => `推薦：${r.titleZh} — 根據你的學習檔案分析。`,
};

// ============================================
// Main Generator
// ============================================

export function generateReasons(
  recommendation: Recommendation,
  input: RecommendationInput,
): { reason: string; reasonZh: string } {
  const ctx: ReasonContext = { input, now: new Date() };
  const template = templates[recommendation.strategy] || defaultTemplate;

  return {
    reason: template.en(recommendation, ctx),
    reasonZh: template.zh(recommendation, ctx),
  };
}

/**
 * Batch-generate reasons for all recommendations and return updated copies.
 */
export function enrichRecommendations(
  recommendations: Recommendation[],
  input: RecommendationInput,
): Recommendation[] {
  return recommendations.map(rec => {
    const { reason, reasonZh } = generateReasons(rec, input);
    return { ...rec, reason, reasonZh };
  });
}
