// ============================================
// 2026-10-03 PHASE IELTS-01：IELTS 起始內容 seed（平台原創內容）
//
// ⚠️ CANONICAL SOURCE NOTE (2026-10-03 V):
//   學生的「登入即可練習」起始內容由 `src/modules/ielts/content/starter-sets.ts`
//   經 `ensureStarterContent()` 自動 provision（首次載入目錄時；冪等）。本腳本
//   保留作「人工重跑 / 明確指定 reviewer 發佈」用途；內容如需修改，必須
//   同步更新 `starter-sets.ts`（那份是正典），以免兩者分歧。
//
// 用法：
//   npx tsx scripts/seed-ielts.ts
//     → 建立閱讀卷＋聆聽卷（DRAFT），逐題跑機器驗證，成功者進 QA_REQUIRED。
//       不會自動發佈。
//
//   npx tsx scripts/seed-ielts.ts --reviewer=<teacherOrAdminUserId>
//     → 以指定的人工審核者身分（須為 teacher/admin）將已驗證題目
//       HUMAN_APPROVED → PUBLISHED，並發佈整份卷。這是「人工明示」，
//       不是自動發佈；未提供 reviewer 時永不發佈。
//
// 治理：
//   * 內容全部為平台原創（ORIGINAL_GENERATED），非官方 IELTS 試題
//   * 不寫入任何 HKDSE 資料；不影響既有 XP／證據語意
//   * AI 永不自動發佈（轉換由 validation/pipeline 強制）
// ============================================

import { argValue, getDbUrl } from './lib/db-env';

async function main() {
  process.env.DATABASE_URL = getDbUrl();

  const { db } = await import('@/shared/db/db');
  const { validateIeltsQuestion } = await import('@/modules/ielts/validation/question-validator');
  const { applyTransition } = await import('@/modules/ielts/validation/pipeline');

  const reviewerId = argValue('--reviewer');

  // ---------- 原創閱讀內容（Academic style，非官方試題） ----------
  const passage = [
    'Community repair cafes have spread across many towns in the past decade. At these events, volunteers help visitors mend broken household items, from toasters to bicycles, free of charge.',
    'Organisers say the main aim is to reduce waste. Instead of replacing a faulty lamp, visitors learn to replace a fuse or a switch, and they often return with new confidence to attempt repairs at home.',
    'Some local governments now fund repair cafes because the events save energy that would otherwise be spent manufacturing replacement goods. A council survey in one town found that participating households sent almost a third less electrical waste to landfill within a year.',
    'Not everyone is convinced. Manufacturers warn that inexpert repairs can be dangerous, particularly for devices connected to mains electricity. Volunteers counter that every repair is supervised, and that visitors are told clearly when a professional is needed.',
    'What unites both sides is the observation that the repair culture depends on skills, not equipment. Where training is offered alongside the cafes, the events thrive; where it is not, they often fade away.',
  ].join(' ');

  function span(phrase: string) {
    const start = passage.indexOf(phrase);
    if (start < 0) throw new Error(`seed span not found: ${phrase}`);
    return { start, end: start + phrase.length, text: phrase };
  }

  const readingQuestions = [
    {
      questionType: 'reading_true_false_not_given',
      prompt: 'Repair cafes charge visitors a small fee for repairs.',
      answerKey: 'FALSE',
      explanation: 'The first paragraph states that volunteers help visitors free of charge.',
      difficulty: 'EASY',
      evidence: { passageId: 'seed-reading-passage', evidenceSpans: [span('volunteers help visitors mend broken household items, from toasters to bicycles, free of charge')], reasoning: 'The passage explicitly says repairs are free.', answerType: 'contrast' },
    },
    {
      questionType: 'reading_true_false_not_given',
      prompt: 'Repair cafes have been more successful in towns that offer training.',
      answerKey: 'TRUE',
      explanation: 'The final paragraph says events thrive where training is offered.',
      difficulty: 'MEDIUM',
      evidence: { passageId: 'seed-reading-passage', evidenceSpans: [span('Where training is offered alongside the cafes, the events thrive')], reasoning: 'Direct statement linking training to thriving events.', answerType: 'detail' },
    },
    {
      questionType: 'reading_sentence_completion',
      prompt: 'A council survey found that participating households sent almost a ______ less electrical waste to landfill within a year.',
      answerKey: 'third',
      wordLimit: { maxWords: 2, allowsNumber: false, instruction: 'NO MORE THAN TWO WORDS' },
      explanation: 'The third paragraph mentions almost a third less electrical waste.',
      difficulty: 'MEDIUM',
      evidence: { passageId: 'seed-reading-passage', evidenceSpans: [span('almost a third less electrical waste to landfill')], reasoning: 'Completion answer taken verbatim from the text.', answerType: 'completion' },
    },
    {
      questionType: 'reading_multiple_choice',
      prompt: 'What do organisers identify as the main aim of repair cafes?',
      options: ['Creating local jobs', 'Reducing waste', 'Selling second-hand goods', 'Training professional repairers'],
      answerKey: 'B',
      explanation: 'The second paragraph states the main aim is to reduce waste.',
      difficulty: 'EASY',
      evidence: { passageId: 'seed-reading-passage', evidenceSpans: [span('Organisers say the main aim is to reduce waste')], reasoning: 'Direct statement of the main aim.', answerType: 'detail' },
    },
  ];

  // ---------- 原創聆聽內容（對話，非官方試題） ----------
  const transcript =
    'Librarian: Welcome to Eastside Library. Are you here to join? ' +
    'Visitor: Yes, please. I would like a membership card for my daughter, she is nine. ' +
    'Librarian: Children under twelve need a parent\u2019s signature, and the card is free. ' +
    'Visitor: Perfect. What time do you close on Saturdays? ' +
    'Librarian: We close at half past five on Saturdays and at eight on weekdays.';

  const listeningQuestions = [
    {
      questionType: 'listening_short_answer',
      prompt: 'How old is the visitor\u2019s daughter?',
      answerKey: 'nine',
      acceptedAnswers: ['9'],
      wordLimit: { maxWords: 1, allowsNumber: true, instruction: 'NO MORE THAN ONE WORD AND/OR A NUMBER' },
      explanation: 'The visitor says the daughter is nine.',
      difficulty: 'EASY',
      evidence: { expectedAnswer: 'nine', acceptedVariants: ['9'], wordLimit: { maxWords: 1, allowsNumber: true } },
    },
    {
      questionType: 'listening_sentence_completion',
      prompt: 'The library closes at ______ on Saturdays.',
      answerKey: 'half past five',
      acceptedAnswers: ['5.30', '5:30', 'five thirty'],
      wordLimit: { maxWords: 3, allowsNumber: true, instruction: 'NO MORE THAN THREE WORDS AND/OR A NUMBER' },
      explanation: 'The librarian says the library closes at half past five on Saturdays.',
      difficulty: 'MEDIUM',
      evidence: { expectedAnswer: 'half past five', acceptedVariants: ['5.30', '5:30', 'five thirty'], wordLimit: { maxWords: 3, allowsNumber: true } },
    },
  ];

  const readingQuestionsWithSpans = readingQuestions;

  // ---------- Upsert test + section + questions ----------
  async function ensureTest(slug: string, title: string, testType: string, skill: string, description: string) {
    const existing = await db.ieltsTest.findUnique({ where: { slug } });
    if (existing) {
      console.log(`• 已存在：${slug}（跳過建立）`);
      return { test: existing, created: false };
    }
    const test = await db.ieltsTest.create({
      data: {
        slug,
        title,
        testType,
        skill,
        description,
        status: 'DRAFT',
        contentSource: JSON.stringify({ type: 'ORIGINAL_GENERATED', notes: 'Platform-authored starter content' }),
      },
    });
    console.log(`✓ 建立：${slug}`);
    return { test, created: true };
  }

  async function addSection(testId: string, orderIndex: number, label: string, data: { passageText?: string; transcriptText?: string }) {
    const section = await db.ieltsSection.create({
      data: { testId, orderIndex, label, ...data },
    });
    return section;
  }

  async function addQuestion(
    testId: string,
    sectionId: string,
    orderIndex: number,
    skill: string,
    q: {
      questionType: string;
      prompt: string;
      options?: string[];
      answerKey: string;
      acceptedAnswers?: string[];
      wordLimit?: unknown;
      explanation: string;
      difficulty: string;
      evidence: unknown;
    },
  ) {
    return db.ieltsQuestion.create({
      data: {
        testId,
        sectionId,
        orderIndex,
        questionType: q.questionType,
        skill,
        prompt: q.prompt,
        options: q.options ? JSON.stringify(q.options) : null,
        answerKey: JSON.stringify(q.answerKey),
        acceptedAnswers: q.acceptedAnswers ? JSON.stringify(q.acceptedAnswers) : null,
        wordLimit: q.wordLimit ? JSON.stringify(q.wordLimit) : null,
        evidence: JSON.stringify(q.evidence),
        explanation: q.explanation,
        difficulty: q.difficulty,
        difficultyModel: 'ielts-platform-difficulty-v1',
        contentSource: JSON.stringify({ type: 'ORIGINAL_GENERATED' }),
        generatorVersion: 'seed-ielts-v1',
        validationStatus: 'DRAFT',
      },
    });
  }

  const reading = await ensureTest(
    'seed-academic-reading-1',
    'Academic Reading — Community Repair (original practice set)',
    'ACADEMIC',
    'READING',
    'Original platform-authored practice set: True/False/Not Given, completion and multiple choice.',
  );
  const listening = await ensureTest(
    'seed-listening-1',
    'Listening — Library Membership (original practice set)',
    'ACADEMIC',
    'LISTENING',
    'Original platform-authored listening practice: short answer and completion. Audio is synthesised by platform AI voices.',
  );

  if (reading.created) {
    const section = await addSection(reading.test.id, 0, 'Section 1', { passageText: passage });
    let i = 0;
    for (const q of readingQuestionsWithSpans) {
      await addQuestion(reading.test.id, section.id, i++, 'READING', q as never);
    }
  }
  if (listening.created) {
    const section = await addSection(listening.test.id, 0, 'Part 1', { transcriptText: transcript });
    let i = 0;
    for (const q of listeningQuestions) {
      await addQuestion(listening.test.id, section.id, i++, 'LISTENING', q as never);
    }
  }

  // ---------- Machine validation → QA_REQUIRED ----------
  for (const test of [reading.test, listening.test]) {
    const questions = await db.ieltsQuestion.findMany({ where: { testId: test.id }, orderBy: { orderIndex: 'asc' } });
    const section = await db.ieltsSection.findFirst({ where: { testId: test.id } });
    for (const row of questions) {
      const report = validateIeltsQuestion(
        {
          id: row.id,
          testId: row.testId,
          sectionId: row.sectionId,
          orderIndex: row.orderIndex,
          questionType: row.questionType as never,
          skill: row.skill as never,
          prompt: row.prompt,
          options: row.options ? JSON.parse(row.options) : undefined,
          answerKey: row.answerKey ? JSON.parse(row.answerKey) : undefined,
          acceptedAnswers: row.acceptedAnswers ? JSON.parse(row.acceptedAnswers) : undefined,
          wordLimit: row.wordLimit ? JSON.parse(row.wordLimit) : undefined,
          evidence: row.evidence ? JSON.parse(row.evidence) : undefined,
          explanation: row.explanation ?? undefined,
          difficulty: row.difficulty as never,
          difficultyModel: row.difficultyModel ?? undefined,
          contentSource: row.contentSource ? JSON.parse(row.contentSource) : { type: 'ORIGINAL_GENERATED' },
          generatorVersion: row.generatorVersion ?? undefined,
          validationStatus: row.validationStatus as never,
        },
        { passageText: section?.passageText ?? null, transcriptText: section?.transcriptText ?? null },
      );
      const nextStatus = report.ok ? 'QA_REQUIRED' : row.validationStatus;
      await db.ieltsQuestion.update({
        where: { id: row.id },
        data: {
          validationStatus: nextStatus,
          validationNotes: JSON.stringify({ validatedAt: new Date().toISOString(), ok: report.ok, issues: report.issues }),
        },
      });
      console.log(`  ${report.ok ? '✓' : '✗'} ${row.id.slice(0, 8)}… ${report.ok ? 'QA_REQUIRED' : report.issues.map((x) => x.code).join(',')}`);
    }
  }

  // ---------- Optional human approval (explicit reviewer required) ----------
  if (reviewerId) {
    const reviewer = await db.user.findUnique({ where: { id: reviewerId } });
    if (!reviewer || (reviewer.role !== 'admin' && reviewer.role !== 'teacher')) {
      throw new Error('--reviewer 必須是存在的 teacher/admin 使用者 id（人工審核者）。');
    }
    for (const test of [reading.test, listening.test]) {
      const questions = await db.ieltsQuestion.findMany({ where: { testId: test.id } });
      for (const row of questions) {
        if (row.validationStatus !== 'QA_REQUIRED') continue;
        const approve = applyTransition({ from: 'QA_REQUIRED', to: 'HUMAN_APPROVED', actor: 'HUMAN', reviewerId });
        if (!approve.allowed) throw new Error(approve.error);
        const publish = applyTransition({ from: 'HUMAN_APPROVED', to: 'PUBLISHED', actor: 'HUMAN', reviewerId });
        if (!publish.allowed) throw new Error(publish.error);
        await db.ieltsQuestion.update({
          where: { id: row.id },
          data: { validationStatus: 'PUBLISHED', reviewedBy: reviewerId, reviewedAt: new Date() },
        });
      }
      await db.ieltsTest.update({ where: { id: test.id }, data: { status: 'PUBLISHED' } });
      console.log(`✓ 已由 ${reviewer.name ?? reviewerId} 人工審核並發佈：${test.slug}`);
    }
  } else {
    console.log('\n目前狀態為 QA_REQUIRED（未發佈）。人工審核後再執行：');
    console.log('  npx tsx scripts/seed-ielts.ts --reviewer=<teacher或admin的userId>');
  }

  console.log('\n完成。IELTS 內容與 HKDSE 資料完全隔離。');
}

main()
  .catch((err) => {
    console.error('seed-ielts 失敗：', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      const { db } = await import('@/shared/db/db');
      await db.$disconnect();
    } catch {
      /* ignore */
    }
  });
