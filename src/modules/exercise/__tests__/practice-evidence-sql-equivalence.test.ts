// ============================================
// SQL 證據聚合等價性測試（對抗性 fixtures）
// ============================================
// 目的：在拆除舊的 mock 測試（它們的斷言會被空洞化）**之前**，先建立替代保證。
//
// 被驗證的對象：`practice-repo.buildVerifiedTotalsSql()` 產生的 SQL，其場次層級
// 判定必須與正典 `evaluatePracticeEvidence()` **完全一致**。
// 期望值不由人手撰寫 —— 一律由正典 `aggregateStudentPracticeTotals()` 即時算出，
// 因此本測試斷言的是「SQL 與正典同源」而不是「SQL 等於某個手抄數字」。
//
// ⚠️ 安全設計（結構性，不是自律）：
//   1. **閘門**：僅在 `DATABASE_URL` 指向 localhost/127.0.0.1（CI 的拋棄式
//      Postgres）或明確設定 `EVIDENCE_SQL_TEST=1` 時執行。預設跳過，
//      因此本機即使匯出了 Neon 的 URL 也不會誤觸。
//   2. **永不落地**：所有 fixture 寫入與查詢都在**同一個 Prisma 互動交易**內
//      完成，最後以 sentinel 錯誤強制 rollback。任何斷言失敗亦會自動 rollback。
//      ⇒ 即使在 opt-in 情況下指向真實資料庫，也不可能留下任何資料列。
//   3. 這也解釋了為何要匯出 `buildVerifiedTotalsSql`：必須用**完全相同**的
//      SQL 文字在交易連線內執行（全域 `db` 是另一條連線，看不到未提交的資料）。
//
// 用法：
//   CI（DATABASE_URL=localhost）        → 自動執行
//   npx vitest run <本檔>                → 本機預設跳過
//   $env:EVIDENCE_SQL_TEST=1; npx vitest run <本檔>   → 對任意 DB 執行（仍會回滾）
// ============================================

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';

const DB_URL = process.env.DATABASE_URL ?? '';
const IS_DISPOSABLE_HOST = /(?:^|@|\/\/)(?:localhost|127\.0\.0\.1)(?::|\/|$)/.test(DB_URL);
const OPTED_IN = process.env.EVIDENCE_SQL_TEST === '1';
const ENABLED = Boolean(DB_URL) && (IS_DISPOSABLE_HOST || OPTED_IN);

type DbClient = typeof import('@/shared/db/db')['db'];
type BuildSql = typeof import('../repositories/practice-repo')['buildVerifiedTotalsSql'];
type AggregateTotals = typeof import('../services/practice-evidence-service')['aggregateStudentPracticeTotals'];

/** 已驗證（伺服器答案鍵）基準列 */
const VALID = {
  // 必須有 questionId：`evaluatePracticeEvidence()` 對缺漏者回
  // `missing-question-id`（本測試初版正是漏了此欄而被自己的 fixture 揪出）
  questionId: 'q0',
  result: 'correct',
  awardedScore: 1,
  maxScore: 1,
  countsTowardScore: true,
  scoredBy: 'server',
  scoringMethod: 'server-key-resolved',
};

interface EvidenceCase {
  name: string;
  /** 以 `evaluatePracticeEvidence()` 的輸入形狀描述（未指定 questionId 時自動配發） */
  answers: Array<Record<string, unknown>>;
  /** 場次聚合值 —— 刻意可與實際列數不符，用來證明 recorded 不冒充 verified */
  totalQuestions?: number;
  correctCount?: number;
  /** 是否需要 `evaluatePracticeEvidence` 判為 verified（僅作可讀性斷言） */
  expectVerified: boolean;
  /** Prisma 無法寫入的特殊浮點值（改以 raw UPDATE 注入） */
  specialFloat?: { value: 'Infinity' | '-Infinity' | 'NaN' };
}

const CASES: EvidenceCase[] = [
  // ---- 不可驗證（-1 類）----
  { name: '零答案場次', answers: [], totalQuestions: 5, correctCount: 5, expectVerified: false },
  { name: 'questionId 為 null', answers: [{ ...VALID, questionId: null }], expectVerified: false },
  { name: 'questionId 為空白', answers: [{ ...VALID, questionId: '   ' }], expectVerified: false },
  { name: 'result 不合法', answers: [{ ...VALID, result: 'maybe' }], expectVerified: false },
  { name: 'authority 不支援（client）', answers: [{ ...VALID, scoredBy: 'client' }], expectVerified: false },
  { name: 'legacy 客戶端答案鍵 method', answers: [{ ...VALID, scoringMethod: 'deterministic-answer-comparison' }], expectVerified: false },
  { name: 'scoringMethod 為 null', answers: [{ ...VALID, scoringMethod: null }], expectVerified: false },
  { name: 'counted 列 awardedScore 為 null', answers: [{ ...VALID, awardedScore: null }], expectVerified: false },
  { name: 'maxScore 為 0', answers: [{ ...VALID, maxScore: 0 }], expectVerified: false },
  { name: 'maxScore 為負', answers: [{ ...VALID, maxScore: -1 }], expectVerified: false },
  { name: 'awardedScore > maxScore', answers: [{ ...VALID, awardedScore: 2, maxScore: 1 }], expectVerified: false },
  { name: 'awardedScore 為負', answers: [{ ...VALID, awardedScore: -1 }], expectVerified: false },
  { name: '全部 countsTowardScore=false（no-counted-items）', answers: [{ ...VALID, countsTowardScore: false }], expectVerified: false },

  // ---- 已驗證（1 類）----
  { name: '單一已驗證列', answers: [{ ...VALID }], totalQuestions: 1, correctCount: 1, expectVerified: true },
  { name: '已驗證：對 + 錯', answers: [{ ...VALID }, { ...VALID, questionId: 'q2', result: 'incorrect', awardedScore: 0 }], totalQuestions: 2, correctCount: 1, expectVerified: true },
  { name: 'countsTowardScore 為 null 視為 counted', answers: [{ ...VALID, countsTowardScore: null }], expectVerified: true },
  { name: 'partial / ungradable 仍為合法 result', answers: [{ ...VALID, result: 'partial', awardedScore: 0.5 }, { ...VALID, questionId: 'q2', result: 'ungradable', awardedScore: 0 }], expectVerified: true },
  { name: '多列中 answer key authority 為 listening', answers: [{ ...VALID, scoringMethod: 'listening-server-exact-match' }], expectVerified: true },

  // ---- 關鍵陷阱 ----
  {
    // TS 在 `countsTowardScore === false` 時 `continue`，**先跳過再看分數** ——
    // 所以被跳過的列其分數不合法**不構成**致命錯誤。單純的逐列 WHERE 會判錯。
    name: '陷阱：被跳過的列分數不合法，不得視為致命',
    answers: [
      { ...VALID, countsTowardScore: false, awardedScore: null, maxScore: null },
      { ...VALID, questionId: 'q2' },
    ],
    expectVerified: true,
  },
  {
    // 場次層級 all-or-nothing：一列 legacy 就令整個場次不可驗證。
    name: '陷阱：同一場次內 valid + legacy ⇒ 整場不可驗證',
    answers: [
      { ...VALID },
      { ...VALID, questionId: 'q2', scoringMethod: 'client-key-deterministic' },
    ],
    expectVerified: false,
  },
  {
    name: '陷阱：偽造場次聚合值不得冒充 verified',
    answers: [{ ...VALID }, { ...VALID, questionId: 'q2', result: 'incorrect', awardedScore: 0 }],
    totalQuestions: 999,
    correctCount: 999,
    expectVerified: true,
  },
  {
    name: '陷阱：awardedScore 為 Infinity ⇒ 不可驗證',
    answers: [{ ...VALID, awardedScore: Number.POSITIVE_INFINITY }],
    expectVerified: false,
    specialFloat: { value: 'Infinity' },
  },
  {
    name: '陷阱：awardedScore 為 NaN ⇒ 不可驗證',
    answers: [{ ...VALID, awardedScore: Number.NaN }],
    expectVerified: false,
    specialFloat: { value: 'NaN' },
  },
];

describe.skipIf(!ENABLED)('SQL 證據聚合等價性（對抗性 fixtures）', () => {
  let db: DbClient;
  let buildSql: BuildSql;
  let aggregateTotals: AggregateTotals;
  let evaluate: typeof import('../services/practice-evidence-service')['evaluatePracticeEvidence'];

  beforeAll(async () => {
    ({ db } = await import('@/shared/db/db'));
    ({ buildVerifiedTotalsSql: buildSql } = await import('../repositories/practice-repo'));
    ({ aggregateStudentPracticeTotals: aggregateTotals, evaluatePracticeEvidence: evaluate } =
      await import('../services/practice-evidence-service'));
  });

  afterAll(async () => {
    await db?.$disconnect();
  });

  it('SQL 場次判定與正典投影在所有對抗性 fixtures 上完全一致（並強制回滾）', async () => {
    /** sentinel：交易末尾拋出以保證 rollback */
    class RollbackSignal extends Error {}
    const ROLLBACK = new RollbackSignal('rollback-by-design');

    let rollbackConfirmed = false;

    try {
      await db.$transaction(async tx => {
        for (const testCase of CASES) {
          const studentId = `evsql-${randomUUID()}`;

          await tx.user.create({ data: { id: studentId, email: `${studentId}@evidence-sql.test` } });

          const totalQuestions = testCase.totalQuestions ?? testCase.answers.length;
          const correctCount = testCase.correctCount ?? 0;

          const session = await tx.practiceSession.create({
            data: {
              studentId,
              skill: 'tenses',
              skillZh: '時態',
              difficulty: 'core',
              totalQuestions,
              correctCount,
              source: 'ai-generated',
            },
          });

          if (testCase.answers.length > 0) {
            await tx.practiceAnswer.createMany({
              data: testCase.answers.map((a, i) => {
                const hasQid = Object.prototype.hasOwnProperty.call(a, 'questionId');
                const isSpecial = Boolean(testCase.specialFloat) && i === 0;
                return {
                  sessionId: session.id,
                  questionIndex: i,
                  questionType: 'mc',
                  questionPrompt: 'prompt',
                  correctAnswer: 'A',
                  studentAnswer: 'A',
                  isCorrect: a.result === 'correct',
                  questionId: hasQid ? (a.questionId as string | null) : `q${i}`,
                  result: (a.result as string | null) ?? null,
                  // 特殊浮點值無法經 Prisma 寫入 → 先放合法佔位，稍後 raw UPDATE
                  awardedScore: isSpecial ? 0 : ((a.awardedScore as number | null) ?? null),
                  maxScore: isSpecial ? 1 : ((a.maxScore as number | null) ?? null),
                  countsTowardScore: (a.countsTowardScore as boolean | null) ?? null,
                  scoredBy: (a.scoredBy as string | null) ?? null,
                  scoringMethod: (a.scoringMethod as string | null) ?? null,
                };
              }),
            });

            if (testCase.specialFloat) {
              await tx.$executeRawUnsafe(
                `UPDATE "PracticeAnswer" SET "awardedScore" = $1::float8 WHERE "sessionId" = $2 AND "questionIndex" = 0`,
                testCase.specialFloat.value,
                session.id,
              );
            }
          }

          // ---- 正典 TS 期望值（不手寫） ----
          const canonical = evaluate(testCase.answers);
          expect(
            { case: testCase.name, status: canonical.status },
          ).toEqual({ case: testCase.name, status: testCase.expectVerified ? 'verified' : 'unverifiable' });

          const expected = aggregateTotals([
            { totalQuestions, correctCount, answers: testCase.answers },
          ]);

          // ---- SQL 實際值（與正式路徑同一份 SQL 文字） ----
          const rows = await tx.$queryRawUnsafe<Array<Record<string, unknown>>>(
            buildSql([], []),
            studentId,
            null,
          );
          expect(rows.length).toBe(1);
          const row = rows[0];
          const actual = {
            verifiedTotalQuestions: Number(row.verifiedTotalQuestions),
            verifiedCorrectCount: Number(row.verifiedCorrectCount),
            recordedTotalQuestions: Number(row.recordedTotalQuestions),
            recordedCorrectCount: Number(row.recordedCorrectCount),
            sessionsCount: Number(row.sessionsCount),
          };

          expect({ case: testCase.name, ...actual }).toEqual({
            case: testCase.name,
            verifiedTotalQuestions: expected.verifiedTotalQuestions,
            verifiedCorrectCount: expected.verifiedCorrectCount,
            recordedTotalQuestions: expected.recordedTotalQuestions,
            recordedCorrectCount: expected.recordedCorrectCount,
            sessionsCount: 1,
          });
        }

        throw ROLLBACK;
      }, { maxWait: 15_000, timeout: 120_000 });
    } catch (err) {
      // 只有我們刻意拋出的 sentinel 才可被吞掉；其他錯誤（含斷言失敗）必須往上拋
      if (!(err instanceof RollbackSignal)) throw err;
      rollbackConfirmed = true;
    }

    expect(rollbackConfirmed).toBe(true);

    // 強制回滾的獨立驗證：fixture 學生不得存在
    const leaked = await db.user.count({ where: { email: { endsWith: '@evidence-sql.test' } } });
    expect(leaked).toBe(0);
  });
});
