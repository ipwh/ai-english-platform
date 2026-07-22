// ============================================
// Paraphrase 技能訓練模組 (P2)
// 對應 DSE Paper 1 核心技能：改寫/同義轉換
// 包含：詞性轉換、主被動轉換、句式變換
// ============================================

import { HALLUCINATION_GUARD } from '@/modules/ai/services/hallucination-guard';

export const PARAPHRASE_MODULE_VERSION = '1.0.0';

// ============================================
// Paraphrase 核心技巧
// ============================================
export const PARAPHRASE_TECHNIQUES = {
  synonymSubstitution: {
    title: '同義詞替換 (Synonym Substitution)',
    description: '用同義詞替換原文中的關鍵詞，是 paraphrase 最基本的技巧。',
    examples: [
      { original: 'The plan failed due to lack of support.', paraphrased: 'The plan was unsuccessful because there was insufficient support.' },
      { original: 'Many people think that...', paraphrased: 'It is widely believed that...' },
      { original: 'The government should...', paraphrased: 'It is suggested that the government...' },
    ],
  },
  voiceTransformation: {
    title: '主被動轉換 (Active ↔ Passive Voice)',
    description: '在主動語態和被動語態之間轉換，是 DSE 常見的 paraphrase 技巧。',
    rules: [
      'Active: Subject + Verb + Object → Passive: Object + be + V-ed + by Subject',
      '注意 tense 保持一致',
      '不一定要保留 "by..."，若 agent 不重要可省略',
    ],
  },
  wordFormTransformation: {
    title: '詞性轉換 (Word Form Transformation)',
    description: '將詞語在名詞、動詞、形容詞、副詞之間轉換，改變句子結構但不改變意思。',
    patterns: [
      'Verb → Noun: decide → decision, develop → development',
      'Adjective → Noun: important → importance, different → difference',
      'Verb → Adjective: interest → interesting/interested',
      'Noun → Verb: conclusion → conclude, analysis → analyze',
    ],
  },
  sentenceStructureVariation: {
    title: '句式變換 (Sentence Structure Variation)',
    description: '改變句子結構：簡單句 ↔ 複合句 ↔ 複雜句之間的轉換。',
    patterns: [
      'Simple → Complex: 加入關係代詞 (which, that, who)',
      'Because/Since → Due to/As a result of (因果關係重組)',
      'Although → Despite/In spite of (讓步關係重組)',
      'If → Unless (條件關係重組)',
    ],
  },
  clauseToPhrase: {
    title: '子句 ↔ 短語轉換 (Clause ↔ Phrase)',
    description: '將子句簡化為短語，或將短語擴展為子句。這是 DSE 高階 paraphrase 技巧。',
    examples: [
      { original: 'When he arrived at the station, the train had left.', paraphrased: 'On arriving at the station, he found the train had left.' },
      { original: 'The man who is standing there is my teacher.', paraphrased: 'The man standing there is my teacher.' },
    ],
  },
};

// ============================================
// Paraphrase 訓練提示生成
// ============================================
export function buildParaphraseTrainingPrompt(params: {
  targetLevel: number;
  focusArea: 'synonym' | 'voice' | 'wordForm' | 'sentenceStructure' | 'clausePhrase' | 'mixed';
  count: number;
}): string {
  const { targetLevel, focusArea, count } = params;

  const techniqueMap: Record<string, { title: string; description: string; examples?: { original: string; paraphrased: string }[]; rules?: string[]; patterns?: string[] }> = {
    synonym: PARAPHRASE_TECHNIQUES.synonymSubstitution,
    voice: PARAPHRASE_TECHNIQUES.voiceTransformation,
    wordForm: PARAPHRASE_TECHNIQUES.wordFormTransformation,
    sentenceStructure: PARAPHRASE_TECHNIQUES.sentenceStructureVariation,
    clausePhrase: PARAPHRASE_TECHNIQUES.clauseToPhrase,
  };

  const technique = techniqueMap[focusArea];

  const focusInstructions = technique
    ? `
## Focus Area: ${technique.title}
${technique.description}
${technique.examples ? technique.examples.map((e: { original: string; paraphrased: string }) => `- "${e.original}" → "${e.paraphrased}"`).join('\n') : ''}
${technique.rules ? technique.rules.map((r: string) => `- ${r}`).join('\n') : ''}
${technique.patterns ? technique.patterns.map((p: string) => `- ${p}`).join('\n') : ''}
`
    : `
## Mixed Practice
Include a balanced mix of all paraphrase techniques: synonym substitution, voice transformation, word form transformation, sentence structure variation, and clause-to-phrase conversion.
`;

  return `${HALLUCINATION_GUARD}

You are a DSE English Paper 1 Paraphrase specialist. Generate targeted paraphrase practice for HKDSE Level ${targetLevel} students.

## Why Paraphrase Matters for DSE Paper 1
1. DSE answers often require paraphrasing — directly copying from the passage may lose marks
2. Marking schemes reward "in your own words" answers where specified
3. Grammar mistakes in paraphrased answers WILL cost marks
4. Good paraphrase = same meaning + different words/structure + correct grammar

${focusInstructions}

## Exercise Generation
Generate ${count} paraphrase exercises targeting HKDSE Level ${targetLevel}.

### Each Exercise Should Include:
1. An original sentence from a DSE-style passage
2. A paraphrase task with clear instructions
3. Model answer (the best paraphrase)
4. Common student mistakes to avoid

### DSE Exam Tip:
In DSE Paper 1, when answering long questions:
- Use KEYWORDS from the passage (don't change technical terms)
- Paraphrase the surrounding structure
- Keep the answer concise and accurate
- NEVER change the original meaning

### JSON Format:
{
  "exercises": [
    {
      "id": "para-1",
      "technique": "synonym|voice|wordForm|sentenceStructure|clausePhrase",
      "level": ${targetLevel},
      "originalSentence": "Original sentence from a DSE-style passage",
      "context": "Optional: 1-2 sentences of surrounding context",
      "instruction": "Paraphrase the underlined sentence without changing its meaning.",
      "modelAnswer": "Best paraphrase",
      "explanationZh": "說明用了什麼 paraphrase 技巧",
      "commonMistakes": ["常見錯誤1", "常見錯誤2"],
      "grammarNote": "Important grammar point to note"
    }
  ]
}`;
}

// ============================================
// Paraphrase 技巧提示（顯示給學生）
// ============================================
export function getParaphraseTips(): string[] {
  return [
    '💡 保留關鍵詞 (technical terms, proper nouns) 不改寫',
    '💡 改變句子結構而非只換單字',
    '💡 主被動轉換是最安全的 paraphrase 方法',
    '💡 詞性轉換可大幅改變句子結構',
    '💡 "Many people think that..." → "It is widely believed that..."',
    '💡 因果關係：because → due to / as a result of / owing to',
    '💡 讓步關係：although → despite / in spite of',
    '💡 在 DSE 答題中，用原文關鍵字 + 自己的句式 = 最穩陣',
    '💡 改寫後務必檢查 grammar（tense, 單複數, article）',
    '💡 Paraphrase 不是越長越好——保持 concise',
  ];
}

// ============================================
// Paraphrase 常見句式轉換模板
// ============================================
export const PARAPHRASE_PATTERNS = [
  {
    category: '因果 (Cause-Effect)',
    patterns: [
      { from: 'X because Y', to: 'Due to Y, X / X as a result of Y' },
      { from: 'X causes Y', to: 'Y is caused by X / X leads to Y / X results in Y' },
      { from: 'X, so Y', to: 'X; therefore, Y / X. As a result, Y' },
    ],
  },
  {
    category: '讓步 (Concession)',
    patterns: [
      { from: 'Although X, Y', to: 'Despite X, Y / In spite of X, Y' },
      { from: 'X. However, Y', to: 'While X, Y / X, yet Y' },
    ],
  },
  {
    category: '條件 (Condition)',
    patterns: [
      { from: 'If X, Y', to: 'Unless (not X), Y / Should X happen, Y' },
      { from: 'Without X, Y', to: 'If there is no X, Y / If X is not present, Y' },
    ],
  },
  {
    category: '目的 (Purpose)',
    patterns: [
      { from: 'X in order to Y', to: 'X so that Y / X with the aim of Y / X for the purpose of Y' },
      { from: 'X to Y', to: 'X so as to Y / X in order that Y' },
    ],
  },
  {
    category: '意見 (Opinion)',
    patterns: [
      { from: 'I think X', to: 'In my opinion, X / From my perspective, X / It seems to me that X' },
      { from: 'Many people believe X', to: 'It is widely believed that X / There is a common belief that X' },
    ],
  },
];
