import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  verifyApiAuth: vi.fn(),
  checkRateLimit: vi.fn(),
  resolveTeacherStudentClass: vi.fn(),
  submitPractice: vi.fn(),
  listPracticeSessions: vi.fn(),
  adminDbQuery: vi.fn(),
  getCumulativeSkillTotals: vi.fn(),
  getWeeklyPracticeSummary: vi.fn(),
  calculatePracticeStreak: vi.fn(),
}));

vi.mock('@/shared/auth/api-auth', () => ({ verifyApiAuth: mocks.verifyApiAuth }));
vi.mock('@/shared/utils/rate-limiter', () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock('@/modules/teacher/copilot/services/teacher-copilot-service', () => ({
  resolveTeacherStudentClass: mocks.resolveTeacherStudentClass,
}));
vi.mock('@/modules/exercise/services/practice-submission-service', () => ({ submitPractice: mocks.submitPractice }));
vi.mock('@/modules/repositories', () => ({ PracticeRepo: { listPracticeSessions: mocks.listPracticeSessions } }));
vi.mock('@/modules/admin/services/admin-operations', () => ({ adminDbQuery: mocks.adminDbQuery }));
vi.mock('@/modules/exercise/services/practice-evidence-service', () => ({ evaluatePracticeEvidence: vi.fn() }));
vi.mock('@/modules/exercise/services/practice-history-service', () => ({
  getCumulativeSkillTotals: mocks.getCumulativeSkillTotals,
  getWeeklyPracticeSummary: mocks.getWeeklyPracticeSummary,
}));
vi.mock('@/modules/student', () => ({ calculatePracticeStreak: mocks.calculatePracticeStreak }));

import * as practiceRoute from '../practice/route';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.verifyApiAuth.mockResolvedValue({ authenticated: true, userId: 'teacher-1', role: 'teacher' });
  mocks.checkRateLimit.mockResolvedValue({ allowed: true });
  mocks.resolveTeacherStudentClass.mockResolvedValue(null);
});

describe('teacher practice roster authorization', () => {
  it('rejects POST attempts for a student outside the teacher roster', async () => {
    const response = await practiceRoute.POST(new NextRequest('http://localhost/api/practice', {
      method: 'POST',
      body: JSON.stringify({ studentId: 'student-foreign', skill: 'grammar', answers: [] }),
    }));

    expect(response.status).toBe(403);
    expect(mocks.submitPractice).not.toHaveBeenCalled();
  });

  it('rejects GET history requests for a student outside the teacher roster', async () => {
    const response = await practiceRoute.GET(new NextRequest(
      'http://localhost/api/practice?studentId=student-foreign',
    ));

    expect(response.status).toBe(403);
    expect(mocks.listPracticeSessions).not.toHaveBeenCalled();
  });
});