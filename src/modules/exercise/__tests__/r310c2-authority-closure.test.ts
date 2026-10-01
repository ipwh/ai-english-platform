// ============================================
// R3.10-C.2: Authority closure behavioral tests
// Proves that every scored projection derives from canonical
// evaluatePracticeEvidence — never from raw PracticeSession totals
// or client-supplied values.
// ============================================
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  classifySessionEvidence,
  projectVerifiedProgress,
  aggregateVerifiedMonthlyTrend,
  aggregateStudentPracticeTotals,
  evaluatePracticeEvidence,
  type SessionEvidenceEntry,
} from '../services/practice-evidence-service';

const verifiedRow = (overrides: Record<string, unknown> = {}) => ({
  questionId: 'q1',
  result: 'correct',
  awardedScore: 1,
  maxScore: 1,
  countsTowardScore: true,
  scoredBy: 'server',
  scoringMethod: 'server-key-resolved',
  ...overrides,
});

const entry = (overrides: Partial<SessionEvidenceEntry> = {}): SessionEvidenceEntry => ({
  id: 's1',
  skill: 'tenses',
  skillZh: '時態',
  source: 'ai-generated',
  startedAt: new Date('2026-08-10T10:00:00.000Z'),
  evidence: { status: 'verified', totalQuestions: 3, correctCount: 2, accuracy: 67 },
  ...overrides,
});

// ============================================
// Phase 8 / Q — countsTowardScore semantics (deterministic)
// ============================================

describe('R3.10-C.2 countsTowardScore contract (Q)', () => {
  it('countsTowardScore === null is counted (schema default semantics, never excluded silently)', () => {
    const ev = evaluatePracticeEvidence([
      verifiedRow({ countsTowardScore: null }),
      verifiedRow({ questionId: 'q2', result: 'incorrect', awardedScore: 0 }),
    ]);
    expect(ev).toMatchObject({ status: 'verified', totalQuestions: 2, correctCount: 1 });
  });

  it('countsTowardScore === undefined is counted (schema default semantics)', () => {
    const ev = evaluatePracticeEvidence([
      verifiedRow({ countsTowardScore: undefined }),
      verifiedRow({ questionId: 'q2', result: 'incorrect', awardedScore: 0 }),
    ]);
    expect(ev).toMatchObject({ status: 'verified', totalQuestions: 2, correctCount: 1 });
  });

  it('literal false is excluded deterministically', () => {
    const ev = evaluatePracticeEvidence([
      verifiedRow({ countsTowardScore: false, result: 'incorrect', awardedScore: 0 }),
      verifiedRow({ questionId: 'q2' }),
    ]);
    expect(ev).toMatchObject({ status: 'verified', totalQuestions: 1, correctCount: 1 });
  });

  it('evaluation is deterministic across repeated calls with identical input', () => {
    const rows = [
      verifiedRow({ countsTowardScore: null }),
      verifiedRow({ questionId: 'q2', result: 'incorrect', awardedScore: 0, countsTowardScore: false }),
      verifiedRow({ questionId: 'q3' }),
    ];
    const first = JSON.stringify(evaluatePracticeEvidence(rows));
    const second = JSON.stringify(evaluatePracticeEvidence(rows));
    expect(second).toBe(first);
    expect(evaluatePracticeEvidence(rows)).toMatchObject({ status: 'verified', totalQuestions: 2, correctCount: 2 });
  });
});

// ============================================
// classifySessionEvidence — forged totals never verified
// ============================================

describe('R3.10-C.2 classifySessionEvidence', () => {
  it('forged PracticeSession totals do NOT become verified evidence', () => {
    const cls = classifySessionEvidence({
      totalQuestions: 999,
      correctCount: 999,
      answers: [], // zero answers → unverifiable
    });
    expect(cls.evidence).toMatchObject({ status: 'unverifiable', reason: 'no-answers' });
    expect(cls.verifiedTotals).toBeNull();
    expect(cls.recordedTotals).toEqual({ totalQuestions: 999, correctCount: 999 });
  });

  it('historical client-scored rows are unverifiable and never contribute', () => {
    const cls = classifySessionEvidence({
      totalQuestions: 10,
      correctCount: 10,
      answers: [verifiedRow({ scoredBy: 'client' })],
    });
    expect(cls.evidence).toMatchObject({ status: 'unverifiable', reason: 'unsupported-authority' });
    expect(cls.verifiedTotals).toBeNull();
  });

  it('verified rows derive totals from evidence, not from the session aggregate', () => {
    const cls = classifySessionEvidence({
      totalQuestions: 999, // forged
      correctCount: 999,   // forged
      answers: [
        verifiedRow(),
        verifiedRow({ questionId: 'q2', result: 'incorrect', awardedScore: 0 }),
        verifiedRow({ questionId: 'q3', result: 'incorrect', awardedScore: 0 }),
      ],
    });
    expect(cls.evidence.status).toBe('verified');
    expect(cls.verifiedTotals).toEqual({ totalQuestions: 3, correctCount: 1 });
    expect(cls.recordedTotals).toEqual({ totalQuestions: 999, correctCount: 999 });
  });
});

// ============================================
// projectVerifiedProgress — B1 core behavior
// ============================================

describe('R3.10-C.2 projectVerifiedProgress (B1 analyze-progress)', () => {
  it('weakSkills / recentPerformance / overallAccuracy come ONLY from verified entries', () => {
    const projection = projectVerifiedProgress([
      entry({ id: 's1', skillZh: '時態', evidence: { status: 'verified', totalQuestions: 3, correctCount: 2, accuracy: 67 } }),
      entry({ id: 's2', skillZh: '時態', evidence: { status: 'verified', totalQuestions: 1, correctCount: 1, accuracy: 100 } }),
      entry({ id: 's3', skillZh: '時態', evidence: { status: 'unverifiable', reason: 'no-answers' } }),
      entry({ id: 's4', skillZh: '時態', evidence: { status: 'unverifiable', reason: 'unsupported-authority' } }),
    ]);
    expect(projection.verifiedTotalQuestions).toBe(4);
    expect(projection.verifiedCorrectCount).toBe(3);
    expect(projection.overallAccuracy).toBe(75);
    // 時態 accuracy = 75 → >= 70 → not a weak skill
    expect(projection.weakSkills).toEqual([]);
    expect(projection.recentPerformance).toHaveLength(2);
    expect(projection.recentPerformance[0]).toEqual({
      date: new Date('2026-08-10T10:00:00.000Z').toLocaleDateString(),
      accuracy: 67,
      questionsDone: 3,
    });
  });

  it('client-supplied accuracy cannot influence the projection (no client input exists)', () => {
    // projectVerifiedProgress has no client-total parameter at all —
    // forged session aggregates are structurally impossible to pass.
    const projection = projectVerifiedProgress([
      entry({ id: 's1', skillZh: '文法', evidence: { status: 'verified', totalQuestions: 10, correctCount: 2, accuracy: 20 } }),
    ]);
    expect(projection.overallAccuracy).toBe(20);
    expect(projection.weakSkills.map(w => w.accuracy)).toEqual([20]);
  });

  it('zero verified evidence → overallAccuracy null, empty weak skills/recent performance', () => {
    const projection = projectVerifiedProgress([
      entry({ id: 's1', skillZh: '文法', evidence: { status: 'unverifiable', reason: 'no-answers' } }),
    ]);
    expect(projection.overallAccuracy).toBeNull();
    expect(projection.weakSkills).toEqual([]);
    expect(projection.recentPerformance).toEqual([]);
    expect(projection.verifiedTotalQuestions).toBe(0);
  });
});

// ============================================
// aggregateVerifiedMonthlyTrend — B2 admin stats
// ============================================

describe('R3.10-C.2 aggregateVerifiedMonthlyTrend (B2 admin stats)', () => {
  it('unverified correctness is NOT counted as scored correctness', () => {
    const points = aggregateVerifiedMonthlyTrend([
      // forged raw totals, zero answers → unverifiable
      { startedAt: new Date('2026-08-01T00:00:00.000Z'), totalQuestions: 500, correctCount: 500, answers: [] },
      // verified rows
      {
        startedAt: new Date('2026-08-02T00:00:00.000Z'),
        totalQuestions: 999,
        correctCount: 999,
        answers: [verifiedRow(), verifiedRow({ questionId: 'q2', result: 'incorrect', awardedScore: 0 })],
      },
      // historical client authority → unverifiable
      {
        startedAt: new Date('2026-08-03T00:00:00.000Z'),
        totalQuestions: 100,
        correctCount: 100,
        answers: [verifiedRow({ scoredBy: 'client' })],
      },
    ]);
    expect(points).toEqual([
      { month: '2026-08', sessions: 3, verifiedQuestions: 2, verifiedCorrect: 1 },
    ]);
  });

  it('session counts remain raw engagement; scored counts are verified-only', () => {
    const points = aggregateVerifiedMonthlyTrend([
      { startedAt: new Date('2026-07-01T00:00:00.000Z'), totalQuestions: 0, correctCount: 0, answers: [] },
      {
        startedAt: new Date('2026-08-01T00:00:00.000Z'),
        totalQuestions: 1,
        correctCount: 1,
        answers: [verifiedRow()],
      },
    ]);
    expect(points.map(p => p.month)).toEqual(['2026-07', '2026-08']);
    expect(points[0]).toEqual({ month: '2026-07', sessions: 1, verifiedQuestions: 0, verifiedCorrect: 0 });
    expect(points[1]).toEqual({ month: '2026-08', sessions: 1, verifiedQuestions: 1, verifiedCorrect: 1 });
  });
});

// ============================================
// aggregateStudentPracticeTotals — B3 admin export
// ============================================

describe('R3.10-C.2 aggregateStudentPracticeTotals (B3 admin export)', () => {
  it('export never falsely labels raw historical totals as verified', () => {
    const totals = aggregateStudentPracticeTotals([
      { totalQuestions: 500, correctCount: 500, answers: [] }, // historical raw
      { totalQuestions: 20, correctCount: 20, answers: [verifiedRow(), verifiedRow({ questionId: 'q2', result: 'incorrect', awardedScore: 0 })] },
    ]);
    expect(totals.verifiedTotalQuestions).toBe(2);
    expect(totals.verifiedCorrectCount).toBe(1);
    expect(totals.recordedTotalQuestions).toBe(520);
    expect(totals.recordedCorrectCount).toBe(520);
  });

  it('zero verified evidence → verified totals are zero, recorded preserved', () => {
    const totals = aggregateStudentPracticeTotals([
      { totalQuestions: 42, correctCount: 7, answers: [verifiedRow({ scoredBy: 'robot' })] },
    ]);
    expect(totals.verifiedTotalQuestions).toBe(0);
    expect(totals.verifiedCorrectCount).toBe(0);
    expect(totals.recordedTotalQuestions).toBe(42);
    expect(totals.recordedCorrectCount).toBe(7);
  });
});

// ============================================
// Consumer boundary contracts (route-level plumbing)
// ============================================

describe('R3.10-C.2 consumer boundary contracts', () => {
  const root = resolve(import.meta.dirname, '../../../..');

  it('B1 analyze-progress uses canonical verified evidence and never client fallback for DB path', () => {
    const route = readFileSync(resolve(root, 'src/app/api/ai/analyze-progress/route.ts'), 'utf-8');
    expect(route).toContain('getVerifiedPracticeSessions(studentId, 30)');
    expect(route).toContain('projectVerifiedProgress(verifiedSessions)');
    expect(route).toContain('insufficientEvidence: true');
    // client fallback removed for DB path:
    expect(route).not.toContain('resolvedWeakSkills = weakSkills || []');
    expect(route).not.toContain('resolvedAccuracy = user.overallAccuracy ?? resolvedAccuracy');
    expect(route).not.toContain('entry.total += s.totalQuestions');
  });

  it('B2 admin stats monthly trend uses canonical verified evidence', () => {
    const route = readFileSync(resolve(root, 'src/app/api/admin/stats/route.ts'), 'utf-8');
    expect(route).toContain('aggregateVerifiedMonthlyTrend(recentSessions)');
    expect(route).toContain('questions: p.verifiedQuestions');
    // raw aggregate arithmetic removed:
    expect(route).not.toContain('entry.questions += s.totalQuestions');
  });

  it('B3 admin export separates verified vs recorded totals', () => {
    const route = readFileSync(resolve(root, 'src/app/api/admin/export/students/route.ts'), 'utf-8');
    // 2026-09-21 稽核：批次投影改為**全歷史**（`aggregateStudentPracticeTotals(s.sessions)`
    // 搭配 `sessions: { take: 50 }` 會把「最新 50 場」當成總數）。
    expect(route).toContain('aggregateVerifiedTotalsForStudents(studentIds)');
    expect(route).toContain('recordedTotalQuestions');
    expect(route).toContain('verifiedTotalQuestions');
    expect(route).not.toContain('take: 50');
    expect(route).not.toContain('aggregateStudentPracticeTotals(s.sessions)');
    expect(route).not.toContain("s.sessions.reduce((sum, sess) => sum + sess.totalQuestions, 0)");
  });

  it('B4 admin analytics attaches canonical verified evidence and nullable accuracy', () => {
    const route = readFileSync(resolve(root, 'src/app/api/admin/students/[studentId]/analytics/route.ts'), 'utf-8');
    expect(route).toContain('classifySessionEvidence(s)');
    expect(route).toContain('verifiedTotals?.totalQuestions');
    expect(route).toContain('accuracy: v.total > 0');
    expect(route).not.toContain("_sum: { totalQuestions: true, correctCount: true }");
  });

  it('B5 diagnostic page never derives accuracy from raw totals for unverified sessions', () => {
    const page = readFileSync(resolve(root, 'src/app/student/diagnostic/page.tsx'), 'utf-8');
    expect(page).toContain("if (!v || v.status !== 'verified') return [];");
    expect(page).not.toContain('accuracy: s.totalQuestions > 0 ? Math.round((s.correctCount / s.totalQuestions) * 100) : 0');
  });

  it('B6 dashboard and help pages have no stored-total fallback', () => {
    const dashboard = readFileSync(resolve(root, 'src/app/student/dashboard/page.tsx'), 'utf-8');
    const help = readFileSync(resolve(root, 'src/app/student/help/page.tsx'), 'utf-8');
    expect(dashboard).toContain("if (!v || v.status !== 'verified') return [];");
    expect(help).toContain("if (!v || v.status !== 'verified') return [];");
    expect(dashboard).not.toContain('?? s.totalQuestions');
    expect(dashboard).not.toContain('?? s.correctCount');
    expect(help).not.toContain('?? session.totalQuestions');
    expect(help).not.toContain('?? session.correctCount');
    // help page passes studentId so the server path is authoritative:
    expect(help).toContain('studentId: profile.id');
  });

  it('B7 store scored metrics come from the server evidence projection (no client derivation)', () => {
    // 2026-09-20 稽核：store 不再由本機 sessions 推算 scored 指標
    // （舊實作以「最新 50 場」加總 → 技能題數會隨練習推移下降甚至整列消失）。
    const store = readFileSync(resolve(root, 'src/store/practiceStore.ts'), 'utf-8');
    expect(store).not.toContain("if (!v || v.status !== 'verified') continue;");
    expect(store).not.toContain('const accuracy = vTotal > 0');
    expect(store).toContain('cumulativeSkillTotals');
    expect(store).toContain('serverWeekly');

    // 證據閘門的唯一 owner 改為伺服器端的累積投影服務：
    const svc = readFileSync(resolve(root, 'src/modules/exercise/services/practice-history-service.ts'), 'utf-8');
    expect(svc).toContain('evaluatePracticeEvidence');
    expect(svc).toContain("if (evidence.status !== 'verified') continue;");
  });

  it('B7 progress page never sends raw-total recentPerformance to the AI analysis', () => {
    const page = readFileSync(resolve(root, 'src/app/student/progress/page.tsx'), 'utf-8');
    expect(page).toContain("if (!v || v.status !== 'verified') return [];");
    expect(page).not.toContain("accuracy: Math.round((s.correctCount / Math.max(1, s.totalQuestions)) * 100)");
    // unverified sessions show an explicit label, not raw accuracy:
    // 2026-10-01：改由 i18n key 提供（字串在 i18n-progress.ts；契約不變）
    expect(page).toContain("t('progress.unverified')");
    const i18n = readFileSync(resolve(root, 'src/shared/utils/i18n-progress.ts'), 'utf-8');
    expect(i18n).toContain("'progress.unverified'");
  });

  it('teacher dashboard never displays raw totals as accuracy for unverified sessions', () => {
    const page = readFileSync(resolve(root, 'src/app/teacher/students/[studentId]/page.tsx'), 'utf-8');
    expect(page).toContain("store.language === 'en' ? 'Unverified' : '未驗證'");
    expect(page).not.toContain(': 0}%');
  });

  it('K grammar radar ignores unverifiable sessions (existing R3.10-C edge)', () => {
    const route = readFileSync(resolve(root, 'src/app/api/diagnostic/grammar/route.ts'), 'utf-8');
    expect(route).toContain("if (s.evidence.status !== 'verified') continue;");
  });

  it('L teacher dashboard attaches canonical verified evidence per session', () => {
    const route = readFileSync(resolve(root, 'src/app/api/teacher/students/[id]/route.ts'), 'utf-8');
    expect(route).toContain('verified: evaluatePracticeEvidence(s.answers)');
  });
});
