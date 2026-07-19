// Sprint 35: ExplanationAdapter — level-adapted explanations
import type {
  PersonalizationContext,
} from '../types';

// ============================================
// ExplanationAdapter
// ============================================

export class ExplanationAdapter {

  /** Adapt explanation complexity to student level */
  adapt(opts: {
    ctx: PersonalizationContext;
    topic: string;
    topicZh: string;
    concept: string; // The specific concept to explain
    conceptZh?: string;
    mistakeType?: string;
  }): {
    explanation: string;
    explanationZh: string;
    complexity: 'basic' | 'intermediate' | 'advanced';
    examples: string[];
    examplesZh: string[];
    memoryTip: string;
    memoryTipZh: string;
  } {
    const { ctx, topic, topicZh, concept, conceptZh, mistakeType } = opts;

    // Determine complexity from CEFR level and mastery
    const cefrLevel = ctx.cefrLevel || 'B1';
    const complexity = this.determineComplexity(cefrLevel, ctx.gradeLevel);

    const explanation = this.buildExplanation(complexity, concept, topic, mistakeType);
    const explanationZh = this.buildExplanationZh(complexity, conceptZh || concept, topicZh, mistakeType);

    const examples = this.getExamples(concept, complexity);
    const examplesZh = this.getExamplesZh(conceptZh || concept, complexity);

    const memoryTip = this.getMemoryTip(concept, mistakeType);
    const memoryTipZh = this.getMemoryTipZh(conceptZh || concept, mistakeType);

    return {
      explanation, explanationZh, complexity,
      examples, examplesZh, memoryTip, memoryTipZh,
    };
  }

  private determineComplexity(cefr: string, gradeLevel: string): 'basic' | 'intermediate' | 'advanced' {
    const levelOrder = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
    const idx = levelOrder.indexOf(cefr);
    const gradeNum = parseInt(gradeLevel.slice(1));

    if (idx <= 1 || gradeNum <= 2) return 'basic';
    if (idx <= 3 || gradeNum <= 4) return 'intermediate';
    return 'advanced';
  }

  private buildExplanation(
    complexity: string, concept: string, topic: string, mistakeType?: string,
  ): string {
    switch (complexity) {
      case 'basic':
        return `${concept} is about ${topic}. Think of it like this: ${this.simpleAnalogy(concept)}`;
      case 'intermediate':
        return `${concept} is an important part of ${topic}. The key rule is: ${this.intermediateRule(concept, mistakeType)}`;
      case 'advanced':
        return `${concept} in ${topic}: ${this.advancedExplanation(concept, mistakeType)}`;
      default:
        return `${concept} is about ${topic}.`;
    }
  }

  private buildExplanationZh(
    complexity: string, concept: string, topic: string, mistakeType?: string,
  ): string {
    switch (complexity) {
      case 'basic':
        return `「${concept}」是關於${topic}的。可以這樣理解：${this.simpleAnalogyZh(concept)}`;
      case 'intermediate':
        return `「${concept}」是${topic}的重要部分。關鍵規則是：${this.intermediateRuleZh(concept, mistakeType)}`;
      case 'advanced':
        return `「${concept}」在${topic}中的應用：${this.advancedExplanationZh(concept, mistakeType)}`;
      default:
        return `「${concept}」是關於${topic}的。`;
    }
  }

  private simpleAnalogy(concept: string): string {
    const analogies: Record<string, string> = {
      'tenses': 'time markers like "yesterday" = past, "now" = present, "tomorrow" = future',
      'articles': '"a/an" = any one, "the" = specific one',
      'prepositions': 'position words like "on" the table, "in" the box',
      'conditionals': '"if this happens, then that will happen"',
      'passive-voice': 'focus on what happened, not who did it',
    };
    return analogies[concept] || 'a simple rule you can remember';
  }

  private simpleAnalogyZh(concept: string): string {
    const analogies: Record<string, string> = {
      'tenses': '時間標記如「昨天」= 過去，「現在」= 現在，「明天」= 將來',
      'articles': '「a/an」= 任何一個，「the」= 特定那一個',
      'prepositions': '位置詞如「在桌上」、「在盒裡」',
      'conditionals': '「如果這樣，就會那樣」',
      'passive-voice': '重點在發生了什麼，而不是誰做的',
    };
    return analogies[concept] || '一個簡單易記的規則';
  }

  private intermediateRule(concept: string, mistakeType?: string): string {
    if (mistakeType === 'tense') return 'Match the verb form to the time expression. Present perfect needs "have/has + past participle".';
    if (mistakeType === 'subject-verb-agreement') return 'Singular subjects need singular verbs (add -s/-es). Plural subjects use base form.';
    return `Understand the pattern behind "${concept}" and practice with varied examples.`;
  }

  private intermediateRuleZh(concept: string, mistakeType?: string): string {
    if (mistakeType === 'tense') return '動詞形式要配合時間表達。現在完成式需要「have/has + 過去分詞」。';
    return `理解「${concept}」背後的形式，並用不同例子練習。`;
  }

  private advancedExplanation(concept: string, mistakeType?: string): string {
    return `"${concept}" requires understanding of both form and function. Analyze the context to determine the correct usage. Common errors include: ${mistakeType || 'form-function mismatch'}. Compare with similar structures to deepen understanding.`;
  }

  private advancedExplanationZh(concept: string, mistakeType?: string): string {
    return `「${concept}」需要同時理解形式和功能。分析上下文以確定正確用法。常見錯誤包括：${mistakeType || '形式與功能不匹配'}。與類似結構比較以加深理解。`;
  }

  private getExamples(concept: string, complexity: string): string[] {
    const examples: Record<string, string[]> = {
      'tenses': ['I walked to school yesterday.', 'I am walking now.', 'I will walk tomorrow.'],
      'articles': ['I saw a dog.', 'The dog was brown.'],
      'conditionals': ['If it rains, I will stay home.', 'If I were you, I would study.'],
      'passive-voice': ['The cake was baked by mom.', 'English is spoken worldwide.'],
    };
    return examples[concept] || [`Example of ${concept} in context.`];
  }

  private getExamplesZh(concept: string, complexity: string): string[] {
    const examples: Record<string, string[]> = {
      'tenses': ['我昨天走路去學校。', '我現在正在走路。', '我明天會走路去。'],
      'articles': ['我看見一隻狗。', '那隻狗是棕色的。'],
      'conditionals': ['如果下雨，我會留在家。', '如果我是你，我會努力學習。'],
    };
    return examples[concept] || [`「${concept}」的例句。`];
  }

  private getMemoryTip(concept: string, mistakeType?: string): string {
    return `💡 Memory tip: Connect "${concept}" to a real-life situation. The more personal the connection, the better you'll remember.`;
  }

  private getMemoryTipZh(concept: string, mistakeType?: string): string {
    return `💡 記憶提示：將「${concept}」與真實生活情境聯繫起來。聯繫越個人化，記憶越深刻。`;
  }
}

export const explanationAdapter = new ExplanationAdapter();
