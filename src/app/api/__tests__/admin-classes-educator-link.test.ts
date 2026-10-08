import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// ============================================
// POST /api/admin/classes — 教師／管理員自動連結（2026-10-08）
// ============================================
// 背景：生產庫 `TeacherClass` 曾為 0 列 → 所有非 admin 教師的
// `GET /api/teacher/students` 直接回空、`/api/classes` 回 0 班、
// 學生詳情／逐題作答情況一律 403。修正為「新增／儲存班級時把該班連結
// 給所有 educators」，且連結實作收斂到單一 owner
// （`admin-operations.adminLinkEducators`，修復腳本亦呼叫同一函式）。
// 本測試鎖定：路由必須經該函式建立關聯（不得再各自手寫 upsert）。

const mocks = vi.hoisted(() => ({
  verifyAdmin: vi.fn(),
  syncClassToSheet: vi.fn(),
  adminDbQuery: vi.fn(),
  adminFindEducators: vi.fn(),
  adminLinkEducators: vi.fn(),
  loggerInfo: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock('@/shared/auth/admin-auth', () => ({ verifyAdmin: mocks.verifyAdmin }));
vi.mock('@/shared/google/sheets-sync', () => ({ syncClassToSheet: mocks.syncClassToSheet }));
vi.mock('@/modules/admin/services/admin-operations', () => ({
  adminDbQuery: mocks.adminDbQuery,
  adminFindEducators: mocks.adminFindEducators,
  adminLinkEducators: mocks.adminLinkEducators,
}));
vi.mock('@/shared/logger/logger', () => ({
  logger: { info: mocks.loggerInfo, error: mocks.loggerError, warn: vi.fn() },
}));

import * as route from '../admin/classes/route';

const CLASS_ROW = { id: 'class-4A', name: '4A', gradeLevel: 'S4', academicYear: '2026-2027' };
const EDUCATORS = [{ id: 'teacher-1', role: 'teacher' }, { id: 'admin-1', role: 'admin' }];

function post(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/admin/classes', { method: 'POST', body: JSON.stringify(body) });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.verifyAdmin.mockResolvedValue({ authorized: true, userId: 'admin-1' });
  mocks.adminDbQuery.mockResolvedValue(CLASS_ROW);
  mocks.adminFindEducators.mockResolvedValue(EDUCATORS);
  mocks.adminLinkEducators.mockResolvedValue(EDUCATORS.length);
  mocks.syncClassToSheet.mockResolvedValue(undefined);
});

describe('POST /api/admin/classes educator link', () => {
  it('links the saved class to every educator through the canonical helper', async () => {
    const response = await route.POST(post({ name: '4A', gradeLevel: 'S4' }));

    expect(response.status).toBe(200);
    expect(mocks.adminFindEducators).toHaveBeenCalledTimes(1);
    expect(mocks.adminLinkEducators).toHaveBeenCalledWith(CLASS_ROW.id, EDUCATORS);
  });

  it('rejects unauthenticated requests without creating links', async () => {
    mocks.verifyAdmin.mockResolvedValue({ authorized: false, error: 'forbidden' });

    const response = await route.POST(post({ name: '4A', gradeLevel: 'S4' }));

    expect(response.status).toBe(403);
    expect(mocks.adminLinkEducators).not.toHaveBeenCalled();
  });

  it('still succeeds when educator linking fails (class creation is the primary effect)', async () => {
    mocks.adminLinkEducators.mockRejectedValue(new Error('db down'));

    const response = await route.POST(post({ name: '4A', gradeLevel: 'S4' }));

    expect(response.status).toBe(200);
    expect(mocks.loggerError).toHaveBeenCalled();
  });
});
