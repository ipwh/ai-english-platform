// ============================================
// 登入角色政策（單一 owner）— 契約測試
// ============================================
// 2026-10-08 政策（使用者指示）：
//   · 只有**校內網域**（`pochiu.edu.hk`）帳號可以是教師／管理員；
//   · 非校內網域一律視為**學生**（修正前：任何非 `s\d{7}` 的 email 都會被自動
//     判為教師 —— 一個校外 Google 帳號即可取得教師權限）；
//   · 規則只能有一份實作（先前散落 4 處，曾令降權帳號在登入／載入首頁時被自動升回）。
//
// 本測試鎖定角色判定（含冒充網域）與「呼叫端必須使用共用模組」的 source scan。
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ADMIN_EMAILS, SCHOOL_EMAIL_DOMAINS, isSchoolDomainEmail, resolveSignInRole } from '../sign-in-role';

describe('resolveSignInRole', () => {
  it('校內網域的學號形式 email ⇒ 學生', () => {
    expect(resolveSignInRole('s2024146@pochiu.edu.hk')).toBe('student');
    expect(resolveSignInRole('S2024146@POCHIU.EDU.HK')).toBe('student');
  });

  it('校內網域的其他 email ⇒ 教師', () => {
    expect(resolveSignInRole('lamyt@pochiu.edu.hk')).toBe('teacher');
    expect(resolveSignInRole('  ABC@Pochiu.Edu.HK  ')).toBe('teacher');
  });

  it('管理員帳號 ⇒ 管理員（大小寫不敏感）', () => {
    expect(resolveSignInRole('ipwh@pochiu.edu.hk')).toBe('admin');
    expect(resolveSignInRole('IPWH@POCHIU.EDU.HK')).toBe('admin');
  });

  it.each([
    'someone@hateroblox.com',
    'someone@gmail.com',
    // 非學校網域但學號形式的 prefix 仍是學生（不會因網域而變教師）
    's2024146@hateroblox.com',
  ])('非校內網域 %s ⇒ 學生（永不取得教師權限）', (email) => {
    expect(resolveSignInRole(email)).toBe('student');
  });

  it.each([
    'someone@pochiu.edu.hk.evil.com',
    'someone@notpochiu.edu.hk',
    'someone@sub.pochiu.edu.hk',
    'someone@pochiu.edu.hk@hateroblox.com',
    'no-at-sign',
    '',
  ])('冒認／畸形 email %s ⇒ 學生（fail-closed）', (email) => {
    expect(resolveSignInRole(email)).toBe('student');
  });

  it('null / undefined 視為學生（fail-closed）', () => {
    expect(resolveSignInRole(null)).toBe('student');
    expect(resolveSignInRole(undefined)).toBe('student');
  });
});

describe('isSchoolDomainEmail', () => {
  it('只接受完整校內網域標籤', () => {
    expect(isSchoolDomainEmail('a@pochiu.edu.hk')).toBe(true);
    expect(isSchoolDomainEmail('a@pochiu.edu.hk.evil.com')).toBe(false);
    expect(isSchoolDomainEmail('a@notpochiu.edu.hk')).toBe(false);
    expect(isSchoolDomainEmail('a@sub.pochiu.edu.hk')).toBe(false);
    expect(isSchoolDomainEmail('a@')).toBe(false);
    expect(isSchoolDomainEmail('@pochiu.edu.hk')).toBe(false);
    expect(isSchoolDomainEmail(null)).toBe(false);
  });
});

describe('政策常數', () => {
  it('校內網域與管理員帳號皆為校內網域', () => {
    expect(SCHOOL_EMAIL_DOMAINS).toContain('pochiu.edu.hk');
    for (const admin of ADMIN_EMAILS) {
      expect(isSchoolDomainEmail(admin)).toBe(true);
    }
  });
});

describe('呼叫端必須使用單一共用實作（source scan）', () => {
  const filesWithRoleRule = [
    'src/shared/auth/auth-next.ts',
    'src/app/page.tsx',
    'src/app/(public)/role-select/page.tsx',
  ];

  it.each(filesWithRoleRule)('%s 使用 resolveSignInRole，且不再自寫 email 規則', (relativePath) => {
    const source = readFileSync(resolve(import.meta.dirname, '../../../..', relativePath), 'utf-8');

    expect(source).toContain('resolveSignInRole');
    // 舊規則的殘留簽名：郵件前綴判斷、硬編管理員 email、本機函式
    expect(source).not.toContain('s\\d{7}');
    expect(source).not.toContain('ipwh@pochiu.edu.hk');
    expect(source).not.toContain('getRealRoleByEmail');
    expect(source).not.toContain('getMaxRoleByEmail');
  });
});
