// ============================================
// 2026-10-03 PHASE IELTS-01 (V): Platform-Authored Starter Content
// ============================================
// Hand-authored, repo-reviewed practice sets that the platform may provision
// automatically so students have something to practise immediately after login.
//
// GOVERNANCE (docs/ielts/IELTS_ASSESSMENT_GOVERNANCE.md §7.2):
//   * This carve-out applies ONLY to platform-authored starter content (written
//     and reviewed in this repository, tracked in git). It is NOT AI-generated.
//   * AI-generated content can NEVER be auto-published — it stays at
//     QA_REQUIRED until a human approves it.
//   * Everything here is original platform content — not official IELTS
//     material — and never enters HKDSE evidence/XP tables.
// ============================================

import type {
  IeltsDifficulty,
  IeltsEvidenceSpan,
  IeltsItemEvidence,
  IeltsQuestionType,
  IeltsSkill,
  IeltsTestType,
  IeltsWordLimit,
} from '../domain/types';

export interface IeltsStarterQuestion {
  questionType: IeltsQuestionType;
  prompt: string;
  options?: string[];
  answerKey: string;
  acceptedAnswers?: string[];
  wordLimit?: IeltsWordLimit;
  evidence: IeltsItemEvidence;
  explanation: string;
  difficulty: IeltsDifficulty;
}

export interface IeltsStarterSet {
  slug: string;
  title: string;
  testType: IeltsTestType;
  skill: IeltsSkill;
  description: string;
  sectionLabel: string;
  /** Writing tasks (2026-10-03 XII): full task instructions served as the
   * section text — the writing bank reads label + instructions, no questions. */
  sectionInstructions?: string;
  passageText?: string;
  transcriptText?: string;
  questions: IeltsStarterQuestion[];
}

// ---------- Academic Reading starter (original content) ----------

const STARTER_READING_PASSAGE = [
  'Community repair cafes have spread across many towns in the past decade. At these events, volunteers help visitors mend broken household items, from toasters to bicycles, free of charge.',
  'Organisers say the main aim is to reduce waste. Instead of replacing a faulty lamp, visitors learn to replace a fuse or a switch, and they often return with new confidence to attempt repairs at home.',
  'Some local governments now fund repair cafes because the events save energy that would otherwise be spent manufacturing replacement goods. A council survey in one town found that participating households sent almost a third less electrical waste to landfill within a year.',
  'Not everyone is convinced. Manufacturers warn that inexpert repairs can be dangerous, particularly for devices connected to mains electricity. Volunteers counter that every repair is supervised, and that visitors are told clearly when a professional is needed.',
  'What unites both sides is the observation that the repair culture depends on skills, not equipment. Where training is offered alongside the cafes, the events thrive; where it is not, they often fade away.',
].join(' ');

function span(passage: string, phrase: string): IeltsEvidenceSpan {
  const start = passage.indexOf(phrase);
  if (start < 0) throw new Error(`Starter content span not found: ${phrase}`);
  return { start, end: start + phrase.length, text: phrase };
}

// ---------- Academic Listening starter (original content) ----------

const STARTER_LISTENING_TRANSCRIPT =
  'Librarian: Welcome to Eastside Library. Are you here to join? ' +
  'Visitor: Yes, please. I would like a membership card for my daughter, she is nine. ' +
  'Librarian: Children under twelve need a parent\u2019s signature, and the card is free. ' +
  'Visitor: Perfect. What time do you close on Saturdays? ' +
  'Librarian: We close at half past five on Saturdays and at eight on weekdays.';

// ---------- General Training Reading starter (original content) ----------

const STARTER_GT_NOTICE =
  'COMMUNITY GYM — SUMMER OPENING HOURS\n' +
  'Weekdays: 6.30 am - 10 pm\n' +
  'Weekends: 8 am - 8 pm\n' +
  'Members must bring their own towel. Lockers are free but require a padlock.';

const STARTER_GT_EMAIL =
  'From: Riverside Sports Centre\n' +
  'To: New members\n' +
  'Subject: Booking swimming lanes\n' +
  'Please book swimming lanes online. Lane bookings open seven days in advance and are limited to one hour per member per day. ' +
  'Cancel a booking at least two hours before your session to avoid a charge.';

const STARTER_GT_PASSAGE = `${STARTER_GT_NOTICE}\n\n${STARTER_GT_EMAIL}`;

export const IELTS_STARTER_SETS: readonly IeltsStarterSet[] = [
  {
    slug: 'seed-academic-reading-1',
    title: 'Academic Reading — Community Repair (original practice set)',
    testType: 'ACADEMIC',
    skill: 'READING',
    description:
      'Original platform-authored practice set: True/False/Not Given, completion and multiple choice.',
    sectionLabel: 'Section 1',
    passageText: STARTER_READING_PASSAGE,
    questions: [
      {
        questionType: 'reading_true_false_not_given',
        prompt: 'Repair cafes charge visitors a small fee for repairs.',
        answerKey: 'FALSE',
        explanation: 'The first paragraph states that volunteers help visitors free of charge.',
        difficulty: 'EASY',
        evidence: {
          passageId: 'seed-reading-passage',
          evidenceSpans: [
            span(
              STARTER_READING_PASSAGE,
              'volunteers help visitors mend broken household items, from toasters to bicycles, free of charge',
            ),
          ],
          reasoning: 'The passage explicitly says repairs are free.',
          answerType: 'contrast',
        },
      },
      {
        questionType: 'reading_true_false_not_given',
        prompt: 'Repair cafes have been more successful in towns that offer training.',
        answerKey: 'TRUE',
        explanation: 'The final paragraph says events thrive where training is offered.',
        difficulty: 'MEDIUM',
        evidence: {
          passageId: 'seed-reading-passage',
          evidenceSpans: [
            span(STARTER_READING_PASSAGE, 'Where training is offered alongside the cafes, the events thrive'),
          ],
          reasoning: 'Direct statement linking training to thriving events.',
          answerType: 'detail',
        },
      },
      {
        questionType: 'reading_sentence_completion',
        prompt:
          'A council survey found that participating households sent almost a ______ less electrical waste to landfill within a year.',
        answerKey: 'third',
        wordLimit: { maxWords: 2, allowsNumber: false, instruction: 'NO MORE THAN TWO WORDS' },
        explanation: 'The third paragraph mentions almost a third less electrical waste.',
        difficulty: 'MEDIUM',
        evidence: {
          passageId: 'seed-reading-passage',
          evidenceSpans: [span(STARTER_READING_PASSAGE, 'almost a third less electrical waste to landfill')],
          reasoning: 'Completion answer taken verbatim from the text.',
          answerType: 'completion',
        },
      },
      {
        questionType: 'reading_multiple_choice',
        prompt: 'What do organisers identify as the main aim of repair cafes?',
        options: [
          'Creating local jobs',
          'Reducing waste',
          'Selling second-hand goods',
          'Training professional repairers',
        ],
        answerKey: 'B',
        explanation: 'The second paragraph states the main aim is to reduce waste.',
        difficulty: 'EASY',
        evidence: {
          passageId: 'seed-reading-passage',
          evidenceSpans: [span(STARTER_READING_PASSAGE, 'Organisers say the main aim is to reduce waste')],
          reasoning: 'Direct statement of the main aim.',
          answerType: 'detail',
        },
      },
    ],
  },
  {
    slug: 'seed-listening-1',
    title: 'Listening — Library Membership (original practice set)',
    testType: 'ACADEMIC',
    skill: 'LISTENING',
    description:
      'Original platform-authored listening practice: short answer and completion. Audio is synthesised by platform AI voices.',
    sectionLabel: 'Part 1',
    transcriptText: STARTER_LISTENING_TRANSCRIPT,
    questions: [
      {
        questionType: 'listening_short_answer',
        prompt: 'How old is the visitor\u2019s daughter?',
        answerKey: 'nine',
        acceptedAnswers: ['9'],
        wordLimit: { maxWords: 1, allowsNumber: true, instruction: 'NO MORE THAN ONE WORD AND/OR A NUMBER' },
        explanation: 'The visitor says the daughter is nine.',
        difficulty: 'EASY',
        evidence: {
          expectedAnswer: 'nine',
          acceptedVariants: ['9'],
          wordLimit: { maxWords: 1, allowsNumber: true },
        },
      },
      {
        questionType: 'listening_sentence_completion',
        prompt: 'The library closes at ______ on Saturdays.',
        answerKey: 'half past five',
        acceptedAnswers: ['5.30', '5:30', 'five thirty'],
        wordLimit: { maxWords: 3, allowsNumber: true, instruction: 'NO MORE THAN THREE WORDS AND/OR A NUMBER' },
        explanation: 'The librarian says the library closes at half past five on Saturdays.',
        difficulty: 'MEDIUM',
        evidence: {
          expectedAnswer: 'half past five',
          acceptedVariants: ['5.30', '5:30', 'five thirty'],
          wordLimit: { maxWords: 3, allowsNumber: true },
        },
      },
    ],
  },
  {
    slug: 'seed-gt-reading-1',
    title: 'General Training Reading — Community Gym & Booking (original practice set)',
    testType: 'GENERAL_TRAINING',
    skill: 'READING',
    description:
      'Original platform-authored General Training practice set: two everyday texts with True/False/Not Given, short answer and completion.',
    sectionLabel: 'Section 1',
    passageText: STARTER_GT_PASSAGE,
    questions: [
      {
        questionType: 'reading_true_false_not_given',
        prompt: 'The gym opens at 8 am on weekends.',
        answerKey: 'TRUE',
        explanation: 'The notice states that weekend opening hours start at 8 am.',
        difficulty: 'EASY',
        evidence: {
          passageId: 'seed-gt-reading-passage',
          evidenceSpans: [span(STARTER_GT_PASSAGE, 'Weekends: 8 am - 8 pm')],
          reasoning: 'Direct statement of the weekend opening time.',
          answerType: 'detail',
        },
      },
      {
        questionType: 'reading_short_answer',
        prompt: 'What must members bring with them?',
        answerKey: 'towel',
        wordLimit: { maxWords: 1, allowsNumber: false, instruction: 'Choose ONE WORD ONLY' },
        explanation: 'The notice says members must bring their own towel.',
        difficulty: 'EASY',
        evidence: {
          passageId: 'seed-gt-reading-passage',
          evidenceSpans: [span(STARTER_GT_PASSAGE, 'Members must bring their own towel')],
          reasoning: 'Answer taken verbatim from the notice.',
          answerType: 'completion',
        },
      },
      {
        questionType: 'reading_sentence_completion',
        prompt: 'Lockers can be used free of charge, but members need to provide a ______.',
        answerKey: 'padlock',
        wordLimit: { maxWords: 1, allowsNumber: false, instruction: 'Choose ONE WORD ONLY' },
        explanation: 'The notice says lockers are free but require a padlock.',
        difficulty: 'EASY',
        evidence: {
          passageId: 'seed-gt-reading-passage',
          evidenceSpans: [span(STARTER_GT_PASSAGE, 'Lockers are free but require a padlock')],
          reasoning: 'Answer taken verbatim from the notice.',
          answerType: 'completion',
        },
      },
      {
        questionType: 'reading_true_false_not_given',
        prompt: 'Swimming lanes must be booked online.',
        answerKey: 'TRUE',
        explanation: 'The email asks members to book swimming lanes online.',
        difficulty: 'EASY',
        evidence: {
          passageId: 'seed-gt-reading-passage',
          evidenceSpans: [span(STARTER_GT_PASSAGE, 'Please book swimming lanes online')],
          reasoning: 'Direct statement that online booking is required.',
          answerType: 'detail',
        },
      },
      {
        questionType: 'reading_sentence_completion',
        prompt: 'Each member can book a swimming lane for a maximum of ______ per day.',
        answerKey: 'one hour',
        wordLimit: { maxWords: 2, allowsNumber: false, instruction: 'NO MORE THAN TWO WORDS' },
        explanation: 'The email says bookings are limited to one hour per member per day.',
        difficulty: 'MEDIUM',
        evidence: {
          passageId: 'seed-gt-reading-passage',
          evidenceSpans: [span(STARTER_GT_PASSAGE, 'limited to one hour per member per day')],
          reasoning: 'Answer taken verbatim from the email.',
          answerType: 'completion',
        },
      },
    ],
  },
  // ---------- Writing starter tasks (2026-10-03 XII, original content) ----------
  // Students must ALWAYS have writing practice available; these platform-authored
  // tasks fill the writing bank when no published writing prompt exists. The
  // section label is the machine task type; `sectionInstructions` is the full
  // task text shown to the writer (no questions — writing is assessed by the
  // AI writing evaluator, never by the objective scorer).
  {
    slug: 'seed-writing-academic-task1',
    title: 'Academic Writing Task 1 — Household Technology (original practice task)',
    testType: 'ACADEMIC',
    skill: 'WRITING',
    description:
      'Original platform-authored practice task: official-style Academic Task 1 (≥150 words, 20 minutes). Not official IELTS material.',
    sectionLabel: 'academic_task1',
    sectionInstructions:
      'The chart below shows the percentage of households in three countries with access to the internet between 2000 and 2020. Summarise the information by selecting and reporting the main features, and make comparisons where relevant. Write at least 150 words.',
    questions: [],
  },
  {
    slug: 'seed-writing-academic-task2',
    title: 'Academic Writing Task 2 — Public Libraries (original practice task)',
    testType: 'ACADEMIC',
    skill: 'WRITING',
    description:
      'Original platform-authored practice task: official-style Academic Task 2 (≥250 words, 40 minutes). Not official IELTS material.',
    sectionLabel: 'academic_task2',
    sectionInstructions:
      'Some people think that governments should invest more money in public libraries, while others believe this money would be better spent on digital services. Discuss both views and give your own opinion. Write at least 250 words.',
    questions: [],
  },
  {
    slug: 'seed-writing-general-task1',
    title: 'General Training Writing Task 1 — Damaged Furniture (original practice task)',
    testType: 'GENERAL_TRAINING',
    skill: 'WRITING',
    description:
      'Original platform-authored practice task: official-style General Training Task 1 letter (≥150 words, 20 minutes). Not official IELTS material.',
    sectionLabel: 'general_task1',
    sectionInstructions:
      'You recently bought a piece of furniture from a shop, but it arrived damaged. Write a letter to the shop manager. In your letter: explain what you bought and when; describe the damage; say what you would like the manager to do. Write at least 150 words. Begin your letter as follows: Dear Sir or Madam,',
    questions: [],
  },
  {
    slug: 'seed-writing-general-task2',
    title: 'General Training Writing Task 2 — Funding University (original practice task)',
    testType: 'GENERAL_TRAINING',
    skill: 'WRITING',
    description:
      'Original platform-authored practice task: official-style General Training Task 2 (≥250 words, 40 minutes). Not official IELTS material.',
    sectionLabel: 'general_task2',
    sectionInstructions:
      'Some people believe that university education should be free for all students, while others think that students should pay for their own studies. Discuss both views and give your own opinion. Write at least 250 words.',
    questions: [],
  },
];
