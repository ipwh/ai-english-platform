// ============================================
// 密碼雜湊工具 — bcryptjs（純 JS，Vercel 相容）
// 支援舊版 simpleHash 遷移：比對成功後自動升級為 bcrypt
// ============================================

import bcrypt from 'bcryptjs';
import { logger } from '@/lib/logger';

const BCRYPT_ROUNDS = 10;

/**
 * 使用 bcryptjs 雜湊密碼
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export function hashPasswordSync(password: string): string {
  return bcrypt.hashSync(password, BCRYPT_ROUNDS);
}

/**
 * 驗證密碼：先嘗試 bcrypt，失敗時嘗試舊版 simpleHash
 * 若舊版比對成功，回傳特殊標記讓呼叫方重新雜湊儲存
 */
export async function verifyPassword(password: string, hash: string): Promise<'valid' | 'needs_rehash' | 'invalid'> {
  // 1. 嘗試 bcrypt 比對
  if (hash.startsWith('$2a$') || hash.startsWith('$2b$') || hash.startsWith('$2y$')) {
    const match = await bcrypt.compare(password, hash);
    return match ? 'valid' : 'invalid';
  }

  // 2. 嘗試舊版 simpleHash（遷移期 — 每次比對成功記錄警告以追蹤遷移進度）
  if (hash.startsWith('hash_')) {
    const legacyMatch = legacySimpleHash(password) === hash;
    if (legacyMatch) trackLegacyUsage();
    return legacyMatch ? 'needs_rehash' : 'invalid';
  }

  return 'invalid';
}

/**
 * 同步版本 — 供 NextAuth credential provider 使用
 */
export function verifyPasswordSync(password: string, hash: string): 'valid' | 'needs_rehash' | 'invalid' {
  if (hash.startsWith('$2a$') || hash.startsWith('$2b$') || hash.startsWith('$2y$')) {
    return bcrypt.compareSync(password, hash) ? 'valid' : 'invalid';
  }
  if (hash.startsWith('hash_')) {
    const legacyMatch = legacySimpleHash(password) === hash;
    if (legacyMatch) trackLegacyUsage();
    return legacyMatch ? 'needs_rehash' : 'invalid';
  }
  return 'invalid';
}

// ============================================
// 舊版 simpleHash — 僅保留供遷移用，新密碼一律使用 bcrypt
// ============================================

/** 舊版雜湊使用計數器（用於監控遷移進度） */
let legacyHashUsageCount = 0;
const MAX_LEGACY_WARNINGS = 5;

function legacySimpleHash(password: string): string {
  let hash = 0;
  for (let i = 0; i < password.length; i++) {
    const char = password.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return `hash_${Math.abs(hash).toString(16)}_${password.length}`;
}

/** 檢查是否仍有使用舊版雜湊的密碼 */
export function getLegacyHashStats(): { count: number; needsMigration: boolean } {
  return { count: legacyHashUsageCount, needsMigration: legacyHashUsageCount > 0 };
}

function trackLegacyUsage(): void {
  legacyHashUsageCount++;
  if (legacyHashUsageCount <= MAX_LEGACY_WARNINGS) {
    logger.warn({ module: 'crypto', count: legacyHashUsageCount },
      `Detected legacy simpleHash password #${legacyHashUsageCount}. Will auto-upgrade to bcrypt on login.`);
  } else if (legacyHashUsageCount === MAX_LEGACY_WARNINGS + 1) {
    logger.warn({ module: 'crypto', count: legacyHashUsageCount },
      `Legacy hash warnings exceeded limit of ${MAX_LEGACY_WARNINGS}. Total: ${legacyHashUsageCount}. Please complete migration.`);
  }
}

// ============================================
// 向後相容：simpleHash 別名（供 seed.ts / import scripts 使用）
// ⚠️ DEPRECATED: 新程式碼應使用 hashPassword / hashPasswordSync
// 此別名將於 2026-09-01 後移除
// ============================================
/** @deprecated 使用 hashPasswordSync 取代。將於 2026-09-01 移除。 */
export const simpleHash = hashPasswordSync;
