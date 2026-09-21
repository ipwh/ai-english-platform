import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  adminDbQuery: vi.fn(),
  verifyApiAuth: vi.fn(),
}));

vi.mock('@/modules/admin/services/admin-operations', () => ({ adminDbQuery: mocks.adminDbQuery }));
vi.mock('@/shared/auth/api-auth', () => ({ verifyApiAuth: mocks.verifyApiAuth }));
vi.mock('@/shared/utils/notifications', () => ({
  notifyAssignmentCreated: vi.fn(),
  notifyAssignmentCreatedToUsers: vi.fn(),
}));

import * as route from '../assignments/route';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.verifyApiAuth.mockResolvedValue({ authenticated: true, role: 'student', userId: 'student-1' });
  mocks.adminDbQuery.mockImplementation(async (model: string) => {
    if (model === 'user') {
      return {
        classId: 'class-4A', class: { name: '4A' },
        studentClasses: [{ classId: 'class-4B', class: { name: '4B' } }],
      };
    }
    if (model === 'assignment') return [];
    return [];
  });
});

describe('GET /api/assignments legacy class targeting', () => {
  it('lists className-only assignments for primary and mixed-class membership', async () => {
    const response = await route.GET(new NextRequest('http://localhost/api/assignments'));

    expect(response.status).toBe(200);
    const assignmentCall = mocks.adminDbQuery.mock.calls.find(([model]) => model === 'assignment');
    expect(assignmentCall?.[2].where.OR).toContainEqual({ className: { in: ['4B', '4A'] } });
  });
});