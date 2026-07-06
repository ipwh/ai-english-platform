// ============================================
// 認證系統 — 用戶資料庫 + JWT 工具
// 目前使用 mock 資料庫，可替換為 PostgreSQL/MongoDB
// ============================================

import { SignJWT, jwtVerify } from 'jose';
import type { UserRole } from './types';

// ============================================
// 用戶資料（Mock Database）
// TODO: 替換為真實資料庫 (PostgreSQL / MongoDB / Planetscale)
// ============================================

export interface AuthUser {
  id: string;
  email: string;
  passwordHash: string; // 實際應使用 bcrypt hash
  nameZh: string;
  nameEn: string;
  role: UserRole;
  className?: string;
  classNumber?: string;
}

// 簡易密碼雜湊（示範用，正式環境請用 bcrypt）
function simpleHash(password: string): string {
  let hash = 0;
  for (let i = 0; i < password.length; i++) {
    const char = password.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return `hash_${Math.abs(hash).toString(16)}_${password.length}`;
}

function verifyPassword(password: string, hash: string): boolean {
  return simpleHash(password) === hash;
}

// Mock 用戶資料庫
const mockUsers: AuthUser[] = [
  {
    id: 's001',
    email: 'student@school.hk',
    passwordHash: simpleHash('student123'),
    nameZh: '陳家明',
    nameEn: 'Chan Ka Ming',
    role: 'student',
    className: '4A',
    classNumber: '15',
  },
  {
    id: 's002',
    email: 'student2@school.hk',
    passwordHash: simpleHash('student123'),
    nameZh: '李志偉',
    nameEn: 'Lee Chi Wai',
    role: 'student',
    className: '4A',
    classNumber: '20',
  },
  {
    id: 't001',
    email: 'teacher@school.hk',
    passwordHash: simpleHash('teacher123'),
    nameZh: '黃淑儀',
    nameEn: 'Wong Suk Yee',
    role: 'teacher',
  },
  {
    id: 'admin001',
    email: 'admin@school.hk',
    passwordHash: simpleHash('admin123'),
    nameZh: '系統管理員',
    nameEn: 'System Admin',
    role: 'admin',
  },
];

// ============================================
// JWT 工具
// ============================================

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

export async function createSessionToken(user: AuthUser): Promise<string> {
  const payload: SessionPayload = {
    userId: user.id,
    email: user.email,
    nameZh: user.nameZh,
    nameEn: user.nameEn,
    role: user.role,
    className: user.className,
  };

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

// ============================================
// 認證邏輯
// ============================================

export interface LoginResult {
  success: boolean;
  error?: string;
  token?: string;
  user?: SessionPayload;
}

export async function authenticateUser(email: string, password: string): Promise<LoginResult> {
  const emailLower = email.toLowerCase().trim();
  const user = mockUsers.find(u => u.email.toLowerCase() === emailLower);

  if (!user) {
    return { success: false, error: '電郵地址或密碼不正確。' };
  }

  if (!verifyPassword(password, user.passwordHash)) {
    return { success: false, error: '電郵地址或密碼不正確。' };
  }

  const token = await createSessionToken(user);

  return {
    success: true,
    token,
    user: {
      userId: user.id,
      email: user.email,
      nameZh: user.nameZh,
      nameEn: user.nameEn,
      role: user.role,
      className: user.className,
    },
  };
}

export function getDemoUsers(): { email: string; password: string; role: string; name: string }[] {
  return mockUsers.map(u => ({
    email: u.email,
    password: u.role === 'student' ? 'student123' : u.role === 'teacher' ? 'teacher123' : 'admin123',
    role: u.role,
    name: u.nameZh,
  }));
}
