// ============================================
// Self-Directed Practice — topic catalogue (2026-10-10)
// ============================================
// The barrier to using 自訂文法與詞彙練習 was that a student had to name the structure
// themselves ("我想練甚麼？" with an empty box). This catalogue lets the UI show every
// topic of the chosen category as a multi-select chip list, while the free-text box
// stays available — the student can tick, type, or do both.
//
// Consistency contract (enforced by a test): every `label` MUST be inferable as its own
// category by `inferCategory()`. The labels are the canonical English topic names that
// the AI prompt expects, so a ticked topic reads exactly like a typed one and the
// stored objective stays machine-readable.
//
// ⚠️ ONE CATEGORY ONLY. `inferCategory()` counts keyword hits per category and REFUSES
// (400 CATEGORY_AMBIGUOUS) when more than one category is hit, so a label must never
// contain another category's keyword. Two labels are shaped by that rule:
//   * "reduced clauses (V-ing / p.p. clauses)" is not called "participle clauses",
//     because "participle" is grammar evidence (分詞作形容詞);
//   * "fixed collocations (depend on, interested in)" is not called "prepositional
//     collocations", because "preposition" is grammar evidence.
// The reverse direction matters too: "adjective" is deliberately NOT a grammar keyword,
// otherwise the vocabulary request "enough and too with adjectives" would tie.
//
// Topics are grouped per category so 23 grammar topics stay scannable; the groups have no
// meaning outside the UI (a request sends the ticked labels, never the group).
//
// Lives in `shared/` on purpose: the student page is a client component, and importing
// the module barrel would pull server-only code (Prisma/db) into the browser bundle.
// ============================================

export type PracticeTopicCategory = 'grammar' | 'sentence_pattern' | 'vocabulary';

export interface PracticeTopicOption {
  /** Stable id — the UI's selection key (never sent to the AI). */
  id: string;
  /** Canonical English topic name: what is sent to the AI and stored in the objective. */
  label: string;
  /** Traditional-Chinese name shown to the student. */
  labelZh: string;
  /**
   * Question types this topic is best practised with, in preference order. Used ONLY when
   * the student has not chosen a type; an explicit choice always wins.
   *
   * Policy: `mc` first wherever the point can be recognised rather than produced (MC is the
   * only type the server marks without AI), and a productive type
   * (`transformation` / `error_correction` / `sentence_production`) where the skill itself is
   * productive — a 分詞構句 item that cannot be rewritten tests nothing. Values are
   * `PracticeQuestionType` ids; a test pins them against the real list.
   */
  defaultQuestionTypes: readonly string[];
}

/** A UI-only grouping of topics inside one category (never sent to the AI). */
export interface PracticeTopicGroup {
  id: string;
  labelZh: string;
  labelEn: string;
  options: readonly PracticeTopicOption[];
}

/** The API's request-text limit (`MIN/MAX_REQUEST_CHARS` in the normalizer; kept in sync by a test). */
export const TOPIC_REQUEST_MAX_CHARS = 400;

export const CUSTOM_PRACTICE_TOPIC_GROUPS: Record<PracticeTopicCategory, readonly PracticeTopicGroup[]> = {
  grammar: [
    {
      id: 'tenses',
      labelZh: '時態',
      labelEn: 'Tenses',
      options: [
        { id: 'present-simple', label: 'present simple', labelZh: '現在式', defaultQuestionTypes: ['mc', 'fill_blank', 'error_correction'] },
        { id: 'present-continuous', label: 'present continuous', labelZh: '現在進行式', defaultQuestionTypes: ['mc', 'fill_blank', 'error_correction'] },
        { id: 'present-perfect', label: 'present perfect', labelZh: '現在完成式', defaultQuestionTypes: ['mc', 'fill_blank', 'error_correction'] },
        { id: 'past-simple', label: 'past simple', labelZh: '過去式', defaultQuestionTypes: ['mc', 'fill_blank', 'error_correction'] },
        { id: 'past-continuous', label: 'past continuous', labelZh: '過去進行式', defaultQuestionTypes: ['mc', 'fill_blank', 'error_correction'] },
        { id: 'past-perfect', label: 'past perfect', labelZh: '過去完成式', defaultQuestionTypes: ['mc', 'fill_blank', 'error_correction'] },
        { id: 'future', label: 'future tense (will / going to)', labelZh: '將來式（will / going to）', defaultQuestionTypes: ['mc', 'fill_blank', 'error_correction'] },
      ],
    },
    {
      id: 'verbs-voice',
      labelZh: '動詞與語態',
      labelEn: 'Verbs & voice',
      options: [
        { id: 'subject-verb', label: 'subject-verb agreement', labelZh: '主語與動詞一致', defaultQuestionTypes: ['mc', 'fill_blank', 'error_correction'] },
        { id: 'passive', label: 'passive voice', labelZh: '被動語態', defaultQuestionTypes: ['mc', 'transformation', 'fill_blank'] },
        { id: 'modals', label: 'modal verbs (can / could / should / must)', labelZh: '情態動詞（can / could / should / must）', defaultQuestionTypes: ['mc', 'fill_blank', 'error_correction'] },
        { id: 'modal-perfects', label: 'modal perfects (must have / should have / could have)', labelZh: '情態動詞過去推測（must have／should have）', defaultQuestionTypes: ['mc', 'fill_blank', 'transformation'] },
        { id: 'gerund-infinitive', label: 'gerunds and infinitives', labelZh: '動名詞與不定詞', defaultQuestionTypes: ['mc', 'fill_blank', 'error_correction'] },
        // NOT "verb patterns": the word "pattern" is sentence-pattern evidence, and a label
        // must hit exactly ONE category (see the header note).
        { id: 'verb-gerund-infinitive', label: 'verb + gerund or infinitive (remember / forget / stop)', labelZh: '動詞接續模式（remember／forget／stop 一動兩義）', defaultQuestionTypes: ['mc', 'fill_blank', 'error_correction'] },
        { id: 'used-to', label: 'used to / be used to / get used to', labelZh: 'used to 的用法（過去習慣／習慣了）', defaultQuestionTypes: ['mc', 'fill_blank', 'error_correction'] },
      ],
    },
    {
      id: 'parts-of-speech',
      labelZh: '詞類',
      labelEn: 'Parts of speech',
      options: [
        { id: 'articles', label: 'articles (a / an / the)', labelZh: '冠詞（a / an / the）', defaultQuestionTypes: ['mc', 'fill_blank', 'error_correction'] },
        { id: 'prepositions', label: 'prepositions', labelZh: '介詞', defaultQuestionTypes: ['mc', 'fill_blank', 'error_correction'] },
        { id: 'pronouns', label: 'pronouns', labelZh: '代名詞', defaultQuestionTypes: ['mc', 'fill_blank', 'error_correction'] },
        { id: 'countable', label: 'countable and uncountable nouns', labelZh: '可數與不可數名詞', defaultQuestionTypes: ['mc', 'fill_blank', 'error_correction'] },
        { id: 'quantifiers', label: 'quantifiers (many / some / a few)', labelZh: '數量詞（many／some／a few）', defaultQuestionTypes: ['mc', 'fill_blank', 'error_correction'] },
        // "adverbs" carries this label: adding "adjective" as a grammar keyword would steal
        // "enough and too with adjectives" from vocabulary (regression-cased in the suite).
        { id: 'adjectives-adverbs', label: 'adjectives and adverbs', labelZh: '形容詞與副詞（位置、-ly 變化）', defaultQuestionTypes: ['mc', 'fill_blank', 'error_correction'] },
        { id: 'participles', label: 'participles as adjectives (-ing / -ed)', labelZh: '分詞作形容詞（-ing／-ed）', defaultQuestionTypes: ['mc', 'fill_blank'] },
      ],
    },
    {
      id: 'sentence-mechanics',
      labelZh: '句法要點',
      labelEn: 'Sentence mechanics',
      options: [
        { id: 'negation', label: 'negation (negative sentences)', labelZh: '否定句', defaultQuestionTypes: ['mc', 'transformation', 'fill_blank'] },
        { id: 'punctuation', label: 'punctuation (comma splice, semicolon, colon)', labelZh: '標點（逗號誤連、分號、冒號）', defaultQuestionTypes: ['mc', 'error_correction'] },
      ],
    },
  ],
  sentence_pattern: [
    {
      id: 'clauses',
      labelZh: '子句',
      labelEn: 'Clause structures',
      options: [
        { id: 'relative-clauses', label: 'relative clauses (defining / non-defining)', labelZh: '關係子句（限定／非限定）', defaultQuestionTypes: ['mc', 'fill_blank', 'transformation'] },
        { id: 'noun-clauses', label: 'noun clauses (that / whether / indirect questions)', labelZh: '名詞子句（語序、that／whether）', defaultQuestionTypes: ['mc', 'fill_blank', 'error_correction'] },
        { id: 'adverbial-clauses', label: 'adverbial clauses (time / reason / concession / purpose)', labelZh: '副詞子句（時間／原因／讓步／目的）', defaultQuestionTypes: ['mc', 'fill_blank', 'transformation'] },
        // "reduced clauses", not "participle clauses": "participle" is grammar evidence, and a
        // single-category hit is required (the Chinese label keeps the familiar name 分詞構句).
        { id: 'reduced-clauses', label: 'reduced clauses (V-ing / p.p. clauses)', labelZh: '分詞構句（減化子句）', defaultQuestionTypes: ['transformation', 'mc', 'error_correction'] },
        { id: 'conditionals', label: 'conditionals (if-clauses)', labelZh: '條件句（if 子句）', defaultQuestionTypes: ['mc', 'fill_blank', 'transformation'] },
        { id: 'reported-speech', label: 'reported speech (ask / tell / say)', labelZh: '轉述句（ask / tell / say）', defaultQuestionTypes: ['transformation', 'mc', 'fill_blank'] },
        { id: 'connectives', label: 'connectives and conjunctions', labelZh: '連接詞', defaultQuestionTypes: ['fill_blank', 'mc', 'error_correction'] },
        { id: 'question-forms', label: 'question forms (indirect questions)', labelZh: '疑問句（間接問句語序）', defaultQuestionTypes: ['mc', 'fill_blank', 'transformation'] },
      ],
    },
    {
      id: 'emphasis-inversion',
      labelZh: '強調與倒裝',
      labelEn: 'Emphasis & inversion',
      options: [
        { id: 'inversion', label: 'inversion', labelZh: '倒裝句', defaultQuestionTypes: ['transformation', 'mc', 'error_correction'] },
        { id: 'cleft', label: 'cleft sentences (It is ... that / What ... is)', labelZh: '強調句（It is ... that／What ... is）', defaultQuestionTypes: ['transformation', 'mc'] },
        { id: 'emphasis', label: 'emphasis with do / does / did', labelZh: '強調用法（do／does／did）', defaultQuestionTypes: ['mc', 'transformation', 'fill_blank'] },
      ],
    },
    {
      id: 'moods',
      labelZh: '語氣',
      labelEn: 'Moods',
      options: [
        { id: 'subjunctive', label: 'subjunctive mood (suggest / insist / recommend)', labelZh: '假設語氣（建議、要求：(should) + 原形）', defaultQuestionTypes: ['mc', 'fill_blank', 'error_correction'] },
        { id: 'wish', label: 'wish / if only (unreal past)', labelZh: 'wish 與 if only（與事實相反的願望）', defaultQuestionTypes: ['mc', 'fill_blank', 'transformation'] },
      ],
    },
    {
      id: 'comparison-result',
      labelZh: '比較與結果',
      labelEn: 'Comparison & result',
      options: [
        { id: 'comparatives', label: 'comparatives and superlatives', labelZh: '比較級與最高級', defaultQuestionTypes: ['mc', 'fill_blank', 'error_correction'] },
        { id: 'cause-effect', label: 'cause and effect', labelZh: '因果句式', defaultQuestionTypes: ['mc', 'fill_blank', 'transformation'] },
        { id: 'so-such', label: 'so / such ... that (result clauses)', labelZh: '結果句（so／such ... that）', defaultQuestionTypes: ['fill_blank', 'mc', 'error_correction'] },
      ],
    },
    {
      id: 'writing-patterns',
      labelZh: '寫作句式',
      labelEn: 'Writing patterns',
      options: [
        { id: 'word-order', label: 'sentence patterns (basic sentence structure)', labelZh: '基本句型（句子結構）', defaultQuestionTypes: ['mc', 'error_correction', 'transformation'] },
        { id: 'parallelism', label: 'parallelism (parallel structure)', labelZh: '平行結構', defaultQuestionTypes: ['error_correction', 'mc', 'transformation'] },
        { id: 'discourse-markers', label: 'discourse markers (However / Therefore / In addition)', labelZh: '篇章標記（However／Therefore／In addition）', defaultQuestionTypes: ['fill_blank', 'mc', 'sentence_production'] },
        { id: 'causative', label: 'causative (have / get something done)', labelZh: '使役句型（have／get something done）', defaultQuestionTypes: ['transformation', 'mc', 'fill_blank'] },
        { id: 'similes', label: 'similes (as ... as / like)', labelZh: '比喻句（as ... as / like）', defaultQuestionTypes: ['fill_blank', 'mc', 'sentence_production'] },
      ],
    },
  ],
  vocabulary: [
    {
      id: 'usage-collocation',
      labelZh: '用法與搭配',
      labelEn: 'Usage & collocations',
      options: [
        { id: 'enough-too', label: 'enough / too / too much / too many', labelZh: 'enough／too（足夠／太…）', defaultQuestionTypes: ['mc', 'fill_blank', 'transformation'] },
        // "fixed collocation pairs", not "prepositional collocations" ("preposition" is grammar
        // evidence) and not "...collocations" (that substring is the collocations topic's own
        // search term — see the topicSearchTerms invariant).
        { id: 'fixed-collocations', label: 'fixed collocation pairs (depend on, interested in, responsible for)', labelZh: '介詞搭配（depend on／interested in／responsible for）', defaultQuestionTypes: ['fill_blank', 'mc', 'error_correction'] },
        { id: 'collocations', label: 'collocations', labelZh: '搭配詞', defaultQuestionTypes: ['fill_blank', 'mc', 'error_correction'] },
        { id: 'make-do-take', label: 'make / do / take collocation pairs', labelZh: 'make／do／take 搭配', defaultQuestionTypes: ['fill_blank', 'mc', 'error_correction'] },
      ],
    },
    {
      id: 'meaning-relations',
      labelZh: '詞義關係',
      labelEn: 'Meaning relations',
      options: [
        { id: 'synonyms', label: 'synonyms and antonyms', labelZh: '近義詞與反義詞', defaultQuestionTypes: ['mc', 'fill_blank'] },
        { id: 'confusable', label: 'confusable words (affect / effect, borrow / lend)', labelZh: '易混淆詞（affect／effect、borrow／lend）', defaultQuestionTypes: ['mc', 'fill_blank', 'error_correction'] },
        { id: 'word-forms', label: 'word forms (changing part of speech)', labelZh: '詞性變化（名詞／動詞／形容詞）', defaultQuestionTypes: ['fill_blank', 'mc', 'error_correction'] },
      ],
    },
    {
      id: 'topic-idioms',
      labelZh: '主題詞彙與慣用語',
      labelEn: 'Topic vocabulary & idioms',
      options: [
        { id: 'phrasal-verbs', label: 'phrasal verbs', labelZh: '片語動詞', defaultQuestionTypes: ['mc', 'fill_blank', 'transformation'] },
        { id: 'idioms', label: 'idioms', labelZh: '慣用語', defaultQuestionTypes: ['mc', 'fill_blank', 'sentence_production'] },
        { id: 'expressions', label: 'everyday expressions', labelZh: '日常用語', defaultQuestionTypes: ['mc', 'fill_blank', 'sentence_production'] },
        { id: 'topic-vocabulary', label: 'topic vocabulary (school / environment / technology)', labelZh: '主題詞彙（校園／環境／科技）', defaultQuestionTypes: ['fill_blank', 'mc', 'sentence_production'] },
      ],
    },
  ],
};

function flatten(groups: readonly PracticeTopicGroup[]): readonly PracticeTopicOption[] {
  return groups.flatMap(group => group.options);
}

/** Flat view of the catalogue (group order preserved) — label lookup and request composition. */
export const CUSTOM_PRACTICE_TOPIC_OPTIONS: Record<PracticeTopicCategory, readonly PracticeTopicOption[]> = {
  grammar: flatten(CUSTOM_PRACTICE_TOPIC_GROUPS.grammar),
  sentence_pattern: flatten(CUSTOM_PRACTICE_TOPIC_GROUPS.sentence_pattern),
  vocabulary: flatten(CUSTOM_PRACTICE_TOPIC_GROUPS.vocabulary),
};

/** The labels of `topicIds`, in catalogue order (unknown ids are ignored). */
export function topicLabelsFor(
  category: PracticeTopicCategory | null | undefined,
  topicIds: readonly string[]
): string[] {
  if (!category || topicIds.length === 0) return [];
  const wanted = new Set(topicIds);
  return CUSTOM_PRACTICE_TOPIC_OPTIONS[category]
    .filter(option => wanted.has(option.id))
    .map(option => option.label);
}

/**
 * Normalization used for topic matching (exported so the contract test can reuse it):
 * lowercase, punctuation → space, collapsed. Punctuation-insensitivity is deliberate —
 * "make do take collocation pairs" must match the label "make / do / take collocation pairs".
 */
export function topicMatchNormalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Terms that identify a topic inside a request text: the full label, plus the part before
 * the first bracket — a student who types "reduced clauses" must be recognised even though
 * the catalogue label spells the construction out.
 *
 * INVARIANT (contract-tested): within one category no term may be a substring of another
 * topic's terms. Otherwise ticking one topic would resolve two and union unrelated types —
 * that is exactly why the vocabulary labels say "collocation pairs", not "collocations".
 */
export function topicSearchTerms(option: PracticeTopicOption): string[] {
  const short = option.label.split('(')[0].trim();
  return short && short !== option.label ? [option.label, short] : [option.label];
}

/**
 * The topics a request text actually names: every catalogue topic of the category whose
 * search term appears verbatim in the text (catalogue order).
 *
 * Why text and not a separate `topicIds` field: the picker composes the labels into the
 * request text, so the text IS the ticked set for every entry point (picker, help page,
 * diagnostic, a student typing a label by hand) with no extra API contract to keep in sync.
 * Labels that the 400-character cap cut off are simply not recognised — the caller then
 * falls back to the category defaults, never to something unrelated.
 */
export function topicIdsFromRequest(
  category: PracticeTopicCategory | null | undefined,
  requestText: string
): string[] {
  if (!category) return [];
  const haystack = topicMatchNormalize(requestText);
  if (!haystack) return [];
  return CUSTOM_PRACTICE_TOPIC_OPTIONS[category]
    .filter(option => topicSearchTerms(option).some(term => haystack.includes(topicMatchNormalize(term))))
    .map(option => option.id);
}

/**
 * Question types for the ticked topics, in catalogue order (the first topic's preference
 * first), deduplicated. Empty when no topic is recognised, so the caller falls back to the
 * category defaults. An explicit student choice never reaches this function.
 */
export function topicQuestionTypeDefaults(
  category: PracticeTopicCategory | null | undefined,
  topicIds: readonly string[]
): string[] {
  if (!category || topicIds.length === 0) return [];
  const wanted = new Set(topicIds);
  const types: string[] = [];
  for (const option of CUSTOM_PRACTICE_TOPIC_OPTIONS[category]) {
    if (!wanted.has(option.id)) continue;
    for (const type of option.defaultQuestionTypes) {
      if (!types.includes(type)) types.push(type);
    }
  }
  return types;
}

export interface ComposedRequest {
  /** What to send to the API (always ≤ TOPIC_REQUEST_MAX_CHARS). */
  text: string;
  /** Ticked topics actually expressed in `text` (catalogue order). */
  includedTopicIds: string[];
  /** Ticked topics the cap left out — the UI must say so instead of dropping them silently. */
  omittedTopicIds: string[];
}

/**
 * Plan the request text: the ticked topics (canonical English names, catalogue order) that FIT,
 * followed by the student's own words.
 *
 * Topics come first because they define the practice; the free text is supplementary and is the
 * part that gets cut when the combination would exceed the limit. Two rules keep the result
 * honest, both found by the 2026-10-11 combination matrix:
 *   · only WHOLE labels are included — slicing the joined labels mid-word produced a garbled
 *     request (`… sentence patterns (basic sentence sent`) with no explanation;
 *   · whatever does not fit is REPORTED (`omittedTopicIds`), so the UI can tell the student
 *     instead of silently practising fewer topics than they ticked.
 */
export function composePracticeRequestPlan(
  userText: string,
  category: PracticeTopicCategory | null | undefined,
  topicIds: readonly string[]
): ComposedRequest {
  const text = userText.replace(/\s+/g, ' ').trim();
  const options = category
    ? CUSTOM_PRACTICE_TOPIC_OPTIONS[category].filter(option => topicIds.includes(option.id))
    : [];

  const included: PracticeTopicOption[] = [];
  for (const option of options) {
    const candidate = included.length === 0 ? option.label : `${included.map(item => item.label).join(', ')}, ${option.label}`;
    if (candidate.length > TOPIC_REQUEST_MAX_CHARS) break;
    included.push(option);
  }

  const omittedTopicIds = options.filter(option => !included.includes(option)).map(option => option.id);
  const prefix = included.map(option => option.label).join(', ');
  if (!prefix) {
    return { text: text.slice(0, TOPIC_REQUEST_MAX_CHARS), includedTopicIds: [], omittedTopicIds };
  }

  const room = TOPIC_REQUEST_MAX_CHARS - prefix.length - 1;
  const composed = room <= 0 ? prefix : text ? `${prefix} ${text.slice(0, room)}` : prefix;
  return { text: composed, includedTopicIds: included.map(option => option.id), omittedTopicIds };
}

/**
 * The request text sent to the server: the ticked topics (canonical English names,
 * comma-separated) followed by the student's own words. Thin wrapper over
 * `composePracticeRequestPlan` for callers that only need the text.
 */
export function composePracticeRequest(
  userText: string,
  category: PracticeTopicCategory | null | undefined,
  topicIds: readonly string[]
): string {
  return composePracticeRequestPlan(userText, category, topicIds).text;
}
