// ============================================
// IELTS Writing — official task configurations & criterion definitions
// ============================================
// Source: official Academic/GT Writing format pages + Writing Band Descriptors
// (see docs/ielts/IELTS_SOURCES.md #4, #5, #9, #12). Descriptions are
// paraphrased platform summaries — not verbatim descriptor text.
// ============================================

import type { IeltsTestType, IeltsWritingCriterionKey, IeltsWritingTaskType } from '../domain/types';

export interface IeltsWritingTaskConfig {
  taskType: IeltsWritingTaskType;
  testType: IeltsTestType;
  taskNumber: 1 | 2;
  minWords: number;
  recommendedMinutes: number;
  genre: 'visual_description' | 'letter' | 'essay';
  /** Task 1 uses Task Achievement; Task 2 uses Task Response. */
  taskCriterion:
    | 'taskAchievement'
    | 'taskResponse';
  styleGuide: string;
  /** Task 2 contributes twice as much as Task 1 (official). */
  weight: 1 | 2;
  instructions: string;
}

// ============================================
// Versioning (audit requirement — 2026-10-03)
// ============================================
// Every persisted evaluation must identify the rubric and task-specification
// versions it was produced under. A rubric change MUST bump this constant;
// prompt changes bump the prompt-version constants in the AI prompt modules.

/** Rubric version stamped into every persisted writing evaluation. */
export const IELTS_WRITING_RUBRIC_VERSION = 'ielts-writing-rubric-v1';
/** Task-specification version (deterministic task-type analysis + requirements). */
export const IELTS_TASK_SPECIFICATION_VERSION = 'ielts-task-spec-v1';

export const IELTS_WRITING_TASKS: Readonly<Record<IeltsWritingTaskType, IeltsWritingTaskConfig>> = {
  academic_task1: {
    taskType: 'academic_task1',
    testType: 'ACADEMIC',
    taskNumber: 1,
    minWords: 150,
    recommendedMinutes: 20,
    genre: 'visual_description',
    taskCriterion: 'taskAchievement',
    styleGuide: 'Academic or semi-formal/neutral style. Select and report the main features of the visual; make comparisons where relevant.',
    weight: 1,
    instructions:
      'Summarise the information by selecting and reporting the main features, and make comparisons where relevant. Write at least 150 words.',
  },
  academic_task2: {
    taskType: 'academic_task2',
    testType: 'ACADEMIC',
    taskNumber: 2,
    minWords: 250,
    recommendedMinutes: 40,
    genre: 'essay',
    taskCriterion: 'taskResponse',
    styleGuide: 'Academic or semi-formal/neutral style. Present a clear position, develop arguments with relevant evidence or examples.',
    weight: 2,
    instructions: 'Write about the topic, developing your argument with relevant examples or evidence. Write at least 250 words.',
  },
  general_task1: {
    taskType: 'general_task1',
    testType: 'GENERAL_TRAINING',
    taskNumber: 1,
    minWords: 150,
    recommendedMinutes: 20,
    genre: 'letter',
    taskCriterion: 'taskAchievement',
    styleGuide:
      'Letter format. Choose personal / semi-formal / formal style appropriate to the audience and purpose. Cover the three bullet points. No addresses required.',
    weight: 1,
    instructions:
      'Write a letter. Begin "Dear …", cover the three points in the task, and choose an appropriate register. Write at least 150 words.',
  },
  general_task2: {
    taskType: 'general_task2',
    testType: 'GENERAL_TRAINING',
    taskNumber: 2,
    minWords: 250,
    recommendedMinutes: 40,
    genre: 'essay',
    taskCriterion: 'taskResponse',
    styleGuide: 'Semi-formal/neutral discursive essay. Organise ideas clearly; support arguments with relevant examples or evidence.',
    weight: 2,
    instructions: 'Write an essay on the topic, discussing the point of view, argument or problem. Write at least 250 words.',
  },
};

export interface IeltsWritingCriterionDefinition {
  key: IeltsWritingCriterionKey;
  labelEn: string;
  /** What the criterion covers (platform paraphrase of official descriptions). */
  focus: string[];
  sharedForTasks: 1 | 2 | 'both';
}

export const IELTS_WRITING_CRITERIA_DEFINITIONS: readonly IeltsWritingCriterionDefinition[] = [
  {
    key: 'taskAchievementOrResponse',
    labelEn: 'Task Achievement / Task Response',
    focus: [
      'How accurately, appropriately and relevantly the response covers the task requirements',
      'Task 1: selecting and reporting the main features / how well the letter achieves its purpose',
      'Task 2: developing a position with relevant, extended support',
      'Minimum word requirements (150 / 250) and connected prose (no notes or bullet points)',
    ],
    sharedForTasks: 'both',
  },
  {
    key: 'coherenceAndCohesion',
    labelEn: 'Coherence and Cohesion',
    focus: [
      'Logical organisation and progression of ideas',
      'Paragraphing and paragraph focus',
      'Appropriate use of cohesive devices (linking words, pronouns, conjunctions)',
    ],
    sharedForTasks: 'both',
  },
  {
    key: 'lexicalResource',
    labelEn: 'Lexical Resource',
    focus: [
      'Range of vocabulary and precision of meaning',
      'Appropriacy of register and collocation',
      'Ability to paraphrase / express meaning when a word is unknown',
      'Spelling and word-formation accuracy (errors that impede meaning matter most)',
    ],
    sharedForTasks: 'both',
  },
  {
    key: 'grammaticalRangeAndAccuracy',
    labelEn: 'Grammatical Range and Accuracy',
    focus: [
      'Range and flexibility of grammatical structures',
      'Frequency and impact of grammatical errors',
      'Punctuation that supports meaning',
    ],
    sharedForTasks: 'both',
  },
];

// ============================================
// Deterministic task-requirement extraction (checked pre-AI)
// ============================================
// The AI must report per-requirement coverage with evidence. These patterns
// build the checklist from the task prompt deterministically; the AI does NOT
// get to invent the requirement list (anti-hallucination, see governance §5).
// ============================================

export interface IeltsTaskRequirement {
  id: string;
  label: string;
  pattern: RegExp;
}

export const IELTS_TASK_REQUIREMENT_PATTERNS: readonly IeltsTaskRequirement[] = [
  { id: 'discuss-both-views', label: 'Discuss both views', pattern: /discuss\s+both\s+(?:these\s+)?views?/i },
  { id: 'give-opinion', label: 'Give your own opinion', pattern: /(?:give|state|provide)\s+(?:your\s+)?(?:own\s+)?opinion|what\s+is\s+your\s+opinion/i },
  { id: 'agree-disagree', label: 'Express agreement or disagreement', pattern: /(?:to\s+what\s+extent\s+do\s+you\s+agree|do\s+you\s+agree\s+or\s+disagree|agree\s+or\s+disagree)/i },
  { id: 'advantages-disadvantages', label: 'Discuss advantages and disadvantages', pattern: /advantages?\s+and\s+disadvantages?|benefits?\s+and\s+drawbacks?/i },
  { id: 'outweigh', label: 'Judge whether advantages outweigh disadvantages', pattern: /(?:outweigh|do\s+the\s+benefits?\s+outweigh|are\s+the\s+drawbacks?)/i },
  { id: 'outline-problem-solution', label: 'Outline problems and present solutions', pattern: /(?:what\s+(?:are\s+)?(?:the\s+)?problems|outline\s+(?:the\s+)?problem|suggest\s+(?:some\s+)?solutions?|present\s+(?:a\s+)?solution)/i },
  { id: 'causes-solutions', label: 'Explain causes and suggest solutions', pattern: /(?:causes?\s+and\s+solutions?|what\s+causes|why\s+.{0,40}\?.*what\s+can|reasons?\s+for)/i },
  { id: 'discuss-both-sides', label: 'Discuss both sides of the argument', pattern: /discuss\s+both\s+sides|both\s+the\s+advantages\s+and\s+disadvantages/i },
  { id: 'positive-negative', label: 'Is this a positive or negative development?', pattern: /positive\s+or\s+negative\s+development/i },
  { id: 'cover-three-points', label: 'Cover the three bullet points', pattern: /•|•\s|(?:^|\n)\s*[-–]\s/m },
  { id: 'include-main-features', label: 'Select and report the main features', pattern: /select(?:ing)?\s+and\s+report(?:ing)?\s+(?:the\s+)?main\s+features|summarise\s+the\s+information/i },
  { id: 'make-comparisons', label: 'Make comparisons where relevant', pattern: /make\s+comparisons/i },
  { id: 'begin-dear', label: 'Open the letter with an appropriate greeting', pattern: /begin\s+["“]?dear/i },
  { id: 'explain-situation', label: 'Explain the situation', pattern: /explain\s+(?:the\s+)?situation|tell\s+.{0,30}about/i },
  { id: 'say-what-you-want', label: 'Say what you want or need', pattern: /say\s+what\s+you\s+(?:want|need|would\s+like)|ask\s+for/i },
  // 2026-10-03 (II): two-part question detection + extra obligation phrasing
  { id: 'answer-both-questions', label: 'Answer BOTH questions in the task', pattern: /(\?[\s\S]{0,400}\?)|and\s+(?:what|why|how|explain\s+what)/i },
  { id: 'explain-reasons', label: 'Explain reasons/causes', pattern: /(?:what\s+are\s+the\s+reasons|why\s+(?:do|does|is|are|has|have|did)|reasons?\s+(?:for|why))/i },
  { id: 'suggest-measures', label: 'Suggest measures or solutions', pattern: /(?:what\s+measures|what\s+can\s+be\s+done|suggest\s+(?:possible\s+)?(?:measures|ways)|how\s+can\s+.{0,40}\?)/i },
  { id: 'discuss-implications', label: 'Discuss implications or effects', pattern: /(?:what\s+(?:effects?|impact)|discuss\s+the\s+(?:effects?|impact|implications?))/i },
];

export function extractTaskRequirements(prompt: string): IeltsTaskRequirement[] {
  return IELTS_TASK_REQUIREMENT_PATTERNS.filter((r) => r.pattern.test(prompt));
}

// ============================================
// Task-type classification (2026-10-03 II)
// ============================================
// We classify the task prompt DETERMINISTICALLY before the AI call and inject
// the classification + the obligations it implies into the assessment prompt.
// This makes Task Achievement/Response marking check the RIGHT obligations
// (e.g. "discuss both views" demands both views and an opinion) instead of a
// generic checklist. Classification failure is NOT fatal: unknown → generically
// assessed; it is recorded so the assessment can note the limitation.

export type IeltsTask2QuestionType =
  | 'opinion_agree_disagree'
  | 'discuss_both_views'
  | 'advantages_disadvantages'
  | 'outweigh'
  | 'problem_solution'
  | 'two_part_question'
  | 'positive_negative'
  | 'direct_questions'
  | 'unknown';

export function classifyTask2QuestionType(prompt: string): IeltsTask2QuestionType {
  const p = prompt.toLowerCase();
  if (/discuss\s+both\s+(?:these\s+)?views/.test(p)) return 'discuss_both_views';
  if (/outweigh/.test(p)) return 'outweigh';
  if (/advantages?\s+and\s+disadvantages?|benefits?\s+and\s+drawbacks?/.test(p)) return 'advantages_disadvantages';
  if (/positive\s+or\s+negative\s+development/.test(p)) return 'positive_negative';
  if (/(?:what\s+(?:are\s+)?(?:the\s+)?problems|what\s+can\s+be\s+done|suggest\s+(?:some\s+)?solutions?|what\s+measures)/.test(p)) {
    return 'problem_solution';
  }
  if (/to\s+what\s+extent\s+do\s+you\s+agree|do\s+you\s+agree\s+or\s+disagree/.test(p)) return 'opinion_agree_disagree';
  // Two explicit questions (two-part): at least two '?' with substantial text between.
  const questionMarks = (p.match(/\?/g) ?? []).length;
  if (questionMarks >= 2) return 'two_part_question';
  if (questionMarks === 1) {
    // A single direct question not covered above (e.g. "What are the reasons for this?").
    if (/what|why|how|who|where|when/.test(p)) return 'direct_questions';
  }
  return 'unknown';
}

export function describeTaskTypeExpectations(taskType: IeltsTask2QuestionType): string[] {
  switch (taskType) {
    case 'opinion_agree_disagree':
      return [
        'A clear position must be presented and maintained throughout.',
        'The position must be justified with developed reasons, not merely asserted.',
        'Addressing only one side can still be complete IF the position is fully supported.',
      ];
    case 'discuss_both_views':
      return [
        'BOTH views must be discussed (not one view twice).',
        'The writer\'s own opinion must be given where the task asks for it.',
        'Development for both views should be meaningful, not a token sentence.',
      ];
    case 'advantages_disadvantages':
      return [
        'Both advantages AND disadvantages must be covered.',
        'If the task asks to judge, a reasoned judgement must be present.',
      ];
    case 'outweigh':
      return [
        'Both sides must appear BEFORE a judgement.',
        'A clear verdict (which side outweighs) must be stated and supported.',
      ];
    case 'problem_solution':
      return [
        'Problems/causes AND solutions/measures must both be addressed.',
        'Solutions should connect to the stated problems.',
      ];
    case 'two_part_question':
      return [
        'BOTH questions must be answered; a response to only one part is incomplete.',
        'Each answer needs development (reason + example), not a single sentence.',
      ];
    case 'positive_negative':
      return [
        'A clear stance (positive / negative / balanced) must be stated and developed.',
        'Development should explain WHY the judgement holds.',
      ];
    case 'direct_questions':
      return ['Every question in the task must be answered and developed.'];
    default:
      return ['No standard question type detected — assess task fulfilment from the instruction text itself.'];
  }
}

export type IeltsGeneralLetterType =
  | 'request'
  | 'complaint'
  | 'apology'
  | 'invitation_or_thanks'
  | 'application'
  | 'explanation'
  | 'unknown';

export function classifyGeneralLetterType(prompt: string): IeltsGeneralLetterType {
  const p = prompt.toLowerCase();
  if (/complain|dissatisfied|unhappy with|problem with/.test(p)) return 'complaint';
  if (/apolog|sorry/.test(p)) return 'apology';
  if (/invite|invitation|thank/.test(p)) return 'invitation_or_thanks';
  if (/apply|application|job|volunteer/.test(p)) return 'application';
  if (/ask for|request|would like you to|information about/.test(p)) return 'request';
  if (/explain|let .{0,20}know|inform/.test(p)) return 'explanation';
  return 'unknown';
}

export function describeLetterTypeExpectations(letterType: IeltsGeneralLetterType): string[] {
  switch (letterType) {
    case 'complaint':
      return [
        'State the problem clearly and factually; avoid aggressive tone.',
        'Say what action you want taken; keep a register appropriate to the audience.',
      ];
    case 'request':
      return [
        'The request must be explicit and polite.',
        'Any conditions/details needed to fulfil the request must be given.',
      ];
    case 'apology':
      return [
        'Acknowledge the issue and offer an explanation; where the task asks, propose a remedy.',
      ];
    case 'invitation_or_thanks':
      return ['Warm but audience-appropriate tone; purpose (invite/thank) must be unmistakable.'];
    case 'application':
      return ['Formal register; relevant experience/details must match what the task asks for.'];
    case 'explanation':
      return ['The situation must be explained clearly for the stated reader.'];
    default:
      return ['Assess purpose achievement and register from the task text itself.'];
  }
}

export type IeltsAcademicTask1VisualType =
  | 'line_graph'
  | 'bar_chart'
  | 'pie_chart'
  | 'table'
  | 'mixed_charts'
  | 'process_diagram'
  | 'map'
  | 'unknown';

export function classifyAcademicTask1VisualType(prompt: string): IeltsAcademicTask1VisualType {
  const p = prompt.toLowerCase();
  if (/process|diagram of|how .{0,40} (?:is|are) (?:made|produced)|cycle/.test(p)) return 'process_diagram';
  if (/map|maps of|plan of|floor plan/.test(p)) return 'map';
  if (/line graph/.test(p)) return 'line_graph';
  if (/bar chart/.test(p)) return 'bar_chart';
  if (/pie chart/.test(p)) return 'pie_chart';
  if (/table/.test(p)) return 'table';
  if (/chart|graph/.test(p)) return 'mixed_charts';
  return 'unknown';
}

export function describeAcademicTask1Expectations(visualType: IeltsAcademicTask1VisualType): string[] {
  switch (visualType) {
    case 'process_diagram':
      return [
        'Sequencing language and passive/active accuracy; stages must not be invented.',
        'An overview of the number of stages / start and end point.',
      ];
    case 'map':
      return [
        'Positional language accuracy (to the north of / opposite / alongside).',
        'An overview of the main changes or features compared.',
      ];
    default:
      return [
        'A clear overview paragraph stating the main trends/features.',
        'Selected key data with accurate figures; comparisons where relevant; no invented data.',
      ];
  }
}
