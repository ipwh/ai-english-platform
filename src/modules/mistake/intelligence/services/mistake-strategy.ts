// ============================================
// Mistake Strategy Cards — 題型策略卡
// ============================================
// 2026-09-14: comprehension / listening 錯題依附在一篇 passage 上，
// 不可能重考同一題；對學生真正有價值的是「這類題為何會錯、下次怎樣做」。
// 本檔提供確定性（非 AI）的題型策略卡內容，雙語靜態資料。
//
// 擁有權：錯題本的複習內容由 mistake 模組擁有。
// 閱讀題型標籤重用 reading 模組的 DSE 分類（單一來源），不重複定義。
// ============================================

import { DSE_SKILL_LABELS, DSE_SKILL_LABELS_ZH } from '@/modules/reading/feedback/reading-feedback-types';

export interface StrategyCard {
  /** Stable key — also used by tests */
  key: string;
  labelZh: string;
  labelEn: string;
  /** 這類題目最常見的錯因 */
  whyZh: string;
  whyEn: string;
  /** 下次作答的具體步驟 */
  stepsZh: string[];
  stepsEn: string[];
}

function card(
  key: string,
  labelZh: string,
  labelEn: string,
  whyZh: string,
  whyEn: string,
  stepsZh: string[],
  stepsEn: string[],
): StrategyCard {
  return { key, labelZh, labelEn, whyZh, whyEn, stepsZh, stepsEn };
}

/** 閱讀 DSE 題型策略卡 — label 重用 reading 模組的分類標籤 */
const READING_CARDS: Record<string, StrategyCard> = {
  inference: card(
    'reading.inference',
    DSE_SKILL_LABELS_ZH.inference, DSE_SKILL_LABELS.inference,
    '只讀了字面意思，或用常識補位，沒有回到篇章找證據。',
    'You answered from general knowledge or surface wording instead of returning to the passage for evidence.',
    ['先找出題目要你推斷的是「誰／什麼態度的哪一點」。', '在篇章劃出支持該推斷的一句證據。', '答案要超越原文用字，但不能超出證據能支持的範圍。'],
    ['Decide exactly what is being inferred.', 'Underline the one sentence that supports it.', 'Answer beyond the wording — but never beyond the evidence.'],
  ),
  vocabulary_in_context: card(
    'reading.vocabulary_in_context',
    DSE_SKILL_LABELS_ZH.vocabulary_in_context, DSE_SKILL_LABELS.vocabulary_in_context,
    '用了自己背過的詞義，沒有理會前後文。',
    'You used a memorised dictionary meaning instead of the meaning the surrounding text creates.',
    ['把該詞前後各一句讀一次。', '先判斷詞性（名詞／動詞／形容詞／副詞）。', '代入四個選項，只有語意與詞性都通順的才正確。'],
    ['Read one sentence before and after the word.', 'Identify its part of speech first.', 'Substitute each option — only one fits both meaning and grammar.'],
  ),
  reference: card(
    'reading.reference',
    DSE_SKILL_LABELS_ZH.reference, DSE_SKILL_LABELS.reference,
    '只憑距離判斷前詞，忽略了單複數與邏輯。',
    'You picked the nearest noun without checking number agreement or logic.',
    ['把代名詞還原入句，看是否通順。', '核對單複數（they／them 不可能指單數名詞）。', '必要時向前多找一句。'],
    ['Substitute the referent back into the sentence.', 'Check number agreement (they/them cannot refer to a singular noun).', 'If needed, look one sentence further back.'],
  ),
  tone_attitude: card(
    'reading.tone_attitude',
    DSE_SKILL_LABELS_ZH.tone_attitude, DSE_SKILL_LABELS.tone_attitude,
    '選了太籠統的態度詞（例如「正面」），未扣緊作者用字。',
    'You chose a vague attitude label (e.g. "positive") that does not match the writer\'s actual wording.',
    ['圈出篇章中的評價性形容詞／副詞。', '分辨是支持、保留、質疑還是諷刺。', '選最精確的一項，避免籠統形容。'],
    ['Circle the evaluative adjectives and adverbs.', 'Decide: supportive, reserved, critical or ironic?', 'Choose the most precise label, not the vaguest.'],
  ),
  short_answer: card(
    'reading.short_answer',
    DSE_SKILL_LABELS_ZH.short_answer, DSE_SKILL_LABELS.short_answer,
    '找到正確段落，但直接抄錄原文或抄得不完整。',
    'You located the right paragraph but copied the wording verbatim, or copied too little.',
    ['先用題目關鍵詞定位段落。', '只抽取作答所需的關鍵詞，不是整句照抄。', '用自己的文字改寫，保留原意。'],
    ['Locate the paragraph using the question keywords.', 'Extract only the keywords needed — not the whole sentence.', 'Paraphrase in your own words while keeping the meaning.'],
  ),
  summary_cloze: card(
    'reading.summary_cloze',
    DSE_SKILL_LABELS_ZH.summary_cloze, DSE_SKILL_LABELS.summary_cloze,
    '意思對但詞形不符（名詞寫成動詞、單複數不合）。',
    'The meaning was right but the word form was wrong (noun instead of verb, wrong number).',
    ['先判斷空格需要甚麼詞性。', '回篇章找對應概念的字詞。', '最後檢查時態與單複數。'],
    ['Decide which part of speech the gap needs.', 'Return to the passage to find the matching idea.', 'Check tense and number before finishing.'],
  ),
  sentence_transformation: card(
    'reading.sentence_transformation',
    DSE_SKILL_LABELS_ZH.sentence_transformation, DSE_SKILL_LABELS.sentence_transformation,
    '保留了原句字詞，未按要求改寫或轉換結構。',
    'You kept the original wording instead of restructuring the sentence as instructed.',
    ['先看清題目要求轉換成甚麼結構。', '保留關鍵意思詞，改動其餘部分。', '核對改寫後文法與原句意思一致。'],
    ['Identify the structure the question requires.', 'Keep the key meaning words; change the rest.', 'Verify the rewrite keeps the original meaning and is grammatical.'],
  ),
  multiple_choice: card(
    'reading.multiple_choice',
    DSE_SKILL_LABELS_ZH.multiple_choice, DSE_SKILL_LABELS.multiple_choice,
    '被選項中重複原文詞語的干擾項吸引（同字陷阱）。',
    'You were attracted by a distractor that repeats wording from the passage.',
    ['先自己構思答案，再看選項。', '逐項回篇章核對，特別是「同字但不同義」的選項。', '排除只能部分對應的選項。'],
    ['Form your own answer before reading the options.', 'Check each option against the passage — beware repeats that change meaning.', 'Eliminate options that are only partly supported.'],
  ),
  true_false_not_given: card(
    'reading.true_false_not_given',
    DSE_SKILL_LABELS_ZH.true_false_not_given, DSE_SKILL_LABELS.true_false_not_given,
    '把「文中無提及」誤判為「錯」。',
    'You treated "not given" as "false".',
    ['先確認題目陳述是否在篇章出現過。', '出現過且違反篇章內容 → False。', '完全找不到對應 → Not Given（不要用常識補位）。'],
    ['Check whether the statement appears in the passage at all.', 'Appears and contradicts the passage → False.', 'No corresponding text → Not Given (never fill in from common sense).'],
  ),
};

/** 聆聽策略卡 */
const LISTENING_CARDS: Record<string, StrategyCard> = {
  detail: card(
    'listening.detail',
    '聆聽細節', 'Listening — Detail',
    '未有在錄音前預測關鍵詞，聽到答案時已錯過。',
    'You did not predict the key words before the audio, so the answer passed before you noticed.',
    ['播放前先圈出題目關鍵詞。', '預測答案類型（數字／人名／地點／動作）。', '聽到關鍵詞時立刻記下，不要停下來寫完整句子。'],
    ['Circle the key words before the audio starts.', 'Predict the answer type (number, name, place, action).', 'Note the answer the moment you hear the cue — do not stop to write full sentences.'],
  ),
  gist: card(
    'listening.gist',
    '聆聽主旨', 'Listening — Gist',
    '只抓住個別字詞，未掌握說話者整體意思。',
    'You caught isolated words without following the speaker\'s overall point.',
    ['留意轉折詞（but / however / actually）之後的內容。', '聽語氣判斷立場。', '先答主旨題，細節題留待第二遍。'],
    ['Follow what comes after markers like but / however / actually.', 'Use tone of voice to judge the stance.', 'Answer gist questions first; leave detail questions for the second play.'],
  ),
  inference: card(
    'listening.inference',
    '聆聽推論', 'Listening — Inference',
    '只聽字面，沒有推斷說話者的暗示。',
    'You took the words literally without inferring the speaker\'s implication.',
    ['留意重讀與停頓的位置。', '分辨說話者是認真、猶豫還是諷刺。', '答題時指出支持該推斷的那一句。'],
    ['Listen to which words are stressed and where the pauses fall.', 'Decide whether the speaker is serious, hesitant or ironic.', 'Cite the line that supports your inference.'],
  ),
};

/** 非語言技能類（文法／詞彙／寫作／其他）策略卡 */
const GENERIC_CARDS: Record<string, StrategyCard> = {
  grammar: card(
    'grammar.general',
    '文法項目', 'Grammar point',
    '只記得規則的名稱，未在句子中核對詞形與時態。',
    'You recalled the rule name but did not check form and tense inside the sentence.',
    ['先找出句子主語與時間標記。', '判斷句子需要的時態與語態。', '作答後把整句讀一次，確認通順。'],
    ['Find the subject and any time markers.', 'Decide which tense and voice the sentence needs.', 'Read the whole sentence once more before submitting.'],
  ),
  vocabulary: card(
    'vocabulary.general',
    '詞彙運用', 'Vocabulary',
    '只記單字意思，未記搭配詞（collocation）與詞性。',
    'You memorised the meaning but not the collocation or part of speech.',
    ['確認該詞的詞性。', '記下它常配搭的介系詞或動詞。', '把正確答案加入生詞本，連同一個例句。'],
    ['Confirm the part of speech.', 'Note the preposition or verb it usually collocates with.', 'Add the correct answer to your vocabulary book with one example sentence.'],
  ),
  comprehension: card(
    'comprehension.unclassified',
    '閱讀／聆聽理解（未分類題型）', 'Comprehension (unclassified type)',
    '未能判定具體題型，只知屬理解類錯誤。',
    'The specific question type is unknown — recorded only as a comprehension error.',
    ['重做同類練習時，刻意留意自己錯的是哪一步。', '把錯誤歸類為：定位、改寫、詞義還是推論問題。', '下次做同類題目時先做該步檢查。'],
    ['In your next practice, notice which step you fail at.', 'Classify it: locating, paraphrasing, word meaning or inference.', 'Start with that check next time.'],
  ),
  careless: card(
    'careless.general',
    '粗心大意', 'Careless',
    '理解正確但作答時輸入或用字出錯。',
    'You understood the item but made a slip when answering.',
    ['提交前重讀題目要求一次。', '檢查單複數、時態與拼寫。', '檢查是否漏答題目。'],
    ['Re-read the question requirement before submitting.', 'Check number, tense and spelling.', 'Check whether any question was skipped.'],
  ),
  'time-management': card(
    'time-management.general',
    '時間管理', 'Time management',
    '在個別題目花費過多時間，導致後面題目未完成。',
    'You spent too long on individual items and could not finish the rest.',
    ['先做整份試卷中較有把握的部分。', '單題超過預定時間便先標記跳過。', '預留最後 5 分鐘檢查。'],
    ['Start with the parts you are confident in.', 'Mark and skip any item that exceeds its time budget.', 'Reserve the last 5 minutes for checking.'],
  ),
  chinglish: card(
    'chinglish.general',
    '中英夾雜（Chinglish）', 'Chinglish',
    '直接由中文逐字翻譯，未用英文慣用表達。',
    'You translated word-for-word from Chinese instead of using English patterns.',
    ['先想英文的慣用句式，不要逐字翻譯。', '檢查主語與動詞是否一致。', '避免中文式搭配（例如 discuss about）。'],
    ['Think of the English pattern first — never translate word for word.', 'Check subject–verb agreement.', 'Avoid Chinese-style collocations (e.g. discuss about).'],
  ),
};

/**
 * Look up the strategy card for a mistake bucket.
 * Returns null when nothing meaningful can be said (never invents content).
 */
export function getStrategyCard(params: {
  languageSkill?: string | null;
  questionType?: string | null;
  grammarItem?: string | null;
  mistakeType?: string | null;
}): StrategyCard | null {
  const { languageSkill, questionType, grammarItem, mistakeType } = params;

  if (questionType) {
    if (languageSkill === 'reading' && READING_CARDS[questionType]) return READING_CARDS[questionType];
    if (languageSkill === 'listening' && LISTENING_CARDS[questionType]) return LISTENING_CARDS[questionType];
  }

  if (grammarItem) return GENERIC_CARDS.grammar;
  if (mistakeType && GENERIC_CARDS[mistakeType]) return GENERIC_CARDS[mistakeType];
  if (languageSkill === 'reading' || languageSkill === 'listening') {
    return GENERIC_CARDS.comprehension;
  }
  return null;
}
