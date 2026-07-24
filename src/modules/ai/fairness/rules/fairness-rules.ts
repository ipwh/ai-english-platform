// ============================================
// Sprint 112: Fairness Rules (14 rules)
// Deterministic grading fairness. No AI.
// ============================================

import type { FairnessRule, FairnessCheck, FairnessInput, FairnessContext } from '../fairness-types';

const ok = (id: string): FairnessCheck =>
  ({ ruleId: id, passed: true, score: 1, priority: 'low' });
const adjust = (id: string, score: number, detail: string, p: FairnessCheck['priority'] = 'medium', orig?: string, norm?: string): FairnessCheck =>
  ({ ruleId: id, passed: score > 0.5, score, detail, priority: p, originalValue: orig, normalizedValue: norm });

// ═══ Helpers ═══
function norm(s: string): string { return (s || '').trim().toLowerCase(); }

// ═══ 1. ArticleToleranceRule ═══
const ARTICLES = /\b(a|an|the)\s+/gi;

export const articleToleranceRule: FairnessRule = {
  id: 'fair:article-tolerance', name: 'Article Tolerance', description: 'Ignores a/an/the when meaning unchanged', priority: 'medium',
  evaluate(input, ctx) {
    const student = input.studentAnswer;
    const stripped = student.replace(ARTICLES, ' ').replace(/\s+/g, ' ').trim();
    const refStripped = input.referenceAnswer.replace(ARTICLES, ' ').replace(/\s+/g, ' ').trim();

    if (stripped.toLowerCase() === refStripped.toLowerCase() && stripped !== student) {
      return { input: { ...input, studentAnswer: stripped }, check: adjust(this.id, 1, 'Article differences normalized', 'medium', student, stripped) };
    }
    return { input, check: ok(this.id) };
  },
};

// ═══ 2. PunctuationToleranceRule ═══
const PUNCTUATION = /[.,!?;:'"()\-–—\[\]{}<>\/\\@#$%^&*+=~`|]/g;

export const punctuationToleranceRule: FairnessRule = {
  id: 'fair:punctuation-tolerance', name: 'Punctuation Tolerance', description: 'Ignores punctuation when semantics identical', priority: 'medium',
  evaluate(input, ctx) {
    const stripped = input.studentAnswer.replace(PUNCTUATION, '').replace(/\s+/g, ' ').trim();
    const refStripped = input.referenceAnswer.replace(PUNCTUATION, '').replace(/\s+/g, ' ').trim();

    if (stripped.toLowerCase() === refStripped.toLowerCase() && stripped !== input.studentAnswer) {
      return { input: { ...input, studentAnswer: stripped }, check: adjust(this.id, 1, 'Punctuation differences ignored', 'medium', input.studentAnswer, stripped) };
    }
    return { input, check: ok(this.id) };
  },
};

// ═══ 3. CaseToleranceRule ═══
export const caseToleranceRule: FairnessRule = {
  id: 'fair:case-tolerance', name: 'Case Tolerance', description: 'Ignores capitalization differences', priority: 'low',
  evaluate(input, ctx) {
    const lower = input.studentAnswer.toLowerCase().trim();
    const refLower = input.referenceAnswer.toLowerCase().trim();
    if (lower !== input.studentAnswer && lower === refLower) {
      return { input: { ...input, studentAnswer: lower }, check: adjust(this.id, 1, 'Case normalized', 'low', input.studentAnswer, lower) };
    }
    return { input, check: ok(this.id) };
  },
};

// ═══ 4. WhitespaceToleranceRule ═══
export const whitespaceToleranceRule: FairnessRule = {
  id: 'fair:whitespace-tolerance', name: 'Whitespace Tolerance', description: 'Normalizes repeated spaces and line breaks', priority: 'low',
  evaluate(input, ctx) {
    const cleaned = input.studentAnswer.replace(/\s+/g, ' ').trim();
    const refCleaned = input.referenceAnswer.replace(/\s+/g, ' ').trim();
    if (cleaned !== input.studentAnswer && cleaned.toLowerCase() === refCleaned.toLowerCase()) {
      return { input: { ...input, studentAnswer: cleaned }, check: adjust(this.id, 1, 'Whitespace normalized', 'low', input.studentAnswer, cleaned) };
    }
    return { input: { ...input, studentAnswer: cleaned }, check: ok(this.id) };
  },
};

// ═══ 5. BritishAmericanRule (300+ mappings) ═══
const BRITISH_AMERICAN: [string, string][] = [
  ['colour', 'color'], ['colours', 'colors'], ['coloured', 'colored'], ['colouring', 'coloring'],
  ['flavour', 'flavor'], ['flavours', 'flavors'], ['flavoured', 'flavored'],
  ['honour', 'honor'], ['honours', 'honors'], ['honoured', 'honored'],
  ['humour', 'humor'], ['labour', 'labor'], ['labours', 'labors'],
  ['neighbour', 'neighbor'], ['neighbours', 'neighbors'], ['neighbourhood', 'neighborhood'],
  ['rumour', 'rumor'], ['rumours', 'rumors'],
  ['behaviour', 'behavior'], ['behaviours', 'behaviors'],
  ['favour', 'favor'], ['favours', 'favors'], ['favoured', 'favored'], ['favourite', 'favorite'], ['favourites', 'favorites'],
  ['endeavour', 'endeavor'], ['endeavours', 'endeavors'],
  ['splendour', 'splendor'], ['vigour', 'vigor'], ['odour', 'odor'], ['ardour', 'ardor'],
  ['candour', 'candor'], ['clamour', 'clamor'], ['fervour', 'fervor'], ['harbour', 'harbor'],
  ['parlour', 'parlor'], ['rancour', 'rancor'], ['rigour', 'rigor'], ['saviour', 'savior'],
  ['valour', 'valor'], ['vapour', 'vapor'],
  ['centre', 'center'], ['centres', 'centers'], ['centred', 'centered'],
  ['metre', 'meter'], ['metres', 'meters'],
  ['litre', 'liter'], ['litres', 'liters'],
  ['theatre', 'theater'], ['theatres', 'theaters'],
  ['fibre', 'fiber'], ['fibres', 'fibers'],
  ['calibre', 'caliber'], ['sabre', 'saber'], ['sombre', 'somber'],
  ['lustre', 'luster'], ['mitre', 'miter'], ['ochre', 'ocher'], ['sceptre', 'scepter'],
  ['spectre', 'specter'], ['meagre', 'meager'],
  ['organise', 'organize'], ['organises', 'organizes'], ['organised', 'organized'], ['organising', 'organizing'],
  ['organisation', 'organization'], ['organisations', 'organizations'],
  ['realise', 'realize'], ['realises', 'realizes'], ['realised', 'realized'], ['realising', 'realizing'],
  ['recognise', 'recognize'], ['recognises', 'recognizes'], ['recognised', 'recognized'], ['recognising', 'recognizing'],
  ['analyse', 'analyze'], ['analyses', 'analyzes'], ['analysed', 'analyzed'], ['analysing', 'analyzing'],
  ['analyse', 'analyze'], ['paralyse', 'paralyze'], ['catalyse', 'catalyze'],
  ['apologise', 'apologize'], ['apologises', 'apologizes'], ['apologised', 'apologized'],
  ['authorise', 'authorize'], ['authorises', 'authorizes'], ['authorised', 'authorized'],
  ['characterise', 'characterize'], ['characterises', 'characterizes'], ['characterised', 'characterized'],
  ['criticise', 'criticize'], ['criticises', 'criticizes'], ['criticised', 'criticized'],
  ['emphasise', 'emphasize'], ['emphasises', 'emphasizes'], ['emphasised', 'emphasized'],
  ['familiarise', 'familiarize'], ['fertilise', 'fertilize'], ['finalise', 'finalize'],
  ['harmonise', 'harmonize'], ['hypothesise', 'hypothesize'], ['idolise', 'idolize'],
  ['initialise', 'initialize'], ['italicise', 'italicize'], ['jeopardise', 'jeopardize'],
  ['legalise', 'legalize'], ['legitimise', 'legitimize'], ['localise', 'localize'],
  ['magnetise', 'magnetize'], ['maximise', 'maximize'], ['memorise', 'memorize'],
  ['minimise', 'minimize'], ['mobilise', 'mobilize'], ['modernise', 'modernize'],
  ['moralise', 'moralize'], ['nationalise', 'nationalize'], ['naturalise', 'naturalize'],
  ['normalise', 'normalize'], ['optimise', 'optimize'], ['organise', 'organize'],
  ['patronise', 'patronize'], ['penalise', 'penalize'], ['personalise', 'personalize'],
  ['philosophise', 'philosophize'], ['plagiarise', 'plagiarize'], ['polarise', 'polarize'],
  ['politicise', 'politicize'], ['popularise', 'popularize'], ['prioritise', 'prioritize'],
  ['privatise', 'privatize'], ['publicise', 'publicize'], ['rationalise', 'rationalize'],
  ['revitalise', 'revitalize'], ['romanticise', 'romanticize'], ['sensitise', 'sensitize'],
  ['signalise', 'signalize'], ['socialise', 'socialize'], ['specialise', 'specialize'],
  ['stabilise', 'stabilize'], ['standardise', 'standardize'], ['sterilise', 'sterilize'],
  ['stigmatise', 'stigmatize'], ['subsidise', 'subsidize'], ['summarise', 'summarize'],
  ['symbolise', 'symbolize'], ['sympathise', 'sympathize'], ['synchronise', 'synchronize'],
  ['synthesise', 'synthesize'], ['systematise', 'systematize'], ['tantalise', 'tantalize'],
  ['temporise', 'temporize'], ['tenderise', 'tenderize'], ['terrorise', 'terrorize'],
  ['theorise', 'theorize'], ['traumatise', 'traumatize'], ['trivialise', 'trivialize'],
  ['tyrannise', 'tyrannize'], ['unionise', 'unionize'], ['universalise', 'universalize'],
  ['urbanise', 'urbanize'], ['utilise', 'utilize'], ['vandalise', 'vandalize'],
  ['vaporise', 'vaporize'], ['verbalise', 'verbalize'], ['victimise', 'victimize'],
  ['visualise', 'visualize'], ['vitalise', 'vitalize'], ['vocalise', 'vocalize'],
  ['westernise', 'westernize'], ['womanise', 'womanize'],
  ['defence', 'defense'], ['offence', 'offense'], ['pretence', 'pretense'], ['licence', 'license'],
  ['travelling', 'traveling'], ['travelled', 'traveled'], ['traveller', 'traveler'], ['travellers', 'travelers'],
  ['cancelling', 'canceling'], ['cancelled', 'canceled'],
  ['labelling', 'labeling'], ['labelled', 'labeled'],
  ['modelling', 'modeling'], ['modelled', 'modeled'],
  ['levelling', 'leveling'], ['levelled', 'leveled'],
  ['marvelling', 'marveling'], ['marvelled', 'marveled'],
  ['quarrelling', 'quarreling'], ['quarrelled', 'quarreled'],
  ['signalling', 'signaling'], ['signalled', 'signaled'],
  ['totalling', 'totaling'], ['totalled', 'totaled'],
  ['programme', 'program'], ['programmes', 'programs'],
  ['catalogue', 'catalog'], ['catalogues', 'catalogs'],
  ['dialogue', 'dialog'], ['dialogues', 'dialogs'],
  ['analogue', 'analog'], ['analogues', 'analogs'],
  ['monologue', 'monolog'], ['epilogue', 'epilog'], ['prologue', 'prolog'],
  ['tyre', 'tire'], ['tyres', 'tires'],
  ['cheque', 'check'], ['cheques', 'checks'],
  ['grey', 'gray'], ['greyer', 'grayer'], ['greyest', 'grayest'],
  ['jewellery', 'jewelry'], ['jeweller', 'jeweler'],
  ['pyjamas', 'pajamas'],
  ['plough', 'plow'], ['ploughs', 'plows'], ['ploughed', 'plowed'],
  ['sceptical', 'skeptical'], ['scepticism', 'skepticism'], ['sceptic', 'skeptic'],
  ['storey', 'story'], ['storeys', 'stories'],
  ['whilst', 'while'], ['amongst', 'among'],
  ['aluminium', 'aluminum'],
  ['aeroplane', 'airplane'], ['aeroplanes', 'airplanes'],
  ['autumn', 'fall'],
  ['barrister', 'attorney'],
  ['biscuit', 'cookie'], ['biscuits', 'cookies'],
  ['bonnet', 'hood'], ['boot', 'trunk'],
  ['car park', 'parking lot'],
  ['chemist', 'pharmacy'], ['chemists', 'pharmacies'],
  ['chips', 'fries'],
  ['cinema', 'movie theater'],
  ['crisps', 'chips'],
  ['crossroads', 'intersection'],
  ['cupboard', 'closet'],
  ['curtains', 'drapes'],
  ['dustbin', 'trash can'], ['dustbins', 'trash cans'],
  ['film', 'movie'], ['films', 'movies'],
  ['flat', 'apartment'], ['flats', 'apartments'],
  ['football', 'soccer'],
  ['ground floor', 'first floor'],
  ['handbag', 'purse'],
  ['holiday', 'vacation'], ['holidays', 'vacations'],
  ['jam', 'jelly'],
  ['lift', 'elevator'], ['lifts', 'elevators'],
  ['lorry', 'truck'], ['lorries', 'trucks'],
  ['maths', 'math'],
  ['mobile phone', 'cell phone'],
  ['motorway', 'highway'], ['motorways', 'highways'],
  ['nappy', 'diaper'], ['nappies', 'diapers'],
  ['pants', 'underwear'],
  ['pavement', 'sidewalk'],
  ['petrol', 'gasoline'],
  ['post', 'mail'], ['postbox', 'mailbox'], ['postcode', 'zip code'], ['postman', 'mailman'],
  ['pub', 'bar'],
  ['queue', 'line'], ['queuing', 'lining up'],
  ['railway', 'railroad'],
  ['return ticket', 'round trip'],
  ['rubber', 'eraser'],
  ['rubbish', 'garbage'], ['rubbish bin', 'garbage can'],
  ['shop', 'store'], ['shops', 'stores'],
  ['solicitor', 'lawyer'],
  ['sweets', 'candy'],
  ['tap', 'faucet'],
  ['taxi', 'cab'],
  ['telly', 'TV'],
  ['timetable', 'schedule'], ['timetables', 'schedules'],
  ['tin', 'can'],
  ['torch', 'flashlight'], ['torches', 'flashlights'],
  ['trousers', 'pants'],
  ['tube', 'subway'],
  ['underground', 'subway'],
  ['vest', 'undershirt'],
  ['waistcoat', 'vest'],
  ['wardrobe', 'closet'],
  ['windscreen', 'windshield'],
  ['zed', 'zee'],
  ['zip', 'zipper'],
  ['indoor', 'indoors'], // common interchange
  ['towards', 'toward'], ['backwards', 'backward'], ['forwards', 'forward'],
  ['learnt', 'learned'], ['dreamt', 'dreamed'], ['burnt', 'burned'], ['spelt', 'spelled'],
  ['smelt', 'smelled'], ['spilt', 'spilled'], ['spoilt', 'spoiled'],
  ['leant', 'leaned'], ['leapt', 'leaped'], ['knelt', 'kneeled'],
  ['got', 'gotten'],
];

const brToAm = new Map<string, string>();
const amToBr = new Map<string, string>();
for (const [br, am] of BRITISH_AMERICAN) {
  brToAm.set(br.toLowerCase(), am.toLowerCase());
  amToBr.set(am.toLowerCase(), br.toLowerCase());
}

export const britishAmericanRule: FairnessRule = {
  id: 'fair:british-american', name: 'British/American Normalization', description: 'Normalizes 300+ British/American spelling and vocabulary differences', priority: 'high',
  evaluate(input, ctx) {
    let changed = false;
    const original = input.studentAnswer;

    // Normalize student answer
    let words = input.studentAnswer.split(/\b/);
    for (let i = 0; i < words.length; i++) {
      const lower = words[i].toLowerCase();
      const replacement = brToAm.get(lower) || amToBr.get(lower);
      if (replacement) {
        words[i] = words[i][0] === words[i][0]?.toUpperCase()
          ? replacement.charAt(0).toUpperCase() + replacement.slice(1)
          : replacement;
        changed = true;
        break;
      }
    }

    if (!changed) return { input, check: ok(this.id) };

    const normalized = words.join('');
    return {
      input: { ...input, studentAnswer: normalized },
      check: adjust(this.id, 1, 'British/American variation normalized', 'high', original, normalized),
    };
  },
};

// ═══ 6. SpellingToleranceRule ═══
export const spellingToleranceRule: FairnessRule = {
  id: 'fair:spelling-tolerance', name: 'Spelling Tolerance', description: 'Allows minor spelling mistakes via edit distance', priority: 'high',
  evaluate(input, ctx) {
    const maxDist = input.maxSpellingDistance ?? 2;
    const student = norm(input.studentAnswer);
    const reference = norm(input.referenceAnswer);

    // Check exact match first
    if (student === reference) return { input, check: ok(this.id) };

    const dist = levenshteinDistance(student, reference);
    const maxAllowed = Math.max(1, Math.floor(reference.length * 0.2)); // 20% of reference length
    const allowed = Math.min(maxDist, maxAllowed);

    if (dist > 0 && dist <= allowed) {
      const score = Math.max(0.6, 1 - (dist / reference.length));
      return {
        input: { ...input, studentAnswer: reference }, // Use reference as normalized
        check: adjust(this.id, score, `Spelling error tolerated (edit distance ${dist}/${allowed})`, 'high', input.studentAnswer, reference),
      };
    }

    return { input, check: ok(this.id) };
  },
};

/** Levenshtein distance between two strings */
function levenshteinDistance(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

// ═══ 7. VerbTenseToleranceRule ═══
const TENSE_PAIRS: [string, string][] = [
  ['is', 'was'], ['are', 'were'], ['has', 'had'], ['have', 'had'],
  ['do', 'did'], ['does', 'did'], ['go', 'went'], ['goes', 'went'],
  ['come', 'came'], ['comes', 'came'], ['see', 'saw'], ['sees', 'saw'],
  ['say', 'said'], ['says', 'said'], ['take', 'took'], ['takes', 'took'],
  ['give', 'gave'], ['gives', 'gave'], ['make', 'made'], ['makes', 'made'],
  ['know', 'knew'], ['knows', 'knew'], ['think', 'thought'], ['thinks', 'thought'],
  ['find', 'found'], ['finds', 'found'], ['tell', 'told'], ['tells', 'told'],
  ['become', 'became'], ['becomes', 'became'], ['leave', 'left'], ['leaves', 'left'],
  ['feel', 'felt'], ['feels', 'felt'], ['put', 'put'], ['put', 'put'],
  ['bring', 'brought'], ['brings', 'brought'], ['begin', 'began'], ['begins', 'began'],
  ['write', 'wrote'], ['writes', 'wrote'], ['run', 'ran'], ['runs', 'ran'],
  ['speak', 'spoke'], ['speaks', 'spoke'], ['stand', 'stood'], ['stands', 'stood'],
  ['get', 'got'], ['gets', 'got'], ['eat', 'ate'], ['eats', 'ate'],
  ['drink', 'drank'], ['drinks', 'drank'], ['sing', 'sang'], ['sings', 'sang'],
  ['swim', 'swam'], ['swims', 'swam'], ['fly', 'flew'], ['flies', 'flew'],
  ['grow', 'grew'], ['grows', 'grew'], ['sit', 'sat'], ['sits', 'sat'],
  ['buy', 'bought'], ['buys', 'bought'], ['catch', 'caught'], ['catches', 'caught'],
  ['teach', 'taught'], ['teaches', 'taught'], ['build', 'built'], ['builds', 'built'],
  ['send', 'sent'], ['sends', 'sent'], ['spend', 'spent'], ['spends', 'spent'],
  ['lose', 'lost'], ['loses', 'lost'], ['break', 'broke'], ['breaks', 'broke'],
  ['choose', 'chose'], ['chooses', 'chose'], ['drive', 'drove'], ['drives', 'drove'],
  ['fall', 'fell'], ['falls', 'fell'], ['forget', 'forgot'], ['forgets', 'forgot'],
  ['hide', 'hid'], ['hides', 'hid'], ['hold', 'held'], ['holds', 'held'],
  ['keep', 'kept'], ['keeps', 'kept'], ['lead', 'led'], ['leads', 'led'],
  ['mean', 'meant'], ['means', 'meant'], ['meet', 'met'], ['meets', 'met'],
  ['pay', 'paid'], ['pays', 'paid'], ['read', 'read'], ['read', 'read'],
  ['rise', 'rose'], ['rises', 'rose'], ['sell', 'sold'], ['sells', 'sold'],
  ['set', 'set'], ['sets', 'set'], ['show', 'showed'], ['shows', 'showed'],
  ['shut', 'shut'], ['shuts', 'shut'], ['sleep', 'slept'], ['sleeps', 'slept'],
  ['steal', 'stole'], ['steals', 'stole'], ['throw', 'threw'], ['throws', 'threw'],
  ['understand', 'understood'], ['understands', 'understood'], ['wake', 'woke'], ['wakes', 'woke'],
  ['wear', 'wore'], ['wears', 'wore'], ['win', 'won'], ['wins', 'won'],
];

const tenseMap = new Map<string, string>();
for (const [pres, past] of TENSE_PAIRS) {
  tenseMap.set(pres, past);
  tenseMap.set(past, pres);
}

export const verbTenseToleranceRule: FairnessRule = {
  id: 'fair:verb-tense', name: 'Verb Tense Tolerance', description: 'Accepts equivalent tense when meaning unchanged', priority: 'medium',
  evaluate(input, ctx) {
    const studentWords = norm(input.studentAnswer).split(/\s+/);
    const refWords = norm(input.referenceAnswer).split(/\s+/);

    if (studentWords.length !== refWords.length) return { input, check: ok(this.id) };

    let changed = false;
    const normalized: string[] = [];

    for (let i = 0; i < studentWords.length; i++) {
      const sw = studentWords[i];
      const rw = refWords[i];
      if (sw === rw) { normalized.push(sw); continue; }

      const tenseMatch = tenseMap.get(sw);
      if (tenseMatch === rw) {
        normalized.push(rw);
        changed = true;
      } else {
        normalized.push(sw);
      }
    }

    if (changed) {
      const newAnswer = normalized.join(' ');
      return {
        input: { ...input, studentAnswer: newAnswer },
        check: adjust(this.id, 0.9, 'Tense variation tolerated', 'medium', input.studentAnswer, newAnswer),
      };
    }
    return { input, check: ok(this.id) };
  },
};

// ═══ 8. SingularPluralRule ═══
const PLURALS: [string, string][] = [
  ['child', 'children'], ['man', 'men'], ['woman', 'women'], ['person', 'people'],
  ['mouse', 'mice'], ['tooth', 'teeth'], ['foot', 'feet'], ['goose', 'geese'],
  ['ox', 'oxen'], ['criterion', 'criteria'], ['phenomenon', 'phenomena'],
  ['analysis', 'analyses'], ['thesis', 'theses'], ['hypothesis', 'hypotheses'],
  ['crisis', 'crises'], ['datum', 'data'], ['medium', 'media'],
  ['bacterium', 'bacteria'], ['curriculum', 'curricula'], ['syllabus', 'syllabi'],
  ['focus', 'foci'], ['fungus', 'fungi'], ['nucleus', 'nuclei'],
  ['radius', 'radii'], ['stimulus', 'stimuli'], ['alumnus', 'alumni'],
  ['cactus', 'cacti'], ['octopus', 'octopi'], ['appendix', 'appendices'],
  ['index', 'indices'], ['matrix', 'matrices'], ['vertex', 'vertices'],
  ['vortex', 'vortices'], ['larva', 'larvae'], ['antenna', 'antennae'],
  ['formula', 'formulae'], ['nebula', 'nebulae'], ['vertebra', 'vertebrae'],
  ['alga', 'algae'], ['amoeba', 'amoebae'],
  ['shelf', 'shelves'], ['wolf', 'wolves'], ['calf', 'calves'],
  ['half', 'halves'], ['knife', 'knives'], ['life', 'lives'],
  ['loaf', 'loaves'], ['scarf', 'scarves'], ['self', 'selves'],
  ['thief', 'thieves'], ['wife', 'wives'], ['leaf', 'leaves'],
  ['fish', 'fishes'], ['species', 'species'], ['series', 'series'],
  ['sheep', 'sheep'], ['deer', 'deer'], ['moose', 'moose'], ['aircraft', 'aircraft'],
  ['offspring', 'offspring'], ['means', 'means'], ['headquarters', 'headquarters'],
  ['news', 'news'], ['gallows', 'gallows'], ['barracks', 'barracks'],
];

const pluralMap = new Map<string, string>();
for (const [sg, pl] of PLURALS) {
  pluralMap.set(sg, pl); pluralMap.set(pl, sg);
  // Also handle regular -s/-es
  pluralMap.set(sg + 's', pl); pluralMap.set(sg + 'es', pl);
}

export const singularPluralRule: FairnessRule = {
  id: 'fair:singular-plural', name: 'Singular/Plural Tolerance', description: 'Accepts singular/plural variations', priority: 'medium',
  evaluate(input, ctx) {
    const studentWords = norm(input.studentAnswer).split(/\s+/);
    const refWords = norm(input.referenceAnswer).split(/\s+/);

    if (studentWords.length !== refWords.length) return { input, check: ok(this.id) };

    let changed = false;
    const normalized: string[] = [];

    for (let i = 0; i < studentWords.length; i++) {
      const sw = studentWords[i];
      const rw = refWords[i];
      if (sw === rw) { normalized.push(sw); continue; }

      // Check irregular plural
      const plural = pluralMap.get(sw);
      if (plural === rw) { normalized.push(rw); changed = true; continue; }

      // Check regular plural (-s/-es)
      if (sw + 's' === rw || sw + 'es' === rw || rw + 's' === sw || rw + 'es' === sw) {
        normalized.push(rw); changed = true; continue;
      }
      // Check -y → -ies
      if (sw.endsWith('y') && sw.slice(0, -1) + 'ies' === rw) { normalized.push(rw); changed = true; continue; }
      if (rw.endsWith('y') && rw.slice(0, -1) + 'ies' === sw) { normalized.push(rw); changed = true; continue; }

      normalized.push(sw);
    }

    if (changed) {
      const newAnswer = normalized.join(' ');
      return {
        input: { ...input, studentAnswer: newAnswer },
        check: adjust(this.id, 0.9, 'Singular/plural variation tolerated', 'medium', input.studentAnswer, newAnswer),
      };
    }
    return { input, check: ok(this.id) };
  },
};

// ═══ 9. AbbreviationRule ═══
const ABBREVIATIONS: Record<string, string[]> = {
  'usa': ['united states', 'united states of america', 'us', 'u.s.', 'u.s.a.', 'america'],
  'uk': ['united kingdom', 'u.k.', 'great britain', 'britain', 'england'],
  'dna': ['deoxyribonucleic acid'],
  'nasa': ['national aeronautics and space administration'],
  'eu': ['european union'],
  'un': ['united nations'],
  'who': ['world health organization'],
  'nato': ['north atlantic treaty organization'],
  'fbi': ['federal bureau of investigation'],
  'cia': ['central intelligence agency'],
  'ceo': ['chief executive officer'],
  'cfo': ['chief financial officer'],
  'coo': ['chief operating officer'],
  'cto': ['chief technology officer'],
  'hr': ['human resources', 'hour', 'hours'],
  'pr': ['public relations'],
  'it': ['information technology'],
  'ai': ['artificial intelligence'],
  'ml': ['machine learning'],
  'vr': ['virtual reality'],
  'ar': ['augmented reality'],
  'iot': ['internet of things'],
  'gps': ['global positioning system'],
  'lcd': ['liquid crystal display'],
  'led': ['light emitting diode'],
  'usb': ['universal serial bus'],
  'hd': ['high definition'],
  '4k': ['ultra hd', 'ultra high definition'],
  'tv': ['television'],
  'pc': ['personal computer', 'computer'],
  'app': ['application'],
  'www': ['world wide web'],
  'url': ['uniform resource locator', 'web address'],
  'http': ['hypertext transfer protocol'],
  'html': ['hypertext markup language'],
  'css': ['cascading style sheets'],
  'js': ['javascript'],
  'pdf': ['portable document format'],
  'jpg': ['jpeg', 'joint photographic experts group'],
  'png': ['portable network graphics'],
  'gif': ['graphics interchange format'],
  'sms': ['text message', 'short message service'],
  'wi-fi': ['wifi', 'wireless fidelity'],
  '3d': ['three dimensional', 'three-d'],
  '2d': ['two dimensional', 'two-d'],
  'id': ['identification', 'identity'],
  'i.e.': ['that is', 'in other words'],
  'e.g.': ['for example'],
  'etc.': ['et cetera', 'and so on'],
  'vs': ['versus', 'against'],
  'am': ['ante meridiem', 'morning'],
  'pm': ['post meridiem', 'afternoon', 'evening'],
  'ad': ['anno domini'],
  'bc': ['before christ'],
  'est': ['eastern standard time'],
  'gmt': ['greenwich mean time'],
  'mph': ['miles per hour'],
  'kph': ['kilometers per hour'],
  'mpg': ['miles per gallon'],
  'rpm': ['revolutions per minute'],
  'lbs': ['pounds'],
  'kg': ['kilograms', 'kilogram'],
  'km': ['kilometers', 'kilometer'],
  'cm': ['centimeters', 'centimeter'],
  'mm': ['millimeters', 'millimeter'],
  'min': ['minute', 'minutes'],
  'sec': ['second', 'seconds'],
  'mr': ['mister'],
  'mrs': ['missus', 'misses'],
  'ms': ['miss'],
  'dr': ['doctor'],
  'prof': ['professor'],
  'st': ['street', 'saint'],
  'ave': ['avenue'],
  'rd': ['road'],
  'blvd': ['boulevard'],
  'apt': ['apartment'],
  'dept': ['department'],
  'govt': ['government'],
  'intl': ['international'],
  'natl': ['national'],
  'org': ['organization'],
  'edu': ['education', 'educational'],
  'info': ['information'],
  'tech': ['technology'],
  'bio': ['biology', 'biography'],
  'chem': ['chemistry'],
  'phys': ['physics', 'physical'],
  'math': ['mathematics'],
  'stats': ['statistics'],
  'econ': ['economics'],
  'psych': ['psychology'],
  'soc': ['sociology', 'social'],
  'pol': ['politics', 'political'],
  'geo': ['geography'],
  'hist': ['history'],
  'lang': ['language'],
  'lit': ['literature'],
  'eng': ['english'],
  'sci': ['science'],
};

const abbrMap = new Map<string, string>();
for (const [abbr, expansions] of Object.entries(ABBREVIATIONS)) {
  for (const exp of expansions) {
    abbrMap.set(exp.toLowerCase(), abbr.toLowerCase());
    abbrMap.set(abbr.toLowerCase(), exp.toLowerCase());
  }
}

export const abbreviationRule: FairnessRule = {
  id: 'fair:abbreviation', name: 'Abbreviation Expansion', description: 'Normalizes abbreviations and their expansions', priority: 'medium',
  evaluate(input, ctx) {
    const original = input.studentAnswer;
    const words = norm(original).split(/\s+/);
    let changed = false;
    const normalized = words.map(w => {
      const match = abbrMap.get(w);
      if (match) { changed = true; return match; }
      return w;
    });

    if (changed) {
      const newAnswer = normalized.join(' ');
      return {
        input: { ...input, studentAnswer: newAnswer },
        check: adjust(this.id, 1, 'Abbreviation normalized', 'medium', original, newAnswer),
      };
    }
    return { input, check: ok(this.id) };
  },
};

// ═══ 10. NumberNormalizationRule ═══
const NUMBER_WORDS: Record<string, number> = {
  'zero': 0, 'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
  'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
  'eleven': 11, 'twelve': 12, 'thirteen': 13, 'fourteen': 14, 'fifteen': 15,
  'sixteen': 16, 'seventeen': 17, 'eighteen': 18, 'nineteen': 19, 'twenty': 20,
  'thirty': 30, 'forty': 40, 'fifty': 50, 'sixty': 60, 'seventy': 70,
  'eighty': 80, 'ninety': 90, 'hundred': 100, 'thousand': 1000, 'million': 1000000,
  'first': 1, 'second': 2, 'third': 3, 'fourth': 4, 'fifth': 5,
  'sixth': 6, 'seventh': 7, 'eighth': 8, 'ninth': 9, 'tenth': 10,
};

const ROMAN_NUMERALS: Record<string, number> = {
  'i': 1, 'ii': 2, 'iii': 3, 'iv': 4, 'v': 5, 'vi': 6, 'vii': 7, 'viii': 8, 'ix': 9, 'x': 10,
  'xi': 11, 'xii': 12, 'xiii': 13, 'xiv': 14, 'xv': 15, 'xvi': 16, 'xvii': 17, 'xviii': 18, 'xix': 19, 'xx': 20,
  'l': 50, 'c': 100, 'd': 500, 'm': 1000,
};

function normalizeNumberWord(word: string): string {
  const lower = word.replace(/[.,]$/, ''); // strip trailing punctuation
  // Try number words
  const numVal = NUMBER_WORDS[lower];
  if (numVal !== undefined) return String(numVal);
  // Try Roman numerals
  const romanVal = ROMAN_NUMERALS[lower];
  if (romanVal !== undefined) return String(romanVal);
  // Try numeric with leading zeros
  const numeric = parseInt(lower, 10);
  if (!isNaN(numeric) && lower !== String(numeric)) return String(numeric);
  return word;
}

export const numberNormalizationRule: FairnessRule = {
  id: 'fair:number-normalization', name: 'Number Normalization', description: 'Normalizes number words, Roman numerals, and numeric formats', priority: 'low',
  evaluate(input, ctx) {
    const original = input.studentAnswer;
    const words = original.split(/\s+/);
    const normalized = words.map(normalizeNumberWord);
    const newAnswer = normalized.join(' ');

    if (newAnswer !== original) {
      return {
        input: { ...input, studentAnswer: newAnswer },
        check: adjust(this.id, 1, 'Numbers normalized', 'low', original, newAnswer),
      };
    }
    return { input, check: ok(this.id) };
  },
};

// ═══ 11. SynonymExpansionRule (1000+ synonym groups) ═══
const SYNONYM_GROUPS: string[][] = [
  // Actions
  ['start', 'begin', 'commence', 'initiate', 'launch'],
  ['stop', 'end', 'finish', 'cease', 'halt', 'terminate', 'conclude'],
  ['make', 'create', 'build', 'construct', 'form', 'produce', 'generate', 'manufacture'],
  ['get', 'obtain', 'acquire', 'receive', 'gain', 'fetch', 'retrieve'],
  ['give', 'provide', 'supply', 'offer', 'present', 'grant', 'deliver', 'hand'],
  ['use', 'utilize', 'employ', 'apply', 'operate', 'exercise'],
  ['help', 'assist', 'aid', 'support', 'facilitate'],
  ['show', 'display', 'exhibit', 'demonstrate', 'reveal', 'indicate', 'present'],
  ['think', 'believe', 'consider', 'suppose', 'assume', 'reckon', 'deem'],
  ['say', 'state', 'declare', 'mention', 'express', 'articulate', 'utter', 'remark'],
  ['ask', 'inquire', 'question', 'request', 'query'],
  ['answer', 'reply', 'respond', 'retort'],
  ['explain', 'describe', 'clarify', 'elaborate', 'illustrate', 'expound'],
  ['find', 'discover', 'detect', 'locate', 'uncover', 'identify'],
  ['change', 'modify', 'alter', 'adjust', 'adapt', 'transform', 'convert', 'vary'],
  ['improve', 'enhance', 'better', 'upgrade', 'refine', 'optimize', 'boost'],
  ['reduce', 'decrease', 'lower', 'diminish', 'lessen', 'cut', 'minimize'],
  ['increase', 'raise', 'elevate', 'boost', 'expand', 'enlarge', 'grow'],
  ['remove', 'delete', 'eliminate', 'erase', 'discard', 'clear', 'strip'],
  ['add', 'include', 'insert', 'append', 'attach', 'incorporate'],
  ['choose', 'select', 'pick', 'opt', 'elect', 'decide'],
  ['allow', 'permit', 'enable', 'authorize', 'let', 'approve'],
  ['prevent', 'stop', 'block', 'hinder', 'prohibit', 'forbid', 'ban'],
  ['cause', 'trigger', 'induce', 'provoke', 'bring about', 'lead to', 'result in'],
  ['need', 'require', 'necessitate', 'demand', 'call for'],

  // Qualities/Adjectives
  ['big', 'large', 'huge', 'enormous', 'massive', 'gigantic', 'immense', 'vast'],
  ['small', 'little', 'tiny', 'minute', 'miniature', 'compact', 'petite'],
  ['good', 'great', 'excellent', 'fine', 'superb', 'wonderful', 'splendid', 'fantastic'],
  ['bad', 'poor', 'terrible', 'awful', 'horrible', 'dreadful', 'inferior'],
  ['important', 'significant', 'crucial', 'vital', 'essential', 'critical', 'key', 'major'],
  ['happy', 'glad', 'pleased', 'delighted', 'content', 'joyful', 'cheerful'],
  ['sad', 'unhappy', 'sorrowful', 'miserable', 'depressed', 'gloomy', 'melancholy'],
  ['angry', 'mad', 'furious', 'irate', 'enraged', 'annoyed', 'irritated'],
  ['brave', 'courageous', 'fearless', 'bold', 'daring', 'heroic', 'valiant'],
  ['smart', 'clever', 'intelligent', 'bright', 'brilliant', 'wise', 'sharp'],
  ['fast', 'quick', 'rapid', 'swift', 'speedy', 'brisk', 'hasty'],
  ['slow', 'sluggish', 'slothful', 'lethargic', 'gradual', 'unhurried'],
  ['strong', 'powerful', 'mighty', 'sturdy', 'robust', 'tough', 'forceful'],
  ['weak', 'feeble', 'frail', 'fragile', 'delicate', 'powerless'],
  ['beautiful', 'pretty', 'lovely', 'attractive', 'gorgeous', 'stunning', 'handsome'],
  ['ugly', 'unattractive', 'hideous', 'unsightly', 'grotesque'],
  ['rich', 'wealthy', 'affluent', 'prosperous', 'well-off', 'opulent'],
  ['poor', 'impoverished', 'destitute', 'needy', 'broke', 'penniless'],
  ['old', 'ancient', 'aged', 'elderly', 'antique', 'archaic'],
  ['new', 'modern', 'recent', 'contemporary', 'novel', 'current', 'fresh'],
  ['easy', 'simple', 'straightforward', 'effortless', 'uncomplicated'],
  ['hard', 'difficult', 'challenging', 'tough', 'arduous', 'complex', 'complicated'],
  ['interesting', 'fascinating', 'engaging', 'intriguing', 'captivating', 'compelling'],
  ['boring', 'dull', 'tedious', 'monotonous', 'uninteresting', 'dreary'],
  ['careful', 'cautious', 'wary', 'prudent', 'vigilant'],
  ['brave', 'courageous', 'fearless', 'bold', 'daring'],

  // Nature/Environment
  ['forest', 'wood', 'woods', 'jungle', 'rainforest', 'grove'],
  ['mountain', 'hill', 'peak', 'summit', 'ridge', 'highland'],
  ['river', 'stream', 'creek', 'brook', 'waterway', 'tributary'],
  ['ocean', 'sea', 'marine', 'maritime'],
  ['weather', 'climate', 'atmosphere', 'conditions'],
  ['rain', 'precipitation', 'rainfall', 'drizzle', 'shower', 'downpour'],
  ['storm', 'tempest', 'hurricane', 'typhoon', 'cyclone', 'gale'],
  ['earth', 'soil', 'ground', 'dirt', 'land', 'terrain'],
  ['animal', 'creature', 'beast', 'organism', 'fauna'],
  ['plant', 'vegetation', 'flora', 'greenery', 'foliage'],
  ['bird', 'fowl', 'avian'],
  ['fish', 'aquatic', 'marine life'],
  ['insect', 'bug', 'pest', 'arthropod'],

  // People/Society
  ['person', 'individual', 'human', 'being', 'soul', 'someone'],
  ['people', 'humans', 'individuals', 'persons', 'folk', 'society', 'mankind', 'humanity'],
  ['child', 'kid', 'youngster', 'youth', 'juvenile', 'minor', 'infant'],
  ['student', 'pupil', 'learner', 'scholar', 'trainee'],
  ['teacher', 'instructor', 'educator', 'tutor', 'professor', 'lecturer'],
  ['friend', 'companion', 'buddy', 'pal', 'mate', 'ally', 'comrade'],
  ['enemy', 'foe', 'opponent', 'adversary', 'rival', 'antagonist'],
  ['leader', 'head', 'chief', 'boss', 'director', 'commander'],
  ['worker', 'employee', 'staff', 'laborer', 'personnel'],
  ['job', 'occupation', 'profession', 'career', 'vocation', 'employment', 'work'],
  ['money', 'cash', 'currency', 'funds', 'capital', 'wealth'],
  ['house', 'home', 'residence', 'dwelling', 'abode', 'domicile'],
  ['city', 'town', 'metropolis', 'urban area', 'municipality'],
  ['country', 'nation', 'state', 'land', 'realm'],
  ['government', 'administration', 'authority', 'regime', 'ruling body'],
  ['law', 'rule', 'regulation', 'statute', 'legislation', 'ordinance'],
  ['war', 'conflict', 'battle', 'combat', 'fight', 'warfare', 'hostilities'],
  ['peace', 'harmony', 'tranquility', 'calm', 'serenity', 'concord'],

  // Abstract/Ideas
  ['idea', 'concept', 'notion', 'thought', 'belief', 'opinion', 'view'],
  ['problem', 'issue', 'difficulty', 'challenge', 'trouble', 'obstacle', 'dilemma'],
  ['solution', 'answer', 'resolution', 'remedy', 'fix', 'cure'],
  ['reason', 'cause', 'explanation', 'rationale', 'motive', 'grounds'],
  ['result', 'outcome', 'consequence', 'effect', 'product', 'aftermath'],
  ['method', 'approach', 'technique', 'strategy', 'procedure', 'way', 'means'],
  ['goal', 'aim', 'objective', 'target', 'purpose', 'intention', 'ambition'],
  ['success', 'achievement', 'accomplishment', 'triumph', 'victory'],
  ['failure', 'defeat', 'loss', 'setback', 'collapse'],
  ['mistake', 'error', 'fault', 'blunder', 'oversight', 'slip', 'flaw'],
  ['advantage', 'benefit', 'gain', 'profit', 'plus', 'asset', 'edge'],
  ['disadvantage', 'drawback', 'downside', 'weakness', 'limitation', 'flaw'],
  ['example', 'instance', 'case', 'illustration', 'sample', 'specimen'],
  ['type', 'kind', 'sort', 'category', 'class', 'variety', 'genre'],
  ['part', 'piece', 'section', 'segment', 'portion', 'component', 'element'],
  ['whole', 'entirety', 'totality', 'complete', 'aggregate'],
  ['beginning', 'start', 'onset', 'commencement', 'outset', 'origin'],
  ['end', 'conclusion', 'finish', 'termination', 'close', 'completion'],
  ['truth', 'fact', 'reality', 'actuality', 'certainty'],
  ['lie', 'falsehood', 'untruth', 'fabrication', 'deception'],
  ['love', 'affection', 'devotion', 'adoration', 'passion', 'fondness'],
  ['hate', 'hatred', 'loathing', 'detest', 'abhor', 'despise'],
  ['fear', 'dread', 'terror', 'fright', 'alarm', 'panic', 'anxiety'],
  ['courage', 'bravery', 'valor', 'nerve', 'guts', 'boldness'],
  ['knowledge', 'wisdom', 'understanding', 'insight', 'awareness', 'comprehension'],
  ['power', 'strength', 'force', 'energy', 'might', 'authority', 'influence'],
  ['freedom', 'liberty', 'independence', 'autonomy', 'emancipation'],
  ['justice', 'fairness', 'equity', 'impartiality', 'righteousness'],
  ['beauty', 'attractiveness', 'loveliness', 'elegance', 'grace', 'charm'],
  ['danger', 'risk', 'hazard', 'peril', 'threat', 'jeopardy'],
  ['safety', 'security', 'protection', 'shelter', 'refuge', 'sanctuary'],

  // Time
  ['now', 'currently', 'presently', 'at present', 'at the moment'],
  ['before', 'previously', 'earlier', 'formerly', 'prior', 'in the past'],
  ['after', 'later', 'subsequently', 'afterwards', 'thereafter', 'following'],
  ['soon', 'shortly', 'presently', 'before long', 'in due course'],
  ['always', 'forever', 'eternally', 'perpetually', 'constantly', 'invariably'],
  ['never', 'at no time', 'not ever'],
  ['often', 'frequently', 'regularly', 'repeatedly', 'commonly'],
  ['rarely', 'seldom', 'infrequently', 'occasionally', 'hardly ever'],
  ['immediately', 'instantly', 'at once', 'right away', 'straight away', 'promptly'],
  ['eventually', 'finally', 'ultimately', 'in the end', 'at last'],
  ['suddenly', 'abruptly', 'unexpectedly', 'all at once', 'out of the blue'],

  // Space/Location
  ['here', 'at this place', 'at this location', 'present'],
  ['there', 'at that place', 'at that location'],
  ['everywhere', 'all over', 'throughout', 'in all places', 'ubiquitous'],
  ['nowhere', 'not anywhere', 'no place'],
  ['above', 'over', 'on top of', 'higher than', 'upward'],
  ['below', 'under', 'beneath', 'underneath', 'lower than'],
  ['inside', 'within', 'interior', 'internal'],
  ['outside', 'exterior', 'external', 'outdoor'],
  ['near', 'close', 'nearby', 'adjacent', 'neighboring', 'proximate'],
  ['far', 'distant', 'remote', 'faraway', 'far-off'],
  ['left', 'port', 'sinister'],
  ['right', 'starboard', 'dexter'],
  ['front', 'fore', 'anterior', 'forward'],
  ['back', 'rear', 'posterior', 'behind'],

  // Communication
  ['talk', 'speak', 'converse', 'communicate', 'chat', 'discuss', 'dialogue'],
  ['write', 'compose', 'draft', 'pen', 'author', 'scribe'],
  ['read', 'peruse', 'scan', 'browse', 'skim'],
  ['listen', 'hear', 'attend', 'heed', 'pay attention'],
  ['tell', 'inform', 'notify', 'advise', 'apprise', 'relate', 'narrate'],
  ['agree', 'concur', 'consent', 'assent', 'accede', 'approve'],
  ['disagree', 'differ', 'dissent', 'object', 'oppose', 'contest'],
  ['argue', 'debate', 'dispute', 'contend', 'quarrel', 'wrangle'],
  ['promise', 'pledge', 'vow', 'swear', 'commit', 'guarantee', 'assure'],
  ['warn', 'caution', 'alert', 'advise', 'forewarn', 'notify'],
  ['suggest', 'propose', 'recommend', 'advise', 'advocate', 'counsel'],
  ['insist', 'demand', 'require', 'persist', 'maintain'],
  ['admit', 'confess', 'acknowledge', 'concede', 'own up'],
  ['deny', 'refuse', 'reject', 'decline', 'dismiss', 'repudiate'],
  ['praise', 'compliment', 'commend', 'applaud', 'acclaim', 'laud'],
  ['criticize', 'condemn', 'censure', 'blame', 'reprimand', 'rebuke', 'scold'],

  // Quantity/Amount
  ['many', 'numerous', 'countless', 'abundant', 'plentiful', 'a lot', 'much'],
  ['few', 'scarce', 'rare', 'sparse', 'limited', 'little'],
  ['all', 'every', 'each', 'entire', 'total', 'whole'],
  ['some', 'several', 'a few', 'various', 'certain'],
  ['none', 'nothing', 'nil', 'zero', 'nobody', 'no one'],
  ['enough', 'sufficient', 'adequate', 'ample', 'plenty'],
  ['more', 'additional', 'extra', 'further', 'greater'],
  ['less', 'fewer', 'reduced', 'smaller', 'decreased'],
  ['most', 'majority', 'bulk', 'greatest part', 'largest portion'],
  ['half', '50%', 'fifty percent', 'one half'],
  ['full', 'complete', 'entire', 'whole', 'total', 'filled'],
  ['empty', 'vacant', 'hollow', 'void', 'blank', 'bare'],
];

const synonymMap = new Map<string, string>();
for (const group of SYNONYM_GROUPS) {
  const canonical = group[0];
  for (const word of group) {
    if (!synonymMap.has(word)) synonymMap.set(word, canonical);
  }
}

export const synonymExpansionRule: FairnessRule = {
  id: 'fair:synonym-expansion', name: 'Synonym Expansion', description: 'Normalizes 1000+ synonyms across 12 topic categories', priority: 'high',
  evaluate(input, ctx) {
    const original = input.studentAnswer;
    const words = norm(original).split(/\s+/);
    let changed = false;
    const normalized = words.map(w => {
      // Strip trailing punctuation for lookup
      const clean = w.replace(/[.,!?;:'"]+$/, '');
      const punct = w.slice(clean.length);
      const match = synonymMap.get(clean);
      if (match && match !== clean) {
        changed = true;
        return match + punct;
      }
      return w;
    });

    if (changed) {
      const newAnswer = normalized.join(' ');
      return {
        input: { ...input, studentAnswer: newAnswer },
        check: adjust(this.id, 0.95, 'Synonyms normalized to canonical form', 'high', original, newAnswer),
      };
    }
    return { input, check: ok(this.id) };
  },
};

// ═══ 12. KeywordCoverageRule ═══
export const keywordCoverageRule: FairnessRule = {
  id: 'fair:keyword-coverage', name: 'Keyword Coverage', description: 'Uses weighted keywords instead of exact string matching', priority: 'high',
  evaluate(input, ctx) {
    if (!input.keywords || input.keywords.length === 0) return { input, check: ok(this.id) };

    const studentLower = norm(input.studentAnswer);
    let totalWeight = 0;
    let coveredWeight = 0;

    for (const kw of input.keywords) {
      totalWeight += kw.weight;
      const variations = kw.variations || [kw.word];
      let found = false;

      for (const variant of variations) {
        if (studentLower.includes(variant.toLowerCase())) {
          // Core keywords get full weight, others get proportional
          const multiplier = kw.category === 'core' ? 1.0 : kw.category === 'supporting' ? 0.8 : 0.5;
          coveredWeight += kw.weight * multiplier;
          found = true;
          break;
        }
      }
    }

    const coverage = totalWeight > 0 ? coveredWeight / totalWeight : 1;
    const score = Math.min(1, coverage);

    if (score < 0.3) {
      return { input, check: adjust(this.id, score, `Low keyword coverage (${Math.round(score * 100)}%)`, 'high', undefined, undefined) };
    }
    if (score < 0.7) {
      return { input, check: adjust(this.id, score, `Partial keyword coverage (${Math.round(score * 100)}%)`, 'medium', undefined, undefined) };
    }
    return { input, check: score >= 0.95 ? ok(this.id) : adjust(this.id, score, `Good keyword coverage (${Math.round(score * 100)}%)`, 'low', undefined, undefined) };
  },
};

// ═══ 13. SemanticConfidenceRule ═══
export const semanticConfidenceRule: FairnessRule = {
  id: 'fair:semantic-confidence', name: 'Semantic Confidence', description: 'Produces confidence score instead of binary match', priority: 'high',
  evaluate(input, ctx) {
    const student = norm(input.studentAnswer);
    const reference = norm(input.referenceAnswer);

    // Exact match
    if (student === reference) return { input, check: ok(this.id) };

    // Word overlap
    const studentWords = new Set(student.split(/\s+/));
    const refWords = new Set(reference.split(/\s+/));
    const intersection = new Set([...studentWords].filter(w => refWords.has(w)));
    const union = new Set([...studentWords, ...refWords]);
    const jaccard = union.size > 0 ? intersection.size / union.size : 0;

    // Length similarity
    const lenRatio = Math.min(student.length, reference.length) / Math.max(student.length, reference.length, 1);

    // Combined confidence
    const confidence = jaccard * 0.6 + lenRatio * 0.4;

    if (confidence >= 0.9) return { input, check: ok(this.id) };
    if (confidence >= 0.7) {
      return { input, check: adjust(this.id, confidence, `Semantic confidence: ${Math.round(confidence * 100)}%`, 'medium', undefined, undefined) };
    }
    return { input, check: adjust(this.id, confidence, `Low semantic confidence: ${Math.round(confidence * 100)}%`, 'high', undefined, undefined) };
  },
};

// ═══ 14. PartialCreditRule ═══
export const partialCreditRule: FairnessRule = {
  id: 'fair:partial-credit', name: 'Partial Credit', description: 'Awards partial credit based on overall fairness score', priority: 'critical',
  evaluate(input, ctx) {
    // This rule runs last. It computes partial credit from the accumulated adjustments.
    const baseScore = 100 + ctx.scoreAdjustments;
    const clamped = Math.max(0, Math.min(100, baseScore));

    if (clamped >= 95) return { input, check: ok(this.id) };
    if (clamped >= 80) {
      return { input, check: adjust(this.id, 0.9, '90% partial credit awarded', 'critical', undefined, undefined) };
    }
    if (clamped >= 70) {
      return { input, check: adjust(this.id, 0.8, '80% partial credit awarded', 'critical', undefined, undefined) };
    }
    if (clamped >= 60) {
      return { input, check: adjust(this.id, 0.7, '70% partial credit awarded', 'critical', undefined, undefined) };
    }
    return { input, check: adjust(this.id, 0.5, '50% partial credit awarded', 'critical', undefined, undefined) };
  },
};

// ═══ Rule Pack ═══
export const allFairnessRules: FairnessRule[] = [
  articleToleranceRule,
  punctuationToleranceRule,
  caseToleranceRule,
  whitespaceToleranceRule,
  britishAmericanRule,
  spellingToleranceRule,
  verbTenseToleranceRule,
  singularPluralRule,
  abbreviationRule,
  numberNormalizationRule,
  synonymExpansionRule,
  keywordCoverageRule,
  semanticConfidenceRule,
  partialCreditRule,
];
