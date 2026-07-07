// ============================================
// JWT 工具 — Edge Runtime 安全（零 Node.js 依賴）
// 僅使用 jose（Edge-compatible），無 Prisma/DB 依賴
// ============================================

import { SignJWT, jwtVerify } from 'jose';
import type { UserRole } from './types';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'english-platform-secret-key-change-in-production-2026'
);

const JWT_EXPIRY = '7d';

export interface SessionPayload {
  userId: string;
  email: string;
  nameZh: string;
  nameEn: string;
  role: UserRole;
  className?: string;
}

export async function createSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(JWT_EXPIRY)
    .sign(JWT_SECRET);
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}
