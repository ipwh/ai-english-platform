// ============================================
// Sprint 105: Accepted Answer Registry
// Deterministic synonym & accepted answer dictionaries.
// Never calls LLM.
// ============================================

/** Synonym groups — each group contains words treated as equivalent. */
export const SYNONYM_GROUPS: string[][] = [
  ['car', 'automobile', 'vehicle', 'motorcar'],
  ['kid', 'child', 'youngster', 'youth', 'minor'],
  ['buy', 'purchase', 'acquire', 'obtain'],
  ['teacher', 'educator', 'instructor', 'tutor', 'lecturer'],
  ['student', 'pupil', 'learner', 'scholar'],
  ['big', 'large', 'huge', 'enormous', 'massive', 'giant'],
  ['small', 'tiny', 'little', 'miniature', 'petite', 'minute'],
  ['happy', 'glad', 'joyful', 'cheerful', 'delighted', 'pleased'],
  ['sad', 'unhappy', 'sorrowful', 'miserable', 'gloomy', 'depressed'],
  ['angry', 'furious', 'irate', 'mad', 'enraged', 'annoyed'],
  ['beautiful', 'pretty', 'gorgeous', 'lovely', 'attractive', 'stunning'],
  ['ugly', 'unattractive', 'hideous', 'unsightly'],
  ['important', 'significant', 'crucial', 'vital', 'essential', 'critical'],
  ['difficult', 'hard', 'challenging', 'tough', 'demanding', 'arduous'],
  ['easy', 'simple', 'straightforward', 'effortless', 'basic'],
  ['fast', 'quick', 'rapid', 'swift', 'speedy'],
  ['slow', 'sluggish', 'leisurely', 'gradual'],
  ['rich', 'wealthy', 'affluent', 'prosperous', 'well-off'],
  ['poor', 'impoverished', 'destitute', 'needy', 'underprivileged'],
  ['sick', 'ill', 'unwell', 'ailing', 'diseased'],
  ['smart', 'intelligent', 'clever', 'bright', 'brilliant', 'wise'],
  ['dumb', 'stupid', 'foolish', 'ignorant', 'silly'],
  ['house', 'home', 'residence', 'dwelling', 'domicile'],
  ['job', 'occupation', 'profession', 'career', 'vocation', 'employment'],
  ['money', 'cash', 'currency', 'funds', 'capital', 'finance'],
  ['food', 'meal', 'cuisine', 'nourishment', 'sustenance'],
  ['friend', 'companion', 'pal', 'buddy', 'mate', 'ally'],
  ['problem', 'issue', 'difficulty', 'challenge', 'obstacle', 'concern'],
  ['help', 'assist', 'aid', 'support', 'facilitate'],
  ['start', 'begin', 'commence', 'initiate', 'launch'],
  ['stop', 'cease', 'halt', 'terminate', 'end', 'finish'],
  ['show', 'display', 'exhibit', 'demonstrate', 'reveal', 'present'],
  ['think', 'believe', 'consider', 'ponder', 'contemplate', 'reflect'],
  ['make', 'create', 'produce', 'build', 'construct', 'manufacture'],
  ['use', 'utilize', 'employ', 'apply', 'operate'],
  ['change', 'modify', 'alter', 'transform', 'adjust', 'adapt'],
  ['environment', 'surroundings', 'habitat', 'ecosystem', 'nature'],
  ['pollution', 'contamination', 'toxicity', 'impurity'],
  ['technology', 'tech', 'innovation', 'engineering'],
  ['communication', 'interaction', 'dialogue', 'discourse', 'correspondence'],
];

/** Build a lookup map: word → set of synonyms. */
const synonymMap = new Map<string, Set<string>>();
for (const group of SYNONYM_GROUPS) {
  for (const word of group) {
    const synonyms = new Set(group.filter(w => w !== word));
    if (synonymMap.has(word)) {
      for (const s of synonyms) synonymMap.get(word)!.add(s);
    } else {
      synonymMap.set(word, synonyms);
    }
  }
}

/** Check if two words are synonyms. */
export function areSynonyms(word1: string, word2: string): boolean {
  const w1 = word1.toLowerCase().trim();
  const w2 = word2.toLowerCase().trim();
  if (w1 === w2) return true;
  return synonymMap.get(w1)?.has(w2) || synonymMap.get(w2)?.has(w1) || false;
}

/** Get all synonyms for a word. */
export function getSynonyms(word: string): string[] {
  return [...(synonymMap.get(word.toLowerCase().trim()) || [])];
}

/** Check if a student answer matches any accepted answer. */
export function matchesAcceptedAnswer(
  studentNormalized: string,
  acceptedAnswers: string[],
): boolean {
  if (acceptedAnswers.length === 0) return false;
  return acceptedAnswers.some(a => a.trim().toLowerCase() === studentNormalized);
}
