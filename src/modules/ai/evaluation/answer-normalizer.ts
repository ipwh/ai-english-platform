// ============================================
// Sprint 105: Answer Normalizer
// Deterministic normalization for fair comparison.
// ============================================

/** British → American spelling mappings */
export const BRITISH_TO_AMERICAN: Record<string, string> = {
  colour: 'color', flavour: 'flavor', honour: 'honor', labour: 'labor',
  neighbour: 'neighbor', humour: 'humor', rumour: 'rumor', behaviour: 'behavior',
  centre: 'center', theatre: 'theater', litre: 'liter', metre: 'meter',
  organise: 'organize', recognise: 'recognize', analyse: 'analyze',
  realise: 'realize', apologise: 'apologize', criticise: 'criticize',
  travelling: 'traveling', travelled: 'traveled', cancelled: 'canceled',
  programme: 'program', tyre: 'tire', grey: 'gray', defence: 'defense',
  licence: 'license', practise: 'practice', jewellery: 'jewelry',
  mould: 'mold', plough: 'plow', sulphur: 'sulfur', aluminium: 'aluminum',
};

/** Common abbreviations → full form */
export const COMMON_ABBREVIATIONS: Record<string, string> = {
  "don't": 'do not', "doesn't": 'does not', "didn't": 'did not',
  "won't": 'will not', "can't": 'cannot', "couldn't": 'could not',
  "shouldn't": 'should not', "wouldn't": 'would not',
  "i'm": 'i am', "you're": 'you are', "they're": 'they are',
  "we're": 'we are', "it's": 'it is', "he's": 'he is', "she's": 'she is',
  "i've": 'i have', "you've": 'you have', "they've": 'they have',
  "we've": 'we have', "i'll": 'i will', "you'll": 'you will',
  "they'll": 'they will', "we'll": 'we will',
  "that's": 'that is', "what's": 'what is', "there's": 'there is',
  "isn't": 'is not', "aren't": 'are not', "wasn't": 'was not',
  "weren't": 'were not', "hasn't": 'has not', "haven't": 'have not',
  "hadn't": 'had not', "mustn't": 'must not', "needn't": 'need not',
  "gonna": 'going to', "wanna": 'want to', "gotta": 'got to',
};

/**
 * Normalize an answer string for comparison.
 * Applies: trim, lowercase, collapse whitespace, normalize newlines,
 * remove punctuation (optional), normalize British→American spelling,
 * expand contractions.
 */
export function normalizeAnswer(
  text: string,
  options?: { keepPunctuation?: boolean; keepArticles?: boolean },
): string {
  let result = text.trim().toLowerCase();

  // Collapse whitespace
  result = result.replace(/\s+/g, ' ');

  // Normalize newlines
  result = result.replace(/\n+/g, ' ');

  // Normalize Unicode
  result = result.normalize('NFKC');

  // Expand contractions
  result = result.split(' ').map(w => COMMON_ABBREVIATIONS[w] || w).join(' ');

  // Remove punctuation (optional)
  if (!options?.keepPunctuation) {
    result = result.replace(/[.,!?;:'"()\[\]{}<>\/\\|~`@#$%^&*+=_-]/g, '');
  }

  // British → American (after punctuation removal so "grey." → "grey" → "gray")
  result = result.split(' ').map(w => BRITISH_TO_AMERICAN[w] || w).join(' ');

  // Remove articles (optional)
  if (!options?.keepArticles) {
    result = result.split(' ').filter(w => !['a', 'an', 'the'].includes(w)).join(' ');
  }

  // Collapse again after removals
  result = result.replace(/\s+/g, ' ').trim();

  return result;
}
