// ============================================
// 2026-09-14: 錯題技能歸屬解析
//
// 正典題目定義（ReadingQuestion / GrammarQuestion）是技能歸屬的唯一權威；
// 解析不到時才使用白名單內的自報值，並標記來源。
// ============================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  resolveReadingQuestionDefinitions: vi.fn(),
  resolveGrammarQuestionDefinitions: vi.fn(),
  resolveGrammarQuestionExplanationsMany: vi.fn(),
}));

vi.mock('@/modules/reading/services/reading-question-service', () => ({
  resolveReadingQuestionDefinitions: mocks.resolveReadingQuestionDefinitions,
}));

vi.mock('../services/grammar-question-service', () => ({
  resolveGrammarQuestionDefinitions: mocks.resolveGrammarQuestionDefinitions,
  resolveGrammarQuestionExplanationsMany: mocks.resolveGrammarQuestionExplanationsMany,
}));

import {
  identityFromGrammarDefinition,
  identityFromReadingDefinition,
  resolveMistakeQuestionContexts,
  resolveMistakeSkillIdentities,
  sanitizeClientSkillClaims,
  sanitizeQuestionSummary,
} from '../services/mistake-skill-identity';
import { getStrategyCard } from '@/modules/mistake/intelligence/services/mistake-strategy';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolveReadingQuestionDefinitions.mockResolvedValue(new Map());
  mocks.resolveGrammarQuestionDefinitions.mockResolvedValue(new Map());
  mocks.resolveGrammarQuestionExplanationsMany.mockResolvedValue(new Map());
});

describe('resolveMistakeSkillIdentities — 正典題目定義優先', () => {
  it('閱讀題目 → languageSkill=reading 且題型取 dseType', async () => {
    mocks.resolveReadingQuestionDefinitions.mockResolvedValue(new Map([
      ['rq-1', {
        id: 'rq-1',
        questionType: 'inference',
        dseType: 'inference',
        questionText: 'What does the writer imply about recycling?',
        choices: null,
        answer: 'It is undervalued.',
        marks: 2,
        orderIndex: 0,
      }],
    ]));

    const resolved = await resolveMistakeSkillIdentities(['rq-1']);
    const identity = resolved.get('rq-1');

    expect(identity).toMatchObject({
      languageSkill: 'reading',
      questionType: 'inference',
      skillSource: 'canonical',
    });
    expect(identity?.questionSummary).toBe('What does the writer imply about recycling?');
  });

  it('文法題目 → 取 grammarItem / questionType / languageSkill', async () => {
    mocks.resolveGrammarQuestionDefinitions.mockResolvedValue(new Map([
      ['gq-1', {
        id: 'gq-1',
        questionType: 'mc',
        prompt: 'She ____ to school every day.',
        promptZh: null,
        choices: ['goes', 'go'],
        answer: 'A',
        acceptedAnswers: null,
        grammarItem: 'tenses-simple',
        languageSkill: 'reading',
        difficulty: 'core',
        gradeLevel: 'S4',
        provenance: 'ai-generated',
      }],
    ]));

    const identity = (await resolveMistakeSkillIdentities(['gq-1'])).get('gq-1');

    expect(identity).toMatchObject({
      grammarItem: 'tenses-simple',
      questionType: 'mc',
      languageSkill: 'reading',
      skillSource: 'canonical',
    });
  });

  it('無法解析的題目不會出現在結果中（不重建、不推測）', async () => {
    const resolved = await resolveMistakeSkillIdentities(['ai-1750000000000-0']);
    expect(resolved.size).toBe(0);
  });

  it('重複 id 只查一次', async () => {
    await resolveMistakeSkillIdentities(['q1', 'q1', 'q1']);
    expect(mocks.resolveReadingQuestionDefinitions).toHaveBeenCalledWith(['q1']);
  });

  it('忽略空字串 id', async () => {
    await resolveMistakeSkillIdentities(['', 'q1']);
    expect(mocks.resolveReadingQuestionDefinitions).toHaveBeenCalledWith(['q1']);
  });
});

describe('identityFromReadingDefinition / identityFromGrammarDefinition', () => {
  it('閱讀定義缺 dseType 時退回 questionType', () => {
    const identity = identityFromReadingDefinition({
      id: 'rq-2', questionType: 'shortAnswer', dseType: null,
      questionText: 'Explain.', choices: null, answer: 'x', marks: 1, orderIndex: 0,
    });
    expect(identity.questionType).toBe('shortAnswer');
  });

  it('文法定義的未知 languageSkill 不會被當成技能寫入', () => {
    const identity = identityFromGrammarDefinition({
      id: 'gq-2', questionType: 'mc', prompt: 'p', promptZh: null, choices: null,
      answer: 'A', acceptedAnswers: null, grammarItem: 'articles',
      languageSkill: 'not-a-skill', difficulty: 'core', gradeLevel: 'S4', provenance: 'ai-generated',
    });
    expect(identity.languageSkill).toBeNull();
    expect(identity.grammarItem).toBe('articles');
  });
});

describe('resolveMistakeQuestionContexts — 錯題語境（選項／題型／解說）', () => {
  it('閱讀題目 → 帶回選項與題型（篇章不儲存，不推測）', async () => {
    mocks.resolveReadingQuestionDefinitions.mockResolvedValue(new Map([
      ['rq-1', {
        id: 'rq-1',
        questionType: 'mcq',
        dseType: 'vocabulary_in_context',
        questionText: "What does the word 'curiosity' in the last sentence mean?",
        choices: ['Being eager to know', 'Being afraid', 'Feeling bored', 'Being tired'],
        answer: 'A',
        marks: 1,
        orderIndex: 0,
      }],
    ]));

    const context = (await resolveMistakeQuestionContexts(['rq-1'])).get('rq-1');

    expect(context).toMatchObject({
      canonical: true,
      questionType: 'vocabulary_in_context',
      choices: ['Being eager to know', 'Being afraid', 'Feeling bored', 'Being tired'],
      explanationZh: null,
      explanationEn: null,
    });
  });

  it('文法題目 → 帶回解說（作答後才揭示）', async () => {
    mocks.resolveGrammarQuestionDefinitions.mockResolvedValue(new Map([
      ['gq-1', {
        id: 'gq-1',
        questionType: 'mc',
        prompt: 'She ____ to school every day.',
        promptZh: null,
        choices: ['goes', 'go'],
        answer: 'A',
        acceptedAnswers: null,
        grammarItem: 'tenses-simple',
        languageSkill: null,
        difficulty: 'core',
        gradeLevel: 'S4',
        provenance: 'ai-generated',
      }],
    ]));
    mocks.resolveGrammarQuestionExplanationsMany.mockResolvedValue(new Map([
      ['gq-1', { explanationZh: '第三人稱單數加 -s。', explanationEn: 'Third person singular takes -s.' }],
    ]));

    const context = (await resolveMistakeQuestionContexts(['gq-1'])).get('gq-1');

    expect(context).toMatchObject({
      canonical: true,
      questionType: 'mc',
      choices: ['goes', 'go'],
      explanationZh: '第三人稱單數加 -s。',
      explanationEn: 'Third person singular takes -s.',
    });
    // 只查文法 id 的解說，閱讀 id 不會被查
    expect(mocks.resolveGrammarQuestionExplanationsMany).toHaveBeenCalledWith(['gq-1']);
  });

  it('無法解析的舊題目 → 不在結果中（canonical 只能由正典定義證明）', async () => {
    const contexts = await resolveMistakeQuestionContexts(['rd-legacy-1']);
    expect(contexts.size).toBe(0);
    expect(mocks.resolveGrammarQuestionExplanationsMany).toHaveBeenCalledWith([]);
  });

  it('空 id 清單 → 不查詢題庫', async () => {
    const contexts = await resolveMistakeQuestionContexts(['', '']);
    expect(contexts.size).toBe(0);
    expect(mocks.resolveReadingQuestionDefinitions).not.toHaveBeenCalled();
  });

  it('重複 id 只查一次', async () => {
    await resolveMistakeQuestionContexts(['rq-1', 'rq-1']);
    expect(mocks.resolveReadingQuestionDefinitions).toHaveBeenCalledWith(['rq-1']);
  });
});

describe('sanitizeClientSkillClaims — 白名單', () => {
  it('合法技能與題型保留', () => {
    expect(sanitizeClientSkillClaims({ languageSkill: 'reading', questionType: 'inference' }))
      .toEqual({ languageSkill: 'reading', questionType: 'inference' });
  });

  it('未知技能丟棄', () => {
    expect(sanitizeClientSkillClaims({ languageSkill: 'admin' }).languageSkill).toBeNull();
  });

  it('聆聽題型在白名單內（無伺服器題目庫，只能自報）', () => {
    expect(sanitizeClientSkillClaims({ languageSkill: 'listening', questionType: 'detail' }))
      .toEqual({ languageSkill: 'listening', questionType: 'detail' });
  });

  it('未知題型丟棄（防止自由文字寫入）', () => {
    expect(sanitizeClientSkillClaims({ questionType: 'DROP TABLE' }).questionType).toBeNull();
  });

  it('非字串輸入丟棄', () => {
    expect(sanitizeClientSkillClaims({ languageSkill: 42, questionType: {} }))
      .toEqual({ languageSkill: null, questionType: null });
  });

  // 交叉驗證：聆聽策略卡的每個題型都必須能通過自報白名單，否則
  // 由 AI 即時生成的聆聽錯題永遠拿不到策略卡。
  it('每個聆聽策略卡題型都在自報白名單內', () => {
    for (const type of ['detail', 'gist', 'inference']) {
      expect(sanitizeClientSkillClaims({ questionType: type }).questionType).toBe(type);
      expect(getStrategyCard({ languageSkill: 'listening', questionType: type })?.key).toBe(`listening.${type}`);
    }
  });
});

describe('sanitizeQuestionSummary — 顯示用摘要', () => {
  it('去除前後空白', () => {
    expect(sanitizeQuestionSummary('  What is the main idea?  ')).toBe('What is the main idea?');
  });

  it('空字串 → null', () => {
    expect(sanitizeQuestionSummary('   ')).toBeNull();
  });

  it('非字串 → null', () => {
    expect(sanitizeQuestionSummary({ text: 'x' })).toBeNull();
  });

  it('超長摘要被截短', () => {
    const summary = sanitizeQuestionSummary('a'.repeat(500));
    expect(summary).toHaveLength(200);
  });
});
