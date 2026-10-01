// ============================================
// Teacher Monitoring — 班級練習數據總覽（教師主頁「班級完成率」區塊）
// ============================================
// 2026-10-01 用戶回報（修正前的三個缺陷）：
// 1. 教師主頁只顯示 `classes.slice(0, 8)` —— 全校 25 個班別只看得到 8 個；
// 2. 「完成率」只由 `Assignment.completionRate` 平均得出 —— 沒有派發作業的
//    班別（25 班中大多數）整條棒是空的，「看不到全校所有班別的資料」；
// 3. 圖例只有「完成率／平均正確率」，與區塊標題「班級完成率」不符，
//    亦沒有「完成次數、參與人數、參與率」等班別層級數據。
//
// 本服務提供**全校**（排除 Demo）每個班別的：
//   · 完成次數（全歷史練習場次；engagement 語意，含不可驗證舊場次）
//   · 參與人數（有 ≥1 場練習的學生數）
//   · 參與率（參與人數 ÷ 名單人數）
//   · 正確率（全歷史**已驗證證據**聚合；無可驗證證據 ⇒ null）
// 加上名單人數（正確率的「—」與參與率的分母都需要誠實呈現）。
//
// 規則約束（AGENTS.md／ADR-046）：
// - 「累積」數字一律走正典 SQL 聚合 `aggregateVerifiedTotalsForStudents()`
//   （單一 SQL、每名學生一列），**永不**以「最新 N 筆」切片或逐列搬運推算。
// - 「無資料 ≠ 0」：無可驗證證據時 `accuracy = null`（UI 顯示「—」），
//   不得以 0% 冒充。
// - 名單語意與 `/api/teacher/students` 一致：`User.classId` ∪ `StudentClass`、
//   排除 `role ≠ 'student'` 與 `level = 'Demo'`（Demo 班本身亦排除）。
//
// 權限（2026-10-01，依用戶明確要求）：顯示「全校所有班別」的**聚合數字**，
// 不含任何學生層級資料（姓名、id）；與「教師可匯出全校學生」的既有指示
// 一致。學生層級資料仍只留在 `/api/teacher/students`（受任教班級限制）。
import { db } from '@/shared/db/db';
import { aggregateVerifiedTotalsForStudents } from '@/modules/exercise/services/practice-history-service';

/** 單一班別的練習數據（全歷史累積；純聚合，無學生層級資料） */
export interface ClassPracticeStats {
  classId: string;
  className: string;
  gradeLevel: string;
  /** 現行名單人數（User.classId ∪ StudentClass；排除 Demo） */
  studentCount: number;
  /** 參與人數：有 ≥1 場練習場次的學生數 */
  participantCount: number;
  /** 參與率（0-100，四捨五入）；名單為空 ⇒ null（不得顯示 0%） */
  participationRate: number | null;
  /** 完成次數：全歷史練習場次數（engagement，不限已驗證） */
  sessionsCount: number;
  /** 正確率（0-100，四捨五入；以全歷史已驗證題目聚合）；無證據 ⇒ null */
  accuracy: number | null;
}

/** 年級排序權重（S1 < S2 < …；非 S1-S6 一律排最後） */
function gradeRank(gradeLevel: string): number {
  const match = /^S(\d)$/.exec(gradeLevel);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

/**
 * 全校班級練習數據（單一查詢聚合；詳見檔頭契約）。
 *
 * 呼叫端：`GET /api/teacher/class-stats`（教師＋管理員）。
 * 回傳只含「有班別」的學生 —— 已解除班別（畢業／轉校）的學生不計入
 * 任何班別，與教師名單的 roster 語意一致。
 */
export async function getClassPracticeStats(): Promise<ClassPracticeStats[]> {
  const classes = await db.class.findMany({
    where: { name: { not: 'Demo' } },
    select: { id: true, name: true, gradeLevel: true },
  });
  if (classes.length === 0) return [];

  // 名單來源（與 `/api/teacher/students` 相同的兩組判定）：
  //   1. 主班級 `User.classId`
  //   2. 混合上課 `StudentClass`（目前生產資料為 0 列，仍須支援）
  const [primaryMembers, mixedMembers] = await Promise.all([
    db.user.findMany({
      where: { role: 'student', level: { not: 'Demo' }, classId: { not: null } },
      select: { id: true, classId: true },
    }),
    db.studentClass.findMany({
      where: { student: { role: 'student', level: { not: 'Demo' } } },
      select: { studentId: true, classId: true },
    }),
  ]);

  const membersByClass = new Map<string, Set<string>>();
  const addMember = (classId: string, studentId: string) => {
    const members = membersByClass.get(classId) ?? new Set<string>();
    members.add(studentId);
    membersByClass.set(classId, members);
  };
  for (const member of primaryMembers) if (member.classId) addMember(member.classId, member.id);
  for (const member of mixedMembers) addMember(member.classId, member.studentId);

  const allStudentIds = Array.from(new Set([
    ...primaryMembers.map(member => member.id),
    ...mixedMembers.map(member => member.studentId),
  ]));

  // 單一 SQL、每名學生一列（全歷史已驗證證據）— 永不逐列搬運（ADR-046）。
  // 沒有練習場次的學生不會出現在 Map 中 ⇒ 不計入參與。
  const totals = await aggregateVerifiedTotalsForStudents(allStudentIds);

  const stats: ClassPracticeStats[] = classes.map((cls) => {
    const members = membersByClass.get(cls.id) ?? new Set<string>();
    let participantCount = 0;
    let sessionsCount = 0;
    let verifiedQuestions = 0;
    let verifiedCorrect = 0;
    for (const studentId of members) {
      const studentTotals = totals.get(studentId);
      if (!studentTotals) continue; // 無任何練習場次
      if (studentTotals.sessionsCount > 0) participantCount += 1;
      sessionsCount += studentTotals.sessionsCount;
      verifiedQuestions += studentTotals.verifiedTotalQuestions;
      verifiedCorrect += studentTotals.verifiedCorrectCount;
    }
    const studentCount = members.size;
    return {
      classId: cls.id,
      className: cls.name,
      gradeLevel: cls.gradeLevel,
      studentCount,
      participantCount,
      // 名單為空 ⇒ 「—」（不得顯示 0%）；參與率為 0 才是真實的「無人參與」
      participationRate: studentCount > 0 ? Math.round((participantCount / studentCount) * 100) : null,
      sessionsCount,
      // 無可驗證題目 ⇒ 「—」（「無資料 ≠ 0」）
      accuracy: verifiedQuestions > 0 ? Math.round((verifiedCorrect / verifiedQuestions) * 100) : null,
    };
  });

  // 排序：年級（S1→S6）→ 同級再按班名（1A < 1B < …）
  return stats.sort((a, b) =>
    gradeRank(a.gradeLevel) - gradeRank(b.gradeLevel)
    || a.gradeLevel.localeCompare(b.gradeLevel)
    || a.className.localeCompare(b.className),
  );
}
