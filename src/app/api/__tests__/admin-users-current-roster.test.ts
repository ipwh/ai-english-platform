import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  verifyAdmin: vi.fn(),
  listUsersAdmin: vi.fn(),
  countUsers: vi.fn(),
  listAllClasses: vi.fn(),
}));

vi.mock('@/shared/auth/admin-auth', () => ({ verifyAdmin: mocks.verifyAdmin }));
vi.mock('@/modules/admin/services/admin-service', () => ({
  listUsersAdmin: mocks.listUsersAdmin,
  countUsers: mocks.countUsers,
  listAllClasses: mocks.listAllClasses,
  findUserByEmail: vi.fn(),
  upsertClass: vi.fn(),
  createUser: vi.fn(),
}));
vi.mock('@/shared/google/sheets-sync', () => ({ syncStudentToSheet: vi.fn() }));

import * as route from '../admin/users/route';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.verifyAdmin.mockResolvedValue({ authorized: true });
  mocks.listUsersAdmin.mockResolvedValue([]);
  mocks.countUsers.mockResolvedValue(0);
  mocks.listAllClasses.mockResolvedValue([]);
});

describe('GET /api/admin/users current roster filter', () => {
  it('limits the student-analysis roster to classes in the current academic year', async () => {
    const response = await route.GET(new NextRequest(
      'http://localhost/api/admin/users?role=student&level=S6&currentOnly=true',
    ));

    expect(response.status).toBe(200);
    const where = mocks.listUsersAdmin.mock.calls[0][0].where;
    expect(where).toMatchObject({ role: 'student', level: 'S6', academicYear: '2026-2027', class: { academicYear: '2026-2027' } });
    expect(mocks.countUsers).toHaveBeenCalledWith(where);
    expect(mocks.listAllClasses).toHaveBeenCalledWith('2026-2027');
  });

  it('keeps historical user-management queries available when currentOnly is absent', async () => {
    await route.GET(new NextRequest('http://localhost/api/admin/users?role=student&level=S6'));

    const where = mocks.listUsersAdmin.mock.calls[0][0].where;
    expect(where).toMatchObject({ role: 'student', level: 'S6' });
    expect(where.class).toBeUndefined();
    expect(mocks.listAllClasses).toHaveBeenCalledWith(undefined);
  });
});