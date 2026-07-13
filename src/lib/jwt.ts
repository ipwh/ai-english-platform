// ============================================
// JWT 工具 — Edge Runtime 安全（零 Node.js 依賴）
// 僅使用 jose（Edge-compatible），無 Prisma/DB 依賴
// ============================================

import { SignJWT, jwtVerify } from 'jose';
import type { UserRole } from './types';

function getJWTSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      'JWT_SECRET 環境變數未設定。請在 .env.local 或 Vercel Environment Variables 中設定。\n' +
      '生產環境必須使用至少 32 字元的隨機字串。'
    );
  }
  return new TextEncoder().encode(secret);
}

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
    .sign(getJWTSecret());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getJWTSecret());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}
