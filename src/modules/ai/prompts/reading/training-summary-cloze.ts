// ============================================
// Summary Cloze 專項訓練模組 (P2)
// 對應 DSE Paper 1 最難題型：撮要填充
// 包含：詞性判斷、Participial Modifier 陷阱、同主語驗證
// ============================================

import { HALLUCINATION_GUARD } from '@/modules/ai/services/hallucination-guard';

export const SUMMARY_CLOZE_MODULE_VERSION = '1.0.0';

// ============================================
// Summary Cloze 核心技巧
// ============================================
export const SUMMARY_CLOZE_TECHNIQUES = {
  partOfSpeech: {
    title: '詞性敏感度訓練 (Part of Speech Sensitivity)',
    description: '先判斷空格所需的詞性 (noun/verb/adjective/adverb/preposition/conjunction)，大幅縮小答案範圍。',
    rules: [
      '名詞 (n.): 空格前有 article (a/an/the)、形容詞、或介詞',
      '動詞 (v.): 空格在主語後、助動詞後、或 to 後',
      '形容詞 (adj.): 空格在各詞前或 be/look/seem 後',
      '副詞 (adv.): 空格修飾動詞/形容詞/整個句子',
      '介詞 (prep.): 空格在各詞/動詞後形成短語',
      '連接詞 (conj.): 空格連接兩個子句',
    ],
    dseExample: '2020 DSE: "It took _(ii)_ to make the modifications" — 空格在 took 後，需要名詞短語作賓語',
  },
  participialModifier: {
    title: 'Participial Modifier 陷阱 (Ving/Ved 作修飾語)',
    description: 'DSE Summary Cloze 最常見陷阱：Ving/Ved 用作 adjective/modifier 而非 tense（進行式/被動式）',
    trap: '很多考生把 Ving 誤認為「進行式」而填錯。實際上 Ving 可以是形容語（修飾名詞）或狀語（修飾主句）。',
    examples: [
      {
        text: 'Bars specializing in online games have caught on.',
        question: 'We are a bar _________ in online games.',
        answer: 'specializing',
        explanation: 'specializing 是 present participle 作 adjective 修飾 bar，不是進行式。',
        commonMistake: 'specialized (誤以為被動)',
      },
    ],
    keyRule: '前面的 modifier 子句（Ving 開頭），其 implied subject 必須與主句 subject 一致。',
    dseExample: '2018 DSE: "So, ________ his portly images online, he was extremely angry." — 答案不是 posting，因為是他自己看到，所以答案是 seeing/finding/discovering。',
  },
  sameSubjectCheck: {
    title: '同主語驗證 (Same Subject Check)',
    description: '當 modifier 子句在主句之前，必須檢查 modifier 的 implied subject 是否與主句 subject 一致。',
    method: [
      '1. 找出主句的 subject',
      '2. 確認 modifier 子句的 implied subject',
      '3. 兩者是否一致？若不一致，答案必定錯誤',
    ],
  },
  clozeLocation: {
    title: '定位技巧 (Location Strategy)',
    description: 'Summary Cloze 不需要從頭讀到尾。有三種定位方法：',
    strategies: [
      '指明段落：直接鎖定指定段落',
      '未指明段落：答案在上一題和下一題的答案位置之間',
      '全文歸納：留到最後才做，因為做完其他題目後對文章已有深入理解',
    ],
  },
};

// ============================================
// Summary Cloze 練習生成提示
// ============================================
export function buildSummaryClozeTrainingPrompt(params: {
  targetLevel: number;
  focusArea: 'partOfSpeech' | 'participialModifier' | 'sameSubjectCheck' | 'mixed';
  count: number;
}): string {
  const { targetLevel, focusArea, count } = params;

  const technique = focusArea === 'partOfSpeech' ? SUMMARY_CLOZE_TECHNIQUES.partOfSpeech
    : focusArea === 'participialModifier' ? SUMMARY_CLOZE_TECHNIQUES.participialModifier
    : focusArea === 'sameSubjectCheck' ? SUMMARY_CLOZE_TECHNIQUES.sameSubjectCheck
    : null;

  // Build focus instructions safely across union types
  let focusInstructions: string;
  if (technique) {
    const parts: string[] = [];
    parts.push(`## Focus Area: ${technique.title}`);
    parts.push(technique.description);
    if ('rules' in technique && Array.isArray(technique.rules)) {
      parts.push(...technique.rules.map((r: string) => `- ${r}`));
    }
    if ('trap' in technique && technique.trap) {
      parts.push(`### ⚠️ Common Trap:`);
      parts.push(technique.trap);
    }
    if ('keyRule' in technique && technique.keyRule) {
      parts.push(`### Key Rule:`);
      parts.push(technique.keyRule);
    }
    focusInstructions = '\n' + parts.join('\n') + '\n';
  } else {
    focusInstructions = `
## Mixed Practice
Include a balanced mix of:
- Part of speech identification (詞性判斷)
- Participial modifier traps (Ving/Ved 陷阱)
- Same subject verification (同主語驗證)
`;
  }

  return `${HALLUCINATION_GUARD}

You are a DSE English Paper 1 Summary Cloze specialist. Generate targeted practice for the most challenging question type in DSE Reading.

## Summary Cloze Core Principles
1. **Part of Speech First**: Always determine the required part of speech before looking for the answer
2. **Ving ≠ Present Continuous**: Present/Past participles are often used as adjectives/modifiers, NOT as tenses
3. **Same Subject Rule**: A modifier clause before the main clause MUST share the same subject as the main clause
4. **Context is Key**: The answer must fit BOTH grammatically and semantically in the summary
5. **Word Limit**: DSE typically requires "ONE word" or "no more than THREE words"

### Phase 4C: Copy / Change / Create Answer Modes
Every gap belongs to one of three modes:
- **copy**: The exact word exists in the passage and fits without change
- **change**: The word exists but needs tense/number/part-of-speech adjustment
- **create**: The word does NOT appear; must be inferred from context

For each exercise, ensure:
- At least 30% of gaps are "change" or "create" mode
- Each gap has clear grammar cues (articles before nouns, auxiliaries before verbs, etc.)
- The required part of speech is unambiguous from surrounding words

${focusInstructions}

## Exercise Generation
Generate ${count} Summary Cloze exercises targeting HKDSE Level ${targetLevel}.

### For Each Exercise:
1. Provide a short reading passage (150-300 words) with [paragraph] markers
2. Provide a summary paragraph with gaps (3-8 gaps depending on difficulty)
3. For each gap:
   - Show the required part of speech
   - Provide the correct answer
   - Explain WHY it's correct (grammar + meaning)
   - Include the common student mistake/trap

### JSON Format:
{
  "exercises": [
    {
      "id": "sc-1",
      "title": "...",
      "focusSkill": "partOfSpeech|participialModifier|sameSubjectCheck",
      "level": ${targetLevel},
      "passage": { "content": "...", "wordCount": 200 },
      "summaryText": "Summary paragraph with _____ gaps",
      "gaps": [
        {
          "index": 1,
          "answerMode": "copy|change|create",
          "requiredPos": "noun|verb|adjective|adverb|preposition|conjunction|participle",
          "wordLimit": "ONE word",
          "answer": "...",
          "acceptAlso": ["alternative if create mode"],
          "explanationZh": "解釋為何此詞正確（詞性+文意）",
          "commonMistake": "常見錯誤答案",
          "mistakeReasonZh": "為何該錯誤常見/為何不正確"
        }
      ],
      "totalMarks": 5
    }
  ]
}`;
}

// ============================================
// Summary Cloze 技巧提示（顯示給學生）
// ============================================
export function getSummaryClozeTips(): string[] {
  return [
    '💡 第一步：先判斷空格詞性 (noun/verb/adj/adv/prep/conj)',
    '💡 第二步：判斷答案模式 — copy（直接抄）/ change（語法轉換）/ create（語境創作）',
    '💡 第三步：找出原文對應句（用關鍵詞 matching）',
    '💡 第四步：若是 change 模式，調整 tense/單複數/詞性',
    '💡 第五步：若是 create 模式，從上下文推斷合適詞語',
    '💡 第六步：確認字數限制（ONE word / no more than THREE words）',
    '💡 Ving/Ved 可能是形容語，不是進行式/被動式！',
    '💡 Modifier 子句的主語必須與主句一致',
    '💡 先做已指明段落的 cloze，再做未指明的',
    '💡 全文歸納型 cloze 留到最後才做',
    '💡 做完其他題目再回來檢查 cloze 答案',
    '💡 不要改變原文意思——答案必須忠於原文',
    '💡 Copy 模式 ≠ 不用思考 — 仍需確認文法吻合',
    '💡 Change 模式最常見錯誤：直接抄原文而忘記轉換',
  ];
}

// ============================================
// 常見 DSE Summary Cloze 陷阱詞彙
// ============================================
export const COMMON_CLOZE_TRAP_WORDS = [
  { word: 'specializing', trap: 'specialized (誤用被動)', rule: 'Present participle as adjective' },
  { word: 'seeing', trap: 'posting (忽略同主語規則)', rule: 'Same subject: he saw → he was angry' },
  { word: 'heated', trap: 'hot (不完整)', rule: 'Past participle as adjective: heated water (被加熱的水)' },
  { word: 'surrounding', trap: 'surrounded', rule: 'Active meaning: the area surrounding the building' },
  { word: 'leading', trap: 'led', rule: 'Present participle describing ongoing action' },
  { word: 'causing', trap: 'caused', rule: 'Active causation from the subject' },
  { word: 'remaining', trap: 'remained', rule: 'Participle as adjective modifying noun' },
  { word: 'growing', trap: 'grown', rule: 'Active/ongoing process' },
];
