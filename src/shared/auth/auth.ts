// ============================================
// 認證系統 — Prisma DB + JWT 工具
// ============================================

import type { UserRole } from '@/shared/types/types';
import type { SessionPayload } from '@/shared/auth/jwt';
import { StudentRepo } from '@/modules/repositories';
import { createSessionToken } from '@/shared/auth/jwt';

// Re-export JWT utilities from Edge-safe module
// (jwt.ts 不含 Prisma 依賴，可在 Edge Runtime 安全使用)
export { verifySessionToken, type SessionPayload } from '@/shared/auth/jwt';

// ============================================
// 密碼工具 — 已移至 @/lib/crypto.ts
// ============================================

import { hashPassword, verifyPassword } from '@/shared/auth/crypto';
import { logger } from '@/shared/logger/logger';

// ============================================
// 認證邏輯（Prisma DB）
// ============================================

export interface LoginResult {
  success: boolean;
  error?: string;
  token?: string;
  user?: SessionPayload;
}

export async function authenticateUser(email: string, password: string): Promise<LoginResult> {
  const emailLower = email.toLowerCase().trim();

  const user = await StudentRepo.findUserByEmail(emailLower);

  if (!user) {
    return { success: false, error: '電郵地址或密碼不正確。' };
  }

  if (!user.passwordHash) {
    return { success: false, error: '電郵地址或密碼不正確。' };
  }

  const verifyResult = await verifyPassword(password, user.passwordHash);
  if (verifyResult === 'invalid') {
    return { success: false, error: '電郵地址或密碼不正確。' };
  }

  const sessionPayload: SessionPayload = {
    userId: user.id,
    email: user.email,
    nameZh: user.nameZh || user.name || user.email,
    nameEn: user.nameEn || user.name || user.email,
    role: (user.role as UserRole) || 'student',
    className: user.class?.name || undefined,
  };

  const token = await createSessionToken(sessionPayload);

  // 若密碼是舊版 simpleHash，背景重新雜湊為 bcrypt（不阻塞登入）
  if (verifyResult === 'needs_rehash') {
    hashPassword(password).then(newHash => {
      StudentRepo.updateUserPassword(user.id, newHash).catch(err => {
        logger.error({ module: 'auth', userId: user.id, error: (err as Error).message }, 'Background password rehash failed');
      });
    });
  }

  return { success: true, token, user: sessionPayload };
}
