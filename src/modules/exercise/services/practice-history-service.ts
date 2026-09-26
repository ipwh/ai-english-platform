// ============================================
// Practice History Service — 練習歷史的「累積」投影
// ============================================
// 單一 owner：學生練習歷史的累積統計（技能題數、每週摘要）。
//
// 2026-09-20 稽核修正（DB 實證）：
// `技能掌握度` 的題數原本由 `/api/practice` GET 回傳的**最新 50 場**在客戶端加總，
// 學生練其他技能時舊技能會被擠出視窗 → 題數下降、甚至整列消失
// （實測：>50 場學生的視窗題數 ÷ 累積題數 = 0.30；學生 cmrbd6… 片語動詞
// 55 → 50 → 0）。本服務改用**日期界線 + 全歷史分頁**的累積投影，數字只升不跌。
//
// 證據契約（R3.10-C.2 / R3.10-D）：
// - scored 統計（題數／正確數）**只**由 persisted answer rows 經正典
//   `evaluatePracticeEvidence` 推導；unverifiable 場次整場略過。
// - engagement（總題數／場次數）可用 session 聚合值，且不得當作分數。
// ============================================

import { PracticeRepo } from '@/modules/repositories';
import { evaluatePracticeEvidence } from './practice-evidence-service';
import { hkWeekStartUtc } from '@/shared/utils/hk-date';

/** 單一技能累積（只計已驗證 evidence 的題數） */
export interface CumulativeSkillTotal {
  skill: string;
  skillZh: string;
  /** 累積已驗證題數（countsTowardScore 的 answer rows） */
  questions: number;
  /** 累積答對題數 */
  correct: number;
}

/** 每週練習摘要 */
export interface WeeklyPracticeSummary {
  /** engagement：本週題數（含未驗證／開放式，不得當作分數） */
  questionsDone: number;
  /** 本週完成的練習場次數 */
  sessionsCount: number;
  /** scored：本週已驗證題數 */
  verifiedQuestions: number;
  /** scored：本週已驗證答對題數 */
  verifiedCorrect: number;
  /**
   * scored 準確率（0-100）。
   * **null = 沒有已驗證資料**（「無資料」不得顯示為 0%，2026-09-20 稽核）。
   */
  accuracy: number | null;
}

interface PageOptions {
  pageSize?: number;
  /** Optional caller-controlled page limit for bounded reports; cumulative projections must omit it. */
  maxPages?: number;
}

interface IterateOptions extends PageOptions {
  /** 只取此時間之後的場次（供週摘要等日期界線視窗使用） */
  since?: Date;
}

/**
 * 以既有 repository 由新至舊分頁讀取「場次 + 逐題證據」。
 * 唯一分頁入口，避免每個消費者各自寫一次截斷邏輯（「最新 N 筆」會令累積數字下降）。
 */
export async function* iterateSessionsWithEvidence(
  studentId: string,
  { pageSize = 200, maxPages, since }: IterateOptions = {},
) {
  for (let page = 0; maxPages === undefined || page < maxPages; page++) {
    const rows = await PracticeRepo.listPracticeSessionsWithEvidence(studentId, pageSize, page * pageSize, since);
    for (const row of rows) yield row;
    if (rows.length < pageSize) return;
  }
}

/** 全歷史蒐集（分頁、無隱性截斷）—— 需要「累積」語意的消費者使用。 */
export async function listAllSessionsWithEvidence(
  studentId: string,
  options: IterateOptions = {},
): Promise<Awaited<ReturnType<typeof PracticeRepo.listPracticeSessionsWithEvidence>>> {
  const collected: Awaited<ReturnType<typeof PracticeRepo.listPracticeSessionsWithEvidence>> = [];
  for await (const row of iterateSessionsWithEvidence(studentId, options)) collected.push(row);
  return collected;
}

/**
 * 累積 per-skill 已驗證題數（全歷史；只升不跌）。
 * 排序：題數多 → 少（UI 直接照序顯示）。
 *
 * 2026-09-25（Neon egress）：改由 SQL 聚合完成（規則單一定義見
 * `practice-evidence-rules.ts`）。舊碼把全歷史**每一列** session + answer
 * 搬進 Node 再自行加總 —— 實測單一學生一次 = 1.3 MB，而本函式每次練習頁
 * 載入都會跑一次，是 Neon Free 5 GB/月 額度的主要消耗來源。
 * 回傳量由 MB 級降為「每個技能一列」；全歷史語意不變（SQL 無 LIMIT／無取樣，
 * 「只升不跌」的單調性因此是結構性保證，而非靠 maxPages 上限）。
 */
export async function getCumulativeSkillTotals(
  studentId: string,
): Promise<CumulativeSkillTotal[]> {
  const rows = await PracticeRepo.aggregateVerifiedTotalsBySkillForStudent(studentId);

  // 依 skill 合併（空字串 → 'general'；與舊碼同一套標籤回退規則）
  const totals = new Map<string, CumulativeSkillTotal>();
  for (const row of rows) {
    const skill = row.skill || 'general';
    const entry = totals.get(skill) ?? {
      skill,
      skillZh: row.skillZh || skill,
      questions: 0,
      correct: 0,
    };
    entry.questions += row.verifiedTotalQuestions;
    entry.correct += row.verifiedCorrectCount;
    totals.set(skill, entry);
  }

  return Array.from(totals.values())
    .filter(entry => entry.questions > 0)
    .sort((a, b) => b.questions - a.questions);
}

/**
 * 本週摘要（香港週界線：今日起往前 6 日）。
 * 取代舊碼由「最新 50 場 ∩ 7 日」在客戶端計算（爆量學生的本週題數同樣被截斷）。
 */
export async function getWeeklyPracticeSummary(
  studentId: string,
  now: Date = new Date(),
  options: PageOptions = {},
): Promise<WeeklyPracticeSummary> {
  const since = hkWeekStartUtc(6, now);
  let questionsDone = 0;
  let sessionsCount = 0;
  let verifiedQuestions = 0;
  let verifiedCorrect = 0;

  for await (const session of iterateSessionsWithEvidence(studentId, { ...options, since })) {
    sessionsCount += 1;
    questionsDone += session.totalQuestions;

    const evidence = evaluatePracticeEvidence(session.answers);
    if (evidence.status !== 'verified') continue;
    verifiedQuestions += evidence.totalQuestions;
    verifiedCorrect += evidence.correctCount;
  }

  return {
    questionsDone,
    sessionsCount,
    verifiedQuestions,
    verifiedCorrect,
    // 無已驗證資料 → null（「無資料」不得顯示為 0%）
    accuracy: verifiedQuestions > 0 ? Math.round((verifiedCorrect / verifiedQuestions) * 100) : null,
  };
}

// ============================================
// 批次累積投影（2026-09-21 稽核；2026-09-26 改走 SQL）
// ============================================
// 病根一（2026-09-21）：`/api/admin/export/students` 舊碼以 `sessions: { take: 50 }`
// 的 nested select 交給 `aggregateStudentPracticeTotals()`，令匯出報表的
// `totalQuestionsAnswered / totalCorrectAnswers / sessionAccuracy`
// 只算「最新 50 場」卻以「總數」為欄名（高練習量學生被系統性低估）。
// 當時改為「不設 take 上限、以 `skip` 分頁迭代到不足一頁為止」。
//
// 病根二（2026-09-26，Neon egress）：分頁迭代等於把**每一列** session + answer
// 搬進 Node 才加總（實測 admin 匯出一次 2.4 MB），而匯出只需要每名學生兩個數字。
// 現在改由**單一 SQL 聚合**完成（`GROUP BY studentId`，每名學生一列）。
// 規則仍是單一定義（`practice-evidence-rules.ts`），等價性由
// `db:verify:evidence-sql`（真實資料）與 `db:verify:metrics-parity`（部署閘門）保證。

/** 單一學生的批次累積統計 */
export interface StudentCumulativeTotals {
  /** 已驗證題數（`countsTowardScore` 的 answer rows，全歷史） */
  verifiedTotalQuestions: number;
  /** 已驗證答對題數（全歷史） */
  verifiedCorrectCount: number;
  /** 已驗證準確率（0-100）；**null = 無可驗證證據**（不得顯示 0%） */
  accuracy: number | null;
  /** 原始紀錄值（session 聚合，含不可驗證場次；engagement 用，不得當分數） */
  recordedTotalQuestions: number;
  recordedCorrectCount: number;
  /** 練習場次數（含不可驗證） */
  sessionsCount: number;
}

/**
 * 批次累積統計（全歷史；只計已驗證 evidence）。
 *
 * `studentIds` 為空時回傳空 Map；未出現在結果的學生代表「無任何練習」，
 * 呼叫端必須以 null 呈現（**永不**以 0% 代替）。
 */
export async function aggregateVerifiedTotalsForStudents(
  studentIds: string[],
): Promise<Map<string, StudentCumulativeTotals>> {
  if (studentIds.length === 0) return new Map();

  const rows = await PracticeRepo.aggregateVerifiedTotalsForStudentsByIds(studentIds);

  const result = new Map<string, StudentCumulativeTotals>();
  for (const row of rows) {
    result.set(row.studentId, {
      verifiedTotalQuestions: row.verifiedTotalQuestions,
      verifiedCorrectCount: row.verifiedCorrectCount,
      // 準確率一律由累積值推導；無證據 ⇒ null（「無資料」≠ 0%）
      accuracy: row.verifiedTotalQuestions > 0
        ? Math.round((row.verifiedCorrectCount / row.verifiedTotalQuestions) * 100)
        : null,
      recordedTotalQuestions: row.recordedTotalQuestions,
      recordedCorrectCount: row.recordedCorrectCount,
      sessionsCount: row.sessionsCount,
    });
  }

  return result;
}

