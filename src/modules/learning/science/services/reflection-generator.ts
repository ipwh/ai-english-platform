// Sprint 33: ReflectionGenerator — metacognitive prompt generation
import type { ReviewScheduleEntry } from '../types';

// ============================================
// ReflectionGenerator — prompts for metacognition
// ============================================

export class ReflectionGenerator {
  private readonly BEFORE_TEMPLATES_EN = [
    "What do you already know about '{topic}'?",
    "Predict how well you'll do on '{topic}'. Rate your confidence 1-5.",
    "What strategy will you use to learn '{topic}'?",
    "What was the hardest part of '{topic}' last time?",
    "How does '{topic}' connect to what you learned before?",
  ];

  private readonly BEFORE_TEMPLATES_ZH = [
    "關於「{topic}」，你已經知道什麼？",
    "預測你在「{topic}」的表現。給自己 1-5 分信心評分。",
    "你會用什麼策略來學習「{topic}」？",
    "上次學習「{topic}」時最困難的部分是什麼？",
    "「{topic}」如何與你之前學過的內容連結？",
  ];

  private readonly AFTER_TEMPLATES_EN = [
    "How did your actual performance compare to your prediction?",
    "What was the most surprising thing you learned?",
    "Which question was hardest and why?",
    "What would you do differently next time?",
    "Write one sentence summarizing what you learned about '{topic}'.",
    "What's still unclear about '{topic}'?",
    "How confident are you that you could teach '{topic}' to someone else?",
  ];

  private readonly AFTER_TEMPLATES_ZH = [
    "你的實際表現與預測相比如何？",
    "你學到最令你驚訝的是什麼？",
    "哪一題最難？為什麼？",
    "下次你會做什麼不同的改變？",
    "用一句話總結你學到關於「{topic}」的內容。",
    "關於「{topic}」還有什麼不清楚的地方？",
    "你有多大信心可以向別人解釋「{topic}」？",
  ];

  /** Generate before-practice reflection prompts */
  beforePractice(
    entries: ReviewScheduleEntry[],
    count = 3,
    language: 'en' | 'zh' = 'en',
  ): string[] {
    const templates = language === 'zh' ? this.BEFORE_TEMPLATES_ZH : this.BEFORE_TEMPLATES_EN;
    const topics = this.extractTopics(entries);

    return this.pickRandom(templates, count).map(t =>
      t.replace('{topic}', topics[Math.floor(Math.random() * topics.length)] || 'this topic'),
    );
  }

  /** Generate after-practice reflection prompts */
  afterPractice(
    entries: ReviewScheduleEntry[],
    count = 4,
    language: 'en' | 'zh' = 'en',
  ): string[] {
    const templates = language === 'zh' ? this.AFTER_TEMPLATES_ZH : this.AFTER_TEMPLATES_EN;
    const topics = this.extractTopics(entries);

    return this.pickRandom(templates, count).map(t =>
      t.replace('{topic}', topics[Math.floor(Math.random() * topics.length)] || 'this topic'),
    );
  }

  /** Generate a reflection prompt for a specific item based on its state */
  generateItemReflection(entry: ReviewScheduleEntry, language: 'en' | 'zh' = 'en'): string {
    if (entry.lapses >= 2) {
      return language === 'zh'
        ? `你已經忘記「${entry.titleZh || entry.itemId}」${entry.lapses} 次了。你認為是什麼原因？可以嘗試不同的記憶方法嗎？`
        : `You've forgotten "${entry.title || entry.itemId}" ${entry.lapses} times. What do you think is the reason? Can you try a different memorization method?`;
    }
    if (entry.isMastered) {
      return language === 'zh'
        ? `你已掌握「${entry.titleZh || entry.itemId}」！試試向別人解釋這個概念，以鞏固你的理解。`
        : `You've mastered "${entry.title || entry.itemId}"! Try explaining this concept to someone else to solidify your understanding.`;
    }
    if (entry.retrievalStrength < 0.3) {
      return language === 'zh'
        ? `「${entry.titleZh || entry.itemId}」的提取強度較低。嘗試在 24 小時內再次練習，以加強記憶。`
        : `Retrieval strength for "${entry.title || entry.itemId}" is low. Try practicing again within 24 hours to strengthen memory.`;
    }
    return language === 'zh'
      ? `花 30 秒回想你學到關於「${entry.titleZh || entry.itemId}」的三件事。`
      : `Take 30 seconds to recall three things you learned about "${entry.title || entry.itemId}".`;
  }

  /** Combine before + after + per-item reflections into a session prompt set */
  generateSessionReflections(
    entries: ReviewScheduleEntry[],
    language: 'en' | 'zh' = 'en',
  ): { before: string[]; after: string[]; perItem: Record<string, string> } {
    const perItem: Record<string, string> = {};
    for (const e of entries.slice(0, 5)) {
      perItem[e.itemId] = this.generateItemReflection(e, language);
    }

    return {
      before: this.beforePractice(entries, 2, language),
      after: this.afterPractice(entries, 3, language),
      perItem,
    };
  }

  private extractTopics(entries: ReviewScheduleEntry[]): string[] {
    const topics = new Set<string>();
    for (const e of entries) {
      if (e.title) topics.add(e.title);
      else if (e.titleZh) topics.add(e.titleZh);
      else if (e.skillDimension) topics.add(e.skillDimension);
    }
    const arr = [...topics];
    return arr.length > 0 ? arr : ['English'];
  }

  private pickRandom<T>(arr: T[], count: number): T[] {
    const shuffled = [...arr].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(count, arr.length));
  }
}

export const reflectionGenerator = new ReflectionGenerator();
