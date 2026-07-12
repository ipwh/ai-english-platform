// ============================================
// 密碼雜湊工具 — 統一所有 auth/import 模組
// TODO: 建議升級為 bcrypt/argon2（目前為簡易 hash）
// ============================================

/** 簡易密碼雜湊（與 prisma/seed.ts 一致） */
export function simpleHash(password: string): string {
  let hash = 0;
  for (let i = 0; i < password.length; i++) {
    const char = password.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return `hash_${Math.abs(hash).toString(16)}_${password.length}`;
}

export function verifyPassword(password: string, hash: string): boolean {
  return simpleHash(password) === hash;
}
