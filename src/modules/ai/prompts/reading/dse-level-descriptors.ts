// ============================================
// DSE Paper 1 Reading — HKEAA Official Level Descriptors
// 來源：HKEAA English Language Level Descriptors (Reading)
// 用於 prompt injection + 自動難度校準
// ============================================

export const HKEAA_READING_LEVEL_DESCRIPTORS = {
  L5: {
    label: 'Level 5 (Highest)',
    generalComprehension: [
      'The main theme and subthemes or focuses of complex texts are identified with less familiar topics.',
      'Views and attitudes expressed in complex texts are evaluated and alternative views are compared.',
      'The development of a point of view or argument is followed, and the reasons are fully understood.',
    ],
    specificComprehension: [
      'Inferences are made in a wide range of complex texts, including those based on an understanding of the wider meaning of a text.',
      'The purposes of the texts are understood.',
      'The meanings of words and phrases are identified when a context is given, including a context based on more than one part of a text.',
      'This includes both literal and figurative language.',
    ],
    styleAwareness: [
      'Tone and mood are interpreted in all texts.',
    ],
    textComplexity: 'complex',
    topicFamiliarity: 'less familiar',
    inferenceRange: 'wide range, cross-paragraph, wider meaning',
    vocabularyDepth: 'literal + figurative language',
  },
  L4: {
    label: 'Level 4',
    generalComprehension: [
      'The main theme or ideas of fairly complex texts are identified.',
      'Views and attitudes are identified, and the development of an argument followed.',
    ],
    specificComprehension: [
      'Obvious inferences are made in fairly complex texts.',
      'More sophisticated inferences are made if the text is simple and the topic is familiar.',
      'The meaning of words and phrases is identified when a context is given by one or more sentences or a paragraph in fairly complex texts.',
    ],
    styleAwareness: [
      'Tone and mood are interpreted in fairly complex texts.',
    ],
    textComplexity: 'fairly complex',
    topicFamiliarity: 'mixed',
    inferenceRange: 'obvious inferences; sophisticated only in simple texts',
    vocabularyDepth: 'context given by 1-2 sentences or a paragraph',
  },
  L3: {
    label: 'Level 3',
    generalComprehension: [
      'The main theme or ideas of a paragraph are identified if a text is straightforward.',
      'Explicitly expressed views and attitudes are identified.',
    ],
    specificComprehension: [
      'Explicitly stated information is understood in fairly complex texts on familiar themes.',
      'Straightforward inferences are made.',
      'The meaning of words and phrases is identified when a familiar context is given.',
    ],
    styleAwareness: [
      'Tone and mood are interpreted in simple texts.',
    ],
    textComplexity: 'straightforward to fairly complex',
    topicFamiliarity: 'familiar',
    inferenceRange: 'straightforward inferences only',
    vocabularyDepth: 'familiar context required',
  },
  L2: {
    label: 'Level 2',
    generalComprehension: [
      'The main idea of a simple paragraph is understood when this is clearly signalled.',
      'Fact is distinguished from opinion in simple texts when this is clearly signalled.',
    ],
    specificComprehension: [
      'Explicitly stated information is understood in simple texts.',
      'The meaning of words is identified when a simple and familiar context is given.',
    ],
    styleAwareness: [
      'Basic stylistic features can be recognized.',
    ],
    textComplexity: 'simple',
    topicFamiliarity: 'simple and familiar',
    inferenceRange: 'none required — explicit only',
    vocabularyDepth: 'simple, familiar context only',
  },
  L1: {
    label: 'Level 1 (Lowest)',
    generalComprehension: [
      'The sequence of events is identified in a text with a simple structure.',
    ],
    specificComprehension: [
      'Explicitly stated factual information is understood in simple texts containing familiar vocabulary.',
      'Features such as headings can be used to locate relevant information.',
    ],
    styleAwareness: [
      'Basic stylistic features can be recognized in short, simple texts.',
    ],
    textComplexity: 'simple',
    topicFamiliarity: 'familiar vocabulary only',
    inferenceRange: 'none',
    vocabularyDepth: 'familiar vocabulary only',
  },
} as const;

/**
 * 將 HKEAA Level 對應到平台難度等級
 */
export const HKEAA_TO_PLATFORM_DIFFICULTY: Record<string, { difficulty: 'remedial' | 'core' | 'challenge'; targetLevel: number; maxAttainableLevel: number }> = {
  L1: { difficulty: 'remedial', targetLevel: 1, maxAttainableLevel: 2 },
  L2: { difficulty: 'remedial', targetLevel: 2, maxAttainableLevel: 3 },
  L3: { difficulty: 'core', targetLevel: 3, maxAttainableLevel: 4 },
  L4: { difficulty: 'core', targetLevel: 4, maxAttainableLevel: 5 },
  L5: { difficulty: 'challenge', targetLevel: 5, maxAttainableLevel: 5 },
};

/**
 * B1/B2 等級上限說明
 */
export const B1_B2_LEVEL_CAPS = {
  B1: {
    maxLevel: 4,
    explanation: 'Part B1 is the easier section. The highest level attainable for candidates attempting Parts A and B1 is Level 4.',
    recommendation: 'Choose B1 if you are targeting Level 3-4 and want a more stable performance.',
    targetStudents: 'Band 2-3 students, or those who regularly struggle with English reading.',
  },
  B2: {
    maxLevel: 5,
    explanation: 'Part B2 is the more difficult section. Candidates attempting Parts A and B2 can attain the full range of levels (1-5**).',
    recommendation: 'Choose B2 if you are targeting Level 5 or above.',
    targetStudents: 'Band 1 students, or those confident in English reading.',
  },
};

/**
 * 生成 HKEAA Level Descriptor prompt injection string
 */
export function buildHKEAALevelPrompt(targetLevel: number, part: 'A' | 'B1' | 'B2'): string {
  const levelKey = `L${targetLevel}` as keyof typeof HKEAA_READING_LEVEL_DESCRIPTORS;
  const desc = HKEAA_READING_LEVEL_DESCRIPTORS[levelKey];
  if (!desc) return '';

  const capInfo = part === 'B1' ? B1_B2_LEVEL_CAPS.B1 : part === 'B2' ? B1_B2_LEVEL_CAPS.B2 : null;

  return `
## HKEAA Reading Level Descriptors — Target: ${desc.label}

### General Comprehension:
${desc.generalComprehension.map(g => `- ${g}`).join('\n')}

### Specific Comprehension:
${desc.specificComprehension.map(s => `- ${s}`).join('\n')}

### Style Awareness:
${desc.styleAwareness.map(s => `- ${s}`).join('\n')}

### Text Requirements:
- Text Complexity: **${desc.textComplexity}**
- Topic Familiarity: **${desc.topicFamiliarity}**
- Inference Range: **${desc.inferenceRange}**
- Vocabulary Depth: **${desc.vocabularyDepth}**
${capInfo ? `\n### Section Cap:\n- ${capInfo.explanation}\n- ${capInfo.recommendation}` : ''}

⚠️ ALL questions must align with the above level descriptors. Do NOT generate questions beyond this level.
`;
}
