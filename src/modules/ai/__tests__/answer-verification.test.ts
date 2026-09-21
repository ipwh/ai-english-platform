// ============================================
// Tests: Answer Verification Gate
//
// Regression source (2026-09-20): a vocabulary item was delivered with the
// key on "update up" while its own explanation said no option was correct:
//
//   Always ___ ___ your passwords regularly to keep your accounts safe.
//   A. update in  B. update up  C. update with  D. update on
//   💡 「update up 不是正確片語…但選項中沒有正確的，因此題目有誤。」
//
// Layer A (deterministic) must reject self-admitted defects, and Layer B
// (independent blind solve) must reject items whose options are all wrong.
// ============================================

import { describe, it, expect, vi } from 'vitest';
import {
  inspectGeneratedQuestion,
  verifyGeneratedAnswers,
  summarizeVerificationDrops,
  type AnswerVerifier,
} from '@/modules/ai/services/answer-verification';
import type { GeneratedQuestion } from '@/modules/ai/types/generation-types';
import type { AnswerVerificationResponse } from '@/modules/ai/schemas/ai-schema';
import { ANSWER_VERIFICATION_SYSTEM_PROMPT } from '@/modules/ai/prompts/grammar/answer-verification';

function mc(overrides: Partial<GeneratedQuestion> = {}): GeneratedQuestion {
  return {
    type: 'mc',
    prompt: 'Choose the correct option: She ___ to school every day.',
    promptZh: '選擇正確答案',
    choices: ['goes', 'go', 'going', 'gone'],
    answer: 'A',
    explanationZh: '第三人稱單數用 goes。',
    explanationEn: 'Third person singular takes "goes".',
    commonMistake: '學生常忘記加 -es。',
    ...overrides,
  };
}

/** The exact defective item from the 2026-09-20 report. */
function brokenPhrasalVerbItem(): GeneratedQuestion {
  return mc({
    prompt: 'Always ___ ___ your passwords regularly to keep your accounts safe.',
    promptZh: '選擇正確的片語動詞',
    choices: ['update in', 'update up', 'update with', 'update on'],
    answer: 'B',
    explanationZh:
      'update up 不是正確片語。update 作為及物動詞，直接接受詞，無需介詞。但本題選項中只有 update up 是片語動詞形式？實際上正確用法是 update 直接加受詞。但選項中沒有正確的，因此題目有誤。',
    explanationEn: 'None of the options is a correct English phrasal verb.',
    commonMistake: '學生誤加介詞。',
  });
}

/** A verifier that never touches the network. */
function stubVerifier(response: AnswerVerificationResponse | null): AnswerVerifier {
  return async () => response;
}

// ============================================
// Layer A — deterministic checks
// ============================================

describe('inspectGeneratedQuestion (deterministic layer)', () => {
  it('rejects the 2026-09-20 item whose explanation admits the question is wrong', () => {
    const defects = inspectGeneratedQuestion(brokenPhrasalVerbItem());
    expect(defects.join(' ')).toContain('解說自認題目有誤');
  });

  it('accepts a clean item', () => {
    expect(inspectGeneratedQuestion(mc())).toEqual([]);
  });

  it('does NOT flag a legitimate explanation of a wrong distractor', () => {
    const legit = mc({
      choices: ['discussed', 'discussed about', 'discuss about', 'discussing'],
      answer: 'A',
      explanationZh: 'B 不是正確的片語：discuss 是及物動詞，後面不加 about。',
      explanationEn: 'B is not a valid option: discuss is transitive and takes no preposition.',
    });
    expect(inspectGeneratedQuestion(legit)).toEqual([]);
  });

  it('does NOT flag a distractor-level remark about a correct preposition/word form', () => {
    const legit = mc({
      choices: ['discussed', 'discussed about', 'discuss about', 'discussing'],
      answer: 'A',
      explanationZh: '選項 C 沒有正確的詞形與搭配：discuss 後不可加 about。',
      explanationEn: 'Option C has no correct word form here.',
    });
    expect(inspectGeneratedQuestion(legit)).toEqual([]);
  });

  it('does NOT flag teaching phrases such as 「本題易錯點」', () => {
    const legit = mc({
      explanationZh: '本題易錯點：學生常把 discuss 當成 discuss about。',
      commonMistake: '學生答案不對時往往忘記及物動詞用法。',
    });
    expect(inspectGeneratedQuestion(legit)).toEqual([]);
  });

  it('does NOT flag a general remark about an error type in the wrong option', () => {
    const legit = mc({
      explanationZh: '本題錯誤選項的設計是常見中式英語（discuss about）。',
    });
    expect(inspectGeneratedQuestion(legit)).toEqual([]);
  });

  it('flags "四個選項均沒有正確答案"', () => {
    const defects = inspectGeneratedQuestion(
      mc({ explanationZh: '四個選項均沒有正確答案，題目應重新設計。' }),
    );
    expect(defects.join(' ')).toContain('解說自認題目有誤');
  });

  it('flags a defective answer key admission', () => {
    const defects = inspectGeneratedQuestion(
      mc({ explanationZh: '答案鍵有誤，實際正確用法不在選項中。' }),
    );
    expect(defects.join(' ')).toContain('解說自認題目有誤');
  });

  it('rejects duplicated options', () => {
    const defects = inspectGeneratedQuestion(
      mc({ choices: ['goes', 'go', 'go', 'gone'], answer: 'A' }),
    );
    expect(defects.join(' ')).toContain('選項重複');
  });

  it('rejects an option count other than 4', () => {
    const defects = inspectGeneratedQuestion(mc({ choices: ['goes', 'go', 'going'], answer: 'A' }));
    expect(defects.join(' ')).toContain('選項數目必須為 4');
  });

  it('rejects system fallback filler delivered as a real option', () => {
    const defects = inspectGeneratedQuestion(
      mc({
        choices: ['goes', 'go', 'going', 'Check the sentence structure carefully.'],
        answer: 'A',
      }),
    );
    expect(defects.join(' ')).toContain('系統補位文字');
  });

  it('rejects a key that is not an A–D letter', () => {
    const defects = inspectGeneratedQuestion(mc({ answer: 'goes' }));
    expect(defects.join(' ')).toContain('不是 A–D 選項字母');
  });

  it('rejects an English self-admission ("none of the options is correct")', () => {
    const defects = inspectGeneratedQuestion(
      mc({
        explanationZh: '',
        explanationEn: 'None of the four options is correct in this context.',
      }),
    );
    expect(defects.join(' ')).toContain('解說自認題目有誤');
  });
});

// ============================================
// Layer B — independent blind-solve verification
// ============================================

describe('verifyGeneratedAnswers (independent verifier layer)', () => {
  it('keeps items the verifier agrees with and judges sound', async () => {
    const result = await verifyGeneratedAnswers([mc()], {
      verify: stubVerifier({ verdicts: [{ index: 1, blindAnswer: 'A', soundness: 'ok', reason: 'only goes fits' }] }),
    });
    expect(result.kept).toHaveLength(1);
    expect(result.dropped).toEqual([]);
    expect(result.verifiedCount).toBe(1);
    expect(result.verifierUnavailable).toBe(false);
  });

  it('drops an item the verifier judges flawed even when it agrees with the key', async () => {
    const result = await verifyGeneratedAnswers([mc()], {
      verify: stubVerifier({ verdicts: [{ index: 1, blindAnswer: 'A', soundness: 'flawed', reason: 'all options are invented collocations' }] }),
    });
    expect(result.kept).toHaveLength(0);
    expect(result.dropped[0].reasons.join(' ')).toContain('flawed');
  });

  it('drops an ambiguous item (more than one defensible answer)', async () => {
    const result = await verifyGeneratedAnswers([mc()], {
      verify: stubVerifier({ verdicts: [{ index: 1, blindAnswer: 'A', soundness: 'ambiguous', reason: 'B also fits' }] }),
    });
    expect(result.kept).toHaveLength(0);
    expect(result.dropped[0].reasons.join(' ')).toContain('ambiguous');
  });

  it('drops an item when the blind solve disagrees with the key', async () => {
    const result = await verifyGeneratedAnswers([mc()], {
      verify: stubVerifier({ verdicts: [{ index: 1, blindAnswer: 'B', soundness: 'ok', reason: 'go is plural' }] }),
    });
    expect(result.kept).toHaveLength(0);
    expect(result.dropped[0].reasons.join(' ')).toContain('覆核 B／題目答案鍵 A');
  });

  it('drops an item when the verifier says no option is correct', async () => {
    const result = await verifyGeneratedAnswers([mc()], {
      verify: stubVerifier({ verdicts: [{ index: 1, blindAnswer: 'NONE', soundness: 'ok', reason: '' }] }),
    });
    expect(result.kept).toHaveLength(0);
    expect(result.dropped[0].reasons.join(' ')).toContain('沒有選項正確');
  });

  it('drops an item the verifier did not answer (fail-closed)', async () => {
    const result = await verifyGeneratedAnswers([mc()], {
      verify: stubVerifier({ verdicts: [] }),
    });
    expect(result.kept).toHaveLength(0);
    expect(result.dropped[0].reasons.join(' ')).toContain('未就此題回應');
  });

  it('drops an item whose soundness value cannot be interpreted', async () => {
    const result = await verifyGeneratedAnswers([mc()], {
      verify: stubVerifier({ verdicts: [{ index: 1, blindAnswer: 'A', soundness: 'maybe??', reason: '' }] }),
    });
    expect(result.kept).toHaveLength(0);
    expect(result.dropped[0].reasons.join(' ')).toContain('無法解讀');
  });

  it('never sends the answer key to the verifier (blind solve)', async () => {
    const seen: unknown[] = [];
    const spy: AnswerVerifier = async (items) => {
      seen.push(...items);
      return { verdicts: [{ index: 1, blindAnswer: 'A', soundness: 'ok', reason: '' }] };
    };
    await verifyGeneratedAnswers([mc()], { verify: spy });
    expect(seen).toHaveLength(1);
    expect(Object.keys(seen[0] as Record<string, unknown>)).not.toContain('answer');
  });

  it('verifies fill-blank answers as text and drops a mismatch', async () => {
    const fill: GeneratedQuestion = {
      type: 'fill-blank',
      prompt: 'If I ___ rich, I would travel the world.',
      answer: 'were',
      explanationZh: '第二類條件句用 were。',
      explanationEn: 'Type 2 conditional uses were.',
      commonMistake: '誤用 was。',
      choices: [],
    };
    const agree = await verifyGeneratedAnswers([fill], {
      verify: stubVerifier({ verdicts: [{ index: 1, blindAnswer: 'were', soundness: 'ok', reason: '' }] }),
    });
    expect(agree.kept).toHaveLength(1);

    const disagree = await verifyGeneratedAnswers([fill], {
      verify: stubVerifier({ verdicts: [{ index: 1, blindAnswer: 'was', soundness: 'ok', reason: '' }] }),
    });
    expect(disagree.kept).toHaveLength(0);
    expect(disagree.dropped[0].reasons.join(' ')).toContain('覆核「was」');
  });

  // Error-correction keys the option CONTAINING the mistake (the other three are
  // correct). The verifier must therefore be asked in the inverted direction —
  // otherwise every valid error-correction item would be judged "flawed".
  it('verifies error-correction items in inverted ("option-error") mode', async () => {    const ec: GeneratedQuestion = {
      type: 'error-correction',
      prompt: 'The passage below contains ONE grammatical error. Which underlined part is incorrect?',
      choices: ['has been making', 'since she was a child', 'enjoys to create', 'are inspired by'],
      answer: 'C', // the option that CONTAINS the error
      explanationZh: '「enjoys to create」錯誤，enjoy 後應接動名詞。',
      explanationEn: "'enjoys to create' is incorrect; use a gerund after 'enjoy'.",
      commonMistake: '學生常混淆動名詞與不定詞。',
      readingContent: 'She has been making pottery since she was a child, and she still enjoys to create new pieces.',
    };

    const seen: Array<{ mode?: string }> = [];
    const spy: AnswerVerifier = async (items) => {
      seen.push(...(items as Array<{ mode?: string }>));
      return { verdicts: [{ index: 1, blindAnswer: 'C', soundness: 'ok', reason: 'only C contains an error' }] };
    };
    const agree = await verifyGeneratedAnswers([ec], { verify: spy });
    expect(seen[0].mode).toBe('option-error');
    expect(agree.kept).toHaveLength(1);
    expect(agree.verifiedCount).toBe(1);

    const noError = await verifyGeneratedAnswers([ec], {
      verify: stubVerifier({ verdicts: [{ index: 1, blindAnswer: 'NONE', soundness: 'flawed', reason: 'all four options are correct' }] }),
    });
    expect(noError.kept).toHaveLength(0);
    expect(noError.dropped[0].reasons.join(' ')).toContain('flawed');
  });

  it('verifies error-correction without choices as a blind text solve', async () => {
    const ec: GeneratedQuestion = {
      type: 'error-correction',
      prompt: 'Find the error: He go to school by bus. → ?',
      choices: [],
      answer: 'go → goes',
      explanationZh: '第三人稱單數。',
      explanationEn: 'Third person singular.',
      commonMistake: '',
    };
    const spy = vi.fn(async () => ({
      verdicts: [{ index: 1, blindAnswer: 'go → goes', soundness: 'ok', reason: '' }],
    })) as unknown as AnswerVerifier;
    const result = await verifyGeneratedAnswers([ec], { verify: spy });
    expect(spy).toHaveBeenCalledOnce();
    expect(result.kept).toHaveLength(1);
  });

  it('does not send short-writing tasks to the verifier', async () => {
    const writing: GeneratedQuestion = {
      type: 'short-writing',
      prompt: 'Write an email to your teacher about the school trip.',
      answer: 'Model answer text…',
      explanationZh: '', explanationEn: '', commonMistake: '', choices: [],
    };
    const spy = vi.fn(async () => ({ verdicts: [] })) as unknown as AnswerVerifier;
    const result = await verifyGeneratedAnswers([writing], { verify: spy });
    expect(spy).not.toHaveBeenCalled();
    expect(result.kept).toHaveLength(1);
  });

  it('fails closed when the verifier is unavailable', async () => {
    const result = await verifyGeneratedAnswers([mc()], { verify: async () => null });
    expect(result.verifierUnavailable).toBe(true);
    expect(result.kept).toHaveLength(0);
    expect(result.verifiedCount).toBe(0);
  });

  it('fails closed by default when the verifier is unavailable', async () => {
    const result = await verifyGeneratedAnswers([mc()], {
      verify: async () => null,
    });
    expect(result.verifierUnavailable).toBe(true);
    expect(result.kept).toHaveLength(0);
    expect(result.dropped[0].reasons.join(' ')).toContain('fail-closed');
  });

  it('fails closed when the verifier throws', async () => {
    const result = await verifyGeneratedAnswers([mc()], {
      verify: async () => { throw new Error('provider down'); },
    });
    expect(result.verifierUnavailable).toBe(true);
    expect(result.kept).toHaveLength(0);
  });

  it('drops every objective item when the verifier is unavailable', async () => {
    const result = await verifyGeneratedAnswers(
      [mc(), brokenPhrasalVerbItem()],
      { verify: async () => null },
    );
    expect(result.kept).toHaveLength(0);
    expect(result.dropped).toHaveLength(2);
    expect(result.dropped.map(drop => drop.index)).toEqual([2, 1]);
  });

  it('maps dropped items back to their original 1-based index', async () => {
    const result = await verifyGeneratedAnswers(
      [
        mc({ prompt: 'Item one' }),
        mc({ prompt: 'Item two' }),
        mc({ prompt: 'Item three' }),
      ],
      { verify: stubVerifier({ verdicts: [{ index: 1, blindAnswer: 'A', soundness: 'ok', reason: '' }] }) },
    );
    // Only the first item got a positive verdict; items 2 and 3 had no verdict.
    expect(result.kept).toHaveLength(1);
    expect(result.dropped.map((d) => d.index)).toEqual([2, 3]);
    expect(summarizeVerificationDrops(result.dropped)).toContain('Q2');
  });

  it('drops malformed items before ever calling the verifier', async () => {
    const spy = vi.fn(async () => ({ verdicts: [] })) as unknown as AnswerVerifier;
    const result = await verifyGeneratedAnswers(
      [mc({ choices: ['goes', 'go', 'go', 'gone'] })],
      { verify: spy },
    );
    expect(spy).not.toHaveBeenCalled();
    expect(result.kept).toHaveLength(0);
  });
});

// ============================================
// Verifier contract in the prompt itself
// ============================================

describe('answer-verification prompt contract', () => {
  it('documents the inverted error-correction mode in the system prompt', () => {
    expect(ANSWER_VERIFICATION_SYSTEM_PROMPT).toContain('option-error');
    expect(ANSWER_VERIFICATION_SYSTEM_PROMPT).toContain('含有錯誤');
  });

  it('never asks the verifier to trust a provided answer key', () => {
    expect(ANSWER_VERIFICATION_SYSTEM_PROMPT).toMatch(/沒有\**提供答案鍵|blind solve/);
  });
});
