// ============================================
// R3.10-D.1: Grammar semantic authority security tests
// Proves the server owns BOTH grammar question identity and the
// answer-key provenance:
//   a. forged correctAnswer cannot change correctness
//   b. unknown grammar questionId is rejected (NOT_PROJECTABLE)
//   c. forged choices cannot redefine the key
//   d. complete client tampering chain fails
//   e. server-resolved grammar question produces trusted evidence
//   f. client correctness fields remain ignored
//   g. generated grammar question persists before delivery
//   h. returned question ID resolves to the same server definition
// ============================================
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  persistGeneratedGrammarQuestions,
  resolveGrammarQuestionDefinitions,
} from '../services/grammar-question-service';
import { validateGrammarAnswersWithServerKeys } from '../services/practice-answer-validation';
import { evaluatePracticeEvidence } from '../services/practice-evidence-service';
import {
  classifyPracticeSubmission,
  isServerAuthoritativeSubmission,
  shouldUpdateMastery,
} from '../services/practice-submission-classification';

const { mockCreateMany, mockFindMany, stored } = vi.hoisted(() => {
  const stored: Array<Record<string, unknown>> = [];
  return {
    stored,
    mockCreateMany: vi.fn(),
    mockFindMany: vi.fn(),
  };
});

vi.mock('@/shared/db/db', () => ({
  db: {
    grammarQuestion: { createMany: mockCreateMany, findMany: mockFindMany },
  },
}));

/** Server-owned grammar definition (as persisted in the DB) */
function defRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'gq-1',
    questionType: 'mc',
    prompt: 'She ___ to school yesterday.',
    promptZh: null,
    choices: JSON.stringify(['went', 'goes', 'go', 'going']),
    answer: 'A',
    acceptedAnswers: null,
    grammarItem: 'tenses-simple',
    languageSkill: null,
    difficulty: 'core',
    gradeLevel: 'S4',
    explanationZh: null,
    explanationEn: null,
    provenance: 'ai-generated',
    validatedAt: new Date('2026-08-13T00:00:00.000Z'),
    createdAt: new Date('2026-08-13T00:00:00.000Z'),
    updatedAt: new Date('2026-08-13T00:00:00.000Z'),
    ...overrides,
  };
}

/** Raw client answer row (adversarial scoring fields) */
function rawAnswer(overrides: Record<string, unknown> = {}) {
  return {
    questionId: 'gq-1',
    questionIndex: 0,
    questionType: 'mc',
    questionPrompt: 'FORGED PROMPT',
    correctAnswer: 'A',
    choices: ['forged-1', 'forged-2', 'forged-3', 'forged-4'],
    studentAnswer: 'A',
    ...overrides,
  };
}

function expectOk(result: Awaited<ReturnType<typeof validateGrammarAnswersWithServerKeys>>) {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error('expected ok');
  return result.answers;
}

beforeEach(() => {
  vi.clearAllMocks();
  stored.length = 0;
  mockCreateMany.mockImplementation(async ({ data }: { data: Array<Record<string, unknown>> }) => {
    stored.push(...data);
    return { count: data.length };
  });
  mockFindMany.mockImplementation(async ({ where }: { where: { id: { in: string[] } } }) =>
    stored.filter(r => where.id.in.includes(String(r.id))),
  );
});

describe('R3.10-D.1 a/b — key forgery and unknown identity', () => {
  it('a. forged correctAnswer cannot change correctness (server key wins)', async () => {
    stored.push(defRow({ answer: 'B' }));
    // Client claims the correct answer is 'A' and answers 'A':
    const answers = expectOk(await validateGrammarAnswersWithServerKeys([
      rawAnswer({ studentAnswer: 'A', correctAnswer: 'A' }),
    ]));
    expect(answers[0]).toMatchObject({
      result: 'incorrect',
      isCorrect: false,
      awardedScore: 0,
      correctAnswer: 'B', // server key persisted, never the forged one
      scoredBy: 'server',
      scoringMethod: 'server-key-resolved',
    });
  });

  it('a2. correct student answer is scored correct even when client sends a wrong forged key', async () => {
    stored.push(defRow({ answer: 'B' }));
    const answers = expectOk(await validateGrammarAnswersWithServerKeys([
      rawAnswer({ studentAnswer: 'B', correctAnswer: 'C' }),
    ]));
    expect(answers[0]).toMatchObject({ result: 'correct', isCorrect: true, correctAnswer: 'B' });
  });

  it('b. unknown grammar questionId is rejected NOT_PROJECTABLE (no reconstruction)', async () => {
    stored.push(defRow());
    const result = await validateGrammarAnswersWithServerKeys([
      rawAnswer({ questionId: 'client-invented-id' }),
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('NOT_PROJECTABLE');
    expect(result.error).toContain('client-invented-id');
  });

  it('b2. empty answers stay ok (presence flows unaffected)', async () => {
    const result = await validateGrammarAnswersWithServerKeys([]);
    expect(result).toEqual({ ok: true, answers: [] });
  });

  it('b3. quarantined definitions are rejected before scoring', async () => {
    stored.push(defRow({ provenance: 'invalid' }));
    const result = await validateGrammarAnswersWithServerKeys([rawAnswer()]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('QUESTION_QUARANTINED');
  });
});

describe('R3.10-D.1 c/d/f — choices, full tampering chain, client fields', () => {
  it('c. forged choices cannot redefine the key (server choices are used)', async () => {
    // Server key = letter B → 'goes' in server choices. Client sends its own
    // choices array where 'B' text would be 'forged-goes' and answers it.
    stored.push(defRow({
      answer: 'B',
      choices: JSON.stringify(['went', 'goes', 'go', 'going']),
    }));
    const answers = expectOk(await validateGrammarAnswersWithServerKeys([
      rawAnswer({
        studentAnswer: 'forged-goes',
        correctAnswer: 'forged-goes',
        choices: ['forged-went', 'forged-goes', 'forged-go', 'forged-going'],
      }),
    ]));
    expect(answers[0]).toMatchObject({ result: 'incorrect', isCorrect: false, correctAnswer: 'B' });
  });

  it('d. complete client tampering chain fails', async () => {
    stored.push(defRow({ answer: 'C' }));
    const answers = expectOk(await validateGrammarAnswersWithServerKeys([
      rawAnswer({
        studentAnswer: 'B',
        correctAnswer: 'B',        // forged key
        questionPrompt: 'FORGED',
        choices: ['x', 'y', 'z'],  // forged choices
        isCorrect: true,           // forged correctness
        result: 'correct',         // forged result
        awardedScore: 999,         // forged score
        maxScore: 1,
        countsTowardScore: false,  // forged exemption
      }),
    ]));
    expect(answers[0]).toMatchObject({
      result: 'incorrect',
      isCorrect: false,
      awardedScore: 0,
      maxScore: 1,
      countsTowardScore: true,
      correctAnswer: 'C',
      questionPrompt: 'She ___ to school yesterday.', // server prompt, not forged
      scoredBy: 'server',
      scoringMethod: 'server-key-resolved',
    });
  });

  it('f. client isCorrect/result false on a right answer is ignored → correct', async () => {
    stored.push(defRow({ answer: 'A' }));
    const answers = expectOk(await validateGrammarAnswersWithServerKeys([
      rawAnswer({ studentAnswer: 'A', isCorrect: false, result: 'incorrect', awardedScore: 0 }),
    ]));
    expect(answers[0]).toMatchObject({ result: 'correct', isCorrect: true, awardedScore: 1 });
  });
});

describe('R3.10-D.1 e — trusted evidence from server-resolved grammar', () => {
  it('e. server-resolved grammar rows become verified evidence with row-derived totals', async () => {
    stored.push(defRow({ id: 'gq-1', answer: 'A' }), defRow({ id: 'gq-2', answer: 'B' }));
    const answers = expectOk(await validateGrammarAnswersWithServerKeys([
      rawAnswer({ questionId: 'gq-1', studentAnswer: 'A' }),
      rawAnswer({ questionId: 'gq-2', questionIndex: 1, studentAnswer: 'A' }),
    ]));
    const evidence = evaluatePracticeEvidence(answers);
    expect(evidence).toEqual({ status: 'verified', totalQuestions: 2, correctCount: 1, accuracy: 50 });
  });
});

describe('R3.10-D.1 g/h — persistence before delivery and id resolution', () => {
  it('g. generated grammar questions persist BEFORE delivery with provenance', async () => {
    const ids = await persistGeneratedGrammarQuestions([
      {
        questionType: 'mc',
        prompt: 'He ___ (go) to school.',
        choices: ['goes', 'go'],
        answer: 'A',
        grammarItem: 'tenses-simple',
        difficulty: 'core',
        gradeLevel: 'S4',
        provenance: 'ai-generated',
      },
    ]);
    expect(ids).toHaveLength(1);
    expect(mockCreateMany).toHaveBeenCalledTimes(1);
    const data = mockCreateMany.mock.calls[0][0].data as Array<Record<string, unknown>>;
    expect(data[0].id).toBe(ids[0]);
    expect(data[0].answer).toBe('A');
    expect(data[0].provenance).toBe('ai-generated');
    expect(data[0].validatedAt).toBeInstanceOf(Date);
  });

  it('h. returned question ID resolves to the same server definition', async () => {
    const ids = await persistGeneratedGrammarQuestions([
      {
        questionType: 'fill-blank',
        prompt: 'They ___ playing now.',
        choices: null,
        answer: 'are',
        acceptedAnswers: ['were'],
        grammarItem: 'tenses-simple',
        difficulty: 'core',
        gradeLevel: 'S4',
      },
    ]);
    const defs = await resolveGrammarQuestionDefinitions(ids);
    const def = defs.get(ids[0]);
    expect(def).toBeDefined();
    expect(def?.answer).toBe('are');
    expect(def?.acceptedAnswers).toEqual(['were']);
    expect(def?.prompt).toBe('They ___ playing now.');
    expect(def?.id).toBe(ids[0]);
  });

  it('h2. unknown id is absent from resolution map (caller must reject)', async () => {
    const ids = await persistGeneratedGrammarQuestions([
      {
        questionType: 'mc', prompt: 'P', choices: ['A', 'B'], answer: 'A',
        grammarItem: 'tenses-simple', difficulty: 'core', gradeLevel: 'S4',
      },
    ]);
    const defs = await resolveGrammarQuestionDefinitions([...ids, 'nope']);
    expect(defs.has('nope')).toBe(false);
    expect(defs.has(ids[0])).toBe(true);
  });
});

describe('R3.10-D.1 route plumbing contracts', () => {
  const root = resolve(import.meta.dirname, '../../../..');

  it('practice submission service resolves grammar questionIds against the server store', () => {
    const svc = readFileSync(resolve(root, 'src/modules/exercise/services/practice-submission-service.ts'), 'utf-8');
    expect(svc).toContain('validateGrammarAnswersWithServerKeys(answers)');
    expect(svc).toContain('classifyPracticeSubmission({ source, skill, answers })');
    expect(svc).toContain("} else if (submissionClass === 'grammar') {");
    // client-key legacy path is NOT used for grammar:
    expect(svc).toContain('const answerValidation = validatePracticeAnswers(answers);');
  });

  it('generate-questions persists grammar questions BEFORE delivery with server ids', () => {
    const route = readFileSync(resolve(root, 'src/app/api/ai/generate-questions/route.ts'), 'utf-8');
    expect(route).toContain('persistGeneratedGrammarQuestions(');
    expect(route).toContain('id: ids[i]');
    expect(route).toContain('文法題目伺服器持久化失敗');
  });

  it('generate-questions persists listening MCs before delivery and refuses undeliverable ones (ADR-045)', () => {
    const route = readFileSync(resolve(root, 'src/app/api/ai/generate-questions/route.ts'), 'utf-8');
    expect(route).toContain('persistGeneratedListeningQuestions(');
    expect(route).toContain('isDeliverableListeningMc');
    expect(route).toContain('LISTENING_QUESTIONS_NOT_DELIVERABLE');
    // 全數不可交付 → 結構化 422（可重試），不得交付沒有答案依據的題目
    expect(route).toMatch(/status:\s*422/);
  });

  it('Prisma schema contains the server-owned ListeningQuestion store (and no dormant listening tables)', () => {
    const schema = readFileSync(resolve(root, 'prisma/schema.prisma'), 'utf-8');
    expect(schema).toContain('model ListeningQuestion');
    expect(schema).toContain('dialogue');
    expect(schema).not.toContain('model ListeningSession');
    expect(schema).not.toContain('model ListeningAnswer');
  });

  it('client uses the server-assigned id and never derives authority from Date.now()', () => {
    const page = readFileSync(resolve(root, 'src/app/student/practice/page.tsx'), 'utf-8');
    expect(page).toContain("typeof q.id === 'string' && q.id.length > 0 ? q.id :");
    expect(page).toContain('絕不從 Date.now()');
  });

  it('evidence service gates on server key authority (scoringMethod provenance)', () => {
    const svc = readFileSync(resolve(root, 'src/modules/exercise/services/practice-evidence-service.ts'), 'utf-8');
    expect(svc).toContain("reason: 'unverified-key-authority'");
    // 2026-09-25：權威配對改為**單一定義**（practice-evidence-rules.ts），
    // service 必須引用而非自行複製 —— 否則 SQL 聚合與 TS 判定會各自漂移。
    expect(svc).toContain('PRACTICE_EVIDENCE_RULES.serverKeyAuthoritative');
    expect(svc).not.toContain("'server-key-resolved'");

    const rules = readFileSync(resolve(root, 'src/modules/exercise/services/practice-evidence-rules.ts'), 'utf-8');
    expect(rules).toContain("'server-key-resolved'");
    expect(rules).toContain("'reading-server-exact-match'");
    expect(rules).toContain("'reading-ai-semantic-evaluation'");
    expect(rules).toContain("'listening-server-exact-match'");
  });

  it('SQL evidence aggregate is generated from the same rules (無手寫複製的 literals)', () => {
    const repo = readFileSync(resolve(root, 'src/modules/exercise/repositories/practice-repo.ts'), 'utf-8');
    expect(repo).toContain("from '../services/practice-evidence-rules'");
    expect(repo).toContain('PRACTICE_EVIDENCE_RULES.serverKeyAuthoritative');
    expect(repo).toContain('PRACTICE_EVIDENCE_RULES.supportedAuthorities');
    expect(repo).toContain('PRACTICE_EVIDENCE_RULES.validResults');
    // 任一 literals 出現在 SQL 檔即代表規則被複製 → 兩套口徑
    expect(repo).not.toContain("'server-key-resolved'");
    expect(repo).not.toContain("'listening-server-exact-match'");
    expect(repo).not.toContain("'ungradable'");
  });

  it('Prisma schema contains the GrammarQuestion store', () => {
    const schema = readFileSync(resolve(root, 'prisma/schema.prisma'), 'utf-8');
    expect(schema).toContain('model GrammarQuestion');
    expect(schema).toContain('acceptedAnswers String?');
    expect(schema).toContain('provenance');
  });
});

describe('R3.10-D.1 A/B — practice submission classification contract', () => {
  it('A. every production skill value classifies correctly (incl. integrated-skills)', () => {
    // grammar (canonical GrammarItem keys)
    for (const skill of ['tenses', 'conditionals', 'passive-voice', 'relative-clauses', 'phrasal-verbs']) {
      expect(classifyPracticeSubmission({ skill })).toBe('grammar');
    }
    // knowledge-graph grammar sub-ids (legacy re-practice)
    expect(classifyPracticeSubmission({ skill: 'tenses-simple' })).toBe('grammar');
    // compat buckets
    expect(classifyPracticeSubmission({ skill: 'grammar' })).toBe('grammar');
    expect(classifyPracticeSubmission({ skill: 'general' })).toBe('grammar');
    // legacy language skills — integrated-skills must NOT fall through:
    // （listening 在**無標記**時仍為 legacy，見 ADR-045 的歷史相容條款）
    for (const skill of ['reading', 'listening', 'writing', 'speaking', 'integrated', 'integrated-skills', 'vocabulary']) {
      expect(classifyPracticeSubmission({ skill })).toBe('legacy-language-skill');
    }
    // reading markers take precedence over skill:
    expect(classifyPracticeSubmission({ source: 'dse-reading', skill: 'reading' })).toBe('reading');
    expect(classifyPracticeSubmission({ skill: 'tenses', answers: [{ dseType: 'multiple_choice' }] })).toBe('reading');
    expect(classifyPracticeSubmission({ skill: 'reading', answers: [{ dseType: 'mc' }] })).toBe('reading');
    // 2026-09-21 ADR-045：listening 有伺服器題庫 → dse-listening / listeningType
    // 標記時進入 listening 權威（無標記的舊資料仍為 legacy）
    expect(classifyPracticeSubmission({ source: 'dse-listening', skill: 'listening' })).toBe('listening');
    expect(classifyPracticeSubmission({ skill: 'listening', answers: [{ listeningType: 'detail' }] })).toBe('listening');
    expect(classifyPracticeSubmission({ skill: 'tenses', answers: [{ listeningType: 'gist' }] })).toBe('listening');
  });

  it('A2. reading marker wins over a listening marker (order is fixed, never ambiguous)', () => {
    expect(classifyPracticeSubmission({
      source: 'dse-reading',
      skill: 'listening',
      answers: [{ listeningType: 'detail' }],
    })).toBe('reading');
  });

  it('A3. listening is a server-authoritative class (evidence + mastery eligible)', () => {
    expect(isServerAuthoritativeSubmission('listening')).toBe(true);
    expect(shouldUpdateMastery('listening', 3)).toBe(true);
    expect(shouldUpdateMastery('listening', 0)).toBe(false);
    expect(isServerAuthoritativeSubmission('legacy-language-skill')).toBe(false);
  });

  it('B. unknown skill values NEVER enter the grammar authority path', () => {
    expect(classifyPracticeSubmission({ skill: 'totally-unknown-skill' })).toBe('unknown');
    expect(classifyPracticeSubmission({ skill: 'integrated-skills-extra' })).toBe('unknown');
    expect(classifyPracticeSubmission({ skill: '' })).toBe('unknown');
    expect(classifyPracticeSubmission({ skill: undefined })).toBe('unknown');
    expect(classifyPracticeSubmission({})).toBe('unknown');
    expect(classifyPracticeSubmission({ skill: '  ' })).toBe('unknown');
  });
});

describe('R3.10-D.1 C/D/I — D9 mastery aggregation boundary', () => {
  it('C. legacy client-key path is never mastery-authoritative', () => {
    expect(isServerAuthoritativeSubmission('legacy-language-skill')).toBe(false);
    expect(isServerAuthoritativeSubmission('unknown')).toBe(false);
    expect(shouldUpdateMastery('legacy-language-skill', 3)).toBe(false);
    expect(shouldUpdateMastery('unknown', 3)).toBe(false);
  });

  it('D. server-key grammar and reading paths may update mastery with server-derived totals', () => {
    expect(isServerAuthoritativeSubmission('grammar')).toBe(true);
    expect(isServerAuthoritativeSubmission('reading')).toBe(true);
    expect(shouldUpdateMastery('grammar', 3)).toBe(true);
    expect(shouldUpdateMastery('reading', 2)).toBe(true);
    // zero totals (presence) never update mastery even on authoritative paths:
    expect(shouldUpdateMastery('grammar', 0)).toBe(false);
    expect(shouldUpdateMastery('reading', 0)).toBe(false);
  });

  it('I. practice submission service enforces the D9 boundary (contract)', () => {
    const root = resolve(import.meta.dirname, '../../../..');
    const svc = readFileSync(resolve(root, 'src/modules/exercise/services/practice-submission-service.ts'), 'utf-8');
    expect(svc).toContain('classifyPracticeSubmission({ source, skill, answers })');
    expect(svc).toContain("if (submissionClass === 'unknown')");
    expect(svc).toContain('shouldUpdateMastery(submissionClass, aggregates.totalQuestions)');
    // unknown skill is loudly rejected:
    expect(svc).toContain('不支援的 skill');
  });
});

describe('R3.10-D.1 E/F/G — diagnostic grammar persistence boundary', () => {
  it('E. diagnostic/grammar persists questions before response (contract)', () => {
    const route = readFileSync(resolve(import.meta.dirname, '../../../../src/app/api/diagnostic/grammar/route.ts'), 'utf-8');
    expect(route).toContain('persistGeneratedGrammarQuestions(');
    expect(route).toContain('questions: questionsWithIds');
    expect(route).toContain('id: ids[i]');
    // it must NOT return raw unpersisted questions:
    expect(route).not.toContain('questions,\n    });');
  });

  it('F. persistence failure prevents question delivery (service rejects)', async () => {
    mockCreateMany.mockRejectedValueOnce(new Error('db down'));
    await expect(persistGeneratedGrammarQuestions([
      {
        questionType: 'mc', prompt: 'P', choices: ['A', 'B'], answer: 'A',
        grammarItem: 'tenses', difficulty: 'core', gradeLevel: 'S4',
      },
    ])).rejects.toThrow('db down');
  });

  it('G. every delivered diagnostic grammar question id is server-resolvable', async () => {
    const ids = await persistGeneratedGrammarQuestions([
      { questionType: 'mc', prompt: 'Q1', choices: ['A', 'B'], answer: 'A', grammarItem: 'tenses', difficulty: 'core', gradeLevel: 'S4' },
      { questionType: 'mc', prompt: 'Q2', choices: ['A', 'B'], answer: 'B', grammarItem: 'tenses', difficulty: 'core', gradeLevel: 'S4' },
    ]);
    const defs = await resolveGrammarQuestionDefinitions(ids);
    expect(defs.size).toBe(2);
    for (const id of ids) expect(defs.has(id)).toBe(true);
  });
});

describe('R3.10-D.1 H — legacy rows remain unverified', () => {
  it('H. client-key-deterministic rows never become verified evidence', () => {
    const ev = evaluatePracticeEvidence([{
      questionId: 'gq-1',
      result: 'correct',
      awardedScore: 1,
      maxScore: 1,
      countsTowardScore: true,
      scoredBy: 'server',
      scoringMethod: 'client-key-deterministic',
    }]);
    expect(ev).toEqual({ status: 'unverifiable', reason: 'unverified-key-authority' });
  });
});
// ============================================
// 2026-09-15: open-ended (writing) questions are NOT auto-gradable
// ============================================
// The stored answer of a short-writing question is a SAMPLE, not a key.
// Scoring it with the deterministic comparator would mark every essay wrong
// (student report) and fabricate mistakes + mastery evidence.
describe('Open-ended grammar definitions are classified, never graded', () => {
  const sampleAnswer =
    'Small shops are more than places to buy things. They are where neighbours know your name...';

  function shortWritingDef(overrides: Record<string, unknown> = {}) {
    return defRow({
      questionType: 'short-writing',
      prompt: 'Write a 120-150 word article about your neighbourhood.',
      choices: null,
      answer: sampleAnswer,
      grammarItem: 'writing-article',
      languageSkill: 'writing',
      ...overrides,
    });
  }

  it('server classifies the row as ungradable (excluded, never incorrect)', async () => {
    stored.push(shortWritingDef());
    const answers = expectOk(await validateGrammarAnswersWithServerKeys([
      rawAnswer({
        questionType: 'short-writing',
        studentAnswer: 'Walking down our neighbourhood streets, the familiar sights are fading...',
        correctAnswer: 'FORGED KEY',
      }),
    ]));

    expect(answers[0]).toMatchObject({
      result: 'ungradable',
      countsTowardScore: false,
      awardedScore: 0,
      maxScore: 1,
      isCorrect: false,          // not wrong — simply not machine-gradable
      correctAnswer: sampleAnswer, // server-owned sample answer, never the forged key
      scoredBy: 'server',
      scoringMethod: 'server-key-resolved',
    });
  });

  it('a writing-only session yields no scored evidence (never 0/1)', async () => {
    stored.push(shortWritingDef());
    const answers = expectOk(await validateGrammarAnswersWithServerKeys([
      rawAnswer({ questionType: 'short-writing', studentAnswer: 'My article...' }),
    ]));
    expect(evaluatePracticeEvidence(answers)).toEqual({ status: 'unverifiable', reason: 'no-counted-items' });
  });

  it('mixed session: the writing row is excluded, the MC row still counts', async () => {
    stored.push(defRow({ id: 'gq-mc', questionType: 'mc', answer: 'A' }));
    stored.push(shortWritingDef({ id: 'gq-w' }));

    const answers = expectOk(await validateGrammarAnswersWithServerKeys([
      rawAnswer({ questionId: 'gq-mc', questionIndex: 0, questionType: 'mc', studentAnswer: 'A' }),
      rawAnswer({ questionId: 'gq-w', questionIndex: 1, questionType: 'short-writing', studentAnswer: 'My article...' }),
    ]));

    const aggregates = evaluatePracticeEvidence(answers);
    expect(aggregates).toMatchObject({ status: 'verified', totalQuestions: 1, correctCount: 1, accuracy: 100 });
  });
});