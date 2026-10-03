// ============================================
// IELTS Speaking — Preparation Strategies (teaching content, ORIGINAL)
// ============================================
// Method-level preparation guidance synthesised for this platform from public
// pedagogical practice (see docs/ielts/IELTS_PRACTICE_PATTERNS.md). NOT scripts,
// NOT official material, and NEVER used to produce a score.
//
// The platform deliberately does NOT:
//   * simulate an examiner / live interview
//   * estimate a Speaking band
//   * judge pronunciation (no acoustic analysis)
// ============================================

export interface IeltsSpeakingPrepSection {
  id: string;
  titleEn: string;
  points: string[];
  steps?: string[];
}

export const IELTS_SPEAKING_PREP_SECTIONS: readonly IeltsSpeakingPrepSection[] = [
  {
    id: 'overview',
    titleEn: 'How the test works (official structure)',
    points: [
      'Three parts, 11–14 minutes total, face-to-face and recorded.',
      'Part 1 (4–5 min): familiar topics — home, family, work, studies, interests.',
      'Part 2 (3–4 min incl. 1 min preparation): a task card; speak up to 2 minutes; the examiner may ask 1–2 follow-up questions.',
      'Part 3 (4–5 min): a deeper, more abstract discussion linked to the Part 2 topic.',
      'Four criteria are assessed: Fluency & Coherence, Lexical Resource, Grammar, Pronunciation — each equally weighted. This platform does not score them; it teaches you to prepare for them.',
    ],
  },
  {
    id: 'part1-strategy',
    titleEn: 'Part 1 strategy — extend naturally',
    points: [
      'Answer + reason + mini-example is the safest extension pattern (4–6 sentences).',
      'One-word or one-sentence answers give the examiner nothing to assess.',
      'Do not over-prepare speeches: Part 1 questions vary slightly and rehearsed language sounds flat.',
      'Keep tense control: past questions ("Did you…?") invite past forms; future questions invite would/will.',
    ],
  },
  {
    id: 'part2-strategy',
    titleEn: 'Part 2 strategy — notes, not scripts',
    points: [
      'Use the 1-minute preparation on the 4 "You should say" facets — one cell per facet.',
      'Speak from keywords; never write full sentences in the minute (you will read them aloud).',
      'Structure: facet 1 → facet 2 → facet 3 → facet 4 (with the "explain why" last, as a natural conclusion).',
      'Aim to keep talking for close to 2 minutes; if you finish early, add a detail or a reflection rather than stopping.',
    ],
  },
  {
    id: 'part3-strategy',
    titleEn: 'Part 3 strategy — practise question FUNCTIONS',
    points: [
      'Most Part 3 questions do one of these jobs: compare, give an opinion, predict, explain causes, propose solutions, generalise about society.',
      'Practise the function, not the exact question — the specific topic changes each time.',
      'Spine for most answers: Answer → Reason → Example → (Counterpoint/qualifier).',
      'Qualifiers are your friend: "broadly speaking", "in most cases", "that said".',
    ],
  },
];

export interface IeltsSpeakingNoteGridGuide {
  titleEn: string;
  intro: string;
  steps: string[];
  example: {
    cueFacets: string[];
    cells: Array<{ facet: string; keywords: string; tense: 'past' | 'now' | 'future' }>;
  };
}

/** Part 2 one-minute note grid method (four-quadrant, Z-order, tense flags). */
export const IELTS_SPEAKING_NOTE_GRID: IeltsSpeakingNoteGridGuide = {
  titleEn: 'Part 2 — the four-quadrant note grid',
  intro:
    'During the 1-minute preparation, draw a large cross on your paper: four quadrants, one per "You should say" facet. Fill them in Z order (top-left → top-right → bottom-left → bottom-right).',
  steps: [
    'Draw a cross → four cells, one per facet. Write the facet keyword in each cell corner.',
    'Add 2–4 KEYWORDS per cell — never full sentences (you will read them aloud and sound robotic).',
    'Join parallel ideas with "&" inside a cell; stack cause → effect vertically.',
    'Mark each cell P (past) / N (now) / F (future) so your tenses switch correctly while speaking.',
    'Rehearse once from the grid: glance at a cell, speak freely, move on — never memorise the words.',
    'If you have spare preparation time, add one concrete detail (a name, a place, a number) to the weakest cell.',
  ],
  example: {
    cueFacets: ['where it is', 'how often you go there', 'what you do there', 'why you like it'],
    cells: [
      { facet: 'where it is', keywords: 'riverside park · 10 min walk · quiet corner', tense: 'now' },
      { facet: 'how often', keywords: 'weekends · after exams · rain or shine? mostly dry days', tense: 'now' },
      { facet: 'what you do', keywords: 'jog & podcast · read on bench · snack kiosk', tense: 'now' },
      { facet: 'why you like it', keywords: 'slow down · green · met my friend there last month', tense: 'past' },
    ],
  },
};

export interface IeltsSpeakingStoryMergingGuide {
  titleEn: string;
  intro: string;
  steps: string[];
  warnings: string[];
}

/** "One story, many cue cards" (串題) preparation method — with honesty guardrails. */
export const IELTS_SPEAKING_STORY_MERGING: IeltsSpeakingStoryMergingGuide = {
  titleEn: 'One story, many cue cards (topic merging)',
  intro:
    'Build 2–3 rich stories from YOUR OWN real experiences, then practise re-aiming each story at several cue cards. This reduces preparation load without memorising answers.',
  steps: [
    'Write down 3 real experiences you can describe in detail (a trip, a project, a person, a decision).',
    'For each story, list: key facts, 2 funny/tense moments, 1 lesson learned.',
    'Collect 5–8 cue cards and mark which facet of your story each card needs emphasised.',
    'Practise OUT LOUD: same story, different emphasis each time — different opening, different ending focus.',
    'Change the details you highlight, not the honesty: never claim a false experience you cannot sustain.',
  ],
  warnings: [
    'Do NOT memorise and recite. Examiners penalise delivered scripts, and recited language usually collapses under follow-up questions.',
    'Merging is a memory aid for IDEAS — the wording must be produced fresh each time.',
  ],
};

export interface IeltsSpeakingPracticeLoop {
  titleEn: string;
  steps: string[];
  selfCheckQuestions: string[];
}

/** Self-recording practice loop — the platform does not analyse audio; the student does. */
export const IELTS_SPEAKING_PRACTICE_LOOP: IeltsSpeakingPracticeLoop = {
  titleEn: 'The recording loop (self-practice)',
  steps: [
    'Record one Part 2 answer on your phone (do not re-record immediately).',
    'Listen back with the note grid in front of you.',
    'Note ONLY three things: (1) repetition, (2) a missing connector, (3) one tense slip.',
    'Repeat the same answer once: fix exactly those three things — do not aim for perfection.',
    'Every few sessions, record a full 3-part mock alone (P1 questions → a P2 card → P3 follow-ups).',
    'This platform does not analyse your audio — this loop is your own feedback mechanism.',
  ],
  selfCheckQuestions: [
    'Did I answer every facet of the card?',
    'Did I extend Part 1 answers with a reason and an example?',
    'Did I use at least three different tense forms correctly?',
    'Did I use any connector twice in a row?',
    'Did I sound like I was reading (flat rhythm, "written" grammar), or speaking naturally?',
  ],
};

/** Anti-patterns the platform explicitly warns about. */
export const IELTS_SPEAKING_PITFALLS: readonly string[] = [
  'Memorised scripts: rehearsed answers are penalised and break down under follow-up questions.',
  'One-word or clipped answers, especially in Part 1.',
  'Listing everything you know instead of answering the actual question.',
  'Inventing experiences: false details are impossible to sustain across Parts 2–3.',
  'Ignoring the follow-up question after Part 2 — it is part of the assessed interaction.',
  'Treating accent as a score: the platform never judges accent or pronunciation (no acoustic analysis); focus on clarity of ideas and language you control.',
];

// ============================================
// Mandatory limitations attached to every preparation-coach session.
// ============================================
// These are server-set — the AI can never remove or weaken them. The prompt
// version constant lives with the prompt itself (ai/prompts/ielts/speaking-
// preparation.ts, IELTS_SPEAKING_PREP_V1) and is persisted with each plan.

/** Prep-coach limitations (server-set; never AI-authored). */
export const IELTS_SPEAKING_PREP_LIMITATIONS: readonly string[] = [
  'This is a preparation plan, not a score: the platform does not assess Speaking bands, does not simulate an examiner, and does not judge pronunciation.',
  'Speak from the plan in your own words — memorised answers are penalised in the real test.',
  'Platform-created practice material: not official IELTS content, and the real test may use different questions.',
];
