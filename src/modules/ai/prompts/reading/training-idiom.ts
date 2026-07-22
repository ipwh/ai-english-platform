// ============================================
// Idiom Inference 訓練模組 (P3)
// 對應 DSE Paper 1：用 context clues 推斷 idiom 意思
// 包含：常見 DSE idiom 庫、context clue 策略
// ============================================

import { HALLUCINATION_GUARD } from '@/modules/ai/services/hallucination-guard';

export const IDIOM_MODULE_VERSION = '1.0.0';

// ============================================
// Context Clue 策略
// ============================================
export const IDIOM_CONTEXT_STRATEGIES = {
  definitionClue: {
    title: '定義線索 (Definition Clue)',
    description: '文章中直接或間接解釋了 idiom 的意思。',
    signalWords: ['means', 'is', 'refers to', 'in other words', 'that is', 'i.e.'],
    example: '"He was nonchalant about the exam results, showing no concern whatsoever." → nonchalant = not concerned',
  },
  contrastClue: {
    title: '對比線索 (Contrast Clue)',
    description: '通過對比/轉折來暗示 idiom 的意思。',
    signalWords: ['but', 'however', 'although', 'on the other hand', 'unlike', 'whereas', 'instead'],
    example: '"Unlike his gregarious sister who loved parties, Tom was quite reserved." → gregarious = sociable (opposite of reserved)',
  },
  exampleClue: {
    title: '舉例線索 (Example Clue)',
    description: '通過例子來解釋 idiom 的含義。',
    signalWords: ['such as', 'for example', 'for instance', 'like', 'including'],
    example: '"Celestial bodies, such as the sun, moon, and stars, have fascinated humans for millennia." → celestial = relating to the sky/heavens',
  },
  causeEffectClue: {
    title: '因果線索 (Cause-Effect Clue)',
    description: '通過因果關係來理解 idiom。',
    signalWords: ['because', 'since', 'therefore', 'as a result', 'consequently', 'so'],
    example: '"The long drought caused the crops to wither; as a result, there was a severe famine." → wither = dry up and die',
  },
  toneClue: {
    title: '語氣線索 (Tone Clue)',
    description: '通過作者的語氣（正面/負面/中性）來推斷 idiom 的情感色彩。',
    indicators: ['Positive tone words: fortunately, luckily, amazingly', 'Negative tone words: unfortunately, sadly, disastrously'],
    example: '"The company\'s decision to cut corners on safety was met with widespread criticism." → cut corners = do something cheaply/poorly (negative connotation)',
  },
};

// ============================================
// 常見 DSE Idiom 庫
// ============================================
export const DSE_IDIOM_BANK = [
  // 日常用語
  { idiom: 'a piece of cake', meaningZh: '非常容易', meaningEn: 'very easy', category: 'daily' },
  { idiom: 'beat around the bush', meaningZh: '避重就輕；拐彎抹角', meaningEn: 'avoid talking about the main topic', category: 'daily' },
  { idiom: 'break the ice', meaningZh: '打破僵局/尷尬氣氛', meaningEn: 'to start a conversation in a social setting', category: 'social' },
  { idiom: 'cost an arm and a leg', meaningZh: '非常昂貴', meaningEn: 'very expensive', category: 'daily' },
  { idiom: 'cut corners', meaningZh: '偷工減料；走捷徑', meaningEn: 'do something in the easiest/cheapest way', category: 'work' },
  { idiom: 'hit the nail on the head', meaningZh: '一針見血；說中要害', meaningEn: 'describe exactly what is causing a situation', category: 'daily' },
  { idiom: 'let the cat out of the bag', meaningZh: '洩露秘密', meaningEn: 'reveal a secret unintentionally', category: 'daily' },
  { idiom: 'once in a blue moon', meaningZh: '千載難逢；極少發生', meaningEn: 'very rarely', category: 'daily' },
  { idiom: 'spill the beans', meaningZh: '爆料；說漏嘴', meaningEn: 'reveal secret information', category: 'daily' },
  { idiom: 'under the weather', meaningZh: '身體不適', meaningEn: 'feeling ill/sick', category: 'health' },

  // 學術/正式用語
  { idiom: 'a double-edged sword', meaningZh: '雙刃劍（有利有弊）', meaningEn: 'something that has both advantages and disadvantages', category: 'academic' },
  { idiom: 'a drop in the ocean', meaningZh: '滄海一粟；微不足道', meaningEn: 'a very small amount compared to what is needed', category: 'academic' },
  { idiom: 'bite the bullet', meaningZh: '硬著頭皮面對', meaningEn: 'force yourself to do something unpleasant', category: 'work' },
  { idiom: 'burn the midnight oil', meaningZh: '熬夜工作/學習', meaningEn: 'work/study late into the night', category: 'study' },
  { idiom: 'call it a day', meaningZh: '收工；到此為止', meaningEn: 'stop working on something', category: 'work' },
  { idiom: 'face the music', meaningZh: '面對後果/批評', meaningEn: 'accept the consequences of one\'s actions', category: 'daily' },
  { idiom: 'go the extra mile', meaningZh: '加倍努力', meaningEn: 'make a special effort beyond what is required', category: 'work' },
  { idiom: 'in the same boat', meaningZh: '同舟共濟；處境相同', meaningEn: 'in the same difficult situation as others', category: 'social' },
  { idiom: 'miss the boat', meaningZh: '錯失良機', meaningEn: 'miss an opportunity', category: 'daily' },
  { idiom: 'on the fence', meaningZh: '猶豫不決；中立', meaningEn: 'undecided about something', category: 'daily' },

  // DSE 歷屆曾出現的
  { idiom: 'fell on the wrong side of it', meaningZh: '犯法；觸犯法律', meaningEn: 'broke the law / was on the wrong side of the law', category: 'dse', year: 2020 },
  { idiom: 'a tongue-lashing', meaningZh: '嚴厲斥責', meaningEn: 'a severe scolding', category: 'dse', year: 2020 },
  { idiom: 'more a fad than a trend', meaningZh: '只是一時狂熱而非長遠趨勢', meaningEn: 'a temporary craze, not a lasting trend', category: 'dse', year: 2016 },
  { idiom: 'lucky charms and odd behaviours', meaningZh: '幸運物和奇怪行為（含諷刺語氣）', meaningEn: 'superstitious objects and peculiar actions (with sarcastic tone)', category: 'dse' },
  { idiom: 'kite-eating trees', meaningZh: '會「吃掉」風箏的樹（比喻樹會卡住風箏）', meaningEn: 'trees that get kites stuck in them (metaphorical)', category: 'dse', year: 2020 },
];

// ============================================
// Idiom 訓練提示生成
// ============================================
export function buildIdiomTrainingPrompt(params: {
  targetLevel: number;
  strategy: 'definition' | 'contrast' | 'example' | 'causeEffect' | 'tone' | 'mixed';
  count: number;
}): string {
  const { targetLevel, strategy, count } = params;

  const strategyMap: Record<string, { title: string; description: string; signalWords?: string[]; indicators?: string[]; example?: string }> = {
    definition: IDIOM_CONTEXT_STRATEGIES.definitionClue,
    contrast: IDIOM_CONTEXT_STRATEGIES.contrastClue,
    example: IDIOM_CONTEXT_STRATEGIES.exampleClue,
    causeEffect: IDIOM_CONTEXT_STRATEGIES.causeEffectClue,
    tone: IDIOM_CONTEXT_STRATEGIES.toneClue,
  };

  const strat = strategyMap[strategy];

  const stratInstructions = strat
    ? `
## Focus Strategy: ${strat.title}
${strat.description}
${strat.signalWords ? `Signal words: ${strat.signalWords.join(', ')}` : ''}
${strat.indicators ? strat.indicators.join('\n') : ''}
${strat.example ? `Example: ${strat.example}` : ''}
`
    : `
## Mixed Strategies
Use a variety of context clue strategies:
- Definition clues (直接解釋)
- Contrast clues (對比暗示)
- Example clues (舉例說明)
- Cause-effect clues (因果推斷)
- Tone clues (語氣推斷)
`;

  return `${HALLUCINATION_GUARD}

You are a DSE English Paper 1 Idiom & Vocabulary specialist. Generate idiom inference practice for HKDSE Level ${targetLevel} students.

## Why Idiom Inference Matters for DSE Paper 1
1. DSE passages frequently contain idioms and figurative expressions
2. HKEAA does NOT expect students to know all idioms beforehand
3. Students MUST use context clues to INFER meaning
4. The "look 2 sentences before + 2 sentences after" strategy is critical
5. Understanding the TONE (positive/negative/neutral) helps narrow down meaning
6. Even guessing half-correctly can earn partial marks

${stratInstructions}

## Key DSE Idiom Inference Strategy
When encountering an unknown idiom in DSE Paper 1:
1. Read the 2 sentences BEFORE the idiom
2. Read the 2 sentences AFTER the idiom
3. Determine the OVERALL TONE (positive/negative/neutral)
4. Look for contrast words (but, however) or explanation words (means, i.e.)
5. Make an educated guess based on context
6. If MCQ, eliminate obviously wrong options first

## Exercise Generation
Generate ${count} idiom/figurative-language inference exercises targeting Level ${targetLevel}.

### Each Exercise Should Include:
1. A short DSE-style passage (100-200 words) containing an idiom or figurative expression
2. The target idiom highlighted with line reference
3. Multiple choice options (A/B/C/D) testing meaning in context
4. Correct answer with explanation of context clues used
5. Strategy breakdown (which context clue strategy works)

### JSON Format:
{
  "exercises": [
    {
      "id": "idiom-1",
      "strategy": "definition|contrast|example|causeEffect|tone",
      "level": ${targetLevel},
      "passage": "Short passage with the idiom in context...",
      "targetIdiom": "the idiom phrase",
      "lineRef": "line 5",
      "question": "What does 'X' (line 5) mean as used in the passage?",
      "choices": ["A. ...", "B. ...", "C. ...", "D. ..."],
      "answer": "B",
      "explanationZh": "解釋上下文線索如何指向正確答案",
      "contextCluesUsed": ["clue1", "clue2"],
      "inferenceSteps": [
        "Step 1: Read 2 sentences before → found contrast word 'but'",
        "Step 2: Read 2 sentences after → found explanation 'that is'",
        "Step 3: Determined negative tone from word 'unfortunately'",
        "Step 4: Eliminated options A and D (positive tone)",
        "Step 5: Selected B based on context"
      ]
    }
  ]
}`;
}

// ============================================
// Idiom 技巧提示（顯示給學生）
// ============================================
export function getIdiomTips(): string[] {
  return [
    '💡 不要驚慌！HKEAA 不期望你認識所有 idioms',
    '💡 「看前 2 句 + 後 2 句」是 DSE 黃金策略',
    '💡 先判斷 idiom 的語氣：正面/負面/中性？',
    '💡 找對比詞 (but, however) — 通常前後句意思相反',
    '💡 找解釋詞 (means, i.e., that is) — 可能直接定義了 idiom',
    '💡 找因果詞 (because, therefore) — 因果關係可揭示意思',
    '💡 MC 題：先用 elimination 排除明顯錯誤選項',
    '💡 即使不完全理解，估中一半也可能拿到半分',
    '💡 平時多看 The Guardian, BBC, SCMP 累積 idioms',
    '💡 做 past paper 遇到 idiom 立即記錄在「Idiom 簿」',
  ];
}

// ============================================
// DSE 出現過的 Idiom 列表（快速查閱）
// ============================================
export function getDSEidiomQuickReference(): string {
  const dseIdioms = DSE_IDIOM_BANK.filter(i => i.category === 'dse');
  return dseIdioms.map(i =>
    `- **${i.idiom}** (${i.year || 'DSE'}) — ${i.meaningZh} — ${i.meaningEn}`
  ).join('\n');
}

// ============================================
// Context Clue Checklist for Students
// ============================================
export function getContextClueChecklist(): string[] {
  return [
    '☐ 看了 idiom 前的 2 句嗎？',
    '☐ 看了 idiom 後的 2 句嗎？',
    '☐ 判斷了 idiom 的語氣（+/-/中性）嗎？',
    '☐ 找到了對比詞 (but, however, although) 嗎？',
    '☐ 找到了解釋詞 (means, i.e., that is) 嗎？',
    '☐ 找到了舉例詞 (such as, for example) 嗎？',
    '☐ 找到了因果詞 (because, therefore) 嗎？',
    '☐ 用 elimination 排除了明顯錯誤的選項嗎？',
    '☐ 將答案代入原文檢查是否合理？',
    '☐ 如果不確定，選了最合理的選項而非留空？',
  ];
}
