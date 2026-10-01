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
import { evaluatePracticeEvidence, type PracticeEvidenceResult } from './practice-evidence-service';
import { hkWeekStartUtc, hkDayStartUtc, hkMonthStartUtc, nextMonthKey, DAY_MS } from '@/shared/utils/hk-date';

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
 * 全歷史練習場次數（含不可驗證場次）—— 教師端「練習次數」顯示用。
 *
 * 2026-10-01：教師端舊碼以 `practiceSessions.length`（最新 50 場顯示視窗）
 * 當「練習次數」總數 —— 高練習量學生被截斷在 50（違反「累積數字不得由
 * 最新 N 筆推算」）。改走與 `syncActivityMetrics` 相同的單列 SQL 聚合
 * （全歷史語意與 `aggregateVerifiedTotalsForStudents` 一致）。
 */
export async function getCumulativeSessionsCount(studentId: string): Promise<number> {
  const totals = await PracticeRepo.aggregateVerifiedTotalsForStudent(studentId);
  return totals.sessionsCount;
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

// ============================================
// 出題去重素材（2026-10-01 同題重複稽核）
// ============================================
// 病根：生成端只對「同一次請求內」去重（acceptedPromptKeys），跨請求零記憶 →
// 學生短期內重複生成時會再收到幾乎相同的題目。實測（唯讀 SQL 稽核）：
//   · 重複題目集中於三條管線：ai-generated 60 組、dse-listening 33 組、
//     dse-reading 23 組（全部經 /api/ai/generate-questions；/api/reading 完整
//     試卷流程 14 日內 0 重複）；同一學生同題最多跨 13 場
//   · 同一題內容（`what do people in spain do at midnight on new year's eve?`）
//     以 **7 個不同 questionId** 各領了一次 `answerCorrect` XP
// 本模組提供兩類近期素材供生成端硬性排除 + 提示模型避開：
//   1. 題目文字（近 14 日，DB 端去重；不含答案）
//   2. 聆聽對話（由 `ListeningQuestion` 回推；換了問題文字仍是重複內容）
// 兩者都只是**去重／提示**用途（永不入敘述、永不當證據），呼叫端會再截斷長度。

/** 學生近 14 日已練習的題目文字（已正規化去重、新至舊），供出題避免重複。 */
export async function getRecentQuestionPromptsForGeneration(
  studentId: string,
  limit = 150,
): Promise<string[]> {
  if (!studentId) return [];
  const raw = await PracticeRepo.listRecentQuestionPrompts(studentId);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    const text = String(item?.prompt ?? '').trim();
    if (!text) continue;
    const key = text.toLowerCase().replace(/\s+/g, ' ');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= limit) break;
  }
  return out;
}

/** 學生近 14 日用過的聆聽對話（已正規化去重），供出題避免重用同一段內容。 */
export async function getRecentListeningDialoguesForGeneration(
  studentId: string,
  limit = 40,
): Promise<string[]> {
  if (!studentId) return [];
  const raw = await PracticeRepo.listRecentListeningDialogues(studentId);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    const text = String(item?.dialogue ?? '').trim();
    if (!text) continue;
    const key = text.toLowerCase().replace(/\s+/g, ' ');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= limit) break;
  }
  return out;
}

// ============================================
// 學生端「練習歷史」逐日檢視（2026-10-01）
// ============================================
// 需求：學生在「我的進度」只想看到最近 5 筆，無法回看每日的練習次數與類型。
// 設計（遵守 ADR-046 egress 契約）：
//   · 月摘要＝DB 端 GROUP BY（每日 × 技能）聚合，只回傳聚合列（不搬逐場記錄）
//   · 日明細＝按需查詢「單一日」（有界），逐場附正典 `evaluatePracticeEvidence`
//   · engagement（場次／題數）與 scored（準確率）分離，從不互相推導

/** 單一（香港日 × 技能）的練習量（engagement，非分數） */
export interface PracticeHistoryDaySkill {
  skill: string;
  skillZh: string;
  /** 該日該技能的場次數 */
  sessionsCount: number;
  /** 該日該技能的題數（含未驗證／開放式，不得當分數） */
  questionsTotal: number;
}

/** 單一香港日的練習摘要 */
export interface PracticeHistoryDay {
  /** 香港日 key（`YYYY-MM-DD`） */
  dayKey: string;
  sessionsCount: number;
  questionsTotal: number;
  skills: PracticeHistoryDaySkill[];
}

export interface PracticeHistoryMonth {
  /** 香港月 key（`YYYY-MM`） */
  monthKey: string;
  /** 只有「有練習」的日子；新至舊 */
  days: PracticeHistoryDay[];
}

/**
 * 指定香港月的逐日練習摘要（每日 × 技能聚合）。
 * 只回傳聚合數字（每（日, 技能）一列），單次呼叫為 KB 級。
 */
export async function getPracticeHistoryMonth(
  studentId: string,
  monthKey: string,
): Promise<PracticeHistoryMonth> {
  const since = hkMonthStartUtc(monthKey);
  const until = hkMonthStartUtc(nextMonthKey(monthKey));
  const rows = await PracticeRepo.aggregatePracticeSessionsByDayAndSkill(studentId, since, until);

  const days = new Map<string, PracticeHistoryDay>();
  for (const row of rows) {
    const skill = row.skill || 'general';
    const day = days.get(row.dayKey) ?? {
      dayKey: row.dayKey,
      sessionsCount: 0,
      questionsTotal: 0,
      skills: [],
    };
    day.sessionsCount += row.sessionsCount;
    day.questionsTotal += row.questionsTotal;
    day.skills.push({
      skill,
      skillZh: row.skillZh || skill,
      sessionsCount: row.sessionsCount,
      questionsTotal: row.questionsTotal,
    });
    days.set(row.dayKey, day);
  }

  const dayList = Array.from(days.values());
  for (const day of dayList) {
    day.skills.sort((a, b) =>
      b.sessionsCount - a.sessionsCount
      || b.questionsTotal - a.questionsTotal
      || a.skill.localeCompare(b.skill));
  }
  dayList.sort((a, b) => b.dayKey.localeCompare(a.dayKey));
  return { monthKey, days: dayList };
}

/** 單場練習（供「日明細」顯示；`verified` 由 persisted answer rows 推導） */
export interface PracticeHistorySession {
  id: string;
  skill: string;
  skillZh: string;
  difficulty: string;
  totalQuestions: number;
  correctCount: number;
  source: string;
  startedAt: Date;
  completedAt: Date | null;
  verified: PracticeEvidenceResult;
}

export interface PracticeHistoryDayDetail {
  dayKey: string;
  /** 按時間（舊→新）排序 */
  sessions: PracticeHistorySession[];
  /** 超過上限被截斷（極端爆量日；正常不會發生） */
  truncated: boolean;
}

/**
 * 指定香港日的逐場明細（有界：只查該日）。
 * 每場附正典證據投影（`evaluatePracticeEvidence`）——「未驗證」不得顯示為 0%。
 */
export async function getPracticeHistoryDay(
  studentId: string,
  dayKey: string,
  maxSessions = 200,
): Promise<PracticeHistoryDayDetail> {
  const since = hkDayStartUtc(dayKey);
  const until = new Date(since.getTime() + DAY_MS);
  const rows = await PracticeRepo.listPracticeSessionsWithEvidence(studentId, maxSessions + 1, 0, since, until);
  const truncated = rows.length > maxSessions;
  const sessions = rows
    .slice(0, maxSessions)
    .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime())
    .map(row => ({
      id: row.id,
      skill: row.skill,
      skillZh: row.skillZh,
      difficulty: row.difficulty,
      totalQuestions: row.totalQuestions,
      correctCount: row.correctCount,
      source: row.source,
      startedAt: row.startedAt,
      completedAt: row.completedAt,
      verified: evaluatePracticeEvidence(row.answers),
    }));
  return { dayKey, sessions, truncated };
}

// ============================================
// 教師端：單日逐場 + 逐題明細（2026-10-01）
// ============================================
// 需求：教師端「學生詳情」原本只列最新 10 場（資料來源取最新 50 場），
// 無法回看歷史。與學生端共用同一個逐日瀏覽（月摘要／日明細），但教師需要
// **逐題答案**；學生端維持精簡選取，逐題明細僅在教師檢視時按「單日」有界
// 查詢（一次一天，不搬全歷史）。

/** 教師檢視用：逐題顯示欄位（評分權威仍在 persisted rows，不由此推導） */
export interface PracticeHistoryAnswerDetail {
  questionIndex: number;
  questionType: string;
  questionPrompt: string;
  correctAnswer: string;
  studentAnswer: string;
  isCorrect: boolean;
  result: string | null;
  timeSpent: number | null;
}

export interface PracticeHistoryTeacherSession extends PracticeHistorySession {
  answers: PracticeHistoryAnswerDetail[];
}

export interface PracticeHistoryTeacherDayDetail {
  dayKey: string;
  /** 按時間（舊→新）排序 */
  sessions: PracticeHistoryTeacherSession[];
  truncated: boolean;
}

/**
 * 指定香港日的逐場明細（含逐題答案）——**僅供教師端**。
 * 學生端請用 `getPracticeHistoryDay`（不搬題目文字）。
 */
export async function getPracticeHistoryDayForTeacher(
  studentId: string,
  dayKey: string,
  maxSessions = 200,
): Promise<PracticeHistoryTeacherDayDetail> {
  const since = hkDayStartUtc(dayKey);
  const until = new Date(since.getTime() + DAY_MS);
  const rows = await PracticeRepo.listPracticeSessionsWithAnswersInRange(studentId, since, until, maxSessions + 1);
  const truncated = rows.length > maxSessions;
  const sessions = rows.slice(0, maxSessions).map(row => ({
    id: row.id,
    skill: row.skill,
    skillZh: row.skillZh,
    difficulty: row.difficulty,
    totalQuestions: row.totalQuestions,
    correctCount: row.correctCount,
    source: row.source,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    verified: evaluatePracticeEvidence(row.answers),
    answers: row.answers.map(a => ({
      questionIndex: a.questionIndex,
      questionType: a.questionType,
      questionPrompt: a.questionPrompt,
      correctAnswer: a.correctAnswer,
      studentAnswer: a.studentAnswer,
      isCorrect: a.isCorrect,
      result: a.result,
      timeSpent: a.timeSpent,
    })),
  }));
  return { dayKey, sessions, truncated };
}

