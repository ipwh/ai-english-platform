// ============================================
// 2026-10-08：出題提示詞的「單一可辯護答案」契約測試
//
// 病根（使用者回報「題目數量生成不足」；實測）：
// 說話（Paper 4）要求 MC 時，舊碼的 skill section 仍叫模型交
// 「Answer field: 3-5 bullet points. Choices: [].」——與上方「type: mc／4 個選項」
// 互相矛盾。模型於是改出主觀比較題（「哪一項最有效／最重要」），而交付前的
// 獨立答案覆核（blind-solve）一律判 `ambiguous`（多於一個站得住腳的選項）並整批
// 丟棄 ⇒ 交付數量只能靠補題輪補回，容易不足。
//
// 契約：產生 MC 的 skill section 必須要求「只有一個可辯護答案」並禁止未定義判準的
// 主觀比較題；非 MC（開放式）路徑維持原本的 bullet points 指引。
// ============================================
import { describe, expect, it } from 'vitest';
import { buildCompactSystemPrompt } from '../prompts/generate-questions-prompt';

function promptFor(overrides: Partial<Parameters<typeof buildCompactSystemPrompt>[0]>) {
  return buildCompactSystemPrompt(
    {
      difficulty: 'core',
      gradeLevel: 'S4',
      count: 5,
      questionType: 'mc',
      ...overrides,
    } as Parameters<typeof buildCompactSystemPrompt>[0],
    '',
  );
}

describe('buildCompactSystemPrompt — 單一可辯護答案（MC）', () => {
  it('說話 MC：要求恰好一個可辯護選項，並禁止主觀最高級題目', () => {
    const prompt = promptFor({ languageSkill: 'speaking', languageSkillZh: '說話' });

    expect(prompt).toContain('exactly ONE defensible option');
    expect(prompt).toContain('NEVER ask for opinions or subjective superlatives');
    // 舊碼的矛盾指引不得再出現於 MC 情境
    expect(prompt).not.toContain('Answer field: 3-5 bullet points');
  });

  it('一般 MC 規則（所有技能）同樣要求唯一可辯護答案', () => {
    const prompt = promptFor({ grammarItem: 'tenses', grammarItemZh: '時態' });

    expect(prompt).toContain('Exactly ONE option may be defensible');
    expect(prompt).toContain('opinion-only superlative');
  });

  it('說話的非 MC（開放式）路徑維持 bullet points 指引', () => {
    const prompt = promptFor({
      languageSkill: 'speaking',
      languageSkillZh: '說話',
      questionType: 'fill-blank',
    });

    expect(prompt).toContain('Answer field: 3-5 bullet points');
    expect(prompt).not.toContain('exactly ONE defensible option');
  });

  it('說話 section 只會出現一次（不得同時出現 MC 與開放式指引）', () => {
    const mc = promptFor({ languageSkill: 'speaking', languageSkillZh: '說話' });
    expect(mc).toContain('DSE Paper 4 Speaking');
    expect(mc.split('DSE Paper 4 Speaking').length - 1).toBe(1);
  });
});
