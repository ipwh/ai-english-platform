// ============================================
// DSE Paper 1 Reading — Question Wording Template Library
// 基於 2012-2025 真實 HKDSE Past Paper 提問句式
// 來源：已 OCR 的歷屆試題 + 網上分析資源
// ============================================

/**
 * DSE 真實題目句式模板 — 按題型分類
 * 每個模板包含 exact wording pattern 用於 LLM prompt injection
 */
export const DSE_QUESTION_TEMPLATES: Record<string, { pattern: string; examples: string[]; marks: number; wordLimit?: string }> = {
  // ==========================================
  // 1. MCQ — 四選一選擇題
  // ==========================================
  mcq: {
    pattern: 'Multiple-choice question with 4 options (A/B/C/D). One is unambiguously correct.',
    examples: [
      'What does \'fell on the wrong side of it\' (line 3) mean?',
      'Based on the facilities mentioned in paragraph 2, which of the following can people NOT do in Tai Kwun?',
      'What is suggested when the text states \'he has heard it all\' (line 1)?',
      'The sentence "Watch out for \'kite-eating\' trees!" (line 17) suggests the reader should...',
      'Norton ______ with the statement \'there are no problems, only solutions\' (line 4).',
    ],
    marks: 1,
  },

  // ==========================================
  // 2. True/False/Not Given
  // ==========================================
  trueFalseNG: {
    pattern: 'According to paragraph X, are the following statements True (T), False (F) or Not Given (NG)?',
    examples: [
      'According to paragraph 2, are the following statements True, False or Not Given? (3 marks)\n(i) The compound is officially named Tai Kwun.\n(ii) The compound was unknown to the public previously.\n(iii) The compound displays traditional Hong Kong art in the art galleries.',
      'According to paragraphs 3-6, are the following statements True (T), False (F) or Not Given (NG)? (3 marks)\n(i) Diamond kites are the most enjoyable type of kite to fly.\n(ii) People should avoid flying kites on beaches.\n(iii) When the wind is weaker, dragon kites fly better than box kites.',
      'According to paragraphs 4-5, are the following statements True (T), False (F) or Not Given (NG)? (5 marks)',
    ],
    marks: 1,
    wordLimit: 'Each statement = 1 mark',
  },

  // ==========================================
  // 3. Matching — 配對題
  // ==========================================
  matching: {
    pattern: 'Match items from Column A to Column B. Each option can only be used once.',
    examples: [
      'Select one of the menu options in the header above paragraph 1 to complete each gap in the table below. Each option can only be used once.',
      'Match the following headings to paragraphs 2-6.',
      'Match each person to their viewpoint expressed in the passage.',
    ],
    marks: 1,
  },

  // ==========================================
  // 4. Summary Cloze — 撮要填充（填空式）
  // ==========================================
  summaryCloze: {
    pattern: 'Complete the summary using words from the passage. Some answers may need grammatical adjustment (change mode) or inference (create mode) — not all are direct copies.',
    examples: [
      'Complete the summary of paragraph 1 by selecting the best option from the choices below. (3 marks)',
      'Complete the summary of paragraph 8 by using ONE word taken from paragraph 8 for each gap. You may need to change the form of the word. (4 marks)',
      'Complete the following information about the new arts pavilion by using a word or phrase taken from paragraphs 4-6 for each gap. Write no more than THREE words for each gap. (6 marks)',
      'Using the information in paragraphs 2-6, complete the following Troubleshooting Guide. For each gap use ONE word taken from paragraphs 2-6. Some answers require grammatical adjustment. (5 marks)',
    ],
    marks: 1,
    wordLimit: 'ONE word OR no more than THREE words per gap — MUST specify',
  },

  // ==========================================
  // 5. Short Answer — 短答題
  // ==========================================
  shortAnswer: {
    pattern: 'Answer in a few words or a short phrase. Answer must be directly from the passage.',
    examples: [
      'With reference to paragraph 3, state ONE reason why the building work was especially challenging.',
      'When is National Kite Month?',
      'According to paragraph 11, why did the mother decide to spend the night at Chancery Lane, next to the prison?',
    ],
    marks: 1,
    wordLimit: '15 words maximum',
  },

  // ==========================================
  // 6. Referencing — 代詞指涉題
  // ==========================================
  referencing: {
    pattern: 'What does \'X\' refer to in line Y? / Who or what does \'X\' refer to?',
    examples: [
      'What does \'the other\' (line 25) refer to?',
      'Who or what does \'it\' (line 7) refer to?',
      'Who or what does \'they\' (line 22) refer to?',
      'What does \'this\' refer to in paragraph 4?',
    ],
    marks: 1,
  },

  // ==========================================
  // 7. Open-ended Inference — 開放式推論題
  // ==========================================
  inference: {
    pattern: 'Explain why... / What does X imply about...? Answer in 30-50 words.',
    examples: [
      'Why do some readers receive \'a tongue-lashing\' (lines 12-13) instead of \'a kind word\' (line 12)?',
      'What does the phrase \'lucky charms and odd behaviours\' suggest about the writer\'s attitudes?',
    ],
    marks: 3,
    wordLimit: '30-50 words',
  },

  // ==========================================
  // 8. Tone/Attitude/Purpose — 語氣/態度/目的
  // ==========================================
  toneAttitude: {
    pattern: 'What is the author\'s tone/attitude/stance/purpose? Must rely on word choice, hedging, or structure — NOT simple positive/negative labeling.',
    examples: [
      'What is the writer\'s attitude toward the renovation project? Explain with reference to specific words or phrases.',
      'What is the purpose of paragraph 5 in relation to the whole passage?',
      'The tone of the passage can best be described as...\nA. cautiously optimistic\nB. bitterly sarcastic\nC. neutrally informative\nD. enthusiastically promotional',
      'How does the writer feel about the proposed policy? Support your answer with evidence from the passage.',
      'What stance does the author take on the issue? Is it straightforward or qualified? Explain.',
      'The writer uses phrases like "promising yet unproven" and "potential pitfalls remain." What does this suggest about the writer\'s overall position?',
      'Read lines 25-30. What is the writer\'s tone when discussing the government\'s response?',
    ],
    marks: 2,
  },

  // ==========================================
  // 9. Sequencing — 排序題
  // ==========================================
  sequencing: {
    pattern: 'Arrange the following events in the correct order according to the passage.',
    examples: [
      'Arrange the following events in chronological order as they appear in the passage.',
      'Put the following steps in the correct sequence according to the instructions.',
    ],
    marks: 2,
  },

  // ==========================================
  // 10. Synonym/Antonym Search — 同義/反義詞搜索（NEW）
  // ==========================================
  synonymSearch: {
    pattern: 'Find a word or phrase in paragraph X which has a similar meaning to \'Y\'.',
    examples: [
      'Find a word or phrase in paragraph 1 which has a similar meaning to \'enter\'.',
      'Find a word or phrase in paragraph 1 that suggests the Victoria Prison and Central Police Station was disconnected from the daily lives of Hong Kong citizens.',
      'Find a word in paragraph 4 to highlight the fact that it took time to find a solution.',
    ],
    marks: 1,
    wordLimit: 'ONE word or ONE phrase',
  },

  // ==========================================
  // 11. Descriptive Phrase Search — 描述性片語搜索（NEW）
  // ==========================================
  phraseSearch: {
    pattern: 'What phrase is used in paragraph X to describe Y?',
    examples: [
      'What phrase is used in paragraph 5 to describe Tai Kwun as a wide-open relaxing place?',
      'Which expression in paragraph 3 tells us that the author was surprised?',
    ],
    marks: 1,
  },

  // ==========================================
  // 12. Negative Inference — 否定推論題（NEW）
  // ==========================================
  negativeInference: {
    pattern: 'Based on paragraph X, which of the following can people NOT do / is NOT mentioned?',
    examples: [
      'Based on the facilities mentioned in paragraph 2, which of the following can people NOT do in Tai Kwun?\nA. eat lunch\nB. sleep in a prison cell\nC. meet friends for a drink\nD. learn about Hong Kong history',
    ],
    marks: 1,
  },

  // ==========================================
  // 13. MC-based Summary Cloze — 選擇式撮要填充（NEW）
  // ==========================================
  mcCloze: {
    pattern: 'Complete the summary by selecting the best option from the choices below for each gap.',
    examples: [
      'Complete the summary of paragraph 1 by selecting the best option from the choices below. (3 marks)\nTai Kwun was previously a prison but now it is _(i)_ and anyone can visit. It took _(ii)_ to make the modifications to the buildings. Now the work in Tai Kwun is _(iii)_; it has become the most important project of its kind in Hong Kong.\n\n(i) A. a law court  B. a heritage site  C. a police station  D. a residential house\n(ii) A. 179 years  B. a long time  C. not too long  D. very little time\n(iii) A. starting  B. ongoing  C. finished  D. cancelled',
    ],
    marks: 1,
  },

  // ==========================================
  // 14. Table-form Information Extraction — 表格式資訊提取（NEW）
  // ==========================================
  tableCompletion: {
    pattern: 'Complete the table/following information by using a word or phrase taken from paragraphs X-Y. Write no more than THREE words for each gap.',
    examples: [
      'Complete the following information about the new arts pavilion by using a word or phrase taken from paragraphs 4-6 for each gap. Write no more than THREE words for each gap. (6 marks)\n\n| | Initial design | Final design |\n|---|---|---|\n| Distinctive appearance | (i) _____ | (ii) _____ |\n| Facilities | a) a large hall  b) (iii) _____ | Not Stated |\n| Residents\' response | Residents argued that the tower would obstruct their (iv) _____ | Some believe the new structures are out of place. |',
      'Complete the following tips from paragraph 3. Write ONE word taken from the paragraph in each gap below. (2 marks)\n\nThere are two methods for kite flyers to check if the wind is suitable for kite flying:\n• Either a windsock or (i) _____ can show the wind speed.\n• Look at the movement of the (ii) _____ on the trees nearby.',
    ],
    marks: 1,
    wordLimit: 'ONE word to THREE words per gap',
  },

  // ==========================================
  // 15. Error-Correction Summary — 改錯型摘要（NEW）
  // ==========================================
  errorCorrectionSummary: {
    pattern: 'Below is a summary. In X of the lines there is ONE mistake. If you find a mistake, underline it and replace the word. In one of the lines there is no mistake; put a tick (✓).',
    examples: [
      'Below is a summary of paragraph 10. In three of the lines there is ONE mistake. If you find a mistake, underline it and replace it with one that expresses the correct idea. Write the word in the box on the right. Both grammar and spelling must be correct. In one of the lines there is no mistake; put a tick (✓) in the box. (4 marks)',
    ],
    marks: 1,
  },

  // ==========================================
  // 16. Example-Finding — 舉例題（NEW）
  // ==========================================
  exampleFinding: {
    pattern: 'Give an example, from paragraph X, of how Y\'s prediction has come true.',
    examples: [
      'Give an example, from paragraph 9, of how John Batten\'s prediction in paragraph 9 has come true.',
      'Provide an example from the passage that illustrates the author\'s point about X.',
    ],
    marks: 1,
  },

  // ==========================================
  // 17. Cause-Effect Completion — 因果完成題（NEW）
  // ==========================================
  causeEffectCompletion: {
    pattern: 'Complete the sentence using ONE word. You may need to change the form of a word found in paragraph X (change mode) or infer from context (create mode).',
    examples: [
      'Complete the following sentence using ONE word taken from paragraph 1. You may need to change the form.\nKnowing the _____ of kite flying will make it more enjoyable.',
      'Use ONE word to complete the following statement based on the information in paragraph 6.\nIt\'s the _____ noticed by readers between the serious and silly that makes the serious problems stand out.',
    ],
    marks: 1,
    wordLimit: 'ONE word',
  },

  // ==========================================
  // 18. Author Intention — 作者意圖推斷（NEW）
  // ==========================================
  authorIntention: {
    pattern: 'The sentence "..." (line Y) suggests the reader should... / The writer uses "..." to show...',
    examples: [
      'The sentence "Watch out for \'kite-eating\' trees!" (line 17) suggests the reader should...\nA. make kites bump into trees\nB. make sure kites fly close to the trees\nC. remove kites which are stuck in trees\nD. take care to avoid kites getting stuck in trees',
    ],
    marks: 1,
  },

  // ==========================================
  // 19. Word Meaning in Context — 語境詞義題（NEW - explicit subtype）
  // ==========================================
  vocabularyInContext: {
    pattern: 'What does the word/phrase \'X\' (line Y) mean as used in the passage?',
    examples: [
      'What does \'a tongue-lashing\' (lines 12-13) mean?',
      'What does \'fetish\' mean as used in paragraph 2?',
      'What does the phrase \'more a fad than a trend\' suggest?',
    ],
    marks: 1,
  },
};

/**
 * 按 DSE Part 推薦題型組合
 * Part A (compulsory): 簡單直接題型為主
 * Part B1 (easier): 中等難度，B1 獨有題型
 * Part B2 (harder): 高難度，含推論/評價題
 */
export const DSE_PART_QUESTION_MIX = {
  A: {
    label: 'Part A (Compulsory)',
    maxLevel: 5,
    recommendedTypes: [
      'mcq', 'trueFalseNG', 'synonymSearch', 'referencing', 'shortAnswer',
      'mcCloze', 'summaryCloze', 'phraseSearch', 'vocabularyInContext', 'negativeInference',
    ],
    totalQuestions: '~19 questions, 42 marks',
    timeAllocation: '35-40 minutes',
    passageCount: '1-2 passages',
  },
  B1: {
    label: 'Part B1 (Easier Section)',
    maxLevel: 4,
    recommendedTypes: [
      'mcq', 'trueFalseNG', 'matching', 'summaryCloze', 'shortAnswer',
      'referencing', 'tableCompletion', 'causeEffectCompletion', 'authorIntention',
    ],
    totalQuestions: '~22 questions, 42 marks',
    timeAllocation: '45-50 minutes',
    passageCount: '2-3 passages',
    levelCapWarning: '⚠️ B1 最高只能達 Level 4。目標 Level 5+ 請選 B2。',
  },
  B2: {
    label: 'Part B2 (More Difficult Section)',
    maxLevel: 5,
    recommendedTypes: [
      'mcq', 'trueFalseNG', 'summaryCloze', 'inference', 'toneAttitude',
      'referencing', 'phraseSearch', 'errorCorrectionSummary', 'exampleFinding',
      'vocabularyInContext',
    ],
    totalQuestions: '~21 questions, 42 marks',
    timeAllocation: '45-50 minutes',
    passageCount: '1-2 passages (longer, more complex)',
  },
};

/**
 * DSE 題目常用指令用語 (rubric words)
 */
export const DSE_RUBRIC_PHRASES = {
  paragraphReference: ['With reference to paragraph X', 'According to paragraph X', 'Based on the information in paragraph X', 'In paragraph X'],
  wordLimits: ['ONE word', 'no more than THREE words', 'Write ONE word taken from the paragraph', 'use a word or phrase taken from paragraphs X-Y'],
  lineReferences: ['(line X)', '(lines X-Y)', 'in line X'],
  answerFormats: ['Complete the following sentence', 'Complete the summary', 'Find a word or phrase', 'Who or what does \'X\' refer to', 'Give an example', 'State ONE reason'],
  markIndicators: ['(1 mark)', '(2 marks)', '(3 marks)', '(4 marks)', '(5 marks)', '(6 marks)'],
  tFNGInstructions: ['True (T), False (F) or Not Given (NG)', 'are the following statements True, False or Not Given'],
  tickInstruction: ['put a tick (✓)', 'If there is no mistake, put a tick (✓)'],
};
