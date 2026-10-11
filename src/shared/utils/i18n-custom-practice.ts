// ============================================
// i18n — Self-Directed Practice (zh / en)
// ============================================
// Wording contract: this feature is AI-assisted self-study. The UI must never
// present its marks as a validated HKDSE score, and items awaiting review must be
// described as NOT marked (never as wrong).
// ============================================

export const customPracticeTranslations: Record<string, { zh: string; en: string }> = {
  'nav.customPractice': { zh: '自訂練習', en: 'Custom Practice' },

  'customPractice.title': { zh: '自訂文法與詞彙練習', en: 'Self-Directed Grammar & Vocabulary Practice' },
  'customPractice.subtitle': {
    zh: '用你自己的話描述想練甚麼，系統會即時出題、批改並提供解說。此為 AI 輔助自學練習，並非考評局評分。',
    en: 'Describe what you want to practise, in your own words. The system generates questions, marks them and explains them. This is AI-assisted self-study, not an HKDSE score.',
  },

  'customPractice.requestLabel': { zh: '你想練習甚麼？', en: 'What do you want to practise?' },
  // Section heading for the form. It must NOT repeat `requestLabel`: the heading and
  // the field label used the same string, so the student saw the question twice
  // (2026-10-10 report).
  'customPractice.requestSectionTitle': { zh: '出題設定', en: 'Practice setup' },
  'customPractice.requestPlaceholder': {
    zh: '例如：我經常分不清 past perfect 和 past simple',
    en: 'For example: I keep mixing up past perfect and past simple',
  },
  'customPractice.requestHint': {
    zh: '3 至 400 個字元。也可選擇下面的類別，勾選想練的主題。',
    en: '3 to 400 characters. You can also choose a category below and tick the topics you want.',
  },

  'customPractice.categoryLegend': { zh: '練習類別', en: 'Practice category' },
  'customPractice.category.auto': { zh: '由系統判斷', en: 'Let the system decide' },
  'customPractice.category.grammar': { zh: '文法 / 時態', en: 'Grammar & tenses' },
  'customPractice.category.sentence_pattern': { zh: '句式 / 條件句', en: 'Sentence patterns & conditionals' },
  'customPractice.category.vocabulary': { zh: '詞彙用法', en: 'Vocabulary usage' },

  // Topic picker — the barrier-lowering path (2026-10-10): the student ticks topics
  // instead of having to name a structure from scratch.
  'customPractice.topicsLegend': { zh: '想練的主題（可多選）', en: 'Topics (pick any number)' },
  'customPractice.topicsHint': {
    zh: '可只勾選主題（可跨組多選），或在最上面的方框補充自己的說法；兩者會一併送出。',
    en: 'Ticking is enough on its own — pick as many as you like across the groups, and you can also add your own words in the box above; both are sent together.',
  },
  'customPractice.topicsCount': {
    zh: '已選 {count} 項 · 送出內容 {used}/{max} 字元',
    en: '{count} selected · request length {used}/{max} characters',
  },
  'customPractice.topicsOmitted': {
    zh: '字數上限所限，以下 {count} 個已勾選主題未能送出（其餘會照常出題）：{labels}。如要練這些主題，請減少勾選或分次練習。',
    en: 'The character limit left out {count} of your ticked topics (everything else is still used): {labels}. Untick some, or practise them in a separate set.',
  },

  'customPractice.difficultyLegend': { zh: '程度', en: 'Difficulty' },
  'customPractice.difficulty.basic': { zh: '基礎', en: 'Basic' },
  'customPractice.difficulty.intermediate': { zh: '中等', en: 'Intermediate' },
  'customPractice.difficulty.advanced': { zh: '進階', en: 'Advanced' },

  'customPractice.countLabel': { zh: '題目數量（3–10）', en: 'Number of questions (3–10)' },

  'customPractice.typesLegend': { zh: '題型（可選多項，留空表示由系統決定）', en: 'Question types (optional; leave empty to let the system decide)' },
  'customPractice.typesAutoByTopic': {
    zh: '依你勾選的主題，未選題型時將使用：{types}。',
    en: 'Based on the topics you ticked, leaving this empty will use: {types}.',
  },
  'customPractice.missingTypes': {
    zh: '以下你勾選的題型未能在本次出題中產生（其餘題目已通過覆核）：{types}。可再按「重新生成」或改選其他題型。',
    en: 'These question types you ticked could not be produced this time (everything delivered passed verification): {types}. Try regenerate, or pick a different mix.',
  },
  'customPractice.type.mc': { zh: '選擇題', en: 'Multiple choice' },
  'customPractice.type.fill_blank': { zh: '填空', en: 'Fill in the blank' },
  'customPractice.type.error_correction': { zh: '改錯', en: 'Error correction' },
  'customPractice.type.transformation': { zh: '句式轉換', en: 'Sentence transformation' },
  'customPractice.type.sentence_production': { zh: '造句', en: 'Sentence production' },

  'customPractice.generate': { zh: '開始出題', en: 'Generate practice' },
  'customPractice.generating': { zh: '正在出題及核對答案…', en: 'Generating and verifying answers…' },

  'customPractice.interpretation': { zh: '系統理解為：', en: 'Interpreted as: ' },
  'customPractice.shortfall': {
    zh: '要求 {requested} 題，實際提供 {delivered} 題（部分題目未通過驗證，因此未交付）。',
    en: 'You asked for {requested} questions; {delivered} were delivered (the rest did not pass verification, so they were not shown).',
  },
  'customPractice.verifiedNote': {
    zh: '每題都經獨立覆核（覆核者未看到答案鍵）。',
    en: 'Every question was independently verified (the verifier never saw the answer key).',
  },

  'customPractice.questionsTitle': { zh: '作答', en: 'Your answers' },
  'customPractice.answerLabel': { zh: '你的答案', en: 'Your answer' },
  'customPractice.submit': { zh: '提交並批改', en: 'Submit for marking' },
  'customPractice.submitting': { zh: '正在批改…', en: 'Marking…' },
  'customPractice.answerAll': { zh: '請至少回答一題。', en: 'Answer at least one question.' },

  'customPractice.resultsTitle': { zh: '批改結果', en: 'Marked results' },
  'customPractice.score': { zh: '得分：{awarded} / {total}', en: 'Score: {awarded} / {total}' },
  'customPractice.needsReviewNote': {
    zh: '{count} 題未能評分（已標示待審，不會當作答錯）。',
    en: '{count} question(s) could not be marked (flagged for review — not counted as wrong).',
  },
  'customPractice.referenceAnswer': { zh: '參考答案', en: 'Reference answer' },
  'customPractice.acceptedAlternatives': { zh: '其他可接受答案', en: 'Also accepted' },
  'customPractice.explanation': { zh: '解說', en: 'Explanation' },
  'customPractice.improvement': { zh: '改善建議', en: 'Improvement' },
  'customPractice.verdict.correct': { zh: '正確', en: 'Correct' },
  'customPractice.verdict.partially_correct': { zh: '部分正確', en: 'Partially correct' },
  // 「不正確」not「未正確」: the student reported that "未正確" reads as ambiguous in
  // Chinese ("not yet correct" vs "wrong"), which hides why the answer lost marks.
  'customPractice.verdict.incorrect': { zh: '不正確', en: 'Incorrect' },
  'customPractice.verdict.needs_review': { zh: '待審（未評分）', en: 'Awaiting review (not marked)' },
  'customPractice.targetRule': { zh: '考核重點', en: 'Target' },

  'customPractice.again': { zh: '再練一次', en: 'Practise again' },
  'customPractice.backToResults': { zh: '返回批改結果', en: 'Back to results' },
  'customPractice.historyTitle': { zh: '我的練習記錄', en: 'My practice history' },
  'customPractice.historyRefresh': { zh: '更新記錄', en: 'Refresh' },
  'customPractice.historyEmpty': { zh: '尚未有練習記錄。', en: 'No practice sets yet.' },
  'customPractice.historyOpen': { zh: '查看', en: 'View' },
  'customPractice.historyDone': { zh: '已批改', en: 'Marked' },
  'customPractice.historyPending': { zh: '未提交', en: 'Not submitted' },

  'customPractice.error.session': { zh: '登入已逾時，請重新登入。', en: 'Your session has expired — please sign in again.' },
  'customPractice.error.rate': { zh: '操作太頻繁，請稍後再試。', en: 'Too many requests — please wait a moment and try again.' },
  'customPractice.error.category': {
    zh: '系統無法從你的描述判斷練習類別，請選擇「文法 / 時態」、「句式 / 條件句」或「詞彙用法」，或把想練的文法結構寫得更具體（例如：should / could 的用法）。',
    en: 'The system could not tell which practice category you meant. Choose Grammar & tenses, Sentence patterns & conditionals or Vocabulary usage, or name the structure you want to practise (for example: "should vs could").',
  },
  'customPractice.error.invalidRequest': {
    zh: '輸入的內容不符合格式，因此未出題：描述需為 3 至 400 字，題數需為 3 至 10 題，題型需為系統提供的選項。請檢查後再試一次。',
    en: 'The request was not in a usable form, so nothing was generated: the description must be 3–400 characters, the number of questions 3–10, and the question types must be one of the options offered. Please check and try again.',
  },
  'customPractice.error.quality': {
    zh: '生成的題目未通過驗證，因此沒有交付任何題目。請換個說法再試。',
    en: 'The generated questions did not pass verification, so nothing was delivered. Try wording your request differently.',
  },
  'customPractice.error.verifier': {
    zh: '暫時無法完成答案覆核，因此未交付題目。請稍後再試。',
    en: 'Answers could not be verified right now, so nothing was delivered. Please try again shortly.',
  },
  'customPractice.error.provider': { zh: 'AI 服務暫時不可用，請稍後再試。', en: 'The AI service is temporarily unavailable. Please try again later.' },
  'customPractice.error.already': { zh: '這份練習已經提交過，以下顯示已有的批改結果。', en: 'This set was already submitted — showing the existing results below.' },
  'customPractice.error.generic': { zh: '發生錯誤，請再試一次。', en: 'Something went wrong. Please try again.' },
};
