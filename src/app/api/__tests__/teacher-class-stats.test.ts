// ============================================
// /api/teacher/class-stats 路由測試（2026-10-01）
// ============================================
// - 認證：JWT session_token 或 NextAuth；僅教師／管理員（403 其他）
// - 成功：回傳 getClassPracticeStats() 的每班聚合
// - 失敗：500 且 classes: []（查詢失敗 ≠ 沒有班別數據）
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  findUserByIdSelect: vi.fn(),
  verifySessionToken: vi.fn(),
  auth: vi.fn(),
  getClassPracticeStats: vi.fn(),
}));

vi.mock('@/modules/student', () => ({
  findUserByIdSelect: mocks.findUserByIdSelect,
}));
vi.mock('@/shared/auth/jwt', () => ({ verifySessionToken: mocks.verifySessionToken }));
vi.mock('@/shared/auth/auth-next', () => ({ auth: mocks.auth }));
vi.mock('@/modules/teacher/monitoring/services/class-stats-service', () => ({
  getClassPracticeStats: mocks.getClassPracticeStats,
}));

import * as route from '../teacher/class-stats/route';

const CLASS_ROW = {
  classId: 'c1', className: '1A', gradeLevel: 'S1',
  studentCount: 3, participantCount: 2, participationRate: 67,
  sessionsCount: 12, accuracy: 75,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.verifySessionToken.mockResolvedValue({ userId: 'teacher-1', role: 'teacher' });
  mocks.auth.mockResolvedValue(null);
  mocks.findUserByIdSelect.mockResolvedValue(null);
  mocks.getClassPracticeStats.mockResolvedValue([CLASS_ROW]);
});

describe('GET /api/teacher/class-stats', () => {
  it('教師（JWT）可取得全校班級聚合', async () => {
    const response = await route.GET(new NextRequest('http://localhost/api/teacher/class-stats', {
      headers: { cookie: 'session_token=test-token' },
    }));

    expect(response.status).toBe(200);
    expect((await response.json()).classes).toEqual([CLASS_ROW]);
    expect(mocks.getClassPracticeStats).toHaveBeenCalledTimes(1);
  });

  it('管理員（NextAuth，角色需查 DB）可取得資料', async () => {
    mocks.verifySessionToken.mockResolvedValue(null);
    mocks.auth.mockResolvedValue({ user: { id: 'admin-1' } });
    mocks.findUserByIdSelect.mockResolvedValue({ role: 'admin' });

    const response = await route.GET(new NextRequest('http://localhost/api/teacher/class-stats'));
    expect(response.status).toBe(200);
  });

  it('未登入／非教師角色 ⇒ 403', async () => {
    mocks.verifySessionToken.mockResolvedValue({ userId: 'student-1', role: 'student' });

    const response = await route.GET(new NextRequest('http://localhost/api/teacher/class-stats', {
      headers: { cookie: 'session_token=student-token' },
    }));

    expect(response.status).toBe(403);
    expect(mocks.getClassPracticeStats).not.toHaveBeenCalled();
  });

  it('聚合查詢失敗 ⇒ 500（回空陣列但保留非 2xx，讓前端區分「失敗」與「沒資料」）', async () => {
    mocks.getClassPracticeStats.mockRejectedValue(new Error('db down'));

    const response = await route.GET(new NextRequest('http://localhost/api/teacher/class-stats', {
      headers: { cookie: 'session_token=test-token' },
    }));

    expect(response.status).toBe(500);
    expect((await response.json()).classes).toEqual([]);
  });
});
