// ============================================
// 2026-10-03 PHASE IELTS-01 (IV): Materials-Derived Style Reference
// ============================================
// Reference patterns distilled from the local study materials in
// `materials/IELTS/` (Cambridge IELTS 21 Academic practice tests; "Crack IELTS
// Reading"; "Mastering the IELTS test"):
//
//   * QUESTION-SET BLUEPRINTS — how official papers compose a section/passage
//     (type mixes, per-part tendencies, numbering conventions)
//   * OFFICIAL INSTRUCTION PHRASES — the functional wording candidates see
//     ("Complete the notes below.", "Write ONE WORD ONLY for each answer.", …)
//   * WRITING TASK SCAFFOLDING — the standard timing/topic/reasons boilerplate
//
// COPYRIGHT POLICY: none of the books' passages, questions, options, answer
// keys or transcripts are stored here or anywhere in the platform. Only
// format-level patterns and functional instruction wording are represented;
// every example below is ORIGINAL platform-written text. The PDFs themselves
// are excluded from the deployment image (.dockerignore).
// ============================================

export const IELTS_MATERIALS_REFERENCE_NOTE =
  'Pattern reference derived from platform study materials (Cambridge-style practice structure). ' +
  'Never reproduce book passages/questions — write fully original content in these shapes.';

// ============================================
// Reading — set composition blueprints
// ============================================

export const READING_ACADEMIC_BLUEPRINT = `
OFFICIAL READING SET COMPOSITION (observed in Cambridge-style papers; follow the
shape, never the content):
- Passage 1: a factual narrative/explanatory text. Typical mix: note/table/sentence
  completion (ONE WORD ONLY / NO MORE THAN TWO WORDS) + TRUE/FALSE/NOT GIVEN
  (information-based).
- Passage 2: a discursive or descriptive text (sections A–G with headings).
  Typical mix: "Which section contains the following information?" matching +
  matching headings or matching sentence endings + one multiple-choice.
- Passage 3: an argument/review text (writer's attitude present).
  Typical mix: YES/NO/NOT GIVEN (writer's claims) + multiple-choice (writer's
  purpose) + summary completion (word list or free completion).
- A practice set with fewer questions should use 2–3 of these type families with
  the same progression (completion → matching → opinion/judgement).
- Numbering is continuous across a passage (e.g. 1–13); instructions state the
  exact box range.
`.trim();

export const READING_GENERAL_BLUEPRINT = `
GENERAL TRAINING READING SET COMPOSITION (observed shape; never copy content):
- Section 1: 1–2 short everyday texts (notice, advert, leaflet, timetable,
  email) + TRUE/FALSE/NOT GIVEN (information) or short-answer/completion.
- Section 2: workplace/community texts (rules, contracts, guides) +
  "Which section contains the following information?"-style matching or
  note/table completion.
- Section 3: one longer informative text + completion + multiple-choice.
- Practical, transactional register; answers must be found verbatim or by direct
  paraphrase-free reading.
`.trim();

export const READING_INSTRUCTION_PHRASES = `
OFFICIAL-STYLE READING INSTRUCTIONS (use these functional phrasings, filling in
your own ranges):
- "You should spend about 20 minutes on Questions X–Y, which are based on
  Reading Passage N below."
- "Complete the notes below. Choose ONE WORD ONLY from the passage for each
  answer. Write your answers in boxes X–Y on your answer sheet."
- "Complete the table below. Write NO MORE THAN TWO WORDS AND/OR A NUMBER for
  each answer."
- "Do the following statements agree with the information given in Reading
  Passage N? In boxes X–Y on your answer sheet, write TRUE / FALSE / NOT GIVEN."
- "Do the following statements agree with the claims of the writer in Reading
  Passage N? In boxes X–Y on your answer sheet, write YES / NO / NOT GIVEN."
- "Reading Passage N has seven sections, A–G. Which section contains the
  following information? Write the correct letter, A–G, in boxes X–Y."
- "Choose the correct heading for each section from the list of headings below.
  Write the correct number, i–ix, in boxes X–Y."
- "Match each statement with the correct person, A, B, C or D. Write the correct
  letter, A, B, C or D, in boxes X–Y. NB You may use any letter more than once."
- "Complete the summary using the list of words, A–I, below. Write the correct
  letter, A–I, in boxes X–Y."  → represent this as a MATCHING item on this
  platform (word list = coded options, answer = the letter); include the summary
  sentence(s) with gaps in the prompt.
`.trim();

// ============================================
// Listening — per-part tendencies
// ============================================

export const LISTENING_PART_BLUEPRINTS = `
OFFICIAL LISTENING PART TENDENCIES (observed shape; never copy content):
- Part 1 (social conversation, two speakers): form/notes completion with a
  worked example (Example: …), ONE WORD AND/OR A NUMBER / NO MORE THAN TWO WORDS.
- Part 2 (monologue to a group): multiple-choice (Choose the correct letter, A,
  B or C) + matching (e.g. "Which …?") or plan/map/diagram labelling.
- Part 3 (2–3 speakers, study discussion): multiple-choice series + matching
  ("Match each statement with the correct person… NB You may use any letter more
  than once.").
- Part 4 (academic monologue / lecture extract): note/sentence completion, ONE
  WORD ONLY / NO MORE THAN TWO WORDS.
- Numbering is continuous (1–10, 11–20, …). Instructions state the box range.
- NEVER create a single item whose stem asks for TWO answers ("Choose TWO
  letters"): official papers split those across TWO numbered questions, and this
  platform's blind-solve verification cannot disambiguate a two-answer stem.
  Express such content as separate questions instead.
`.trim();

export const LISTENING_INSTRUCTION_PHRASES = `
OFFICIAL-STYLE LISTENING INSTRUCTIONS (functional phrasings):
- "Questions X–Y: Choose the correct letter, A, B or C."
- "Complete the notes below. Write ONE WORD AND/OR A NUMBER for each answer."
- "Complete the table below. Write NO MORE THAN TWO WORDS for each answer."
- "Choose TWO letters… is NOT used on this platform — split into separate items."
- "Write your answers in boxes X–Y on your answer sheet."
`.trim();

// ============================================
// Writing — task scaffolding
// ============================================

export const WRITING_TASK_SCAFFOLD = `
OFFICIAL WRITING TASK SCAFFOLDING (use this boilerplate; content stays original):
- Task 1: "You should spend about 20 minutes on this task." … task … "Write at
  least 150 words."
- Task 2: "You should spend about 40 minutes on this task." + "Write about the
  following topic:" + the topic/question + "Give reasons for your answer and
  include any relevant examples from your own knowledge or experience." + "Write
  at least 250 words."
- General Training Task 1 letters: situation + "In your letter:" + exactly three
  bullet requirements + "Write at least 150 words." (official salutations like
  "Begin your letter as follows: Dear Sir or Madam," are optional and used only
  when the register demands them).
`.trim();
