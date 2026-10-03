// ============================================
// INTERNAL_IELTS_GOLDEN_FIXTURES — original platform content
// ============================================
// These fixtures are ORIGINAL work written for this platform's tests. They are
// NOT official IELTS material and MUST NOT be labelled or presented as such.
// They exist to pin deterministic scoring, validation and assessment schemas.
// ============================================

import type { IeltsQuestionDefinition } from '../../domain/types';

export const INTERNAL_IELTS_GOLDEN_FIXTURE_LABEL =
  'INTERNAL_IELTS_GOLDEN_FIXTURES (platform-original content; not official IELTS material)';

// ============================================
// Reading fixture (Academic style, original)
// ============================================

export const GOLDEN_READING_PASSAGE = [
  'Urban beekeeping has grown rapidly in many cities over the past decade. Rooftops, community gardens and even office balconies now host hives that would once have seemed out of place in a concrete environment.',
  'Supporters argue that city hives help pollinate parks and gardens, and that the insects thrive because urban areas are often warmer than surrounding farmland and contain fewer pesticides.',
  'Critics, however, warn that too many hives can crowd out wild pollinators such as solitary bees, which compete for the same limited flowers. Researchers in London found that honeybee density in some districts had tripled within five years, while the number of wild bee species declined.',
  'Most scientists agree that the real problem is the loss of flower-rich habitats rather than the number of hives itself. Planting more wildflowers, they suggest, benefits both honeybees and their wild relatives, whereas simply adding hives may not.',
].join(' ');

function span(passage: string, phrase: string) {
  const start = passage.indexOf(phrase);
  if (start < 0) throw new Error(`Golden fixture span phrase not found: ${phrase}`);
  return { start, end: start + phrase.length, text: phrase };
}

export const GOLDEN_READING_QUESTIONS: IeltsQuestionDefinition[] = [
  {
    id: 'golden-r-1',
    testId: 'golden-test-reading',
    orderIndex: 0,
    questionType: 'reading_true_false_not_given',
    skill: 'READING',
    prompt: 'Urban beekeeping has become more common in cities over the last ten years.',
    answerKey: 'TRUE',
    explanation: 'The first paragraph states that urban beekeeping has grown rapidly over the past decade.',
    difficulty: 'EASY',
    difficultyModel: 'ielts-platform-difficulty-v1',
    contentSource: { type: 'ORIGINAL_GENERATED' },
    generatorVersion: 'golden-fixture-v1',
    validationStatus: 'PUBLISHED',
    evidence: {
      passageId: 'golden-reading-passage',
      evidenceSpans: [span(GOLDEN_READING_PASSAGE, 'Urban beekeeping has grown rapidly in many cities over the past decade')],
      reasoning: 'Direct statement of growth over ten years.',
      answerType: 'detail',
    },
  },
  {
    id: 'golden-r-2',
    testId: 'golden-test-reading',
    orderIndex: 1,
    questionType: 'reading_true_false_not_given',
    skill: 'READING',
    prompt: 'Honeybees produce more honey in cities than in the countryside.',
    answerKey: 'NOT GIVEN',
    explanation: 'The passage discusses warmth and pesticides, but never compares honey production volumes.',
    difficulty: 'MEDIUM',
    difficultyModel: 'ielts-platform-difficulty-v1',
    contentSource: { type: 'ORIGINAL_GENERATED' },
    generatorVersion: 'golden-fixture-v1',
    validationStatus: 'PUBLISHED',
    evidence: {
      passageId: 'golden-reading-passage',
      evidenceSpans: [span(GOLDEN_READING_PASSAGE, 'the insects thrive because urban areas are often warmer')],
      reasoning: 'Mentions thriving, but no production comparison — neither confirmed nor contradicted.',
      answerType: 'absence',
    },
  },
  {
    id: 'golden-r-3',
    testId: 'golden-test-reading',
    orderIndex: 2,
    questionType: 'reading_sentence_completion',
    skill: 'READING',
    prompt: 'Researchers in London observed that honeybee density in some districts had ______ within five years.',
    answerKey: 'tripled',
    acceptedAnswers: [],
    wordLimit: { maxWords: 2, allowsNumber: false, instruction: 'NO MORE THAN TWO WORDS' },
    explanation: 'The third paragraph states honeybee density "had tripled within five years".',
    difficulty: 'MEDIUM',
    difficultyModel: 'ielts-platform-difficulty-v1',
    contentSource: { type: 'ORIGINAL_GENERATED' },
    generatorVersion: 'golden-fixture-v1',
    validationStatus: 'PUBLISHED',
    evidence: {
      passageId: 'golden-reading-passage',
      evidenceSpans: [span(GOLDEN_READING_PASSAGE, 'had tripled within five years')],
      reasoning: 'Completion answer taken verbatim from the passage.',
      answerType: 'completion',
    },
  },
  {
    id: 'golden-r-4',
    testId: 'golden-test-reading',
    orderIndex: 3,
    questionType: 'reading_multiple_choice',
    skill: 'READING',
    prompt: 'What do most scientists identify as the main problem?',
    options: ['The number of hives', 'The loss of flower-rich habitats', 'Urban temperatures', 'Pesticide use by gardeners'],
    answerKey: 'B',
    explanation: 'The final paragraph states the real problem is the loss of flower-rich habitats.',
    difficulty: 'HARD',
    difficultyModel: 'ielts-platform-difficulty-v1',
    contentSource: { type: 'ORIGINAL_GENERATED' },
    generatorVersion: 'golden-fixture-v1',
    validationStatus: 'PUBLISHED',
    evidence: {
      passageId: 'golden-reading-passage',
      evidenceSpans: [span(GOLDEN_READING_PASSAGE, 'the real problem is the loss of flower-rich habitats')],
      reasoning: 'Direct statement of the main problem.',
      answerType: 'detail',
    },
  },
];

// ============================================
// Listening fixture (original dialogue)
// ============================================

export const GOLDEN_LISTENING_TRANSCRIPT =
  'Receptionist: Good morning, Riverside Sports Centre. How can I help you? ' +
  'Caller: Hello, I would like to book a badminton court for Saturday afternoon. ' +
  'Receptionist: Certainly. Courts cost twelve pounds per hour, and we have availability at two and at four. ' +
  'Caller: Four o\u2019clock would be perfect, thank you.';

export const GOLDEN_LISTENING_QUESTIONS: IeltsQuestionDefinition[] = [
  {
    id: 'golden-l-1',
    testId: 'golden-test-listening',
    orderIndex: 0,
    questionType: 'listening_short_answer',
    skill: 'LISTENING',
    prompt: 'How much does a court cost per hour?',
    answerKey: 'twelve pounds',
    acceptedAnswers: ['12 pounds', '£12'],
    wordLimit: { maxWords: 2, allowsNumber: true, instruction: 'NO MORE THAN TWO WORDS AND/OR A NUMBER' },
    explanation: 'The receptionist says courts cost twelve pounds per hour.',
    difficulty: 'EASY',
    difficultyModel: 'ielts-platform-difficulty-v1',
    contentSource: { type: 'ORIGINAL_GENERATED' },
    generatorVersion: 'golden-fixture-v1',
    validationStatus: 'PUBLISHED',
    evidence: {
      transcriptSpan: span(GOLDEN_LISTENING_TRANSCRIPT, 'twelve pounds per hour'),
      expectedAnswer: 'twelve pounds',
      acceptedVariants: ['12 pounds', '£12'],
      wordLimit: { maxWords: 2, allowsNumber: true },
    },
  },
  {
    id: 'golden-l-2',
    testId: 'golden-test-listening',
    orderIndex: 1,
    questionType: 'listening_sentence_completion',
    skill: 'LISTENING',
    prompt: 'The caller books the court at ______ o\u2019clock.',
    answerKey: 'four',
    acceptedAnswers: ['4'],
    wordLimit: { maxWords: 1, allowsNumber: true, instruction: 'NO MORE THAN ONE WORD AND/OR A NUMBER' },
    explanation: 'The caller says four o\u2019clock would be perfect.',
    difficulty: 'EASY',
    difficultyModel: 'ielts-platform-difficulty-v1',
    contentSource: { type: 'ORIGINAL_GENERATED' },
    generatorVersion: 'golden-fixture-v1',
    validationStatus: 'PUBLISHED',
    evidence: {
      transcriptSpan: span(GOLDEN_LISTENING_TRANSCRIPT, 'Four o\u2019clock would be perfect'),
      expectedAnswer: 'four',
      acceptedVariants: ['4'],
      wordLimit: { maxWords: 1, allowsNumber: true },
    },
  },
];

// ============================================
// Writing / Speaking evaluation regression set (original)
// ============================================

export interface GoldenWritingSample {
  id: string;
  label: string;
  taskType: 'academic_task1' | 'academic_task2' | 'general_task1' | 'general_task2';
  prompt: string;
  essay: string;
  notes: string;
}

const STRONG_ESSAY = [
  'Whether governments should fund public art is a question that divides opinion in many cities. Those who support public funding argue that shared artworks give communities a sense of identity and draw visitors to neglected districts. However, critics contend that the money would be better spent on hospitals and schools, which serve more immediate needs.',
  'In my view, a modest public art budget is defensible precisely because culture improves the quality of urban life in ways that markets undervalue. For example, the murals along my local riverfront transformed a disused industrial lane into a space where families now gather every weekend. Local shopkeepers have reported steadier trade since the paintings appeared, and school groups regularly use the walls as an open-air gallery for their own projects.',
  'Admittedly, no one should pretend that a sculpture can substitute for a fully staffed clinic. This is why I would limit public art funding to a small, transparent share of the cultural budget, with community panels deciding which projects receive support. Such panels could prioritise works that reflect the history of the neighbourhood rather than the tastes of a distant committee.',
  'A further benefit is educational. When children walk past ambitious public artworks on their way to school, they learn that creative work belongs to everyone, not merely to those who can afford gallery tickets. This quiet, everyday exposure may do more for long-term cultural participation than any single exhibition.',
  'Consequently, although healthcare must remain the priority, eliminating cultural spending altogether would be short-sighted and hard to justify. The challenge is not whether to fund art, but how to fund it honestly and accountably.',
].join(' ');

const WEAK_ESSAY = [
  'Public art is good. I think government should spend money on it because it is nice.',
  'Also art make city beautiful. Many people like art. Some people dont like it but I think art is important.',
  'So government should pay for art and make people happy.',
].join(' ');

const OFF_TOPIC_ESSAY = [
  'Nowadays traffic is very bad in my city. Cars are everywhere and the roads are always busy in the morning.',
  'We should build more underground stations and encourage people to take the bus instead of driving.',
  'If the government improves public transport, the air will be cleaner and people will be happier.',
].join(' ');

const FORMULAIC_ESSAY = [
  'In this modern era of globalization, it is a controversial issue that has sparked heated debate among the masses.',
  'On the one hand, some people say yes. On the other hand, some people say no. It is a double-edged sword.',
  'In conclusion, both sides have merits and demerits, so the government should take a balanced approach.',
].join(' ');

const UNDER_LENGTH_TASK2 = [
  'I agree that governments should fund public art because it helps communities.',
  'Art can bring people together and make neighbourhoods more attractive to visitors.',
].join(' ');

export const GOLDEN_WRITING_SAMPLES: GoldenWritingSample[] = [
  {
    id: 'writing-strong',
    label: 'clearly strong response (relevant, developed, clear position)',
    taskType: 'academic_task2',
    prompt:
      'Some people think governments should spend money on public art. To what extent do you agree or disagree?',
    essay: STRONG_ESSAY,
    notes: 'Should support high Task Response credit with evidence; no examiner-equivalence claim allowed.',
  },
  {
    id: 'writing-weak',
    label: 'clearly weak response (minimal development, basic language)',
    taskType: 'academic_task2',
    prompt:
      'Some people think governments should spend money on public art. To what extent do you agree or disagree?',
    essay: WEAK_ESSAY,
    notes: 'Below minimum length; limited range; task only superficially addressed.',
  },
  {
    id: 'writing-off-topic',
    label: 'off-topic response (traffic instead of art funding)',
    taskType: 'academic_task2',
    prompt:
      'Some people think governments should spend money on public art. To what extent do you agree or disagree?',
    essay: OFF_TOPIC_ESSAY,
    notes: 'Task Response must be penalised — no credit for fluent but irrelevant prose.',
  },
  {
    id: 'writing-formulaic',
    label: 'memorised/formulaic response (template language, no task engagement)',
    taskType: 'academic_task2',
    prompt:
      'Some people think governments should spend money on public art. To what extent do you agree or disagree?',
    essay: FORMULAIC_ESSAY,
    notes: 'templateSuspicion should fire; no unevidenced task fulfilment credit.',
  },
  {
    id: 'writing-under-length',
    label: 'under-length response (below 250 words)',
    taskType: 'academic_task2',
    prompt:
      'Some people think governments should spend money on public art. To what extent do you agree or disagree?',
    essay: UNDER_LENGTH_TASK2,
    notes: 'WORD_LIMIT_EXCEEDED limitation must be surfaced; no mechanical penalty claim.',
  },
  {
    id: 'writing-gt-letter',
    label: 'General Training Task 1 letter (register + three bullet points)',
    taskType: 'general_task1',
    prompt:
      'You recently moved into a new flat and the heating has stopped working. Write a letter to the landlord. In your letter: explain the situation; describe the problem with the heating; say what you would like the landlord to do.',
    essay: [
      'Dear Mr Hughes,',
      'I am writing to let you know that the heating in the flat has stopped working since Monday morning, and I would be grateful for your help in arranging a repair.',
      'The radiators stay completely cold even though the thermostat is set to maximum. In the evenings the hot water is only lukewarm, and the flat becomes very cold after sunset, which makes it difficult to study or sleep comfortably. I checked the boiler as the manual suggests, but the pressure gauge sits in the red zone and the reset button does nothing. The building manager mentioned that another flat on this floor had a similar fault last winter, so it may be a known issue with the system.',
      'I would be grateful if you could arrange for a technician to visit this week, or let me know whom I should contact directly. If an evening appointment is easier, I am happy to stay in after six o\u2019clock on any weekday.',
      'Thank you for your help with this matter.',
      'Yours sincerely,',
      'Alex Chen',
    ].join(' '),
    notes: 'Letter register is semi-formal, all three bullet points covered.',
  },
];

export interface GoldenSpeakingSample {
  id: string;
  label: string;
  part: 'speaking_part1' | 'speaking_part2' | 'speaking_part3';
  prompt: string;
  transcript: string;
  notes: string;
}

// Preparation reference material only. The platform offers NO speaking score
// (no band, no language estimate, no examiner simulation) — these samples show
// the observable features a student can hear back and act on in the
// self-recording loop defined in `speaking/strategies.ts`.
export const GOLDEN_SPEAKING_SAMPLES: GoldenSpeakingSample[] = [
  {
    id: 'speaking-fluent',
    label: 'connected response a student can model structurally',
    part: 'speaking_part2',
    prompt: 'Describe a place you like to visit.',
    transcript:
      'One place that I really enjoy visiting is the small library near my grandparents\u2019 house, because it is quiet and I can focus there. What I like most about it is the wooden reading room, which has tall windows overlooking a garden. I usually go there on Sunday mornings, and I often stay for two or three hours reading novels or preparing for my exams.',
    notes: 'Preparation model: connected, story-based answer structure — not a score reference.',
  },
  {
    id: 'speaking-hesitant',
    label: 'hesitation pattern to hear back and reduce while rehearsing',
    part: 'speaking_part2',
    prompt: 'Describe a place you like to visit.',
    transcript:
      'Yes, so, I want to talk about, um, a place I like, I mean, it is a park, um, near my home, and, um, I go there, like, sometimes, and, um, it is nice, I mean, it is okay.',
    notes: 'Self-check example: hesitation markers a student can identify in their own recording — no fluency score is produced.',
  },
];
