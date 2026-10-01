// ============================================
// Practice Repository — centralized data access for practice sessions & answers
// P1: Repository Layer Migration
// ============================================

import { db } from '@/shared/db/db';
import { hkStartOfDay } from '@/shared/utils/hk-date';
import { PRACTICE_EVIDENCE_RULES } from '../services/practice-evidence-rules';

/** Create a practice session */
export async function createPracticeSession(data: {
  studentId: string;
  skill: string;
  skillZh: string;
  difficulty: string;
  totalQuestions: number;
  correctCount: number;
  source: string;
  completedAt?: Date;
}) {
  return db.practiceSession.create({ data });
}

/** Find today's session for a student by source（「今日」= 香港日） */
export async function findTodaySession(studentId: string, source: string) {
  return db.practiceSession.findFirst({
    where: { studentId, source, startedAt: { gte: hkStartOfDay() } },
  });
}

/**
 * Count today's sessions for a student by source（「今日」= 香港日）。
 * Used for concurrency-safe duplicate detection (2026-08-30 audit R8):
 * the find-then-create window cannot be closed without a DB constraint,
 * so callers re-count after creation and roll back the loser.
 */
export async function countTodaySessions(studentId: string, source: string) {
  return db.practiceSession.count({
    where: { studentId, source, startedAt: { gte: hkStartOfDay() } },
  });
}

/** Delete a practice session by id (race-loser rollback) */
export async function deletePracticeSession(id: string) {
  return db.practiceSession.delete({ where: { id } });
}

/** List practice sessions with basic stats (for analytics/gamification) */
export async function listPracticeSessionsSimple(studentId: string, limit = 100) {
  return db.practiceSession.findMany({
    where: { studentId },
    select: { skill: true, totalQuestions: true, correctCount: true, startedAt: true },
    take: limit,
  });
}

/** Count practice sessions for a student */
export async function countPracticeSessions(studentId: string) {
  return db.practiceSession.count({ where: { studentId } });
}

/** Answer row accepted for persistence (structural contract) */
export interface PracticeAnswerRowInput {
  questionIndex: number;
  /** Canonical question identity (PracticeQuestion.id / ReadingQuestion.id) — required for new rows */
  questionId: string;
  questionType?: string;
  questionPrompt?: string;
  correctAnswer: string;
  studentAnswer: string;
  isCorrect: boolean;
  /** R3.2: actual runtime scoring (preserved verbatim) */
  result?: string;
  awardedScore?: number;
  maxScore?: number;
  countsTowardScore?: boolean;
  /** R3.3/R3.7: actual scoring authority for this row */
  scoredBy?: string;
  scoringMethod?: string;
  timeSpent?: number | null;
}

function mapAnswerRows(sessionId: string, answers: PracticeAnswerRowInput[]) {
  return answers.map((a, idx) => ({
    sessionId,
    questionIndex: a.questionIndex ?? idx,
    questionId: a.questionId,
    questionType: a.questionType || 'mc',
    questionPrompt: a.questionPrompt || '',
    correctAnswer: a.correctAnswer || '',
    studentAnswer: a.studentAnswer || '',
    isCorrect: a.isCorrect,
    result: a.result,
    awardedScore: a.awardedScore,
    maxScore: a.maxScore,
    countsTowardScore: a.countsTowardScore ?? true,
    scoredBy: a.scoredBy,
    scoringMethod: a.scoringMethod,
    timeSpent: a.timeSpent ?? null,
  }));
}

/** Create answers for a practice session */
export async function createPracticeAnswers(
  sessionId: string,
  answers: PracticeAnswerRowInput[],
) {
  if (!answers || answers.length === 0) return [];
  return db.practiceAnswer.createMany({ data: mapAnswerRows(sessionId, answers) });
}

/**
 * 2026-09-26 晚上事故（高併發延遲）：互動交易護欄。
 * 等待連線／交易總時長都有上限，避免壅塞時請求無限堆叠成 500。
 */
const PRACTICE_TX_OPTIONS = { maxWait: 5_000, timeout: 15_000 } as const;

/**
 * R37-H01/H02: Atomic practice execution.
 * PracticeSession (which carries the authoritative aggregate values) and
 * ALL PracticeAnswer rows commit or roll back together. No partial
 * session can ever remain: no session without its full item evidence,
 * no aggregate without matching items.
 *
 * R3.10-E.2 P0-3: when `clientSubmissionId` is provided, the execution is
 * REPLAY-SAFE — a repeated key returns the original persisted session
 * ({ created: false }) with no writes and no side effects. The key is
 * ONLY a replay/dedup mechanism, never an authority signal.
 * Concurrent duplicates resolve via the (studentId, clientSubmissionId)
 * unique index.
 *
 * 2026-09-27 修正：P2002（並發重播競賽）改為在**交易外**解決。舊碼在交易內
 * 捕捉 P2002 後繼續查詢——Postgres 在語句錯誤後即中止交易，後續查詢只會回
 * 「current transaction is aborted」，令競賽路徑反而變成 500（客戶端會重試，
 * 再加重負載）。現在讓交易乾淨回滾，再以一般連線讀取既有場次。
 */
export async function createPracticeExecutionTx(input: {
  session: {
    studentId: string;
    skill: string;
    skillZh: string;
    difficulty: string;
    totalQuestions: number;
    correctCount: number;
    source: string;
    completedAt?: Date;
    clientSubmissionId?: string | null;
  };
  answers: PracticeAnswerRowInput[];
}): Promise<{ id: string; created: boolean; skill: string; skillZh: string; totalQuestions: number; correctCount: number }> {
  const { clientSubmissionId } = input.session;
  const clientKey = clientSubmissionId && clientSubmissionId.length > 0 ? clientSubmissionId : null;

  const readExisting = async () => db.practiceSession.findUnique({
    where: { studentId_clientSubmissionId: { studentId: input.session.studentId, clientSubmissionId: clientKey! } },
  });

  try {
    return await db.$transaction(async tx => {
      if (clientKey) {
        const existing = await tx.practiceSession.findUnique({
          where: { studentId_clientSubmissionId: { studentId: input.session.studentId, clientSubmissionId: clientKey } },
        });
        if (existing) return {
          id: existing.id, created: false, skill: existing.skill, skillZh: existing.skillZh,
          totalQuestions: existing.totalQuestions, correctCount: existing.correctCount,
        };
      }

      const session = await tx.practiceSession.create({ data: input.session });
      if (input.answers.length > 0) {
        await tx.practiceAnswer.createMany({ data: mapAnswerRows(session.id, input.answers) });
      }
      return {
        id: session.id, created: true, skill: session.skill, skillZh: session.skillZh,
        totalQuestions: session.totalQuestions, correctCount: session.correctCount,
      };
    }, PRACTICE_TX_OPTIONS);
  } catch (err) {
    // Concurrent duplicate raced past the pre-check: unique violation aborts the
    // whole transaction — resolve it OUTSIDE the (now rolled back) transaction.
    if (clientKey && err && typeof err === 'object' && (err as { code?: unknown }).code === 'P2002') {
      const existing = await readExisting();
      if (existing) return {
        id: existing.id, created: false, skill: existing.skill, skillZh: existing.skillZh,
        totalQuestions: existing.totalQuestions, correctCount: existing.correctCount,
      };
    }
    throw err;
  }
}

/** List practice sessions for a student */
export async function listPracticeSessions(studentId: string, limit = 50) {
  return db.practiceSession.findMany({
    where: { studentId },
    include: { answers: { orderBy: { questionIndex: 'asc' } } },
    orderBy: { startedAt: 'desc' },
    take: limit,
  });
}

/**
 * 學生近 14 日練習過的題目文字（供出題「避免重複」用）。
 *
 * 2026-10-01（同題快速重複稽核）：生成端只對「同一次請求內」去重，跨請求
 * 完全沒有記憶 → 學生重複生成時會再收到幾乎相同的題目（實測同一題內容
 * `what do people in spain do at midnight on new year's eve?` 曾以 7 個不同
 * questionId 重複領取 `answerCorrect` XP）。本函式提供跨請求去重的素材，
 * **只回傳題目文字**（不含答案）。
 *
 * 視窗為**14 日**（而非「最近 N 場」）—— 重度學生一天可完成 16+ 場，
 * 「最新 20 場」只覆蓋約一天，會令「三天前練過」的題目重新出現。
 * 去重與排序都在 DB 端完成（GROUP BY 正規化文字、每題只回傳一列），
 * 傳輸量有上限；文字只作去重提示／過濾，非證據、非敘述授權。
 */
export async function listRecentQuestionPrompts(studentId: string, days = 14, promptLimit = 150) {
  return db.$queryRawUnsafe<Array<{ prompt: string }>>(
    `
    SELECT (array_agg(a."questionPrompt" ORDER BY a."createdAt" DESC))[1] AS prompt
    FROM "PracticeAnswer" a
    JOIN "PracticeSession" s ON s.id = a."sessionId"
    WHERE s."studentId" = $1
      AND s."startedAt" >= now() - make_interval(days => $2::int)
      AND a."questionPrompt" IS NOT NULL
      AND btrim(a."questionPrompt") <> ''
    GROUP BY lower(btrim(a."questionPrompt"))
    ORDER BY max(a."createdAt") DESC
    LIMIT $3
    `,
    studentId,
    days,
    promptLimit,
  );
}

/**
 * 學生近 14 日練習中用過的聆聽對話（供出題避免重用同一段內容）。
 *
 * 對話在生成時已持久化於 `ListeningQuestion`（ADR-045），故可由既有
 * 作答記錄回推「這段對話學生已見過」—— 即使換了問題文字，同一段對話
 * 對學生仍是重複內容。只回傳截斷後（≤600 字元）的對話，每題一列，
 * 去重與排序都在 DB 端完成。
 */
export async function listRecentListeningDialogues(studentId: string, days = 14, dialogueLimit = 40) {
  return db.$queryRawUnsafe<Array<{ dialogue: string }>>(
    `
    SELECT (array_agg(left(l.dialogue, 600) ORDER BY a."createdAt" DESC))[1] AS dialogue
    FROM "PracticeAnswer" a
    JOIN "PracticeSession" s ON s.id = a."sessionId"
    JOIN "ListeningQuestion" l ON l.id = a."questionId"
    WHERE s."studentId" = $1
      AND s."startedAt" >= now() - make_interval(days => $2::int)
      AND l.dialogue IS NOT NULL
      AND btrim(l.dialogue) <> ''
    GROUP BY l.id
    ORDER BY max(a."createdAt") DESC
    LIMIT $3
    `,
    studentId,
    days,
    dialogueLimit,
  );
}

/**
 * R3.10-C: List practice sessions WITH persisted answer evidence rows.
 * Consumers of verified accuracy must use this (with
 * evaluatePracticeEvidence) instead of trusting session aggregates.
 *
 * `skip` / `since` / `until` 支援分頁與日期界線視窗（2026-09-20 稽核；
 * 2026-10-01 加入 `until` 供「指定一日」的歷史檢視使用）。
 * 注意（2026-09-26）：「累積」語意已改由 SQL 聚合提供（見
 * `aggregateVerifiedTotalsForStudent`），**不再**靠本函式分頁搬全歷史列。
 * 本函式現供逐列消費者（本週有界抓取、單場／單日查詢）使用。
 */
export async function listPracticeSessionsWithEvidence(
  studentId: string,
  limit = 200,
  skip = 0,
  since?: Date,
  until?: Date,
) {
  const startedAtRange =
    since || until
      ? { startedAt: { ...(since ? { gte: since } : {}), ...(until ? { lt: until } : {}) } }
      : {};
  return db.practiceSession.findMany({
    where: { studentId, ...startedAtRange },
    select: {
      id: true,
      skill: true,
      skillZh: true,
      difficulty: true,
      totalQuestions: true,
      correctCount: true,
      source: true,
      startedAt: true,
      completedAt: true,
      answers: {
        select: {
          questionId: true,
          result: true,
          awardedScore: true,
          maxScore: true,
          countsTowardScore: true,
          scoredBy: true,
          scoringMethod: true,
        },
        orderBy: { questionIndex: 'asc' },
      },
    },
    orderBy: { startedAt: 'desc' },
    take: limit,
    skip,
  });
}

/**
 * 單日「逐場 + 完整逐題答案」列表 —— **僅供教師逐題檢視**。
 *
 * 2026-10-01：教師端歷史瀏覽需要與「最近 50 場」相同的逐題明細，但改為按
 * **單日**有界查詢（一次只看一天，不搬全歷史）。學生端維持精簡選取
 * （`listPracticeSessionsWithEvidence`），不在此放大 egress。
 */
export async function listPracticeSessionsWithAnswersInRange(
  studentId: string,
  since: Date,
  until: Date,
  limit = 200,
) {
  return db.practiceSession.findMany({
    where: { studentId, startedAt: { gte: since, lt: until } },
    include: { answers: { orderBy: { questionIndex: 'asc' } } },
    orderBy: { startedAt: 'asc' },
    take: limit,
  });
}

// ============================================
// 2026-09-25: 伺服器端證據聚合（SQL）— 消除「全歷史列串流」egress
// ============================================
// 病根：`getCumulativeSkillTotals()` / `syncActivityMetrics()` /
// `aggregateVerifiedTotalsForStudents()` 原本以分頁把**每一列**
// session + answer 讀進 Node 才自行加總。實測（2026-09-25）：
// 單一學生一次全歷史投影 = 1.3 MB、全校一次 = 345 MB，而每次練習提交
// 會跑 2 次、每次頁面載入再跑 1 次 → Neon Free 5 GB/月 額度一個月用掉 4 GB
// （DB 本身只有 31 MB，即 egress ≈ 練習資料量的 130 倍）。
//
// 這裡用 SQL 執行**同一套**規則（規則來源：`practice-evidence-rules.ts`），
// 只回傳數字（每個學生／技能一列），把搬運量由 MB 降為 KB。
//
// 等價性的關鍵 —— `evaluatePracticeEvidence()` 是**場次層級 all-or-nothing**：
//   場次成立 ⇔ 至少一列 且 所有列通過 tier-1 且 至少一列 counted；
//   任一列不合法 ⇒ 整個場次不可驗證（0 分）。
// 所以**不能**寫成單純的 `WHERE` 列過濾 —— 那會把 TS 判為不可驗證的場次
// 一起算進來（方向性錯誤：會高估而非低估）。
//   tier-1（所有列都須通過）：questionId 非空、result 合法、scoredBy 合法、
//                             (scoredBy, scoringMethod) 為權威配對
//   tier-2（僅 checked 列）：awardedScore/maxScore 為有限數、maxScore > 0、
//                             0 <= awardedScore <= maxScore
//   `countsTowardScore = false` 的列被跳過，但仍必須通過 tier-1。
//
// 等價性以 `scripts/verify-evidence-sql-equivalence.ts` 對真實資料驗證。
// 注意：本聚合使用 PostgreSQL 語法（FILTER / ::timestamptz / btrim），
// 與 `assessment-repo`、`mistake-repo` 既有 raw SQL 相同的前提。

/** SQL predicate 片段 — 一律由 `PRACTICE_EVIDENCE_RULES` 生成，永不手寫複製 */
function evidenceRulesSql(): { authorities: string; results: string; pairs: string } {
  const q = (v: string) => `'${v.replace(/'/g, "''")}'`;
  return {
    authorities: PRACTICE_EVIDENCE_RULES.supportedAuthorities.map(q).join(', '),
    results: PRACTICE_EVIDENCE_RULES.validResults.map(q).join(', '),
    pairs: PRACTICE_EVIDENCE_RULES.serverKeyAuthoritative
      .map(([authority, method]) => `(a."scoredBy" = ${q(authority)} AND a."scoringMethod" = ${q(method)})`)
      .join('\n             OR '),
  };
}

export interface VerifiedTotalsAggregate {
  verifiedTotalQuestions: number;
  verifiedCorrectCount: number;
  recordedTotalQuestions: number;
  recordedCorrectCount: number;
  sessionsCount: number;
}

export interface VerifiedStudentTotalsAggregate extends VerifiedTotalsAggregate {
  studentId: string;
}

export interface VerifiedSkillTotalsAggregate extends VerifiedTotalsAggregate {
  skill: string;
  skillZh: string;
}

/**
 * 建立全歷史證據聚合查詢。
 * `selectColumns` 為空 ⇒ 全學生彙總為一列；否則每組一列。
 * `groupColumns` 為 GROUP BY 運算式（**不含**別名 —— GROUP BY 不接受 `AS`）。
 * `scope`：
 *   · `single`（預設）⇒ `$1 = studentId`（單一學生）
 *   · `many` ⇒ `$1 = studentIds text[]`（批次；供 admin 匯出用，一次 GROUP BY studentId）
 * `$2` = since（null ⇒ 全歷史）。
 *
 * **已匯出**：等價性測試（`practice-evidence-sql-equivalence.test.ts`）需要以
 * 「與正式路徑完全相同的 SQL 文字」在**交易內**執行並回滾，因此必須取得此
 * builder。這不是為測試而抽象 —— SQL 文字若在測試中另寫一份，就等於繞過
 * 被驗證的對象。
 */
export function buildVerifiedTotalsSql(
  selectColumns: string[],
  groupColumns: string[],
  options: { scope?: 'single' | 'many' } = {},
): string {
  const { authorities, results, pairs } = evidenceRulesSql();
  const groupSelect = selectColumns.length > 0 ? `${selectColumns.join(', ')},` : '';
  const groupBy = groupColumns.length > 0 ? `GROUP BY ${groupColumns.join(', ')}` : '';
  const studentScope = options.scope === 'many'
    ? `s."studentId" = ANY($1::text[])`
    : `s."studentId" = $1`;

  return `
    WITH scoped AS (
      SELECT s.id, s."studentId", s.skill, s."skillZh", s."totalQuestions", s."correctCount", s."startedAt"
      FROM "PracticeSession" s
      WHERE ${studentScope}
        AND ($2::timestamptz IS NULL OR s."startedAt" >= $2::timestamptz)
    ),
    flags AS (
      SELECT
        a."sessionId",
        (a."questionId" IS NULL OR btrim(a."questionId") = '') AS bad_question_id,
        (a.result IS NULL OR a.result NOT IN (${results})) AS bad_result,
        (a."scoredBy" IS NULL OR a."scoredBy" NOT IN (${authorities})) AS bad_authority,
        COALESCE(NOT (
             ${pairs}
           ), TRUE) AS bad_key_authority,
        (a."countsTowardScore" IS NULL OR a."countsTowardScore") AS counted,
        (a.result = 'correct') AS is_correct,
        (
          a."awardedScore" IS NULL OR a."maxScore" IS NULL
          -- Number.isFinite 等價：排除 NaN 與 +/-Infinity
          OR NOT (a."awardedScore" BETWEEN '-Infinity'::float8 AND 'Infinity'::float8)
          OR NOT (a."maxScore" BETWEEN '-Infinity'::float8 AND 'Infinity'::float8)
          OR a."awardedScore" IN ('Infinity'::float8, '-Infinity'::float8)
          OR a."maxScore" IN ('Infinity'::float8, '-Infinity'::float8)
          OR a."maxScore" <= 0
          OR a."awardedScore" < 0
          OR a."awardedScore" > a."maxScore"
        ) AS bad_score
      FROM "PracticeAnswer" a
      WHERE a."sessionId" IN (SELECT id FROM scoped)
    ),
    verdict AS (
      -- 場次層級判定：bad_rows = 0 且 counted_rows > 0 才計入
      SELECT
        f."sessionId",
        count(*) FILTER (
          WHERE f.bad_question_id
             OR f.bad_result
             OR f.bad_authority
             OR f.bad_key_authority
             OR (f.counted AND f.bad_score)
        )::int AS bad_rows,
        count(*) FILTER (WHERE f.counted)::int AS counted_rows,
        count(*) FILTER (WHERE f.counted AND f.is_correct)::int AS correct_rows
      FROM flags f
      GROUP BY f."sessionId"
    )
    SELECT
      ${groupSelect}
      COALESCE(sum(v.counted_rows) FILTER (WHERE v.bad_rows = 0 AND v.counted_rows > 0), 0)::int AS "verifiedTotalQuestions",
      COALESCE(sum(v.correct_rows) FILTER (WHERE v.bad_rows = 0 AND v.counted_rows > 0), 0)::int AS "verifiedCorrectCount",
      COALESCE(sum(sc."totalQuestions"), 0)::int AS "recordedTotalQuestions",
      COALESCE(sum(sc."correctCount"), 0)::int AS "recordedCorrectCount",
      count(sc.id)::int AS "sessionsCount"
    FROM scoped sc
    LEFT JOIN verdict v ON v."sessionId" = sc.id
    ${groupBy}
  `;
}

/**
 * 單一學生的全歷史已驗證／原始總數（**只回傳數字**，不搬列）。
 *
 * 語意與 `aggregateStudentPracticeTotals(allSessionsWithEvidence)` 相同，
 * 但 egress 由 MB 級降為單列。`since` 供日期界線視窗使用（例：本週快照）；
 * 累積語意的呼叫端必須省略 `since`。
 */
export async function aggregateVerifiedTotalsForStudent(
  studentId: string,
  since?: Date,
): Promise<VerifiedTotalsAggregate> {
  const rows = await db.$queryRawUnsafe<VerifiedTotalsAggregate[]>(
    buildVerifiedTotalsSql([], []),
    studentId,
    since ?? null,
  );
  return rows[0] ?? {
    verifiedTotalQuestions: 0,
    verifiedCorrectCount: 0,
    recordedTotalQuestions: 0,
    recordedCorrectCount: 0,
    sessionsCount: 0,
  };
}

/**
 * 批次：多學生的全歷史已驗證／原始總數（**每名學生一列**，只回傳數字）。
 * 取代 `aggregateVerifiedTotalsForStudents()` 的逐列分頁搬運
 * （實測 admin 匯出一次 2.4 MB；改後為每名學生一列）。
 *
 * 只回傳「有場次」的學生 —— 沒有練習的學生**不會**出現，呼叫端必須以
 * 「—」呈現（**永不**以 0% 代替，2026-09-20 稽核）。
 */
export async function aggregateVerifiedTotalsForStudentsByIds(
  studentIds: string[],
): Promise<VerifiedStudentTotalsAggregate[]> {
  if (studentIds.length === 0) return [];
  return db.$queryRawUnsafe<VerifiedStudentTotalsAggregate[]>(
    buildVerifiedTotalsSql(['sc."studentId"'], ['sc."studentId"'], { scope: 'many' }),
    studentIds,
    null,
  );
}

/**
 * 單一學生的全歷史「每技能」已驗證總數（**只回傳每個技能一列**）。
 * 取代 `getCumulativeSkillTotals()` 的逐列分頁加總。
 *
 * `skillZh` 必須與正典 TS 投影一致：舊碼逐列迭代（`startedAt DESC`）時
 * **最新一場「已驗證」場次**的標籤勝出（未通過證據判定的場次會被 `continue`
 * 跳過、不提供標籤），因此這裡必須同時限制排序來源與 FILTER：
 *   `array_agg(... ORDER BY startedAt DESC) FILTER (WHERE 該場次已驗證)`。
 * 不可用 `min()`，也不可只看最新場次 —— 2026-09-25 等價性驗證實測兩種寫法
 * 都會與 TS 分歧（同一技能歷史列標籤不一致：`Reading` vs `閱讀`；最新場次
 * 為不可驗證的舊 authority 列時，TS 會沿用下一場的標籤）。
 * 空字串回退為 `skill`（與 TS 的 `skillZh || skill` 相同）。
 */
export async function aggregateVerifiedTotalsBySkillForStudent(
  studentId: string,
): Promise<VerifiedSkillTotalsAggregate[]> {
  const verifiedLabel = `
    COALESCE(NULLIF((
      array_agg(sc."skillZh" ORDER BY sc."startedAt" DESC, sc.id ASC)
      FILTER (WHERE v.bad_rows = 0 AND v.counted_rows > 0)
    )[1], ''), sc.skill) AS "skillZh"`;

  return db.$queryRawUnsafe<VerifiedSkillTotalsAggregate[]>(
    buildVerifiedTotalsSql(['sc.skill', verifiedLabel], ['sc.skill']),
    studentId,
    null,
  );
}

/** Find a practice session by ID */
/**
 * 2026-09-23 稽核：取某學生對某題的作答列（含評分權威欄位），供錯題建立閘門。
 * 只讀，永不修改；DB 先做粗篩（incorrect + server/ai），精確的
 * (scoredBy, scoringMethod) 授權配對由 practice-evidence-service 判定。
 */
export async function listServerScoredIncorrectAnswersForQuestion(studentId: string, questionId: string) {
  return db.practiceAnswer.findMany({
    where: {
      questionId,
      result: 'incorrect',
      scoredBy: { in: ['server', 'ai'] },
      session: { studentId },
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: { studentAnswer: true, correctAnswer: true, scoredBy: true, scoringMethod: true, sessionId: true },
  });
}

/**
 * 2026-09-23 稽核：取某學生對多題的伺服器評分作答列（最新在前），
 * 供「錯題是否已解除」推導。只讀，永不修改。
 */
export async function listServerScoredAnswersForQuestions(studentId: string, questionIds: string[]) {
  return db.practiceAnswer.findMany({
    where: {
      questionId: { in: questionIds },
      scoredBy: { in: ['server', 'ai'] },
      session: { studentId },
    },
    orderBy: { createdAt: 'desc' },
    select: { questionId: true, result: true, scoredBy: true, scoringMethod: true },
  });
}

export async function findPracticeSession(id: string) {
  return db.practiceSession.findUnique({
    where: { id },
    include: { answers: { orderBy: { questionIndex: 'asc' } } },
  });
}

/**
 * 2026-09-28：以 (studentId, clientSubmissionId) 唯一鍵找場次。
 * 供 `POST /api/gamification` 驗證「完成練習」XP 事件確實對應真實場次
 * （防止以偽造 sessionId 重複領取 completeSession XP）。
 */
export async function findPracticeSessionByClientId(studentId: string, clientSubmissionId: string) {
  return db.practiceSession.findUnique({
    where: { studentId_clientSubmissionId: { studentId, clientSubmissionId } },
    select: { id: true, studentId: true, difficulty: true, totalQuestions: true, correctCount: true },
  });
}
/** Update a practice session (e.g., mark as completed) */
export async function completePracticeSession(id: string, correctCount: number) {
  return db.practiceSession.update({
    where: { id },
    data: { completedAt: new Date(), correctCount },
  });
}

// ============================================
// 練習歷史的逐日聚合（2026-10-01，學生端「每日練習回顧」）
// ============================================

/** 每（香港日 × 技能）一列的 engagement 聚合（不含分數語意） */
export interface PracticeDaySkillAggregate {
  dayKey: string;
  skill: string;
  skillZh: string;
  sessionsCount: number;
  questionsTotal: number;
}

/**
 * 指定日期範圍內，學生的**每日 × 技能**練習場次／題數（DB 端 GROUP BY，
 * 只回傳聚合列，不搬逐場記錄）。
 *
 * 香港日界線以 `startedAt + 8h` 的日期取 key（與 `hkDayKey()` 同一算法；
 * 香港無夏令時間）。`skillZh` 取該（日, 技能）內最新一場的標籤，
 * 與累積投影的標籤回退規則一致（空字串回退為 `skill`）。
 *
 * ⚠️ 這是 **engagement** 聚合：題數含未驗證／開放式，**不得**當作分數
 * （分數語意一律經 `evaluatePracticeEvidence`／SQL 證據投影）。
 */
export async function aggregatePracticeSessionsByDayAndSkill(
  studentId: string,
  since: Date,
  until: Date,
): Promise<PracticeDaySkillAggregate[]> {
  return db.$queryRawUnsafe<PracticeDaySkillAggregate[]>(
    `
    SELECT to_char(s."startedAt" + interval '8 hours', 'YYYY-MM-DD') AS "dayKey",
           s.skill AS "skill",
           COALESCE(NULLIF((array_agg(s."skillZh" ORDER BY s."startedAt" DESC, s.id ASC))[1], ''), s.skill) AS "skillZh",
           count(*)::int AS "sessionsCount",
           COALESCE(sum(s."totalQuestions"), 0)::int AS "questionsTotal"
    FROM "PracticeSession" s
    WHERE s."studentId" = $1
      AND s."startedAt" >= $2::timestamptz
      AND s."startedAt" < $3::timestamptz
    GROUP BY 1, 2
    ORDER BY 1 DESC, 2 ASC
    `,
    studentId,
    since,
    until,
  );
}
