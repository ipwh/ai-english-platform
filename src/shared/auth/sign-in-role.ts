// ============================================
// 登入角色判定（單一 owner）— Google OAuth / email 身份政策
// ============================================
// 2026-10-08（使用者指示）：
//   1. **只有校內網域帳號可以是教師／管理員**；非校內網域一律視為**學生**
//      （修正前：任何非 `s\d{7}` 的 email 都會被自動判為教師 —— 一個校外
//      Google 帳號即可取得教師權限，包括匯出全校學生資料）。
//   2. 新教師首次登入會自動連結所有現行班級；**非校內網域永不自動連結**
//      （見 `admin-operations.adminLinkTeacherToAllClasses()`）。
//
// 本模組是該規則的**唯一實作**。呼叫端（全部必須使用這裡，禁止再各自複製
// email 規則 —— 修正前共有 4 份，曾令被降權的帳號在下一次登入／載入首頁時
// 被自動升回教師）：
//   · `shared/auth/auth-next.ts`（登入建帳與角色修正）
//   · `app/page.tsx`（首頁導向）
//   · `app/(public)/role-select/page.tsx`（角色選擇上限）
//   · `modules/admin/services/admin-operations.ts`（自動連結的對象篩選）
//
// 純函式、零依賴 → 可安全用於 client component 與 Edge runtime。
// ============================================

import type { UserRole } from '@/shared/types/types';

/** 校內網域（可多個）。比對一律為**完整網域標籤**，防止 `pochiu.edu.hk.evil.com` 之類的冒充。 */
export const SCHOOL_EMAIL_DOMAINS: readonly string[] = ['pochiu.edu.hk'];

/** 管理員帳號（唯一）。 */
export const ADMIN_EMAILS: readonly string[] = ['ipwh@pochiu.edu.hk'];

/** 學生學號 email 形式：`s` + 7 位數字（例：`s2024146@pochiu.edu.hk`）。 */
const STUDENT_EMAIL_PATTERN = /^s\d{7}$/;

/**
 * 是否為校內網域 email。
 * `x@pochiu.edu.hk` ✓、`x@notpochiu.edu.hk` ✗、`x@pochiu.edu.hk.evil.com` ✗、
 * `x@sub.pochiu.edu.hk` ✗（子網域不算，需要時加入 `SCHOOL_EMAIL_DOMAINS`）。
 */
export function isSchoolDomainEmail(email: string | null | undefined): boolean {
  const domain = emailDomain(email);
  return domain !== null && SCHOOL_EMAIL_DOMAINS.some(d => domain === d.toLowerCase());
}

/** 依 email 判定登入角色：管理員 > 教師（校內網域且非學號形式）> 學生。 */
export function resolveSignInRole(email: string | null | undefined): UserRole {
  const normalized = (email ?? '').trim().toLowerCase();
  if (ADMIN_EMAILS.some(admin => admin.toLowerCase() === normalized)) return 'admin';
  if (!isSchoolDomainEmail(normalized)) return 'student';
  const localPart = normalized.slice(0, normalized.lastIndexOf('@'));
  return STUDENT_EMAIL_PATTERN.test(localPart) ? 'student' : 'teacher';
}

/** 只回傳小寫網域；格式不合法（無 `@`、`@` 在開頭）回 null。 */
function emailDomain(email: string | null | undefined): string | null {
  if (!email) return null;
  const normalized = email.trim().toLowerCase();
  const at = normalized.lastIndexOf('@');
  if (at <= 0 || at === normalized.length - 1) return null;
  return normalized.slice(at + 1);
}
