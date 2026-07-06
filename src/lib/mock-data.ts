// ============================================
// 假資料 — AI 英語學習平台
// 依據：ELE KLACG 2017 課程指引
// TODO: connect to API — 全部資料最終由後端 API 提供
// ============================================

import type {
  Student, Teacher, PracticeQuestion, Assignment, AssignmentSummary,
  MistakeItem, VocabItem, Material, ReviewItem, Notification,
  Badge, ClassInfo, WeeklyReport, WritingDraft, SkillMastery, SkillSummary,
  ClassStudentSummary, SkillHeatmapData, KpiData,
} from './types';

// ========================================
// 學生假資料 (S4 = KS4)
// ========================================
export const mockStudent: Student = {
  id: 's001',
  nameZh: '陳家明',
  nameEn: 'Chan Ka Ming',
  role: 'student',
  className: '4A',
  classNumber: '15',
  email: 'kaming.chan@school.hk',
  streakDays: 7,
  joinedAt: '2025-09-01',
  level: 'S4',
  keyStage: 'KS4',
  overallAccuracy: 68,
  strandMastery: { interpersonal: 65, knowledge: 72, experience: 60 },
  skillMastery: { listening: 70, speaking: 55, reading: 68, writing: 52 },
  diagnosticCompleted: true,
  masteryBySkill: [
    { strand: 'knowledge', category: 'language-forms', grammarItem: 'tenses', subSkill: 'Tenses', subSkillZh: '時態', percentage: 72, lastPracticed: '2026-07-05', keyStage: 'KS4' },
    { strand: 'knowledge', category: 'language-forms', grammarItem: 'relative-clauses', subSkill: 'Relative Clauses', subSkillZh: '關係子句', percentage: 45, lastPracticed: '2026-07-04', keyStage: 'KS4' },
    { strand: 'knowledge', category: 'language-forms', grammarItem: 'conditionals', subSkill: 'Conditionals', subSkillZh: '條件句', percentage: 58, lastPracticed: '2026-07-03', keyStage: 'KS4' },
    { strand: 'knowledge', category: 'language-forms', grammarItem: 'passive-voice', subSkill: 'Passive Voice', subSkillZh: '被動語態', percentage: 63, lastPracticed: '2026-06-28', keyStage: 'KS4' },
    { strand: 'knowledge', category: 'language-forms', grammarItem: 'phrasal-verbs', subSkill: 'Phrasal Verbs', subSkillZh: '片語動詞', percentage: 40, lastPracticed: '2026-07-02', keyStage: 'KS4' },
    { strand: 'knowledge', category: 'language-forms', grammarItem: 'connectives', subSkill: 'Connectives', subSkillZh: '連接詞運用', percentage: 55, lastPracticed: '2026-07-03', keyStage: 'KS4' },
    { strand: 'knowledge', category: 'language-skills', languageSkill: 'reading', subSkill: 'Main Idea', subSkillZh: '主旨理解', percentage: 70, lastPracticed: '2026-07-05', keyStage: 'KS4' },
    { strand: 'knowledge', category: 'language-skills', languageSkill: 'reading', subSkill: 'Inference', subSkillZh: '推論', percentage: 52, lastPracticed: '2026-07-01', keyStage: 'KS4' },
    { strand: 'knowledge', category: 'language-skills', languageSkill: 'writing', subSkill: 'Essay Structure', subSkillZh: '文章結構', percentage: 48, lastPracticed: '2026-06-30', keyStage: 'KS4' },
    { strand: 'interpersonal', category: 'language-skills', languageSkill: 'writing', subSkill: 'Letter Writing', subSkillZh: '書信寫作', percentage: 55, lastPracticed: '2026-06-25', keyStage: 'KS4' },
  ],
  weakSkills: [
    { grammarItem: 'relative-clauses', subSkill: 'Relative Clauses', subSkillZh: '關係子句', accuracy: 45, totalAttempts: 12 },
    { grammarItem: 'phrasal-verbs', subSkill: 'Phrasal Verbs', subSkillZh: '片語動詞', accuracy: 40, totalAttempts: 10 },
    { languageSkill: 'writing', subSkill: 'Essay Structure', subSkillZh: '文章結構', accuracy: 48, totalAttempts: 8 },
  ],
  assignments: [
    { id: 'a001', title: '文法練習：條件句', grammarItem: 'conditionals', dueDate: '2026-07-10', status: 'in-progress' },
    { id: 'a002', title: '閱讀理解：環保議題', languageSkill: 'reading', dueDate: '2026-07-08', status: 'not-started' },
    { id: 'a003', title: '詞彙測驗：學術單字', grammarItem: 'phrasal-verbs', dueDate: '2026-07-05', status: 'completed', score: 75 },
  ],
  mistakes: [],
  vocabularyItems: [],
  genericSkills: [
    { skill: 'communication', level: 65 },
    { skill: 'critical-thinking', level: 55 },
    { skill: 'creativity', level: 50 },
    { skill: 'problem-solving', level: 58 },
    { skill: 'self-learning', level: 60 },
    { skill: 'collaboration', level: 62 },
    { skill: 'it-skills', level: 70 },
    { skill: 'self-management', level: 55 },
    { skill: 'mathematical', level: 45 },
  ],
};

// ========================================
// 教師假資料
// ========================================
export const mockTeacher: Teacher = {
  id: 't001',
  nameZh: '黃淑儀',
  nameEn: 'Wong Suk Yee',
  role: 'teacher',
  email: 'sukyee.wong@school.hk',
  streakDays: 0,
  joinedAt: '2020-09-01',
  subjects: ['English Language'],
  classes: ['4A', '4B', '5C', '5D'],
};

// ========================================
// 技能 mastery 列表（對應課程學習目標）
// ========================================
export const mockMasteryList: SkillMastery[] = [
  // 文法項目 (Language Forms)
  { strand: 'knowledge', category: 'language-forms', grammarItem: 'tenses', subSkill: 'Tenses', subSkillZh: '時態', percentage: 72, lastPracticed: '2026-07-05', keyStage: 'KS4' },
  { strand: 'knowledge', category: 'language-forms', grammarItem: 'relative-clauses', subSkill: 'Relative Clauses', subSkillZh: '關係子句', percentage: 45, lastPracticed: '2026-07-04', keyStage: 'KS4' },
  { strand: 'knowledge', category: 'language-forms', grammarItem: 'conditionals', subSkill: 'Conditionals', subSkillZh: '條件句', percentage: 58, lastPracticed: '2026-07-03', keyStage: 'KS4' },
  { strand: 'knowledge', category: 'language-forms', grammarItem: 'passive-voice', subSkill: 'Passive Voice', subSkillZh: '被動語態', percentage: 63, lastPracticed: '2026-06-28', keyStage: 'KS4' },
  { strand: 'knowledge', category: 'language-forms', grammarItem: 'reported-speech', subSkill: 'Reported Speech', subSkillZh: '轉述句', percentage: 52, lastPracticed: '2026-06-20', keyStage: 'KS4' },
  { strand: 'knowledge', category: 'language-forms', grammarItem: 'phrasal-verbs', subSkill: 'Phrasal Verbs', subSkillZh: '片語動詞', percentage: 40, lastPracticed: '2026-07-02', keyStage: 'KS4' },
  { strand: 'knowledge', category: 'language-forms', grammarItem: 'connectives', subSkill: 'Connectives', subSkillZh: '連接詞運用', percentage: 55, lastPracticed: '2026-07-03', keyStage: 'KS4' },
  { strand: 'knowledge', category: 'language-forms', grammarItem: 'articles', subSkill: 'Articles', subSkillZh: '冠詞', percentage: 70, lastPracticed: '2026-06-15', keyStage: 'KS3' },
  { strand: 'knowledge', category: 'language-forms', grammarItem: 'prepositions', subSkill: 'Prepositions', subSkillZh: '介詞', percentage: 58, lastPracticed: '2026-06-22', keyStage: 'KS4' },
  { strand: 'knowledge', category: 'language-forms', grammarItem: 'comparatives-superlatives', subSkill: 'Comparatives & Superlatives', subSkillZh: '比較級與最高級', percentage: 75, lastPracticed: '2026-06-10', keyStage: 'KS3' },
  // 語言技能 (Language Skills)
  { strand: 'knowledge', category: 'language-skills', languageSkill: 'reading', subSkill: 'Main Idea', subSkillZh: '主旨理解', percentage: 70, lastPracticed: '2026-07-05', keyStage: 'KS4' },
  { strand: 'knowledge', category: 'language-skills', languageSkill: 'reading', subSkill: 'Inference', subSkillZh: '推論', percentage: 52, lastPracticed: '2026-07-01', keyStage: 'KS4' },
  { strand: 'knowledge', category: 'language-skills', languageSkill: 'reading', subSkill: 'Guessing Meaning', subSkillZh: '詞義猜測', percentage: 48, lastPracticed: '2026-06-27', keyStage: 'KS4' },
  { strand: 'knowledge', category: 'language-skills', languageSkill: 'writing', subSkill: 'Essay Structure', subSkillZh: '文章結構', percentage: 48, lastPracticed: '2026-06-30', keyStage: 'KS4' },
  { strand: 'interpersonal', category: 'language-skills', languageSkill: 'writing', subSkill: 'Letter Writing', subSkillZh: '書信寫作', percentage: 55, lastPracticed: '2026-06-25', keyStage: 'KS4' },
  { strand: 'experience', category: 'language-skills', languageSkill: 'speaking', subSkill: 'Oral Presentation', subSkillZh: '口頭匯報', percentage: 50, lastPracticed: '2026-06-18', keyStage: 'KS4' },
];

// ========================================
// 練習題目假資料
// ========================================
export const mockQuestions: PracticeQuestion[] = [
  {
    id: 'q001',
    type: 'mc',
    strand: 'knowledge', grammarItem: 'tenses', subSkill: 'Tenses', subSkillZh: '時態',
    difficulty: 'core',
    gradeLevel: 'S4', keyStage: 'KS4',
    prompt: 'Choose the correct sentence:',
    promptZh: '選擇正確的句子：',
    choices: [
      'A. She have gone to the library yesterday.',
      'B. She has gone to the library yesterday.',
      'C. She went to the library yesterday.',
      'D. She goes to the library yesterday.',
    ],
    answer: 'C',
    explanationZh: '因為有明確過去時間 "yesterday"，必須使用簡單過去式 (Simple Past Tense)。"She went" 是正確的過去式。',
    explanationEn: 'With a specific past time "yesterday", you must use Simple Past Tense. "She went" is correct.',
    commonMistake: '很多學生見到 "have/has gone" 就用現在完成式，但現在完成式不能與明確過去時間連用。',
    grammarPoint: 'Simple Past vs Present Perfect',
    hintLevels: [
      '提示 1：留意句子中的時間詞 "yesterday"。',
      '提示 2："yesterday" 是過去時間，應該用什麼時態？',
      '提示 3：過去式 "went" 是 "go" 的不規則過去式。',
      '提示 4：正確答案是 C。現在完成式 (has gone) 不能與 yesterday 等明確過去時間連用。',
    ],
  },
  {
    id: 'q002',
    type: 'mc',
    strand: 'knowledge', grammarItem: 'relative-clauses', subSkill: 'Relative Clauses', subSkillZh: '關係子句',
    difficulty: 'core',
    gradeLevel: 'S4', keyStage: 'KS4',
    prompt: 'The student ______ won the competition is my best friend.',
    promptZh: '那位贏得比賽的學生是我最好的朋友。',
    choices: ['A. which', 'B. who', 'C. whom', 'D. what'],
    answer: 'B',
    explanationZh: '"student" 是人，所以用 "who" 作為關係代名詞。"which" 用於事物，"whom" 是受格，"what" 不適用。',
    explanationEn: '"student" is a person, so use "who" as the relative pronoun. "which" is for things, "whom" is objective case, "what" is not suitable.',
    commonMistake: '學生常混淆 "who" 和 "which"——記住：人用 who，事物用 which。',
    grammarPoint: 'Relative Pronouns (who/which/whom)',
    hintLevels: [
      '提示 1："student" 是人還是事物？',
      '提示 2：形容人的關係代名詞是 "who" 或 "whom"。',
      '提示 3：這裡需要主格關係代名詞（做主語），所以用 "who"。',
      '提示 4：正確答案是 B。"who" 修飾人（student），在從句中做主語。',
    ],
  },
  {
    id: 'q003',
    type: 'mc',
    strand: 'knowledge', grammarItem: 'phrasal-verbs', subSkill: 'Academic Vocabulary', subSkillZh: '學術詞彙',
    difficulty: 'core',
    gradeLevel: 'S4', keyStage: 'KS4',
    prompt: 'The government needs to ______ new policies to address climate change.',
    promptZh: '政府需要實施新政策來應對氣候變化。',
    choices: ['A. implement', 'B. imply', 'C. imitate', 'D. imagine'],
    answer: 'A',
    explanationZh: '"implement" 意思是「實施、執行」，最適合與 "policies" 搭配。其他選項：imply（暗示）、imitate（模仿）、imagine（想像）。',
    explanationEn: '"implement" means "to put into effect", best collocates with "policies". Others: imply, imitate, imagine.',
    commonMistake: '學生容易混淆 implement 和 imply，兩者意思完全不同。',
    grammarPoint: undefined,
    hintLevels: [
      '提示 1：這個詞的意思是「實施、執行」。',
      '提示 2：哪個詞可以與 "policies"（政策）搭配？',
      '提示 3："implement policies" 是常見搭配。',
      '提示 4：正確答案是 A。"implement" = 實施，是與 policies 最自然的搭配。',
    ],
  },
  {
    id: 'q004',
    type: 'error-correction',
    strand: 'knowledge', grammarItem: 'tenses', subSkill: 'Error Correction', subSkillZh: '常見錯誤辨析',
    difficulty: 'core',
    gradeLevel: 'S4', keyStage: 'KS4',
    prompt: 'Find and correct the error:\n"I am living in Hong Kong since 2010."',
    promptZh: '找出並改正錯誤：',
    choices: undefined,
    answer: 'I have been living in Hong Kong since 2010.',
    explanationZh: '"since 2010" 表示從過去持續到現在，應使用現在完成進行式 (Present Perfect Continuous)。',
    explanationEn: '"since 2010" indicates an action continuing from past to present, requiring Present Perfect Continuous.',
    commonMistake: '這是典型的中式英文錯誤——中文沒有時態變化，學生習慣直接用現在式 + since。',
    grammarPoint: 'Present Perfect Continuous',
    hintLevels: [
      '提示 1：留意 "since 2010" 這個時間標記。',
      '提示 2："since" 通常搭配現在完成式或現在完成進行式。',
      '提示 3：持續性動作用完成進行式 (have been + -ing)。',
      '提示 4：正確答案：I have been living in Hong Kong since 2010。',
    ],
  },
  {
    id: 'q005',
    type: 'fill-blank',
    strand: 'knowledge', grammarItem: 'phrasal-verbs', subSkill: 'Phrasal Verbs', subSkillZh: '片語動詞',
    difficulty: 'core',
    gradeLevel: 'S4', keyStage: 'KS4',
    prompt: 'I need to ______ up with a good idea for the project.',
    promptZh: '我需要想出一個好的專題idea。',
    choices: undefined,
    answer: 'come',
    explanationZh: '"come up with" 是片語動詞，意思是「想出、提出（主意/方案）」。',
    explanationEn: '"come up with" is a phrasal verb meaning "to think of or suggest an idea or plan".',
    commonMistake: '學生常誤用 "think up with" 或只說 "think of"。片語動詞需要整組記憶。',
    grammarPoint: undefined,
    hintLevels: [
      '提示 1：這個片語動詞的意思是「想出」。',
      '提示 2：___ up with = 想出（三個字母）。',
      '提示 3："come up with" 是用於提出想法的常用片語。',
      '提示 4：正確答案是 "come"。"come up with" = 想出、提出。',
    ],
  },
  {
    id: 'q006',
    type: 'mc',
    strand: 'knowledge', languageSkill: 'reading', subSkill: 'Main Idea', subSkillZh: '主旨理解',
    difficulty: 'core',
    gradeLevel: 'S4', keyStage: 'KS4',
    prompt: 'Read the passage:\n"Renewable energy sources such as solar and wind power are becoming increasingly affordable. Many countries are now investing heavily in these technologies to reduce their carbon footprint and combat climate change."\n\nWhat is the main idea?',
    promptZh: '閱讀短文並選出主旨：',
    choices: [
      'A. Solar power is the cheapest energy source.',
      'B. Countries are investing in renewable energy to fight climate change.',
      'C. Wind power is better than solar power.',
      'D. Climate change is not a serious problem.',
    ],
    answer: 'B',
    explanationZh: '短文主旨是各國正投資可再生能源以應對氣候變化。A 和 C 過於狹窄，D 與文章意思相反。',
    explanationEn: 'The main idea is that countries are investing in renewables to fight climate change. A and C are too narrow, D contradicts the passage.',
    commonMistake: '學生常選太窄或太闊的選項——主旨應該概括全文核心，而非細節。',
    grammarPoint: undefined,
    hintLevels: [
      '提示 1：文章主要討論什麼主題？',
      '提示 2：哪個選項最能概括兩句的意思？',
      '提示 3：留意 "becoming affordable" 和 "investing heavily" 這兩個重點。',
      '提示 4：正確答案是 B。文章核心是各國投資可再生能源以減碳。',
    ],
  },
  {
    id: 'q007',
    type: 'mc',
    strand: 'knowledge', grammarItem: 'conditionals', subSkill: 'Conditionals', subSkillZh: '條件句',
    difficulty: 'challenge',
    gradeLevel: 'S4', keyStage: 'KS4',
    prompt: 'If I ______ harder last year, I would have passed the exam.',
    promptZh: '如果我去年更努力，我就會通過考試了。',
    choices: ['A. study', 'B. studied', 'C. had studied', 'D. have studied'],
    answer: 'C',
    explanationZh: '這是第三條件句（與過去事實相反），結構為：If + had + p.p., would have + p.p.。',
    explanationEn: 'This is a Third Conditional (contrary to past fact): If + had + past participle, would have + past participle.',
    commonMistake: '學生常混淆第二和第三條件句——第二是與現在相反，第三是與過去相反。',
    grammarPoint: 'Third Conditional',
    hintLevels: [
      '提示 1：留意 "last year"——這是指過去的事。',
      '提示 2：與過去事實相反的假設用第三條件句。',
      '提示 3：第三條件句的 if 子句用 had + 過去分詞。',
      '提示 4：正確答案是 C。"had studied" 是第三條件句的正確形式。',
    ],
  },
  {
    id: 'q008',
    type: 'short-writing',
    strand: 'knowledge', languageSkill: 'writing', subSkill: 'Essay Structure', subSkillZh: '文章結構',
    difficulty: 'core',
    gradeLevel: 'S4', keyStage: 'KS4',
    prompt: 'Write a topic sentence for a paragraph about the benefits of reading.',
    promptZh: '請寫一個關於閱讀好處的主題句（topic sentence）。',
    choices: undefined,
    answer: 'Reading offers numerous benefits, including improving vocabulary, enhancing critical thinking skills, and reducing stress.',
    explanationZh: '好的主題句應清楚表明段落主旨，並可用列舉方式預告內容方向。',
    explanationEn: 'A good topic sentence clearly states the main idea and may preview supporting points.',
    commonMistake: '學生常寫得太籠統（如 "Reading is good"）或太具體（直接寫例子）。主題句應介於兩者之間。',
    grammarPoint: undefined,
    hintLevels: [
      '提示 1：主題句應概括整段的核心意思。',
      '提示 2：可以先想三個閱讀的好處，然後概括成一句。',
      '提示 3：可用 "Reading offers several benefits..." 作開頭。',
      '提示 4：參考答案：Reading offers numerous benefits, including improving vocabulary, enhancing critical thinking, and reducing stress.',
    ],
  },
  {
    id: 'q009',
    type: 'mc',
    strand: 'knowledge', grammarItem: 'phrasal-verbs', subSkill: 'Collocations', subSkillZh: '詞彙搭配',
    difficulty: 'remedial',
    gradeLevel: 'S4', keyStage: 'KS4',
    prompt: 'We should ______ attention to the teacher\'s instructions.',
    promptZh: '我們應該注意老師的指示。',
    choices: ['A. make', 'B. pay', 'C. give', 'D. take'],
    answer: 'B',
    explanationZh: '"pay attention" 是固定搭配，意思是「注意、留心」。不可說 "make attention" 或 "give attention"。',
    explanationEn: '"pay attention" is a fixed collocation meaning "to focus on". Do not say "make attention".',
    commonMistake: '中文「注意」直譯可能誤用 give 或 make，但英文固定搭配是 pay attention。',
    grammarPoint: undefined,
    hintLevels: [
      '提示 1：這是一個固定詞語搭配。',
      '提示 2：「注意」的英文是 pay ______。',
      '提示 3：這個動詞和「付款」是同一個字。',
      '提示 4：正確答案是 B。"pay attention" 是固定搭配，不可拆換。',
    ],
  },
  {
    id: 'q010',
    type: 'mc',
    strand: 'knowledge', grammarItem: 'passive-voice', subSkill: 'Passive Voice', subSkillZh: '被動語態',
    difficulty: 'challenge',
    gradeLevel: 'S4', keyStage: 'KS4',
    prompt: 'The new library ______ next month.',
    promptZh: '新圖書館將於下月啟用。',
    choices: [
      'A. will open',
      'B. will be opened',
      'C. is opening',
      'D. has opened',
    ],
    answer: 'B',
    explanationZh: '圖書館是被「啟用」的對象，不是自己開門，所以用被動語態 "will be opened"。',
    explanationEn: 'The library is the object being opened, so passive voice "will be opened" is correct.',
    commonMistake: '中文「啟用」看起來像主動，但英文中 library 是被開幕的對象，要用被動。',
    grammarPoint: 'Passive Voice (Future)',
    hintLevels: [
      '提示 1：圖書館是自己開門還是被人啟用？',
      '提示 2：被動語態 = be + 過去分詞。',
      '提示 3：將來被動 = will be + 過去分詞。',
      '提示 4：正確答案是 B。"will be opened" 是將來被動語態。',
    ],
  },
  // === 聆聽題目範例 ===
  {
    id: 'q013', type: 'mc', strand: 'interpersonal', languageSkill: 'listening',
    subSkill: 'Listening Comprehension', subSkillZh: '聆聽理解',
    difficulty: 'core', gradeLevel: 'S4', keyStage: 'KS4',
    listeningContent: 'Hey, are you free this Saturday afternoon? I was thinking we could check out the new shopping mall in Mong Kok. They have a great food court there, and I heard there is also a new cinema. We could watch a movie after lunch if you like. What do you think?',
    listeningContentZh: '一段朋友之間的對話，邀請對方週末去旺角新商場。',
    prompt: 'What does the speaker want to do?',
    promptZh: '說話者想做什麼？',
    choices: [
      'A. Study together on Saturday',
      'B. Go to a shopping mall in Mong Kok',
      'C. Eat at a restaurant near school',
      'D. Watch a movie on Sunday',
    ],
    answer: 'B',
    explanationZh: '說話者提到 "go to the new shopping mall in Mong Kok"，雖然也提到 cinema 和 food court，但主要目的是去商場。',
    explanationEn: 'The speaker mainly suggests going to the shopping mall. Cinema and food court are secondary mentions.',
    commonMistake: '學生常被次要細節（cinema、food court）干擾，忽略主要目的。',
    hintLevels: ['提示1：留意說話者最先提出的建議是什麼。', '提示2：What is the MAIN suggestion?', '提示3：雖然提到很多地方，但核心是 "go to the shopping mall"。', '提示4：B 正確。說話者主要想約去旺角商場。'],
    genericSkills: ['communication'],
  },
];

// ========================================
// 錯題假資料
// ========================================
export const mockMistakes: MistakeItem[] = [
  {
    id: 'm001', questionId: 'q002', questionSummary: '關係子句：選出正確關係代名詞',
    strand: 'knowledge', grammarItem: 'relative-clauses', subSkill: 'Relative Clauses', subSkillZh: '關係子句', mistakeType: 'grammar',
    studentAnswer: 'A. which', correctAnswer: 'B. who', date: '2026-07-05',
    reviewed: true, inReviewList: true,
    aiExplanation: '你選了 "which"，但 "student" 是人，應用 "who"。記住口訣：「人 who 物 which」。',
  },
  {
    id: 'm002', questionId: 'q004', questionSummary: '改正錯誤："I am living in HK since 2010"',
    strand: 'knowledge', grammarItem: 'tenses', subSkill: 'Error Correction', subSkillZh: '常見錯誤辨析', mistakeType: 'grammar',
    studentAnswer: 'I am living in HK from 2010.', correctAnswer: 'I have been living in HK since 2010.',
    date: '2026-07-04', reviewed: false, inReviewList: false,
  },
  {
    id: 'm003', questionId: 'q007', questionSummary: '條件句：第三條件句結構',
    strand: 'knowledge', grammarItem: 'conditionals', subSkill: 'Conditionals', subSkillZh: '條件句', mistakeType: 'grammar',
    studentAnswer: 'B. studied', correctAnswer: 'C. had studied',
    date: '2026-07-03', reviewed: true, inReviewList: true,
    aiExplanation: '你選了 "studied"（第二條件句），但 "last year" 表示與過去事實相反，需要用第三條件句 "had studied"。',
  },
  {
    id: 'm004', questionId: 'q005', questionSummary: '片語動詞：come up with',
    strand: 'knowledge', grammarItem: 'phrasal-verbs', subSkill: 'Phrasal Verbs', subSkillZh: '片語動詞', mistakeType: 'vocabulary',
    studentAnswer: 'think', correctAnswer: 'come',
    date: '2026-07-02', reviewed: false, inReviewList: false,
  },
  {
    id: 'm005', questionId: 'q009', questionSummary: '詞彙搭配：pay attention',
    strand: 'knowledge', grammarItem: 'phrasal-verbs', subSkill: 'Collocations', subSkillZh: '詞彙搭配', mistakeType: 'vocabulary',
    studentAnswer: 'A. make', correctAnswer: 'B. pay',
    date: '2026-07-01', reviewed: false, inReviewList: false,
  },
  {
    id: 'm006', questionId: 'q010', questionSummary: '被動語態：圖書館將被啟用',
    strand: 'knowledge', grammarItem: 'passive-voice', subSkill: 'Passive Voice', subSkillZh: '被動語態', mistakeType: 'grammar',
    studentAnswer: 'A. will open', correctAnswer: 'B. will be opened',
    date: '2026-06-30', reviewed: true, inReviewList: true,
    aiExplanation: '圖書館是「被啟用」，不是自己開門。被動語態 = will be + opened。',
  },
  {
    id: 'm007', questionId: 'q003', questionSummary: '學術詞彙：implement policies',
    strand: 'knowledge', grammarItem: 'phrasal-verbs', subSkill: 'Academic Vocabulary', subSkillZh: '學術詞彙', mistakeType: 'vocabulary',
    studentAnswer: 'B. imply', correctAnswer: 'A. implement',
    date: '2026-06-28', reviewed: true, inReviewList: false,
    aiExplanation: '"imply" 是暗示，"implement" 才是實施。記住 implement policies（實施政策）這個常用搭配。',
  },
];

// ========================================
// 生字簿假資料
// ========================================
export const mockVocab: VocabItem[] = [
  { id: 'v001', word: 'implement', partOfSpeech: 'v.', meaningZh: '實施；執行', exampleSentence: 'The school will implement a new English curriculum next year.', exampleZh: '學校將於明年實施新的英語課程。', familiarity: 'learning', nextReviewDate: '2026-07-07', },
  { id: 'v002', word: 'comprehensive', partOfSpeech: 'adj.', meaningZh: '全面的；綜合的', exampleSentence: 'We need a comprehensive review of the current system.', exampleZh: '我們需要對現行制度進行全面檢討。', familiarity: 'familiar', nextReviewDate: '2026-07-10', },
  { id: 'v003', word: 'consequence', partOfSpeech: 'n.', meaningZh: '後果；結果', exampleSentence: 'Pollution has serious consequences for our health.', exampleZh: '污染對我們的健康有嚴重後果。', familiarity: 'learning', nextReviewDate: '2026-07-06', },
  { id: 'v004', word: 'sufficient', partOfSpeech: 'adj.', meaningZh: '足夠的；充足的', exampleSentence: 'Do you have sufficient evidence to support your claim?', exampleZh: '你有足夠的證據支持你的說法嗎？', familiarity: 'new', nextReviewDate: '2026-07-07', },
  { id: 'v005', word: 'gradually', partOfSpeech: 'adv.', meaningZh: '逐漸地', exampleSentence: 'Her English has gradually improved over the past few months.', exampleZh: '她的英語在過去幾個月逐漸進步。', familiarity: 'familiar', nextReviewDate: '2026-07-12', },
  { id: 'v006', word: 'come up with', partOfSpeech: 'phr. v.', meaningZh: '想出；提出', exampleSentence: 'She came up with a brilliant idea for the project.', exampleZh: '她為專題想出了一個絕妙的主意。', familiarity: 'learning', nextReviewDate: '2026-07-06', },
  { id: 'v007', word: 'nevertheless', partOfSpeech: 'adv.', meaningZh: '然而；不過', exampleSentence: 'The test was difficult; nevertheless, most students passed.', exampleZh: '考試很難；然而，大部分學生都及格了。', familiarity: 'new', nextReviewDate: '2026-07-08', },
  { id: 'v008', word: 'significant', partOfSpeech: 'adj.', meaningZh: '重要的；顯著的', exampleSentence: 'There has been a significant improvement in her writing skills.', exampleZh: '她的寫作能力有顯著進步。', familiarity: 'mastered', nextReviewDate: '2026-07-20', },
];

// ========================================
// 作業假資料（學生端）
// ========================================
export const mockStudentAssignments: AssignmentSummary[] = [
  { id: 'a001', title: '文法練習：條件句', strand: 'knowledge', grammarItem: 'conditionals', dueDate: '2026-07-10', status: 'in-progress' },
  { id: 'a002', title: '閱讀理解：環保議題', strand: 'knowledge', languageSkill: 'reading', dueDate: '2026-07-08', status: 'not-started' },
  { id: 'a003', title: '詞彙測驗：學術單字', strand: 'knowledge', grammarItem: 'phrasal-verbs', dueDate: '2026-07-05', status: 'completed', score: 75, teacherFeedback: '不錯，但詞彙搭配部分需要加強。' },
  { id: 'a004', title: '寫作練習：投訴信', strand: 'interpersonal', languageSkill: 'writing', dueDate: '2026-07-12', status: 'not-started' },
  { id: 'a005', title: '錯題重練：時態', strand: 'knowledge', grammarItem: 'tenses', dueDate: '2026-07-03', status: 'completed', score: 82, teacherFeedback: '有進步！繼續努力。' },
];

// ========================================
// 作業假資料（教師端）
// ========================================
export const mockTeacherAssignments: Assignment[] = [
  { id: 'a001', title: '文法練習：條件句', className: '4A', gradeLevel: 'S4', keyStage: 'KS4', strand: 'knowledge', grammarItem: 'conditionals', difficulty: 'core', questionType: 'mc', questionCount: 15, dueDate: '2026-07-10', status: 'in-progress', completionRate: 62, assignedBy: '黃淑儀', createdAt: '2026-07-01' },
  { id: 'a002', title: '閱讀理解：環保議題', className: '4A', gradeLevel: 'S4', keyStage: 'KS4', strand: 'knowledge', languageSkill: 'reading', difficulty: 'challenge', questionType: 'mc', questionCount: 10, dueDate: '2026-07-08', status: 'in-progress', completionRate: 35, assignedBy: '黃淑儀', createdAt: '2026-06-28' },
  { id: 'a003', title: '詞彙測驗：學術單字', className: '4A', gradeLevel: 'S4', keyStage: 'KS4', strand: 'knowledge', grammarItem: 'phrasal-verbs', difficulty: 'core', questionType: 'mc', questionCount: 20, dueDate: '2026-07-05', status: 'completed', completionRate: 88, assignedBy: '黃淑儀', createdAt: '2026-06-25' },
  { id: 'a004', title: '寫作練習：投訴信', className: '4B', gradeLevel: 'S4', keyStage: 'KS4', strand: 'interpersonal', languageSkill: 'writing', difficulty: 'challenge', questionType: 'short-writing', questionCount: 1, dueDate: '2026-07-12', status: 'not-started', completionRate: 0, assignedBy: '黃淑儀', createdAt: '2026-07-03' },
  { id: 'a005', title: '錯題重練：時態', className: '4A', gradeLevel: 'S4', keyStage: 'KS4', strand: 'knowledge', grammarItem: 'tenses', difficulty: 'remedial', questionType: 'mc', questionCount: 10, dueDate: '2026-07-03', status: 'completed', completionRate: 95, assignedBy: '黃淑儀', createdAt: '2026-06-20' },
];

// ========================================
// 教材假資料
// ========================================
export const mockMaterials: Material[] = [
  { id: 'mat001', title: 'S4 Unit 3 - Conditional Sentences 筆記', type: 'pdf', uploadedAt: '2026-07-01', tags: ['文法', 'S4', '條件句'], ocrStatus: 'completed', ragStatus: 'completed', fileSize: '2.4 MB', uploadedBy: '黃淑儀' },
  { id: 'mat002', title: '環保閱讀練習文章', type: 'docx', uploadedAt: '2026-06-28', tags: ['閱讀', 'S4', '環保'], ocrStatus: 'completed', ragStatus: 'processing', fileSize: '1.1 MB', uploadedBy: '黃淑儀' },
  { id: 'mat003', title: 'DSE 2019 Reading Paper', type: 'pdf', uploadedAt: '2026-06-20', tags: ['歷屆試題', 'S6', '閱讀'], ocrStatus: 'completed', ragStatus: 'completed', fileSize: '5.8 MB', uploadedBy: '黃淑儀' },
  { id: 'mat004', title: '課室用語海報', type: 'image', uploadedAt: '2026-06-15', tags: ['詞彙', '課室', 'S1-S3'], ocrStatus: 'processing', ragStatus: 'pending', fileSize: '3.2 MB', uploadedBy: '黃淑儀' },
  { id: 'mat005', title: 'Writing: Complaint Letter 範文', type: 'docx', uploadedAt: '2026-07-03', tags: ['寫作', 'S4', '書信'], ocrStatus: 'completed', ragStatus: 'pending', fileSize: '0.8 MB', uploadedBy: '黃淑儀' },
  { id: 'mat006', title: 'Phrasal Verbs 總表', type: 'pdf', uploadedAt: '2026-06-10', tags: ['詞彙', '片語動詞', 'S4-S6'], ocrStatus: 'completed', ragStatus: 'completed', fileSize: '1.5 MB', uploadedBy: '黃淑儀' },
];

// ========================================
// AI 批改覆核假資料
// ========================================
export const mockReviews: ReviewItem[] = [
  { id: 'r001', studentId: 's001', studentName: '陳家明', assignmentId: 'a003', assignmentTitle: '詞彙測驗：學術單字', questionPrompt: 'The government needs to ______ new policies.', studentAnswer: 'B. imply', aiScore: 0, aiFeedback: '答案錯誤。"imply" 意思是暗示，此處應使用 "implement"（實施）。建議重溫 implement 的用法及常見搭配。', teacherScore: 0, teacherFeedback: '同意 AI 判斷。家明，請留意 implement 和 imply 的分別。', status: 'reviewed', submittedAt: '2026-07-05' },
  { id: 'r002', studentId: 's002', studentName: '李志偉', assignmentId: 'a003', assignmentTitle: '詞彙測驗：學術單字', questionPrompt: 'The government needs to ______ new policies.', studentAnswer: 'A. implement', aiScore: 100, aiFeedback: '答案正確！"implement policies" 是標準搭配。', status: 'pending', submittedAt: '2026-07-05' },
  { id: 'r003', studentId: 's003', studentName: '張美玲', assignmentId: 'a005', assignmentTitle: '錯題重練：時態', questionPrompt: 'She ______ to the library yesterday.', studentAnswer: 'C. went', aiScore: 100, aiFeedback: '正確！過去時間 yesterday 應使用簡單過去式。', status: 'pending', submittedAt: '2026-07-02' },
  { id: 'r004', studentId: 's004', studentName: '林小芬', assignmentId: 'a001', assignmentTitle: '文法練習：條件句', questionPrompt: 'If I ______ harder last year, I would have passed.', studentAnswer: 'B. studied', aiScore: 0, aiFeedback: '錯誤。這是第三條件句（與過去事實相反），應用 "had studied"。', teacherScore: 0, teacherFeedback: '小芬，留意 last year 提示要用第三條件句。', status: 'reviewed', submittedAt: '2026-07-04' },
  { id: 'r005', studentId: 's005', studentName: '何俊傑', assignmentId: 'a001', assignmentTitle: '文法練習：條件句', questionPrompt: 'If I ______ harder last year, I would have passed.', studentAnswer: 'C. had studied', aiScore: 100, aiFeedback: '正確！第三條件句結構掌握良好。', status: 'pending', submittedAt: '2026-07-04' },
];

// ========================================
// 班級假資料
// ========================================
export const mockClasses: ClassInfo[] = [
  { id: 'c001', name: '4A', gradeLevel: 'S4', keyStage: 'KS4', studentCount: 32, avgAccuracy: 68, avgCompletionRate: 75 },
  { id: 'c002', name: '4B', gradeLevel: 'S4', keyStage: 'KS4', studentCount: 30, avgAccuracy: 72, avgCompletionRate: 80 },
  { id: 'c003', name: '5C', gradeLevel: 'S5', keyStage: 'KS4', studentCount: 28, avgAccuracy: 65, avgCompletionRate: 70 },
  { id: 'c004', name: '5D', gradeLevel: 'S5', keyStage: 'KS4', studentCount: 31, avgAccuracy: 60, avgCompletionRate: 62 },
];

// ========================================
// 學生列表假資料（教師端）
// ========================================
export const mockClassStudents: ClassStudentSummary[] = [
  { id: 's001', nameZh: '陳家明', nameEn: 'Chan Ka Ming', completionRate: 75, accuracy: 68, weakSkillZh: '關係子句', weakSkill: 'relative-clauses', lastLogin: '2026-07-05', riskLevel: 'medium' },
  { id: 's002', nameZh: '李志偉', nameEn: 'Lee Chi Wai', completionRate: 90, accuracy: 82, weakSkillZh: '推論', weakSkill: 'reading', lastLogin: '2026-07-05', riskLevel: 'low' },
  { id: 's003', nameZh: '張美玲', nameEn: 'Cheung Mei Ling', completionRate: 85, accuracy: 78, weakSkillZh: '片語動詞', weakSkill: 'phrasal-verbs', lastLogin: '2026-07-05', riskLevel: 'low' },
  { id: 's004', nameZh: '林小芬', nameEn: 'Lam Siu Fan', completionRate: 45, accuracy: 52, weakSkillZh: '條件句', weakSkill: 'conditionals', lastLogin: '2026-07-03', riskLevel: 'high' },
  { id: 's005', nameZh: '何俊傑', nameEn: 'Ho Chun Kit', completionRate: 60, accuracy: 65, weakSkillZh: '文章結構', weakSkill: 'writing', lastLogin: '2026-07-04', riskLevel: 'medium' },
  { id: 's006', nameZh: '劉嘉欣', nameEn: 'Lau Ka Yan', completionRate: 30, accuracy: 42, weakSkillZh: '時態', weakSkill: 'tenses', lastLogin: '2026-06-28', riskLevel: 'high' },
  { id: 's007', nameZh: '黃偉文', nameEn: 'Wong Wai Man', completionRate: 95, accuracy: 88, weakSkillZh: '被動語態', weakSkill: 'passive-voice', lastLogin: '2026-07-05', riskLevel: 'low' },
];

// ========================================
// 通知假資料
// ========================================
export const mockNotifications: Notification[] = [
  { id: 'n001', type: 'assignment', title: '新作業已派發', message: '黃老師派發了新作業「寫作練習：投訴信」，截止日期：7月12日。', read: false, createdAt: '2026-07-03', link: '/student/assignments' },
  { id: 'n002', type: 'feedback', title: '作業已批改', message: '你的「詞彙測驗：學術單字」已被批改，得分 75 分。', read: false, createdAt: '2026-07-05', link: '/student/assignments' },
  { id: 'n003', type: 'achievement', title: '成就解鎖！', message: '恭喜！你已連續學習 7 天，獲得「持之以恆」徽章。', read: true, createdAt: '2026-07-05', link: '/student/progress' },
  { id: 'n004', type: 'reminder', title: '作業即將到期', message: '「閱讀理解：環保議題」將於 7月8日 截止，請盡快完成。', read: false, createdAt: '2026-07-05', link: '/student/assignments' },
  { id: 'n005', type: 'system', title: '系統更新通知', message: '平台將於 7月10日 凌晨 2:00-4:00 進行維護。', read: true, createdAt: '2026-07-04' },
];

// ========================================
// 成就徽章假資料
// ========================================
export const mockBadges: Badge[] = [
  { id: 'b001', name: '持之以恆', description: '連續學習 7 天', icon: '🔥', unlockedAt: '2026-07-05', unlocked: true },
  { id: 'b002', name: '文法達人', description: '文法正確率達 80%', icon: '📝', unlocked: false },
  { id: 'b003', name: '詞彙高手', description: '掌握 50 個生字', icon: '📚', unlocked: false },
  { id: 'b004', name: '錯題終結者', description: '重做 20 題錯題並答對', icon: '🎯', unlocked: false },
  { id: 'b005', name: '寫作之星', description: '完成 5 篇寫作練習', icon: '✍️', unlocked: true, unlockedAt: '2026-06-28' },
  { id: 'b006', name: '完美測驗', description: '單次練習獲得 100 分', icon: '⭐', unlocked: false },
];

// ========================================
// 寫作假資料
// ========================================
export const mockWritings: WritingDraft[] = [
  {
    id: 'w001', title: '投訴信 - 惡劣餐廳服務', prompt: 'Write a letter of complaint about poor service at a restaurant.',
    draft: 'Dear Sir,\nI am writing to complain the bad service in your restaurant. I went there last Sunday with my family. The waiter is very rude and the food is cold.',
    revisedVersion: 'Dear Sir/Madam,\nI am writing to complain about the poor service at your restaurant. I visited last Sunday with my family. The waiter was very rude, and the food was cold.',
    aiSuggestions: ['"complain about"（非 complain）', '"poor service" 比 "bad service" 更正式', '時態應統一用過去式：was, visited'],
    chinglishWarnings: ['❌ "complain the bad service" → ✅ "complain about the poor service"（中式英文：漏了介詞 about）'],
    submittedAt: '2026-07-02',
  },
  {
    id: 'w002', title: '論說文 - 社交媒體的影響', prompt: 'Discuss the impact of social media on teenagers.',
    draft: 'Social media have many impact to teenagers. It affect their study and mental health.',
    revisedVersion: 'Social media has many impacts on teenagers. It affects their studies and mental health.',
    aiSuggestions: ['"has" 不是 "have"（social media 是單數）', '"impacts on"（非 impacts to）', '"affects" 是第三人稱單數'],
    chinglishWarnings: ['❌ "impacts to" → ✅ "impacts on"', '❌ "have many impact" → ✅ "has many impacts"'],
    submittedAt: '2026-06-25',
  },
];

// ========================================
// 週報假資料
// ========================================
export const mockWeeklyReports: WeeklyReport[] = [
  { id: 'wr001', className: '4A', weekStart: '2026-07-01', avgAccuracy: 68, avgCompletion: 75, activeStudents: 28, topWeakSkillZh: '關係子句', topWeakGrammar: 'relative-clauses', highlights: '本週 4A 班完成率上升 5%，但文法部分仍需加強。' },
  { id: 'wr002', className: '4B', weekStart: '2026-07-01', avgAccuracy: 72, avgCompletion: 80, activeStudents: 26, topWeakSkillZh: '片語動詞', topWeakGrammar: 'phrasal-verbs', highlights: '4B 班整體表現良好，詞彙練習完成率高。' },
];

// ========================================
// KPI 假資料（教師首頁）
// ========================================
export const mockTeacherKpis = [
  { label: '本週活躍學生', value: 112, unit: '人', trend: 'up' as const, change: 8 },
  { label: '平均完成率', value: 75, unit: '%', trend: 'up' as const, change: 5 },
  { label: '待覆核作業', value: 23, unit: '份', trend: 'down' as const, change: -3 },
  { label: '最弱技能數', value: 4, unit: '項', trend: 'stable' as const, change: 0 },
];

// ========================================
// 學生 KPI 假資料
// ========================================
export const mockStudentKpis = [
  { label: '本週練習量', value: 32, unit: '題', trend: 'up' as const, change: 12 },
  { label: '正確率', value: 68, unit: '%', trend: 'up' as const, change: 3 },
  { label: '連續學習', value: 7, unit: '天', trend: 'stable' as const, change: 0 },
];

// ========================================
// 班級技能熱圖假資料
// ========================================
export const mockSkillHeatmap: SkillHeatmapData[] = [
  { item: 'tenses', itemZh: '時態', '4A': 72, '4B': 78, '5C': 65, '5D': 58 },
  { item: 'relative-clauses', itemZh: '關係子句', '4A': 45, '4B': 55, '5C': 50, '5D': 42 },
  { item: 'conditionals', itemZh: '條件句', '4A': 58, '4B': 62, '5C': 48, '5D': 40 },
  { item: 'passive-voice', itemZh: '被動語態', '4A': 63, '4B': 68, '5C': 55, '5D': 52 },
  { item: 'connectives', itemZh: '詞彙搭配', '4A': 55, '4B': 60, '5C': 52, '5D': 48 },
  { item: 'phrasal-verbs', itemZh: '片語動詞', '4A': 40, '4B': 48, '5C': 38, '5D': 35 },
  { item: 'main-idea', itemZh: '主旨理解', '4A': 70, '4B': 75, '5C': 68, '5D': 62 },
  { item: 'inference', itemZh: '推論', '4A': 52, '4B': 58, '5C': 45, '5D': 40 },
];

// ========================================
// 學生練習趨勢假資料（圖表用）
// ========================================
export const mockPracticeTrend = [
  { week: '6月W1', 練習量: 18, 正確率: 62 },
  { week: '6月W2', 練習量: 22, 正確率: 60 },
  { week: '6月W3', 練習量: 28, 正確率: 65 },
  { week: '6月W4', 練習量: 25, 正確率: 64 },
  { week: '7月W1', 練習量: 32, 正確率: 68 },
];

// ========================================
// 學生技能進步假資料（圖表用）
// ========================================
export const mockSkillProgress = [
  { skill: '時態', 月初: 65, 現在: 72 },
  { skill: '關係子句', 月初: 38, 現在: 45 },
  { skill: '條件句', 月初: 50, 現在: 58 },
  { skill: '詞彙', 月初: 55, 現在: 60 },
  { skill: '閱讀', 月初: 58, 現在: 61 },
  { skill: '寫作', 月初: 45, 現在: 50 },
];

// ========================================
// 需跟進學生假資料
// ========================================
export const mockAtRiskStudents = [
  { id: 's004', name: '林小芬', class: '4A', risk: '高', reason: '完成率低於50%，連續3日未登入', accuracy: 52, lastLogin: '2026-07-03' },
  { id: 's006', name: '劉嘉欣', class: '4A', risk: '高', reason: '正確率持續下降，完成率僅30%', accuracy: 42, lastLogin: '2026-06-28' },
  { id: 's001', name: '陳家明', class: '4A', risk: '中', reason: '關係子句掌握度低於50%', accuracy: 68, lastLogin: '2026-07-05' },
  { id: 's005', name: '何俊傑', class: '4A', risk: '中', reason: '寫作能力待改善', accuracy: 65, lastLogin: '2026-07-04' },
];
