// ============================================
// R3.10-K Phase 9 Step 6 — route-level security regression tests
//
// Behavior-level tests for every fixed P0/P1 authorization boundary:
//   SEC-001 auth/role (PATCH removed)
//   SEC-002 ai/translate (auth + caps + non-200 on failure)
//   SEC-003 ai/health (teacher/admin + sanitized)
//   SEC-004 srs/review (cross-user read/write blocked)
//   SEC-005 mistakes/bulk (cross-user mutation blocked)
//   SEC-006 streak (cross-user XP/read blocked)
//   SEC-007 notifications (recipient always self)
//   SEC-008 analyze-progress (cross-user progress blocked)
//
// verifyApiAuth is mocked (the shared helper is exercised by other means),
// but verifyStudentSelfAccess runs its REAL implementation so the actual
// ownership decision logic is what these tests prove.
// ============================================

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  verifyApiAuth: vi.fn(),
  verifySessionToken: vi.fn(),
  authNextAuth: vi.fn(),
  findUserByIdSelect: vi.fn(),

  // vocabulary-service
  getStudentWords: vi.fn(),
  getDueReviews: vi.fn(),
  getWordById: vi.fn(),

  // @/modules/student
  updateVocab: vi.fn(),
  listMistakes: vi.fn(),
  bulkUpdateMistakes: vi.fn(),
  bulkDeleteMistakes: vi.fn(),
  getTodaysXpTransaction: vi.fn(),
  createXpTransaction: vi.fn(),
  updateUser: vi.fn(),
  listNotifications: vi.fn(),
  countUnreadNotifications: vi.fn(),
  markNotificationRead: vi.fn(),
  markNotificationsRead: vi.fn(),
  createNotification: vi.fn(),

  // streak-service / gamification
  syncUserStreak: vi.fn(),
  calculatePracticeStreak: vi.fn(),
  calculateXp: vi.fn(),

  // diagnostic/grammar route
  getRecentDiagnostics: vi.fn(),
  listPracticeSessions: vi.fn(),
  persistGeneratedGrammarQuestions: vi.fn(),

  // admin-operations
  adminDbQuery: vi.fn(),

  // practice-evidence-service
  getVerifiedPracticeSessions: vi.fn(),
  projectVerifiedProgress: vi.fn(),

  // @/modules/ai facade
  callLLM: vi.fn(),
  analyzeProgress: vi.fn(),
  generateQuestions: vi.fn(),
  isDeepSeekConfigured: vi.fn(() => true),
}));

vi.mock('@/modules/repositories', () => ({
  StudentRepo: { findRecordOwner: vi.fn() },
}));

vi.mock('@/shared/auth/api-auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/auth/api-auth')>();
  return {
    ...actual,
    // Emulate the real helper's role enforcement for allowedRoles so route
    // behavior (403 for students on staff endpoints) is actually exercised.
    verifyApiAuth: async (req: unknown, allowedRoles?: string[]) => {
      const result = await mocks.verifyApiAuth(req, allowedRoles);
      if (allowedRoles && result.authenticated && result.role && !allowedRoles.includes(result.role)) {
        return { authenticated: false, error: '權限不足' };
      }
      return result;
    },
  };
});

vi.mock('@/shared/auth/auth-next', () => ({ auth: mocks.authNextAuth }));

vi.mock('@/shared/auth/jwt', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/auth/jwt')>();
  return { ...actual, verifySessionToken: mocks.verifySessionToken };
});

vi.mock('@/modules/vocabulary/services/vocabulary-service', () => ({
  getStudentWords: mocks.getStudentWords,
  getDueReviews: mocks.getDueReviews,
  getWordById: mocks.getWordById,
}));

vi.mock('@/modules/student/progress/services/streak-service', () => ({
  syncUserStreak: mocks.syncUserStreak,
  calculatePracticeStreak: mocks.calculatePracticeStreak,
}));

vi.mock('@/modules/student/progress/services/gamification', () => ({
  calculateXp: mocks.calculateXp,
}));

vi.mock('@/modules/admin/services/admin-operations', () => ({
  adminDbQuery: mocks.adminDbQuery,
}));

vi.mock('@/modules/exercise/services/practice-evidence-service', () => ({
  getVerifiedPracticeSessions: mocks.getVerifiedPracticeSessions,
  projectVerifiedProgress: mocks.projectVerifiedProgress,
}));

vi.mock('@/modules/exercise/services/grammar-question-service', () => ({
  persistGeneratedGrammarQuestions: mocks.persistGeneratedGrammarQuestions,
}));

vi.mock('@/modules/student', () => ({
  findUserByIdSelect: mocks.findUserByIdSelect,
  updateVocab: mocks.updateVocab,
  listMistakes: mocks.listMistakes,
  bulkUpdateMistakes: mocks.bulkUpdateMistakes,
  bulkDeleteMistakes: mocks.bulkDeleteMistakes,
  getTodaysXpTransaction: mocks.getTodaysXpTransaction,
  createXpTransaction: mocks.createXpTransaction,
  updateUser: mocks.updateUser,
  listNotifications: mocks.listNotifications,
  countUnreadNotifications: mocks.countUnreadNotifications,
  markNotificationRead: mocks.markNotificationRead,
  markNotificationsRead: mocks.markNotificationsRead,
  createNotification: mocks.createNotification,
  getRecentDiagnostics: mocks.getRecentDiagnostics,
  listPracticeSessions: mocks.listPracticeSessions,
}));

vi.mock('@/modules/ai', () => ({
  callLLM: mocks.callLLM,
  analyzeProgress: mocks.analyzeProgress,
  generateQuestions: mocks.generateQuestions,
  isBudgetExceededError: (e: unknown) => e instanceof Error && e.name === 'BudgetExceededError',
  isDeepSeekConfigured: mocks.isDeepSeekConfigured,
  getLastAIProvider: () => 'deepseek',
  wasFallbackUsed: () => false,
  isAIConfigured: () => true,
  getAIProviders: () => ({ deepseekConfigured: true }),
}));

import * as roleRoute from '../auth/role/route';
import * as translateRoute from '../ai/translate/route';
import * as healthRoute from '../ai/health/route';
import * as srsRoute from '../srs/review/route';
import * as mistakesBulkRoute from '../mistakes/bulk/route';
import * as streakRoute from '../streak/route';
import * as notificationsRoute from '../notifications/route';
import * as analyzeProgressRoute from '../ai/analyze-progress/route';
import * as diagnosticGrammarRoute from '../diagnostic/grammar/route';

const studentA = { authenticated: true, userId: 'student-A', role: 'student' };
const studentBId = 'student-B';

function authAs(result: { authenticated: boolean; userId?: string; role?: string; error?: string }) {
  mocks.verifyApiAuth.mockResolvedValue(result);
}

function post(url: string, body: unknown): NextRequest {
  return new NextRequest(url, { method: 'POST', body: JSON.stringify(body) });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isDeepSeekConfigured.mockReturnValue(true);
  mocks.verifySessionToken.mockResolvedValue(null);
  mocks.authNextAuth.mockResolvedValue(null);
  mocks.findUserByIdSelect.mockResolvedValue(null);
  mocks.getStudentWords.mockResolvedValue([]);
  mocks.getDueReviews.mockResolvedValue([]);
  mocks.getWordById.mockResolvedValue(null);
  mocks.updateVocab.mockResolvedValue({});
  mocks.listMistakes.mockResolvedValue([]);
  mocks.bulkUpdateMistakes.mockResolvedValue({ count: 1 });
  mocks.bulkDeleteMistakes.mockResolvedValue({ count: 1 });
  mocks.syncUserStreak.mockResolvedValue(3);
  mocks.calculatePracticeStreak.mockResolvedValue(2);
  mocks.calculateXp.mockReturnValue(10);
  mocks.getTodaysXpTransaction.mockResolvedValue(null);
  mocks.createXpTransaction.mockResolvedValue({ id: 'xp-1' });
  mocks.updateUser.mockResolvedValue({});
  mocks.adminDbQuery.mockResolvedValue(null);
  mocks.getVerifiedPracticeSessions.mockResolvedValue([]);
  mocks.projectVerifiedProgress.mockReturnValue({ overallAccuracy: null, weakSkills: [], recentPerformance: [] });
  mocks.analyzeProgress.mockResolvedValue({ summary: 'ok' });
  mocks.callLLM.mockResolvedValue('[{"q":"你好","h":"提示"}]');
  mocks.getRecentDiagnostics.mockResolvedValue([]);
  mocks.listPracticeSessions.mockResolvedValue([]);
  mocks.persistGeneratedGrammarQuestions.mockResolvedValue([]);
});

describe('SEC-001: /api/auth/role — privilege escalation removed', () => {
  it('PATCH handler no longer exists (only GET + POST view-switch)', () => {
    expect((roleRoute as unknown as Record<string, unknown>).PATCH).toBeUndefined();
    expect(typeof (roleRoute as unknown as Record<string, unknown>).GET).toBe('function');
    expect(typeof (roleRoute as unknown as Record<string, unknown>).POST).toBe('function');
  });

  it('GET returns the user read from the session — no role write path', async () => {
    mocks.authNextAuth.mockResolvedValue({ user: { id: 'u1' } });
    mocks.findUserByIdSelect.mockResolvedValue({ id: 'u1', role: 'student' });
    const res = await roleRoute.GET(new NextRequest('http://localhost/api/auth/role'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.user.id).toBe('u1');
    expect(json.user.role).toBe('student');
  });
});

describe('SEC-002: /api/ai/translate — auth + caps + honest failure', () => {
  it('anonymous request → 401', async () => {
    authAs({ authenticated: false, error: '請先登入' });
    const res = await translateRoute.POST(post('http://localhost/api/ai/translate', { items: [{ question: 'Q', hint: '' }] }));
    expect(res.status).toBe(401);
  });

  it('malformed body → 400', async () => {
    authAs(studentA);
    const res = await translateRoute.POST(post('http://localhost/api/ai/translate', { nope: true }));
    expect(res.status).toBe(400);
  });

  it('too many items → 400', async () => {
    authAs(studentA);
    const items = Array.from({ length: 21 }, (_, i) => ({ question: `Q${i}`, hint: '' }));
    const res = await translateRoute.POST(post('http://localhost/api/ai/translate', { items }));
    expect(res.status).toBe(400);
  });

  it('oversized text → 400', async () => {
    authAs(studentA);
    const res = await translateRoute.POST(post('http://localhost/api/ai/translate', {
      items: [{ question: 'x'.repeat(2001), hint: '' }],
    }));
    expect(res.status).toBe(400);
  });

  it('upstream failure → non-2xx (never a fake empty success)', async () => {
    authAs(studentA);
    mocks.callLLM.mockRejectedValue(new Error('provider down'));
    const res = await translateRoute.POST(post('http://localhost/api/ai/translate', { items: [{ question: 'Q', hint: '' }] }));
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.translations).toBeUndefined();
  });

  it('budget exhaustion → 503', async () => {
    authAs(studentA);
    const budgetErr = new Error('Daily AI token budget exceeded.');
    budgetErr.name = 'BudgetExceededError';
    mocks.callLLM.mockRejectedValue(budgetErr);
    const res = await translateRoute.POST(post('http://localhost/api/ai/translate', { items: [{ question: 'Q', hint: '' }] }));
    expect(res.status).toBe(503);
  });

  it('valid authenticated request → translations preserved', async () => {
    authAs(studentA);
    const res = await translateRoute.POST(post('http://localhost/api/ai/translate', { items: [{ question: 'What time is it?', hint: 'time' }] }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.translations).toHaveLength(1);
  });
});

describe('SEC-003: /api/ai/health — staff-only + sanitized', () => {
  it('anonymous → 401', async () => {
    authAs({ authenticated: false, error: '請先登入' });
    const res = await healthRoute.GET(new NextRequest('http://localhost/api/ai/health'));
    expect(res.status).toBe(401);
  });

  it('student → denied', async () => {
    authAs(studentA);
    const res = await healthRoute.GET(new NextRequest('http://localhost/api/ai/health'));
    expect(res.status).toBe(401);
  });

  it('teacher → 200 and no baseUrl / raw error echo in payload', async () => {
    authAs({ authenticated: true, userId: 't1', role: 'teacher' });
    mocks.isDeepSeekConfigured.mockReturnValue(false); // no live paid probe in tests
    const res = await healthRoute.GET(new NextRequest('http://localhost/api/ai/health'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(JSON.stringify(json)).not.toContain('baseUrl');
    expect(JSON.stringify(json)).not.toContain('api.deepseek');
    expect(json.providers).toBeDefined();
    expect(json.deepseekTest.error).toBe('DeepSeek not configured');
  });
});

describe('SEC-004: /api/srs/review — cross-user blocked', () => {
  it('student A cannot read student B deck', async () => {
    authAs(studentA);
    const res = await srsRoute.GET(new NextRequest(`http://localhost/api/srs/review?studentId=${studentBId}`));
    expect(res.status).toBe(403);
  });

  it('student A cannot POST reviews targeting student B', async () => {
    authAs(studentA);
    const res = await srsRoute.POST(post('http://localhost/api/srs/review', {
      studentId: studentBId,
      results: [{ type: 'vocab', id: 'v1', quality: 4 }],
    }));
    expect(res.status).toBe(403);
  });

  it('student A own deck still works', async () => {
    authAs(studentA);
    const res = await srsRoute.GET(new NextRequest('http://localhost/api/srs/review?studentId=student-A'));
    expect(res.status).toBe(200);
  });

  it('student A own vocab review still works', async () => {
    authAs(studentA);
    mocks.getWordById.mockResolvedValue({
      id: 'v1', studentId: 'student-A', easeFactor: 2.5, reviewInterval: 0,
      repetitions: 0, lastReviewedAt: null, nextReviewDate: null, familiarity: 'new',
    });
    const res = await srsRoute.POST(post('http://localhost/api/srs/review', {
      studentId: 'student-A',
      results: [{ type: 'vocab', id: 'v1', quality: 4 }],
    }));
    expect(res.status).toBe(200);
    expect(mocks.updateVocab).toHaveBeenCalledWith('v1', expect.objectContaining({ familiarity: 'learning' }));
  });

  it('mistake updates are ownership-scoped to the target student', async () => {
    authAs(studentA);
    const res = await srsRoute.POST(post('http://localhost/api/srs/review', {
      studentId: 'student-A',
      results: [{ type: 'mistake', id: 'm1', quality: 4 }],
    }));
    expect(res.status).toBe(200);
    expect(mocks.bulkUpdateMistakes).toHaveBeenCalledWith(
      { id: 'm1', studentId: 'student-A' },
      expect.objectContaining({ inReviewList: false, reviewed: true }),
    );
  });
});

describe('SEC-005: /api/mistakes/bulk — cross-user mutation blocked', () => {
  it('student A cannot bulk-operate student B', async () => {
    authAs(studentA);
    const res = await mistakesBulkRoute.POST(post('http://localhost/api/mistakes/bulk', {
      studentId: studentBId, action: 'markAllReviewed',
    }));
    expect(res.status).toBe(403);
  });

  it('student A can operate own mistakes (scoped where)', async () => {
    authAs(studentA);
    const res = await mistakesBulkRoute.POST(post('http://localhost/api/mistakes/bulk', {
      studentId: 'student-A', action: 'markAllReviewed',
    }));
    expect(res.status).toBe(200);
    expect(mocks.bulkUpdateMistakes).toHaveBeenCalledWith(
      { studentId: 'student-A' },
      { reviewed: true },
    );
  });

  it('deleteSelected is scoped to own ids', async () => {
    authAs(studentA);
    const res = await mistakesBulkRoute.POST(post('http://localhost/api/mistakes/bulk', {
      studentId: 'student-A', action: 'deleteSelected', ids: ['m1', 'm2'],
    }));
    expect(res.status).toBe(200);
    expect(mocks.bulkDeleteMistakes).toHaveBeenCalledWith(
      { id: { in: ['m1', 'm2'] }, studentId: 'student-A' },
    );
  });
});

describe('SEC-006: /api/streak — cross-user XP/read blocked', () => {
  it('student A cannot award XP to student B', async () => {
    authAs(studentA);
    const res = await streakRoute.POST(post('http://localhost/api/streak', { studentId: studentBId }));
    expect(res.status).toBe(403);
  });

  it('student A cannot read student B streak', async () => {
    authAs(studentA);
    const res = await streakRoute.GET(new NextRequest(`http://localhost/api/streak?studentId=${studentBId}`));
    expect(res.status).toBe(403);
  });

  it('student A self streak still works (XP to self)', async () => {
    authAs(studentA);
    const res = await streakRoute.POST(post('http://localhost/api/streak', { studentId: 'student-A' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.streakDays).toBe(3);
    expect(json.xpAwarded).toBe(10);
    expect(mocks.createXpTransaction).toHaveBeenCalledWith(expect.objectContaining({ userId: 'student-A' }));
    expect(mocks.updateUser).toHaveBeenCalledWith('student-A', expect.objectContaining({ xp: expect.anything() }));
  });
});

describe('SEC-007: /api/notifications — recipient always self', () => {
  it('body.userId is ignored — notification goes to the authenticated user', async () => {
    authAs(studentA);
    mocks.adminDbQuery.mockResolvedValue({ id: 'n1' });
    const res = await notificationsRoute.POST(post('http://localhost/api/notifications', {
      userId: studentBId,
      type: 'badge',
      title: 'Hello',
      message: 'You earned a badge',
    }));
    expect(res.status).toBe(201);
    expect(mocks.adminDbQuery).toHaveBeenCalledWith('notification', 'create', {
      data: expect.objectContaining({ userId: 'student-A', title: 'Hello', message: 'You earned a badge' }),
    });
  });

  it('oversized title → 400', async () => {
    authAs(studentA);
    const res = await notificationsRoute.POST(post('http://localhost/api/notifications', {
      type: 'badge',
      title: 'x'.repeat(201),
      message: 'ok',
    }));
    expect(res.status).toBe(400);
  });

  it('invalid link → 400', async () => {
    authAs(studentA);
    const res = await notificationsRoute.POST(post('http://localhost/api/notifications', {
      type: 'badge',
      title: 'Hello',
      message: 'ok',
      link: 'javascript:alert(1)',
    }));
    expect(res.status).toBe(400);
  });
});

describe('SEC-008: /api/ai/analyze-progress — cross-user progress blocked', () => {
  it('anonymous → 401', async () => {
    authAs({ authenticated: false, error: '請先登入' });
    const res = await analyzeProgressRoute.POST(post('http://localhost/api/ai/analyze-progress', { studentId: 'student-A' }));
    expect(res.status).toBe(401);
  });

  it('student A cannot read student B progress', async () => {
    authAs(studentA);
    const res = await analyzeProgressRoute.POST(post('http://localhost/api/ai/analyze-progress', { studentId: studentBId }));
    expect(res.status).toBe(403);
  });

  it('student A own progress still works (database source)', async () => {
    authAs(studentA);
    mocks.adminDbQuery.mockImplementation(async (model: string, op: string) => {
      if (model === 'user' && op === 'findUnique') return { level: 'S4', overallAccuracy: 80, streakDays: 3 };
      if (model === 'mistake' && op === 'findMany') return [];
      return null;
    });
    const res = await analyzeProgressRoute.POST(post('http://localhost/api/ai/analyze-progress', { studentId: 'student-A' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json._source).toBe('database');
  });
});

describe('SEC-009: /api/diagnostic/grammar — cross-user radar blocked', () => {
  it('anonymous → 401', async () => {
    authAs({ authenticated: false, error: '請先登入' });
    const res = await diagnosticGrammarRoute.GET(
      new NextRequest('http://localhost/api/diagnostic/grammar?studentId=student-A'),
    );
    expect(res.status).toBe(401);
  });

  it('student A cannot read student B grammar radar', async () => {
    authAs(studentA);
    const res = await diagnosticGrammarRoute.GET(
      new NextRequest(`http://localhost/api/diagnostic/grammar?studentId=${studentBId}`),
    );
    expect(res.status).toBe(403);
  });

  it('ownership is checked BEFORE any trusted student-specific data is queried', async () => {
    authAs(studentA);
    const res = await diagnosticGrammarRoute.GET(
      new NextRequest(`http://localhost/api/diagnostic/grammar?studentId=${studentBId}`),
    );
    expect(res.status).toBe(403);
    // The regression this guards against: DB reads happening first, then the
    // ownership check. No data service may be touched for a foreign student.
    expect(mocks.getRecentDiagnostics).not.toHaveBeenCalled();
    expect(mocks.listMistakes).not.toHaveBeenCalled();
    expect(mocks.getVerifiedPracticeSessions).not.toHaveBeenCalled();
  });

  it('student A own radar still works', async () => {
    authAs(studentA);
    const res = await diagnosticGrammarRoute.GET(
      new NextRequest('http://localhost/api/diagnostic/grammar?studentId=student-A'),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.grammarPoints).toHaveLength(40);
    expect(json.total).toBe(40);
  });

  it('authorized staff (teacher) may read any student radar', async () => {
    authAs({ authenticated: true, userId: 't1', role: 'teacher' });
    const res = await diagnosticGrammarRoute.GET(
      new NextRequest(`http://localhost/api/diagnostic/grammar?studentId=${studentBId}`),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.total).toBe(40);
  });
});
