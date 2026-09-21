// ============================================
// 2026-09-21: /api/admin/stats — 「無資料 ≠ 0」
// ============================================
// 回歸守門：`byLevel[].avgAccuracy` / `byClass[].avgAccuracy` 與
// `monthlyTrend[].accuracy` 在**沒有可驗證證據**時必須是 null（前端顯示「—」），
// 不得回 0（舊碼以 truthiness `? Math.round(...) : 0` 把「未有數據」變成「0%」，
// 在 admin 報表上顯示成紅色，等同指控整個年級答錯全部）。
// 同時鎖定：真實的 0% 必須保留為 0（不得被當成「無資料」）。
// ============================================
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  verifyAdmin: vi.fn(),
  adminDbQuery: vi.fn(),
}));

vi.mock('@/shared/auth/admin-auth', () => ({ verifyAdmin: mocks.verifyAdmin }));
vi.mock('@/modules/admin/services/admin-operations', () => ({ adminDbQuery: mocks.adminDbQuery }));

import * as statsRoute from '../admin/stats/route';

type GroupByRow = { level?: string | null; classId?: string | null; _avg: { overallAccuracy: number | null }; _count: { id: number } };

function wireAdminDb(levelRows: GroupByRow[], classRows: GroupByRow[] = []) {
  mocks.adminDbQuery.mockImplementation(async (model: string, method: string, args?: Record<string, unknown>) => {
    if (model === 'user' && method === 'groupBy') {
      const by = (args?.by as string[])?.[0];
      return by === 'level' ? levelRows : classRows;
    }
    if (model === 'class' && method === 'findMany') return [];
    if (method === 'count') return 0;
    if (method === 'findMany') return [];
    return null;
  });
}

const request = () => new NextRequest('http://localhost/api/admin/stats');

beforeEach(() => {
  vi.clearAllMocks();
  mocks.verifyAdmin.mockResolvedValue({ authorized: true });
});

describe('GET /api/admin/stats — accuracy null semantics', () => {
  it('returns null (not 0) for a level with no verifiable evidence', async () => {
    wireAdminDb([{ level: 'S4', _avg: { overallAccuracy: null }, _count: { id: 30 } }]);

    const response = await statsRoute.GET(request());
    const json = await response.json() as { byLevel: Array<{ avgAccuracy: number | null; studentCount: number }> };

    expect(json.byLevel[0].avgAccuracy).toBeNull();
    expect(json.byLevel[0].studentCount).toBe(30);
  });

  it('keeps a genuine 0% average as 0 (not mistaken for no data)', async () => {
    wireAdminDb([{ level: 'S5', _avg: { overallAccuracy: 0 }, _count: { id: 3 } }]);

    const response = await statsRoute.GET(request());
    const json = await response.json() as { byLevel: Array<{ avgAccuracy: number | null }> };

    expect(json.byLevel[0].avgAccuracy).toBe(0);
  });

  it('rounds a measured average normally', async () => {
    wireAdminDb([{ level: 'S6', _avg: { overallAccuracy: 66.6 }, _count: { id: 12 } }]);

    const response = await statsRoute.GET(request());
    const json = await response.json() as { byLevel: Array<{ avgAccuracy: number | null }> };

    expect(json.byLevel[0].avgAccuracy).toBe(67);
  });

  it('returns null avgAccuracy for classes without evidence too', async () => {
    wireAdminDb(
      [{ level: 'S4', _avg: { overallAccuracy: 55 }, _count: { id: 10 } }],
      [{ classId: 'c1', _avg: { overallAccuracy: null }, _count: { id: 10 } }],
    );

    const response = await statsRoute.GET(request());
    const json = await response.json() as { byClass: Array<{ avgAccuracy: number | null }> };

    expect(json.byClass[0].avgAccuracy).toBeNull();
  });

  it('excludes unverified students from the accuracy distribution query', async () => {
    wireAdminDb([{ level: 'S4', _avg: { overallAccuracy: null }, _count: { id: 1 } }]);

    await statsRoute.GET(request());

    const distributionCall = mocks.adminDbQuery.mock.calls.find(
      ([model, method, args]) => model === 'user' && method === 'findMany'
        && (args as { select?: { overallAccuracy?: boolean } })?.select?.overallAccuracy === true,
    );
    expect(distributionCall?.[2]).toMatchObject({ where: { role: 'student', overallAccuracy: { not: null } } });
  });
});
