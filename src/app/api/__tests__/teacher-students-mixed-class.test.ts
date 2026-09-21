import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  findUserByIdSelect: vi.fn(),
  listTeacherClasses: vi.fn(),
  listAllClasses: vi.fn(),
  listUsersAdmin: vi.fn(),
  verifySessionToken: vi.fn(),
  auth: vi.fn(),
  getLastActivityMap: vi.fn(),
  getDominantDifficultyMap: vi.fn(),
  getShortWritingCounts: vi.fn(),
}));

vi.mock('@/modules/student', () => ({
  findUserByIdSelect: mocks.findUserByIdSelect,
  listTeacherClasses: mocks.listTeacherClasses,
  listAllClasses: mocks.listAllClasses,
  listUsersAdmin: mocks.listUsersAdmin,
}));
vi.mock('@/shared/auth/jwt', () => ({ verifySessionToken: mocks.verifySessionToken }));
vi.mock('@/shared/auth/auth-next', () => ({ auth: mocks.auth }));
vi.mock('@/modules/teacher/monitoring/services/activity-service', () => ({
  getLastActivityMap: mocks.getLastActivityMap,
  getDominantDifficultyMap: mocks.getDominantDifficultyMap,
  getShortWritingCounts: mocks.getShortWritingCounts,
  // 2026-09-21：路由新增的分類函式。測試此模組時以真實規則的簡化版代替，
  // 確保「從未開始」與「長期未活動」在 API 回應層已被區分。
  classifyActivityStatus: (lastActiveAt: Date | null) => {
    if (!lastActiveAt) return { status: 'never-started', daysInactive: null };
    const days = Math.max(0, Math.floor((Date.now() - lastActiveAt.getTime()) / 86400000));
    if (days >= 14) return { status: 'inactive', daysInactive: days };
    if (days >= 7) return { status: 'low', daysInactive: days };
    return { status: 'active', daysInactive: days };
  },
}));

import * as route from '../teacher/students/route';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.verifySessionToken.mockResolvedValue({ userId: 'teacher-1', role: 'teacher' });
  mocks.listTeacherClasses.mockResolvedValue([{
    classId: 'class-4A',
    class: { id: 'class-4A', name: '4A', gradeLevel: 'S4' },
  }]);
  mocks.listUsersAdmin.mockResolvedValue([]);
  mocks.listAllClasses.mockResolvedValue([]);
  mocks.getLastActivityMap.mockResolvedValue(new Map());
  mocks.getDominantDifficultyMap.mockResolvedValue(new Map());
  mocks.getShortWritingCounts.mockResolvedValue(new Map());
});

describe('GET /api/teacher/students mixed-class roster', () => {
  it('includes primary and StudentClass members of taught classes', async () => {
    const response = await route.GET(new NextRequest('http://localhost/api/teacher/students', {
      headers: { cookie: 'session_token=test-token' },
    }));

    expect(response.status).toBe(200);
    const where = mocks.listUsersAdmin.mock.calls[0][0].where;
    expect(where.AND).toContainEqual({
      OR: [
        { classId: { in: ['class-4A'] } },
        { studentClasses: { some: { classId: { in: ['class-4A'] } } } },
      ],
    });

    expect((await response.json()).classes).toEqual([
      { id: 'class-4A', name: '4A', gradeLevel: 'S4' },
    ]);
    expect(mocks.listAllClasses).not.toHaveBeenCalled();
  });

  it('excludes Demo classes from the teacher selector and membership query', async () => {
    mocks.listTeacherClasses.mockResolvedValue([
      { classId: 'class-4A', class: { id: 'class-4A', name: '4A', gradeLevel: 'S4' } },
      { classId: 'class-demo', class: { id: 'class-demo', name: 'Demo', gradeLevel: 'Demo' } },
    ]);

    const response = await route.GET(new NextRequest('http://localhost/api/teacher/students', {
      headers: { cookie: 'session_token=test-token' },
    }));

    expect(response.status).toBe(200);
    const where = mocks.listUsersAdmin.mock.calls[0][0].where;
    expect(where.AND).toContainEqual({
      OR: [
        { classId: { in: ['class-4A'] } },
        { studentClasses: { some: { classId: { in: ['class-4A'] } } } },
      ],
    });
    expect((await response.json()).classes).toEqual([
      { id: 'class-4A', name: '4A', gradeLevel: 'S4' },
    ]);
  });
});