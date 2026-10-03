// ============================================
// i18n — IELTS 備考子系統（zh / en）
// ============================================
// Wording contract (docs/ielts/IELTS_ASSESSMENT_GOVERNANCE.md §11):
// allowed: 練習估算 / estimated band / AI-assisted feedback / IELTS-style
// forbidden: official IELTS score / certified examiner / guaranteed band
// ============================================

export const ieltsTranslations: Record<string, { zh: string; en: string }> = {
  'nav.ielts': { zh: 'IELTS 備考（測試版）', en: 'IELTS Prep (Beta)' },

  'ielts.betaBadge': { zh: '測試版', en: 'Beta' },
  'ielts.betaNotice': {
    zh: '測試版：尚無人工評分校準（HUMAN_EVIDENCE = INSUFFICIENT），分數與內容僅供練習參考；AI 生成題目已通過機械屏檢與盲解覆核，且必須經人工審核才能發佈。',
    en: 'Beta: no human-marker calibration yet (HUMAN_EVIDENCE = INSUFFICIENT). Scores and content are practice material only; AI-generated items pass a machine screen and blind-solve verification, and still require human review before publication.',
  },

  // ---- 出題與審核台（教師／管理員） ----
  'ielts.admin.title': { zh: 'IELTS 出題與審核台', en: 'IELTS Authoring & QA Console' },
  'ielts.admin.note': {
    zh: 'AI 生成的題目只會存入 DRAFT 卷並停留在 QA_REQUIRED；必須由你逐題人工核准並發佈後，學生才會看到。AI 永不自動發佈。',
    en: 'AI-generated items land in a DRAFT test at QA_REQUIRED only. Students see content ONLY after you approve each question and publish the test. AI never auto-publishes.',
  },
  'ielts.admin.generateTitle': { zh: 'AI 生成練習（DeepSeek）', en: 'AI practice generation (DeepSeek)' },
  'ielts.admin.skill': { zh: '技能', en: 'Skill' },
  'ielts.admin.variant': { zh: '組別', en: 'Variant' },
  'ielts.admin.scope': { zh: '範圍', en: 'Scope' },
  'ielts.admin.scopeSet': { zh: '單一 Section／Part', en: 'Single section/part' },
  'ielts.admin.scopeFull': { zh: '完整卷（40 題）', en: 'Full component (40 questions)' },
  'ielts.admin.count': { zh: '題數', en: 'Questions' },
  'ielts.admin.topic': { zh: '主題提示（可選）', en: 'Topic hint (optional)' },
  'ielts.admin.topicPlaceholder': { zh: '例如：城市綠化', en: 'e.g. urban green spaces' },
  'ielts.admin.generate': { zh: '生成', en: 'Generate' },
  'ielts.admin.generating': { zh: '生成中…（可能需 1–3 分鐘）', en: 'Generating… (may take 1–3 minutes)' },
  'ielts.admin.generateResult': {
    zh: '生成完成：交付 {delivered}／{requested} 題（短欠 {shortfall}）',
    en: 'Generation complete: delivered {delivered}/{requested} questions (shortfall {shortfall})',
  },
  'ielts.admin.drops': { zh: '被丟棄項目', en: 'Dropped items' },
  'ielts.admin.generated': { zh: '生成完成，題目已存入 QA_REQUIRED 等待你的審核。', en: 'Generation complete — items are stored at QA_REQUIRED awaiting your review.' },
  'ielts.admin.generateFailed': { zh: '生成失敗，請稍後重試。', en: 'Generation failed. Please try again later.' },
  'ielts.admin.testsTitle': { zh: '試卷與審核佇列', en: 'Tests & review queue' },
  'ielts.admin.refresh': { zh: '重新載入', en: 'Refresh' },
  'ielts.admin.noTests': { zh: '暫無試卷。', en: 'No tests yet.' },
  'ielts.admin.questions': { zh: '{count} 題', en: '{count} questions' },
  'ielts.admin.qaCount': { zh: '待審 {count}', en: '{count} awaiting QA' },
  'ielts.admin.loadQuestions': { zh: '載入題目', en: 'Load questions' },
  'ielts.admin.publishTest': { zh: '發佈試卷', en: 'Publish test' },
  'ielts.admin.publishBlocked': { zh: '所有題目必須先個別發佈，才可發佈整份試卷。', en: 'Every question must be published individually before the test can be published.' },
  'ielts.admin.reviewTitle': { zh: '題目審核', en: 'Question review' },
  'ielts.admin.noQuestions': { zh: '此試卷暫無題目。', en: 'This test has no questions yet.' },
  'ielts.admin.approve': { zh: '核准', en: 'Approve' },
  'ielts.admin.publish': { zh: '發佈', en: 'Publish' },
  'ielts.admin.answer': { zh: '答案', en: 'Answer' },
  'ielts.admin.testPublished': { zh: '試卷已發佈，學生現在可見。', en: 'Test published — students can now see it.' },
  'ielts.admin.instantBadge': {
    zh: '學生即時自學（未經審核）',
    en: 'Student instant self-study (unreviewed)',
  },
  'ielts.admin.loadFailed': { zh: '載入失敗，請重新整理。', en: 'Failed to load. Please refresh.' },
  'ielts.admin.actionFailed': { zh: '操作失敗，請重試。', en: 'Action failed. Please retry.' },

  'ielts.title': { zh: 'IELTS 模擬練習', en: 'IELTS-Style Practice' },
  'ielts.subtitle': {
    zh: '學術組與通用組四項技能練習、寫作與口說 AI 輔助回饋',
    en: 'Academic & General Training practice across four skills, with AI-assisted Writing and Speaking feedback',
  },
  'ielts.disclaimer': {
    zh: '本平台提供 IELTS 風格練習與練習估算分（estimated band），並非官方 IELTS 考試，分數不等同官方成績或認證考官評分。',
    en: 'This platform offers IELTS-style practice and estimated bands. It is not the official IELTS test, and estimates are not official scores or certified examiner judgements.',
  },
  'ielts.humanEvidence': {
    zh: '校準狀態：HUMAN_EVIDENCE = INSUFFICIENT（尚無人工評分校準資料）',
    en: 'Calibration status: HUMAN_EVIDENCE = INSUFFICIENT (no human-marker calibration data yet)',
  },
  'ielts.practiceOnly': { zh: '練習估算', en: 'Practice estimate' },
  'ielts.notComparable': { zh: '此練習未達完整卷別題數，無官方分數換算', en: 'Practice subset — not comparable to the official scale' },
  'ielts.aiVoiceNotice': {
    zh: '語音由平台 AI 語音合成（非官方錄音）',
    en: 'Audio is synthesised by platform AI voices (not an official recording)',
  },

  'ielts.testType.academic': { zh: '學術組 (Academic)', en: 'Academic' },
  'ielts.testType.general': { zh: '通用組 (General Training)', en: 'General Training' },
  'ielts.skill.listening': { zh: '聆聽', en: 'Listening' },
  'ielts.skill.reading': { zh: '閱讀', en: 'Reading' },
  'ielts.skill.writing': { zh: '寫作', en: 'Writing' },
  'ielts.skill.speaking': { zh: '口說', en: 'Speaking' },
  'ielts.skills.title': { zh: '四項技能', en: 'Four Skills' },

  'ielts.dashboard.tests': { zh: '練習卷', en: 'Practice Tests' },
  'ielts.dashboard.noTests': {
    zh: '目前沒有已發佈的練習卷。內容需經人工審核發佈後才會顯示。',
    en: 'No published practice tests yet. Content appears only after human review and publication.',
  },
  'ielts.dashboard.writingLink': { zh: '寫作 AI 練習', en: 'Writing AI practice' },
  'ielts.dashboard.speakingLink': { zh: '口說準備教練', en: 'Speaking preparation coach' },
  'ielts.dashboard.progressLink': { zh: '我的 IELTS 進度', en: 'My IELTS progress' },
  'ielts.dashboard.adminNote': {
    zh: '題目須經 DRAFT → AI 驗證 → 人工審核 → 發佈。AI 永不自動發佈題目。',
    en: 'Items go through DRAFT → AI validation → human review → publication. AI never auto-publishes.',
  },
  'ielts.questionCount': { zh: '{count} 題', en: '{count} questions' },

  // ---- 即時自學練習（2026-10-03 VII）：
  // 不需等待人手審核即可練習；但內容一律明確標示「未經教師審核」，
  // 且永不進入正式題庫（發佈仍須人工） ----
  'ielts.instant.title': { zh: '即時自學練習', en: 'Instant self-study practice' },
  'ielts.instant.desc': {
    zh: '按你的選擇即時生成閱讀／聆聽練習；每題必須通過機械屏檢與盲解覆核（與教師出題同一組把關），無需等待人手安排即可練習。',
    en: 'Reading/listening practice generated on demand; every item passes the same machine screen and blind-solve verification used for authoring — practise without waiting for human review.',
  },
  'ielts.instant.note': {
    zh: '注意：即時練習「未經教師審核」，只作練習用途；教師日後可在審核台檢視，並把合用的題目發佈為正式題庫內容。',
    en: 'Note: instant sets are NOT teacher-reviewed and are practice-only. Teachers can later review them in the console and publish suitable items into the catalogue.',
  },
  'ielts.instant.start': { zh: '開始即時練習', en: 'Start instant practice' },
  'ielts.instant.starting': {
    zh: '正在出題…（可能需 1–3 分鐘）',
    en: 'Generating… (may take 1–3 minutes)',
  },
  'ielts.instant.failed': {
    zh: '暫時未能出題，請稍後再試。',
    en: 'Could not generate questions right now. Please try again later.',
  },
  // NOTE: “每日上限 8 次 / 8 sets per day” must stay in sync with
  // IELTS_INSTANT_PRACTICE_DAILY_LIMIT (modules/ielts/services/instant-practice-service.ts).
  'ielts.instant.dailyLimit': {
    zh: '今日即時練習次數已用完（每日上限 8 次），明天再來。',
    en: 'Daily instant-practice limit reached (8 sets per day). Come back tomorrow.',
  },
  // 2026-10-03 (XII): distinct failure surfaces — never a single generic error.
  'ielts.instant.budget': {
    zh: '今日 AI 用量已達上限，暫停出題（香港時間上午 8 時重置）。閱讀／聆聽既有題庫不受影響。',
    en: 'The daily AI budget is exhausted, so generation is paused (resets at 8 am HKT). Existing catalogue practice is unaffected.',
  },
  'ielts.instant.provider': {
    zh: 'AI 供應商暫時未能回應，請再試一次（若持續發生，請通知老師）。',
    en: 'The AI provider did not respond in time. Please try again in a moment.',
  },
  'ielts.instant.noContent': {
    zh: '今次未能生成合格題目（全數未通過品質覆核），請再試一次。',
    en: 'This attempt produced no items that passed the quality gates. Please try again.',
  },
  'ielts.instant.banner': {
    zh: 'AI 即時自學練習（未經教師審核）',
    en: 'AI instant self-study (not teacher-reviewed)',
  },
  'ielts.instant.bannerDetail': {
    zh: '本卷由 AI 按你的選擇即時生成，並已通過機械屏檢與盲解覆核；但未經教師審核，內容或有不完美之處，只作練習用途。',
    en: 'This set was generated on demand and passed the automated machine screen and blind-solve verification only. It is NOT teacher-reviewed; practice use only.',
  },

  'ielts.dashboard.modeTitle': { zh: '選擇練習組別', en: 'Choose your test variant' },
  'ielts.dashboard.academicDesc': {
    zh: '學術組：閱讀為學術長文；寫作 Task 1 為圖表描述（本平台以資料表呈現）。',
    en: 'Academic: academic-style reading texts; Writing Task 1 is a visual description (delivered as a data table on this platform).',
  },
  'ielts.dashboard.generalDesc': {
    zh: '通用組：閱讀為日常／職場短文；寫作 Task 1 為書信（三個要點）。',
    en: 'General Training: everyday/workplace texts; Writing Task 1 is a letter (three bullet points).',
  },
  'ielts.dashboard.sameNote': {
    zh: '聆聽與口說在兩組完全相同（官方相同）；本平台口說只提供準備教學、不評分。',
    en: 'Listening and Speaking are identical in both variants (as in the official test); Speaking here is preparation coaching only and is never scored.',
  },

  'ielts.start': { zh: '開始練習', en: 'Start practice' },
  'ielts.section': { zh: '部分', en: 'Section' },
  'ielts.questions': { zh: '題目', en: 'Questions' },
  'ielts.submit': { zh: '提交答案', en: 'Submit answers' },
  'ielts.submitting': { zh: '批改中…', en: 'Scoring…' },
  'ielts.answered': { zh: '已作答 {answered}/{total}', en: 'Answered {answered}/{total}' },
  'ielts.play': { zh: '播放語音', en: 'Play audio' },
  'ielts.playLoading': { zh: '準備語音中…', en: 'Preparing audio…' },
  'ielts.audioUnavailable': { zh: '語音暫時無法使用，請稍後再試。', en: 'Audio is temporarily unavailable. Please try again later.' },
  'ielts.transcriptAfterSubmit': {
    zh: '逐字稿將於提交後顯示（作答前不顯示以避免洩題）',
    en: 'The transcript is revealed after submission (hidden beforehand to avoid answer leakage)',
  },
  'ielts.wordLimit': { zh: '{instruction}', en: '{instruction}' },
  'ielts.wordLimitShort': { zh: '限 {n} 字內', en: 'Max {n} words' },
  'ielts.answerPlaceholder': { zh: '輸入答案…', en: 'Type your answer…' },

  'ielts.verdict.correct': { zh: '正確', en: 'Correct' },
  'ielts.verdict.incorrect': { zh: '不正確', en: 'Incorrect' },
  'ielts.verdict.ungradable': { zh: '不計分', en: 'Not scored' },
  'ielts.feedback.wordLimitExceeded': {
    zh: '超出字數上限，本題不獲計分',
    en: 'Max words exceeded — no mark awarded',
  },
  'ielts.score': { zh: '得分 {score}/{total}', en: 'Score {score}/{total}' },
  'ielts.correctAnswer': { zh: '答案', en: 'Answer' },
  'ielts.acceptedAnswers': { zh: '其他接受答案', en: 'Accepted alternatives' },
  'ielts.explanation': { zh: '解釋', en: 'Explanation' },
  'ielts.explain.button': { zh: 'AI 解說此題', en: 'Explain this with AI' },
  'ielts.explain.loading': { zh: '解說中…', en: 'Explaining…' },
  'ielts.explain.whyKey': { zh: '正確答案為何成立', en: 'Why the correct answer is right' },
  'ielts.explain.whyYours': { zh: '你的答案問題所在', en: 'Why your answer does not work' },
  'ielts.explain.tip': { zh: '下次提醒', en: 'Tip for next time' },
  'ielts.explain.note': {
    zh: 'AI 輔助解說：只作解釋，永不改分（分數由伺服器決定性評分，判定不變）。',
    en: 'AI-assisted explanation only — it never changes your mark (scoring is deterministic and server-side; the verdict stands).',
  },
  'ielts.explain.failed': {
    zh: '暫時未能產生解說，請稍後再試。',
    en: 'Could not generate an explanation right now. Please try again later.',
  },
  'ielts.evidence': { zh: '文章／逐字稿依據', en: 'Evidence in passage/transcript' },
  'ielts.bandEstimate': { zh: '練習估算分', en: 'Estimated band' },
  'ielts.bandRange': { zh: '估算範圍', en: 'Estimate range' },
  'ielts.officialNote': {
    zh: '官方說明：各版本試題的分數界線略有差異，此為估算範圍，非官方換算。',
    en: 'Official note: precise mark cut-offs vary slightly by test version; this is an estimate range, not an official conversion.',
  },
  'ielts.reviewAgain': { zh: '再做一次', en: 'Practice again' },

  'ielts.writing.title': { zh: 'IELTS 寫作 AI 輔助評估', en: 'IELTS Writing — AI-assisted assessment' },
  'ielts.writing.taskType': { zh: '任務類型', en: 'Task type' },
  'ielts.writing.task1Academic': { zh: '學術組 Task 1（圖表描述）', en: 'Academic Task 1 (visual description)' },
  'ielts.writing.task2Academic': { zh: '學術組 Task 2（議論文）', en: 'Academic Task 2 (essay)' },
  'ielts.writing.task1General': { zh: '通用組 Task 1（書信）', en: 'General Training Task 1 (letter)' },
  'ielts.writing.task2General': { zh: '通用組 Task 2（議論文）', en: 'General Training Task 2 (essay)' },
  'ielts.writing.promptLabel': { zh: '題目', en: 'Task prompt' },
  'ielts.writing.essayLabel': { zh: '你的文章', en: 'Your response' },
  'ielts.writing.wordCount': { zh: '字數：{count}／最少 {min}', en: 'Words: {count} / minimum {min}' },
  'ielts.writing.belowMinWarn': {
    zh: '低於最低字數：官方指出過短的文章可能不足以展示較高分數所需的語言特徵（本平台不宣稱機械式扣分）。',
    en: 'Below the minimum: the official guidance notes a short response may not provide enough evidence for higher bands (the platform makes no mechanical penalty claim).',
  },
  'ielts.writing.assess': { zh: '取得 AI 回饋（練習估算）', en: 'Get AI feedback (practice estimate)' },
  'ielts.writing.assessing': { zh: '評估中…', en: 'Assessing…' },
  'ielts.writing.useSample': { zh: '使用範例題目', en: 'Use a sample prompt' },
  'ielts.writing.sampleCustom': { zh: '（自訂題目）', en: '(custom prompt)' },
  'ielts.writing.modeLabel': { zh: '測驗組別', en: 'Test variant' },
  'ielts.writing.promptSource': { zh: '題目來源', en: 'Prompt source' },
  'ielts.writing.sourceSample': { zh: '內建範例', en: 'Built-in sample' },
  'ielts.writing.sourceBank': { zh: '平台題庫（已發佈）', en: 'Platform bank (published)' },
  'ielts.writing.sourceCustom': { zh: '自訂', en: 'Custom' },
  'ielts.writing.bankInfo': {
    zh: '題庫共 {count} 題（已發佈）；AI 生成題目須經人工審核發佈後才會出現。',
    en: '{count} published prompt(s) in the bank; AI-generated tasks appear only after human review and publication.',
  },
  'ielts.writing.bankEmpty': {
    zh: '此組別暫無已發佈題目，可使用內建範例或自訂題目。',
    en: 'No published prompts for this variant yet — use a built-in sample or a custom prompt.',
  },

  'ielts.assessment.taskBand': { zh: '任務估算分', en: 'Estimated task band' },
  'ielts.assessment.criteria': { zh: '四項官方準則', en: 'Four official criteria' },
  'ielts.assessment.criterion.taskAchievement': { zh: '任務達成／回應', en: 'Task Achievement / Response' },
  'ielts.assessment.criterion.coherence': { zh: '連貫與銜接', en: 'Coherence and Cohesion' },
  'ielts.assessment.criterion.lexical': { zh: '詞彙資源', en: 'Lexical Resource' },
  'ielts.assessment.criterion.grammar': { zh: '語法範圍與準確度', en: 'Grammatical Range and Accuracy' },
  'ielts.assessment.strengths': { zh: '優點', en: 'Strengths' },
  'ielts.assessment.weaknesses': { zh: '待改善', en: 'Weaknesses' },
  'ielts.assessment.rationale': { zh: '理據', en: 'Rationale' },
  'ielts.assessment.coverage': { zh: '題目要求覆蓋', en: 'Task requirement coverage' },
  'ielts.assessment.coverageStatus.ADDRESSED': { zh: '已回應', en: 'Addressed' },
  'ielts.assessment.coverageStatus.PARTIALLY_ADDRESSED': { zh: '部分回應', en: 'Partially addressed' },
  'ielts.assessment.coverageStatus.NOT_ADDRESSED': { zh: '未回應', en: 'Not addressed' },
  'ielts.assessment.unreported': { zh: 'AI 未回報的要求', en: 'Requirements not reported by AI' },
  'ielts.assessment.template': { zh: '疑似背誦模板', en: 'Possible memorised template' },
  'ielts.assessment.confidence': { zh: '信心程度', en: 'Confidence' },
  'ielts.assessment.calibration': { zh: '校準狀態', en: 'Calibration status' },
  'ielts.assessment.limitations': { zh: '重要限制', en: 'Important limitations' },
  'ielts.assessment.uncertainty': { zh: '不確定之處', en: 'Uncertainty' },
  'ielts.assessment.noEvidence': { zh: '（未能驗證的引文已剔除）', en: '(unverified quotes were removed)' },

  'ielts.speaking.title': { zh: 'IELTS 口說準備中心', en: 'IELTS Speaking — Preparation Centre' },
  'ielts.speaking.noScoreNotice': {
    zh: '本平台不評分口說、不模擬真人考官對答、不評估發音——只教你如何準備。',
    en: 'This platform does not score Speaking, does not simulate an examiner, and does not assess pronunciation — it teaches you how to prepare.',
  },
  'ielts.speaking.variantNote': {
    zh: '口說在學術組與通用訓練組完全相同，毋須選擇組別。',
    en: 'Speaking is identical for Academic and General Training — no variant choice is needed.',
  },
  'ielts.speaking.notOffered': {
    zh: '本平台不提供：口說分數／估算分、模擬考官互動、發音評估。請以真實考官與官方評分為準。',
    en: 'Not offered: Speaking scores/estimates, examiner simulation, or pronunciation assessment. The real examiner and official scoring remain the only authority.',
  },
  'ielts.speaking.howItWorks': { zh: '考試結構與評分準則（教學用）', en: 'How the test works & what is assessed (teaching)' },
  'ielts.speaking.criteriaTitle': { zh: '真實考試的四項準則', en: 'The four criteria the real test uses' },
  'ielts.speaking.part': { zh: '部分', en: 'Part' },
  'ielts.speaking.part1': { zh: 'Part 1 自我介紹與訪問（4–5 分鐘）', en: 'Part 1 Introduction & interview (4–5 min)' },
  'ielts.speaking.part2': { zh: 'Part 2 長答題（1 分鐘準備 + 最多 2 分鐘）', en: 'Part 2 Long turn (1 min prep + up to 2 min)' },
  'ielts.speaking.part3': { zh: 'Part 3 討論（4–5 分鐘）', en: 'Part 3 Discussion (4–5 min)' },
  'ielts.speaking.topicBank': { zh: '準備題庫（平台原創）', en: 'Preparation topic bank (platform-original)' },
  'ielts.speaking.category.part1': { zh: 'Part 1 常見主題', en: 'Part 1 familiar themes' },
  'ielts.speaking.category.people': { zh: 'Part 2 — 人物', en: 'Part 2 — People' },
  'ielts.speaking.category.places': { zh: 'Part 2 — 地點', en: 'Part 2 — Places' },
  'ielts.speaking.category.objects': { zh: 'Part 2 — 物品事物', en: 'Part 2 — Objects & things' },
  'ielts.speaking.category.events': { zh: 'Part 2 — 事件經歷', en: 'Part 2 — Events & experiences' },
  'ielts.speaking.category.part3': { zh: 'Part 3 討論功能', en: 'Part 3 discussion functions' },
  'ielts.speaking.prepPointers': { zh: '準備重點（方法）', en: 'Preparation pointers (method)' },
  'ielts.speaking.languageFunctions': { zh: '實用語言功能（可改寫，非背稿）', en: 'Useful language functions (adapt, do not memorise)' },
  'ielts.speaking.pitfalls': { zh: '常見陷阱', en: 'Common pitfalls' },
  'ielts.speaking.practiceWithThis': { zh: '用這題開始準備', en: 'Prepare with this topic' },
  'ielts.speaking.noteGridTitle': { zh: 'Part 2 四宮格筆記法', en: 'Part 2 — four-quadrant note grid' },
  'ielts.speaking.gridHint': {
    zh: 'Z 次序：左上 → 右上 → 左下 → 右下；格內只寫關鍵詞，切勿寫完整句子。',
    en: 'Z order: top-left → top-right → bottom-left → bottom-right; keywords only — never full sentences.',
  },
  'ielts.speaking.mergeTitle': { zh: '串題工作台（一故事多用）', en: 'Story-merging workbench (one story, many cards)' },
  'ielts.speaking.selectCards': { zh: '選擇要串連的題目卡（可多選）', en: 'Select cue cards to merge (multiple allowed)' },
  'ielts.speaking.yourStory': { zh: '你自己的真實經歷／故事', en: 'Your own real experience / story' },
  'ielts.speaking.yourStoryPlaceholder': {
    zh: '例：那次旅程／那個人／那個決定……（用自己的真實經歷，不要編造）',
    en: 'e.g. that trip / that person / that decision… (use your real experience, never invent one)',
  },
  'ielts.speaking.mergeGenerate': { zh: '請 AI 協助整理串題計劃', en: 'Ask AI to organise a merging plan' },
  'ielts.speaking.coachTitle': { zh: 'AI 準備教練（不評分）', en: 'AI preparation coach (no scoring)' },
  'ielts.speaking.coachIntro': {
    zh: '輸入題目與你自己的筆記，教練會整理：準備步驟、各面向構思、語言功能、陷阱與練習問題——全部不含分數。',
    en: 'Give a topic plus your own notes; the coach returns preparation steps, facet ideas, language functions, pitfalls and practice questions — with no scores anywhere.',
  },
  'ielts.speaking.taskCard': { zh: '題目卡 / 問題', en: 'Task card / question set' },
  'ielts.speaking.yourNotes': { zh: '你自己的筆記（建議填寫）', en: 'Your own notes (recommended)' },
  'ielts.speaking.notesPlaceholder': {
    zh: '你想到的關鍵詞、經歷重點、想用的講法……',
    en: 'Keywords, experience details, phrases you want to try…',
  },
  'ielts.speaking.startCoach': { zh: '生成準備計劃（不評分）', en: 'Generate preparation plan (no scoring)' },
  'ielts.speaking.prepOnly': { zh: '準備計劃（不評分）', en: 'Preparation plan (not scored)' },
  'ielts.speaking.planTitle': { zh: '準備步驟', en: 'Preparation plan' },
  'ielts.speaking.outlineTitle': { zh: '構思（逐面向）', en: 'Outline (facet by facet)' },
  'ielts.speaking.languageTitle': { zh: '語言功能與示例框架', en: 'Language functions & example frames' },
  'ielts.speaking.followUpsTitle': { zh: '自我練習問題', en: 'Practice questions to ask yourself' },
  'ielts.speaking.mergeSuggestionsTitle': { zh: '串題建議', en: 'Story-merging suggestions' },
  'ielts.speaking.practiceLoopTitle': { zh: '自錄自聽練習循環', en: 'Self-recording practice loop' },
  'ielts.speaking.selfCheck': { zh: '自評檢查表', en: 'Self-check list' },
  'ielts.speaking.commonPitfalls': { zh: '常見失分陷阱', en: 'Common pitfalls to avoid' },

  'ielts.progress.title': { zh: '我的 IELTS 練習進度', en: 'My IELTS Practice Progress' },
  'ielts.progress.attempts': { zh: '練習次數', en: 'Attempts' },
  'ielts.progress.latestBand': { zh: '最近估算', en: 'Latest estimate' },
  'ielts.progress.recent': { zh: '最近練習記錄', en: 'Recent practice' },
  'ielts.progress.noData': { zh: '尚無練習記錄', en: 'No practice records yet' },
  'ielts.progress.latestNote': {
    zh: '以上為各技能「最近一次」練習的估算，並非累積平均；練習估算會隨時間變動。',
    en: 'Values show the LATEST estimate per skill — not a cumulative average. Practice estimates vary over time.',
  },

  'ielts.status.title': { zh: '系統狀態與限制', en: 'Status & Limitations' },
  'ielts.error.generic': { zh: '發生錯誤，請稍後再試。', en: 'Something went wrong. Please try again.' },
  'ielts.error.loginRequired': { zh: '請先登入。', en: 'Please log in.' },
  'ielts.error.AI_BUDGET_EXHAUSTED': {
    zh: '今日 AI 額度已用完，請稍後再試。',
    en: 'The AI budget for today is exhausted. Please try again later.',
  },
  'ielts.error.AI_PROVIDER_TIMEOUT': { zh: 'AI 回應逾時，請重試。', en: 'The AI request timed out. Please retry.' },
  'ielts.error.AI_EVIDENCE_MISMATCH': {
    zh: 'AI 引用的文章依據未能核實，評估已被拒絕（不會顯示未經核實的分數）。',
    en: 'The AI evidence could not be verified, so the assessment was refused (unverified bands are never shown).',
  },
  'ielts.error.AI_MISSING_CRITERION': {
    zh: 'AI 回覆缺少準則，評估已被拒絕。',
    en: 'The AI response was missing a criterion; the assessment was refused.',
  },
  'ielts.error.AI_MISSING_EVIDENCE': {
    zh: 'AI 評分缺少證據引文，評估已被拒絕（無證據的評分一律無效）。',
    en: 'The AI returned a band without evidence; the assessment was refused (evidence-less scores are invalid).',
  },
  'ielts.error.AI_UNSUPPORTED_BAND': {
    zh: 'AI 回覆的分數格式不合法（僅接受整分或半分），評估已被拒絕。',
    en: 'The AI returned an invalid band (whole/half only); the assessment was refused.',
  },
  'ielts.error.TASK_NOT_ANSWERED': {
    zh: '內容過短或未作答，無法評估。',
    en: 'The response is too short or missing; there is nothing to assess.',
  },
  'ielts.error.AI_PROVIDER_ERROR': { zh: 'AI 服務暫不可用，請重試。', en: 'The AI service is unavailable. Please retry.' },
  'ielts.error.AI_INVALID_JSON': { zh: 'AI 回覆格式錯誤，請重試。', en: 'The AI returned malformed output. Please retry.' },
};
