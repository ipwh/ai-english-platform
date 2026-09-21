import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  verifyApiAuth: vi.fn(),
  verifyTeacherOwnsClass: vi.fn(),
  generateLessonPlan: vi.fn(),
  generateAssignments: vi.fn(),
}));

vi.mock('@/shared/auth/api-auth', () => ({ verifyApiAuth: mocks.verifyApiAuth }));
vi.mock('@/modules/teacher/copilot/services/teacher-copilot-service', () => ({
  verifyTeacherOwnsClass: mocks.verifyTeacherOwnsClass,
  teacherCopilotService: {
    generateLessonPlan: mocks.generateLessonPlan,
    generateAssignments: mocks.generateAssignments,
  },
}));

import * as copilotRoute from '../teacher/copilot/route';
import * as assignmentsRoute from '../teacher/copilot/assignments/route';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.verifyApiAuth.mockResolvedValue({ authenticated: true, userId: 'teacher-1', role: 'teacher' });
  mocks.verifyTeacherOwnsClass.mockResolvedValue(false);
});

describe('teacher Copilot class authorization', () => {
  it('rejects a foreign class in the combined Copilot endpoint', async () => {
    const response = await copilotRoute.GET(new NextRequest(
      'http://localhost/api/teacher/copilot?teacherId=teacher-1&classId=class-foreign',
    ));

    expect(response.status).toBe(403);
    expect(mocks.verifyTeacherOwnsClass).toHaveBeenCalledWith('teacher-1', 'class-foreign');
    expect(mocks.generateLessonPlan).not.toHaveBeenCalled();
  });

  it('rejects a foreign class in the assignment recommendation endpoint', async () => {
    const response = await assignmentsRoute.GET(new NextRequest(
      'http://localhost/api/teacher/copilot/assignments?classId=class-foreign',
    ));

    expect(response.status).toBe(403);
    expect(mocks.verifyTeacherOwnsClass).toHaveBeenCalledWith('teacher-1', 'class-foreign');
    expect(mocks.generateAssignments).not.toHaveBeenCalled();
  });
});