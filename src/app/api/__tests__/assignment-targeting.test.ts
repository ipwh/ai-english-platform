import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  adminDbQuery: vi.fn(),
}));

vi.mock('@/modules/admin/services/admin-operations', () => ({ adminDbQuery: mocks.adminDbQuery }));
vi.mock('@/modules/assessment/services/submission-attempt-service', () => ({ submitAssignmentAttempt: vi.fn() }));
vi.mock('@/modules/assessment/services/assignment-grader', () => ({ gradeAssignmentItems: vi.fn() }));
vi.mock('@/shared/auth/api-auth', () => ({ verifyApiAuth: vi.fn() }));
vi.mock('@/shared/auth/jwt', () => ({ verifySessionToken: vi.fn() }));
vi.mock('@/modules/ai', () => ({ analyzeAnswer: vi.fn() }));
vi.mock('@/shared/utils/notifications', () => ({ notifySubmissionReceived: vi.fn() }));
vi.mock('@/modules/learning-analytics/services/activity-accounting-service', () => ({
  recordActivityMastery: vi.fn(),
  syncStudentActivityMetrics: vi.fn(),
}));

import { resolveAssignmentTargetStudentIds } from '../assignments/[id]/route';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('resolveAssignmentTargetStudentIds', () => {
  it('deduplicates students who appear in more than one target group', async () => {
    mocks.adminDbQuery
      .mockResolvedValueOnce([{ groupId: 'g1' }, { groupId: 'g2' }])
      .mockResolvedValueOnce([{ studentId: 's1' }, { studentId: 's1' }, { studentId: 's2' }]);

    const targetIds = await resolveAssignmentTargetStudentIds({
      id: 'assignment-1', targetType: 'group', classId: null, className: null,
    });

    expect([...targetIds].sort()).toEqual(['s1', 's2']);
  });

  it('includes primary and mixed-class members for class assignments', async () => {
    mocks.adminDbQuery.mockResolvedValueOnce([{ id: 'primary' }, { id: 'mixed' }]);

    const targetIds = await resolveAssignmentTargetStudentIds({
      id: 'assignment-1', targetType: 'class', classId: 'class-4A', className: '4A',
    });

    expect([...targetIds].sort()).toEqual(['mixed', 'primary']);
    expect(mocks.adminDbQuery).toHaveBeenCalledWith('user', 'findMany', expect.objectContaining({
      where: expect.objectContaining({
        OR: [
          { classId: 'class-4A' },
          { studentClasses: { some: { classId: 'class-4A' } } },
        ],
      }),
    }));
  });
});