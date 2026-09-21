import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  verifyApiAuth: vi.fn(),
  createGroup: vi.fn(),
  listGroups: vi.fn(),
  findGroupById: vi.fn(),
  updateGroup: vi.fn(),
  deleteGroup: vi.fn(),
  resolveTeacherStudentClass: vi.fn(),
}));

vi.mock('@/shared/auth/api-auth', () => ({ verifyApiAuth: mocks.verifyApiAuth }));
vi.mock('@/modules/student', () => ({
  createGroup: mocks.createGroup,
  listGroups: mocks.listGroups,
  findGroupById: mocks.findGroupById,
  updateGroup: mocks.updateGroup,
  deleteGroup: mocks.deleteGroup,
}));
vi.mock('@/modules/teacher/copilot/services/teacher-copilot-service', () => ({
  resolveTeacherStudentClass: mocks.resolveTeacherStudentClass,
}));

import * as groupsRoute from '../groups/route';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.verifyApiAuth.mockResolvedValue({ authenticated: true, userId: 'teacher-1', role: 'teacher' });
  mocks.createGroup.mockResolvedValue({ id: 'group-1' });
  mocks.resolveTeacherStudentClass.mockResolvedValue('class-4A');
});

describe('POST /api/groups', () => {
  it('persists the selected members with the created group', async () => {
    const response = await groupsRoute.POST(new NextRequest('http://localhost/api/groups', {
      method: 'POST',
      body: JSON.stringify({ name: 'Revision group', studentIds: ['student-1', 'student-2', 'student-1'] }),
    }));

    expect(response.status).toBe(201);
    expect(mocks.createGroup).toHaveBeenCalledWith({
      name: 'Revision group',
      description: '',
      createdBy: 'teacher-1',
      studentIds: ['student-1', 'student-2'],
    });
  });

  it('rejects a student outside the teacher roster', async () => {
    mocks.resolveTeacherStudentClass.mockResolvedValue(null);

    const response = await groupsRoute.POST(new NextRequest('http://localhost/api/groups', {
      method: 'POST',
      body: JSON.stringify({ name: 'Revision group', studentIds: ['student-foreign'] }),
    }));

    expect(response.status).toBe(403);
    expect(mocks.createGroup).not.toHaveBeenCalled();
  });
});