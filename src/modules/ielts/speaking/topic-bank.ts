// ============================================
// IELTS Speaking — Preparation Topic Bank (ORIGINAL platform content)
// ============================================
// All prompts here are ORIGINAL English text written for this platform. They are
// SHAPED to match real IELTS task formats (see docs/ielts/IELTS_PRACTICE_PATTERNS.md)
// but are NOT official or recalled questions and must never be presented as such.
//
// The bank is used for TEACHING preparation: topic coverage, planning method,
// useful language functions and pitfalls. The platform never scores speaking and
// never simulates an examiner (product decision, 2026-10-03 II).
// ============================================

import type { IeltsSpeakingPartType } from '../domain/types';

export type IeltsSpeakingTopicCategory = 'part1_themes' | 'people' | 'places' | 'objects_things' | 'events_experiences' | 'part3_functions';

export interface IeltsSpeakingLanguageFunction {
  /** Communicative function, e.g. "speculating". */
  function: string;
  /** Original example frames the student can adapt (NOT a script to memorise). */
  examples: string[];
}

export interface IeltsSpeakingTopic {
  id: string;
  part: IeltsSpeakingPartType;
  category: IeltsSpeakingTopicCategory;
  /** Short label for lists. */
  title: string;
  /** Original prompt text (questions / cue card). */
  prompt: string;
  /** Part 2 "You should say" facets (cue card structure). */
  cueFacets?: string[];
  /** Method-level preparation pointers (how to prepare — never a script). */
  prepPointers: string[];
  /** Useful language FUNCTIONS with adaptable example frames. */
  languageFunctions: IeltsSpeakingLanguageFunction[];
  /** Common pitfalls for this topic. */
  pitfalls: string[];
}

export const IELTS_SPEAKING_TOPIC_CATEGORIES: readonly { key: IeltsSpeakingTopicCategory; labelEn: string }[] = [
  { key: 'part1_themes', labelEn: 'Part 1 familiar themes' },
  { key: 'people', labelEn: 'Part 2 — People' },
  { key: 'places', labelEn: 'Part 2 — Places' },
  { key: 'objects_things', labelEn: 'Part 2 — Objects & things' },
  { key: 'events_experiences', labelEn: 'Part 2 — Events & experiences' },
  { key: 'part3_functions', labelEn: 'Part 3 discussion functions' },
];

// ============================================
// Part 1 — familiar themes (original question sets)
// ============================================

const PART1_THEMES: IeltsSpeakingTopic[] = [
  {
    id: 'p1-work-study',
    part: 'speaking_part1',
    category: 'part1_themes',
    title: 'Work & study',
    prompt: 'Do you work or are you a student? What do you like most about it? Is there anything you would like to change?',
    prepPointers: [
      'Prepare 2 concrete details (a task you enjoy, a challenge) instead of general praise.',
      'Practise extending: answer → reason → mini example.',
    ],
    languageFunctions: [
      { function: 'Describing routine', examples: ['I usually spend most of my day…', 'What I enjoy most is…'] },
      { function: 'Expressing mild dissatisfaction', examples: ['The only thing I would change is…', 'It can be demanding when…'] },
    ],
    pitfalls: ['One-word answers', 'Listing subjects/tasks without any reason'],
  },
  {
    id: 'p1-hometown',
    part: 'speaking_part1',
    category: 'part1_themes',
    title: 'Hometown',
    prompt: 'Where is your hometown? What is it like? Would you like to live there in the future?',
    prepPointers: [
      'Prepare 2–3 concrete images (a street, a smell, a landmark) — concrete beats adjectives.',
      'Practise comparing past and present of the same place.',
    ],
    languageFunctions: [
      { function: 'Describing places briefly', examples: ['It is fairly quiet compared with…', 'What makes it special is…'] },
      { function: 'Speculating about the future', examples: ['I could see myself settling there if…', 'I doubt I would move back unless…'] },
    ],
    pitfalls: ['Reading city statistics like a guidebook', 'Only saying "it is beautiful"'],
  },
  {
    id: 'p1-home',
    part: 'speaking_part1',
    category: 'part1_themes',
    title: 'Home & accommodation',
    prompt: 'Do you live in a house or a flat? What is your favourite room? What would you change about your home?',
    prepPointers: [
      'Prepare room vocabulary (natural light, storage, balcony) you can actually use.',
      'Practise a 4–6 sentence answer with one small story.',
    ],
    languageFunctions: [
      { function: 'Describing spaces', examples: ['It opens onto…', 'It gets plenty of natural light in the morning'] },
      { function: 'Expressing preferences', examples: ['I would rather have… than…', 'What I appreciate most is…'] },
    ],
    pitfalls: ['Furniture inventories with no opinion', 'Inventing details you cannot sustain'],
  },
  {
    id: 'p1-free-time',
    part: 'speaking_part1',
    category: 'part1_themes',
    title: 'Free time & hobbies',
    prompt: 'What do you like doing in your free time? Has this changed in recent years? Do you prefer indoor or outdoor activities?',
    prepPointers: [
      'Make sure you can name the activity precisely and say why you started.',
      'Prepare one contrast: how your hobby changed over time.',
    ],
    languageFunctions: [
      { function: 'Explaining habits', examples: ['I tend to… whenever I get the chance', 'These days I hardly ever…'] },
      { function: 'Giving reasons', examples: ['The main reason I enjoy it is…', 'It helps me unwind after…'] },
    ],
    pitfalls: ['Listing hobbies without depth', 'Claiming extreme expertise'],
  },
  {
    id: 'p1-technology',
    part: 'speaking_part1',
    category: 'part1_themes',
    title: 'Technology & phones',
    prompt: 'How often do you use your phone? What apps do you use the most? Do you think you spend too much time on it?',
    prepPointers: [
      'Prepare balanced opinions (benefit + drawback) so Part 3 escalation feels natural.',
      'Have one honest example of your own habits.',
    ],
    languageFunctions: [
      { function: 'Quantifying habits', examples: ['Probably more than I should, to be honest', 'It is mostly for…'] },
      { function: 'Conceding', examples: ['That said, I try to…', 'I am aware that…'] },
    ],
    pitfalls: ['Moralising about "young people"', 'Zero specific details'],
  },
  {
    id: 'p1-food',
    part: 'speaking_part1',
    category: 'part1_themes',
    title: 'Food & cooking',
    prompt: 'Do you enjoy cooking? What kind of food do you like? Is there any food you dislike?',
    prepPointers: [
      'Prepare taste/texture vocabulary for 2 dishes you know well.',
      'Practise a polite way to express dislike (useful register control).',
    ],
    languageFunctions: [
      { function: 'Describing food', examples: ['It has a rich, slightly spicy flavour', 'It is quite filling'] },
      { function: 'Polite dislike', examples: ['I have never really got used to…', 'It is not quite to my taste'] },
    ],
    pitfalls: ['Reading a menu aloud', 'Saying "delicious" for everything'],
  },
  {
    id: 'p1-weather',
    part: 'speaking_part1',
    category: 'part1_themes',
    title: 'Weather & seasons',
    prompt: 'What is the weather like in your city? Which season do you like best? Does weather affect your mood?',
    prepPointers: [
      'Prepare weather vocabulary linked to ACTIVITIES (what you do in that weather).',
      'The official Part 3 chain often continues into climate topics — know your opinions.',
    ],
    languageFunctions: [
      { function: 'Describing conditions', examples: ['It can get unbearably humid in July', 'We tend to get sudden showers'] },
      { function: 'Linking weather to mood/plans', examples: ['Grey skies put me in the mood to…', 'When it cools down, I usually…'] },
    ],
    pitfalls: ['Only temperature numbers', 'Saying "I don\'t know" about mood effects'],
  },
  {
    id: 'p1-festivals',
    part: 'speaking_part1',
    category: 'part1_themes',
    title: 'Festivals & celebrations',
    prompt: 'What is your favourite festival? How do people usually celebrate it? Do you prefer festivals at home or in public?',
    prepPointers: [
      'Prepare sensory details (food, decorations, sounds) plus one personal memory.',
      'Practise describing traditions neutrally — not tourism-brochure language.',
    ],
    languageFunctions: [
      { function: 'Describing customs', examples: ['People typically gather to…', 'It is traditional to…'] },
      { function: 'Personalising', examples: ['In my family, we always…', 'For me, the best part is…'] },
    ],
    pitfalls: ['Historical lectures', 'Over-claimed enthusiasm'],
  },
];

// ============================================
// Part 2 — cue cards (original) in 4 macro-categories
// ============================================

function cueCardPrompt(target: string, facets: string[]): string {
  return `Describe ${target}. You should say: ${facets.join('; ')} and explain why this matters to you.`;
}

const PART2_TOPICS: IeltsSpeakingTopic[] = [
  {
    id: 'p2-person-interesting',
    part: 'speaking_part2',
    category: 'people',
    title: 'A person you find interesting',
    prompt: cueCardPrompt('a person you find interesting', ['who this person is', 'how you know them', 'what you do or talk about together', 'what makes them interesting']),
    cueFacets: ['who this person is', 'how you know them', 'what you do or talk about together', 'what makes them interesting'],
    prepPointers: [
      'Choose a REAL person you can describe in detail — honesty produces natural, specific stories.',
      'Prepare one small anecdote that shows their character instead of adjectives.',
    ],
    languageFunctions: [
      { function: 'Describing personality with evidence', examples: ['She has a way of…', 'What stands out is how he…'] },
      { function: 'Narrating an anecdote briefly', examples: ['I remember once, when…', 'One time she…'] },
    ],
    pitfalls: ['Listing adjectives without examples', 'Describing a celebrity you know nothing about'],
  },
  {
    id: 'p2-person-helpful',
    part: 'speaking_part2',
    category: 'people',
    title: 'Someone who helped you',
    prompt: cueCardPrompt('someone who helped you in an important way', ['who helped you', 'what the situation was', 'how they helped', 'how you felt about it']),
    cueFacets: ['who helped you', 'what the situation was', 'how they helped', 'how you felt about it'],
    prepPointers: [
      'Prepare emotions carefully (relieved, grateful, encouraged) — this card rewards feeling vocabulary.',
      'Practise a clear problem → help → result structure.',
    ],
    languageFunctions: [
      { function: 'Explaining a problem briefly', examples: ['I was stuck because…', 'At that point I had no idea how to…'] },
      { function: 'Describing emotional impact', examples: ['I felt a huge sense of relief when…', 'It meant a lot that…'] },
    ],
    pitfalls: ['Spending 90 seconds on background', 'Forgetting the "how you felt" facet'],
  },
  {
    id: 'p2-person-neighbour',
    part: 'speaking_part2',
    category: 'people',
    title: 'A neighbour you get along with',
    prompt: cueCardPrompt('a neighbour you get along with', ['who they are', 'how long you have known them', 'what you do together or how you help each other', 'why you get along well']),
    cueFacets: ['who they are', 'how long you have known them', 'what you do together or how you help each other', 'why you get along well'],
    prepPointers: [
      'Small everyday details work well here (parcels, plants, greetings).',
      'Practise "how long" tense shifts (we have known each other since…).',
    ],
    languageFunctions: [
      { function: 'Describing neighbourly contact', examples: ['We occasionally…', 'She often pops over to…'] },
      { function: 'Explaining compatibility', examples: ['We get on well because we…', 'What makes it easy is that…'] },
    ],
    pitfalls: ['Confusing "neighbour" with "classmate"', 'No concrete interaction described'],
  },
  {
    id: 'p2-place-relax',
    part: 'speaking_part2',
    category: 'places',
    title: 'A place where you relax',
    prompt: cueCardPrompt('a place where you like to relax', ['where it is', 'how often you go there', 'what you do there', 'why it helps you relax']),
    cueFacets: ['where it is', 'how often you go there', 'what you do there', 'why it helps you relax'],
    prepPointers: [
      'Prepare sensory language (light, sound, temperature) — places come alive through senses.',
      'Use present tenses for habits and past for one memorable visit.',
    ],
    languageFunctions: [
      { function: 'Describing atmosphere', examples: ['It is peaceful in a way that…', 'The light there is…'] },
      { function: 'Explaining effect on you', examples: ['It helps me switch off because…', 'I always leave feeling…'] },
    ],
    pitfalls: ['Guidebook descriptions', 'No personal routine attached'],
  },
  {
    id: 'p2-place-city',
    part: 'speaking_part2',
    category: 'places',
    title: 'A city you briefly visited',
    prompt: cueCardPrompt('a city you visited for a short time', ['where it is', 'when and why you went', 'what you did there', 'whether you would like to go back']),
    cueFacets: ['where it is', 'when and why you went', 'what you did there', 'whether you would like to go back'],
    prepPointers: [
      'Short visits are ideal for "impression" language — what surprised you most?',
      'Prepare one specific memory rather than a list of attractions.',
    ],
    languageFunctions: [
      { function: 'Describing first impressions', examples: ['What struck me first was…', 'It felt much more… than I expected'] },
      { function: 'Expressing intentions', examples: ['I would jump at the chance to…', 'I would go back mainly to…'] },
    ],
    pitfalls: ['Reciting opening hours and ticket prices', 'No personal reaction'],
  },
  {
    id: 'p2-place-quiet',
    part: 'speaking_part2',
    category: 'places',
    title: 'A quiet place you found',
    prompt: cueCardPrompt('a quiet place you discovered', ['where it is', 'how you found it', 'what you do there', 'why the quietness matters to you']),
    cueFacets: ['where it is', 'how you found it', 'what you do there', 'why the quietness matters to you'],
    prepPointers: [
      'Pair this with the Part 3 theme of city noise — prepare opinions too.',
      'Contrast language (unlike the main road nearby…) adds range naturally.',
    ],
    languageFunctions: [
      { function: 'Contrasting', examples: ['Unlike the main road, it…', 'It is tucked away behind…'] },
      { function: 'Justifying value', examples: ['To me, quiet spaces matter because…', 'It gives me room to think'] },
    ],
    pitfalls: ['Describing noise instead of quiet', 'Superlatives with no evidence'],
  },
  {
    id: 'p2-object-skill',
    part: 'speaking_part2',
    category: 'objects_things',
    title: 'A skill you would like to learn',
    prompt: cueCardPrompt('a skill you would like to learn', ['what the skill is', 'how you would learn it', 'how long it might take', 'how it would help you']),
    cueFacets: ['what the skill is', 'how you would learn it', 'how long it might take', 'how it would help you'],
    prepPointers: [
      'Use future forms accurately (I would start by…; it would probably take…).',
      'Prepare a realistic reason — career, hobby, independence.',
    ],
    languageFunctions: [
      { function: 'Planning hypothetically', examples: ['I would probably begin by…', 'The first step would be to…'] },
      { function: 'Talking about usefulness', examples: ['It would come in handy when…', 'Long term, it could help me…'] },
    ],
    pitfalls: ['Choosing something you cannot talk about at all', 'Dropping the hypothetical tense'],
  },
  {
    id: 'p2-object-clothing',
    part: 'speaking_part2',
    category: 'objects_things',
    title: 'A piece of clothing you wear often',
    prompt: cueCardPrompt('a piece of clothing you often wear', ['what it looks like', 'when you got it', 'how often you wear it', 'why you like it']),
    cueFacets: ['what it looks like', 'when you got it', 'how often you wear it', 'why you like it'],
    prepPointers: [
      'Prepare colour/material/fit vocabulary for one real item.',
      'Bring a tiny story (where you bought it, who gave it).',
    ],
    languageFunctions: [
      { function: 'Describing appearance of objects', examples: ['It is a faded blue…', 'It has a loose, comfortable fit'] },
      { function: 'Explaining attachment', examples: ['I keep reaching for it because…', 'It goes with almost everything'] },
    ],
    pitfalls: ['A fashion essay instead of one item', 'No reason for preference'],
  },
  {
    id: 'p2-object-website',
    part: 'speaking_part2',
    category: 'objects_things',
    title: 'A website or app you use often',
    prompt: cueCardPrompt('a website or app you use often', ['what it is', 'how you discovered it', 'what you use it for', 'why it is useful to you']),
    cueFacets: ['what it is', 'how you discovered it', 'what you use it for', 'why it is useful to you'],
    prepPointers: [
      'Avoid brand marketing talk; focus on YOUR use and limits.',
      'Prepare one drawback for balance (also feeds Part 3).',
    ],
    languageFunctions: [
      { function: 'Explaining usage', examples: ['I mainly use it to…', 'It saves me the trouble of…'] },
      { function: 'Balanced evaluation', examples: ['It is handy, though I try not to…', 'The downside is that…'] },
    ],
    pitfalls: ['Feature lists', 'No personal habit'],
  },
  {
    id: 'p2-event-decision',
    part: 'speaking_part2',
    category: 'events_experiences',
    title: 'An important decision you made',
    prompt: cueCardPrompt('an important decision you made', ['what the decision was', 'when you made it', 'what the alternatives were', 'how you felt about it afterwards']),
    cueFacets: ['what the decision was', 'when you made it', 'what the alternatives were', 'how you felt about it afterwards'],
    prepPointers: [
      'Choice cards need COMPARISON language — prepare weigh-up phrases.',
      'End with reflection (would you decide the same again?).',
    ],
    languageFunctions: [
      { function: 'Weighing options', examples: ['I was torn between… and…', 'The deciding factor was…'] },
      { function: 'Reflecting after the fact', examples: ['Looking back, I would…', 'It turned out to be the right call because…'] },
    ],
    pitfalls: ['A trivial decision treated dramatically', 'No alternatives mentioned'],
  },
  {
    id: 'p2-event-journey',
    part: 'speaking_part2',
    category: 'events_experiences',
    title: 'A memorable journey',
    prompt: cueCardPrompt('a journey you remember well', ['where you went', 'who you went with', 'what happened during the journey', 'why you remember it']),
    cueFacets: ['where you went', 'who you went with', 'what happened during the journey', 'why you remember it'],
    prepPointers: [
      'Narrative tenses (we set off, we were waiting when…) need drilling — stories collapse without them.',
      'Prepare one twist or complication: that is what makes it memorable.',
    ],
    languageFunctions: [
      { function: 'Narrating a sequence', examples: ['We set off at dawn and…', 'Just as we were about to…'] },
      { function: 'Explaining significance', examples: ['It sticks in my mind because…', 'That trip changed how I…'] },
    ],
    pitfalls: ['Chronology with no peak', 'Route descriptions like a map'],
  },
  {
    id: 'p2-event-proud',
    part: 'speaking_part2',
    category: 'events_experiences',
    title: 'Something you are proud of',
    prompt: cueCardPrompt('something you did that you are proud of', ['what you did', 'when and where it happened', 'what was difficult about it', 'why you are proud of it']),
    cueFacets: ['what you did', 'when and where it happened', 'what was difficult about it', 'why you are proud of it'],
    prepPointers: [
      'Modesty with specificity works best: describe the effort, not self-praise.',
      'Difficulty facet = contrast (before/after).',
    ],
    languageFunctions: [
      { function: 'Describing effort', examples: ['It took me weeks of…', 'I had to push myself to…'] },
      { function: 'Measured pride', examples: ['I am quietly proud that…', 'What satisfied me most was…'] },
    ],
    pitfalls: ['Bragging without evidence', 'Claiming achievements you cannot detail'],
  },
];

// ============================================
// Part 3 — discussion functions (question stems + practising advice)
// ============================================

const PART3_FUNCTIONS: IeltsSpeakingTopic[] = [
  {
    id: 'p3-compare',
    part: 'speaking_part3',
    category: 'part3_functions',
    title: 'Compare & contrast',
    prompt: 'How has <topic> changed compared with twenty years ago? How do attitudes differ between older and younger people?',
    prepPointers: [
      'Practise the spine: direct comparison → reason → brief example.',
      'Prepare structures of contrast (whereas / while / by contrast).',
    ],
    languageFunctions: [
      { function: 'Comparing periods', examples: ['Back then, people tended to… whereas now…', 'The biggest shift has been…'] },
      { function: 'Comparing groups', examples: ['Older generations often… while younger people are more likely to…'] },
    ],
    pitfalls: ['Listing differences without a pattern', 'Forgetting to answer the actual comparison'],
  },
  {
    id: 'p3-opinion',
    part: 'speaking_part3',
    category: 'part3_functions',
    title: 'Opinion & justification',
    prompt: 'Why do some people think <view>? Do you think <policy> is a good idea? What is your view?',
    prepPointers: [
      'Prepare a 3-step habit: position → reason → example/qualification.',
      'Practise conceding before countering (I can see why…, but…).',
    ],
    languageFunctions: [
      { function: 'Stating a position', examples: ['On balance, I would argue that…', 'My take is that…'] },
      { function: 'Conceding then countering', examples: ['There is some truth in…, though I would say…'] },
    ],
    pitfalls: ['Yes/No with no development', 'Changing position mid-answer'],
  },
  {
    id: 'p3-speculate',
    part: 'speaking_part3',
    category: 'part3_functions',
    title: 'Speculation & prediction',
    prompt: 'How might <topic> develop in the future? What would happen if <change>?',
    prepPointers: [
      'Future forms practice: might / could / is likely to / there is a risk that…',
      'Use hedged predictions — absolute certainty sounds unnatural.',
    ],
    languageFunctions: [
      { function: 'Hedged prediction', examples: ['I would imagine it will become…', 'There is a chance that…'] },
      { function: 'Conditional speculation', examples: ['If that happened, it would probably…', 'Unless something changes, we might see…'] },
    ],
    pitfalls: ['Present tense for the future', 'Science-fiction scenarios with no reasoning'],
  },
  {
    id: 'p3-causes',
    part: 'speaking_part3',
    category: 'part3_functions',
    title: 'Causes & effects',
    prompt: 'What are the reasons behind <phenomenon>? What effects does it have on society?',
    prepPointers: [
      'Distinguish personal vs societal causes (money, education, culture).',
      'Prepare cause-effect connectors (leads to, results in, stems from).',
    ],
    languageFunctions: [
      { function: 'Explaining causes', examples: ['It largely stems from…', 'Part of the reason is…'] },
      { function: 'Explaining effects', examples: ['A knock-on effect is that…', 'In the long run, this could…'] },
    ],
    pitfalls: ['One-cause explanations', 'Blurring causes and effects'],
  },
  {
    id: 'p3-solutions',
    part: 'speaking_part3',
    category: 'part3_functions',
    title: 'Problems & solutions',
    prompt: 'What problems does <issue> create? What could governments or individuals do about it?',
    prepPointers: [
      'Pair EVERY solution with the problem it addresses — mismatched pairs are a classic weakness.',
      'Prepare actor categories: government / schools / companies / individuals.',
    ],
    languageFunctions: [
      { function: 'Proposing measures', examples: ['One practical measure would be…', 'Authorities could incentivise…'] },
      { function: 'Evaluating feasibility', examples: ['It sounds good in theory, but…', 'That would only work if…'] },
    ],
    pitfalls: ['Solutions that do not match the problem', 'Vague calls for "awareness"'],
  },
  {
    id: 'p3-society',
    part: 'speaking_part3',
    category: 'part3_functions',
    title: 'Society-level generalisation',
    prompt: 'Should <activity> be regulated? Are these trends positive for society as a whole?',
    prepPointers: [
      'Prepare both individual and public-interest arguments (rights vs costs).',
      'Keep it balanced: generalisations need qualifiers (in most cases, broadly speaking).',
    ],
    languageFunctions: [
      { function: 'Qualified generalisation', examples: ['Broadly speaking, most people…', 'In general terms, societies tend to…'] },
      { function: 'Weighing public interest', examples: ['The wider cost of that freedom is…', 'From a public-interest perspective…'] },
    ],
    pitfalls: ['Sweeping claims about "everyone"', 'No concrete beneficiary named'],
  },
];

export const IELTS_SPEAKING_TOPIC_BANK: readonly IeltsSpeakingTopic[] = [
  ...PART1_THEMES,
  ...PART2_TOPICS,
  ...PART3_FUNCTIONS,
];

export function getSpeakingTopicsByCategory(category: IeltsSpeakingTopicCategory): IeltsSpeakingTopic[] {
  return IELTS_SPEAKING_TOPIC_BANK.filter((t) => t.category === category);
}

export function getSpeakingTopicsForPart(part: IeltsSpeakingPartType): IeltsSpeakingTopic[] {
  return IELTS_SPEAKING_TOPIC_BANK.filter((t) => t.part === part);
}

export function findSpeakingTopicById(id: string): IeltsSpeakingTopic | null {
  return IELTS_SPEAKING_TOPIC_BANK.find((t) => t.id === id) ?? null;
}
