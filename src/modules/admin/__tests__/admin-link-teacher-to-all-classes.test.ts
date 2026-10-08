// ============================================
// 教師 ↔ 班級自動連結 + 學校網域政策 — 契約測試
// ============================================
// 背景（2026-10-08）：
//   1. 生產事故：教師帳號由首次 Google 登入自動建立，該路徑只寫 `User` ⇒
//      `TeacherClass` 全空 ⇒ 教師端學生名單／班級清單／作答情況全部看不到。
//   2. 政策（使用者指示）：只有**校內網域**帳號可以是教師；
//      非校內網域一律視為學生，**永不**取得班級關聯（修正前任何非 `s\d{7}`
//      的 email 都會被自動判為教師）。
//
// 本測試鎖定：
//   · `adminLinkTeacherToAllClasses()` 對每個非 Demo 班級建立關聯（冪等 upsert），
//     且對「非校內網域／非教師角色／查不到的帳號」fail-closed（不寫入）；
//   · `adminFindEducators()` 只回校內網域的教師／管理員（自動連結對象的過濾）；
//   · `auth-next.ts` 建立教師帳號時確實呼叫自動連結，且失敗不阻擋登入（source scan）。
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const mocks = vi.hoisted(() => ({
  classFindMany: vi.fn(),
  userFindUnique: vi.fn(),
  userFindMany: vi.fn(),
  teacherClassUpsert: vi.fn(),
}));

vi.mock('@/shared/db/db', () => ({
  db: {
    class: { findMany: mocks.classFindMany },
    user: { findUnique: mocks.userFindUnique, findMany: mocks.userFindMany },
    teacherClass: { upsert: mocks.teacherClassUpsert },
  },
}));

import { adminFindEducators, adminLinkEducators, adminLinkTeacherToAllClasses } from '../services/admin-operations';

const SCHOOL_TEACHER = { id: 'teacher-1', role: 'teacher', email: 'lamyt@pochiu.edu.hk' };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.classFindMany.mockResolvedValue([]);
  mocks.userFindUnique.mockResolvedValue(SCHOOL_TEACHER);
  mocks.userFindMany.mockResolvedValue([]);
  mocks.teacherClassUpsert.mockResolvedValue({});
});

describe('adminLinkTeacherToAllClasses', () => {
  it('為每個現行班級建立教師關聯（冪等 upsert，非 create）', async () => {
    mocks.classFindMany.mockResolvedValue([{ id: 'class-4A' }, { id: 'class-4B' }, { id: 'class-6D' }]);

    const count = await adminLinkTeacherToAllClasses('teacher-1');

    expect(count).toBe(3);
    expect(mocks.teacherClassUpsert).toHaveBeenCalledTimes(3);
    for (const classId of ['class-4A', 'class-4B', 'class-6D']) {
      expect(mocks.teacherClassUpsert).toHaveBeenCalledWith({
        where: { teacherId_classId: { teacherId: 'teacher-1', classId } },
        update: {},
        create: { teacherId: 'teacher-1', classId },
      });
    }
  });

  it('沒有任何班級時不建立任何關聯', async () => {
    const count = await adminLinkTeacherToAllClasses('teacher-1');

    expect(count).toBe(0);
    expect(mocks.teacherClassUpsert).not.toHaveBeenCalled();
  });

  it.each([
    ['非校內網域帳號', { id: 'u1', role: 'teacher', email: 'someone@hateroblox.com' }],
    ['學生角色', { id: 'u1', role: 'student', email: 's2024146@pochiu.edu.hk' }],
    ['冒充網域', { id: 'u1', role: 'teacher', email: 'someone@pochiu.edu.hk.evil.com' }],
    ['查不到的帳號', null],
  ])('%s 一律 fail-closed（不建立任何關聯）', async (_label, account) => {
    mocks.userFindUnique.mockResolvedValue(account);
    mocks.classFindMany.mockResolvedValue([{ id: 'class-4A' }]);

    const count = await adminLinkTeacherToAllClasses('u1');

    expect(count).toBe(0);
    expect(mocks.teacherClassUpsert).not.toHaveBeenCalled();
  });

  it('管理員（校內網域）亦可連結', async () => {
    mocks.userFindUnique.mockResolvedValue({ id: 'admin-1', role: 'admin', email: 'ipwh@pochiu.edu.hk' });
    mocks.classFindMany.mockResolvedValue([{ id: 'class-4A' }]);

    expect(await adminLinkTeacherToAllClasses('admin-1')).toBe(1);
  });
});

describe('adminFindEducators', () => {
  it('只查校內網域的教師／管理員（非校內網域永不納入自動連結）', async () => {
    mocks.userFindMany.mockResolvedValue([SCHOOL_TEACHER]);

    const educators = await adminFindEducators();

    expect(educators).toEqual([SCHOOL_TEACHER]);
    expect(mocks.userFindMany).toHaveBeenCalledWith({
      where: {
        role: { in: ['teacher', 'admin'] },
        OR: [{ email: { endsWith: '@pochiu.edu.hk', mode: 'insensitive' } }],
      },
      select: { id: true, role: true, email: true },
    });
  });
});

describe('adminLinkEducators', () => {
  it('對每個 educator 建立同一班級的關聯並回傳數量', async () => {
    const count = await adminLinkEducators('class-4A', [{ id: 't1' }, { id: 't2' }]);

    expect(count).toBe(2);
    expect(mocks.teacherClassUpsert).toHaveBeenCalledTimes(2);
  });
});

describe('auth-next.ts 接線（source scan）', () => {
  const source = readFileSync(resolve(import.meta.dirname, '../../../shared/auth/auth-next.ts'), 'utf-8');

  it('建立教師帳號時呼叫自動連結', () => {
    expect(source).toContain("if (correctRole === 'teacher')");
    expect(source).toContain('await linkNewTeacherToAllClasses(created.id)');
  });

  it('角色一律由共用政策模組判定（不得再自寫 email 規則）', () => {
    expect(source).toContain("import { resolveSignInRole } from '@/shared/auth/sign-in-role'");
    expect(source).toContain('const correctRole = resolveSignInRole(user.email)');
    expect(source).not.toContain('s\\d{7}');
  });

  it('自動連結失敗永不阻擋登入（try/catch + logger）', () => {
    expect(source).toContain("await import('@/modules/admin/services/admin-operations')");
    expect(source).toContain('adminLinkTeacherToAllClasses');
    expect(source).toContain('Failed to link new teacher to classes');
  });
});
