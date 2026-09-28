// ============================================
// 開發腳本共用：DATABASE_URL 載入與 CLI 參數
// ============================================
// 2026-09-28：取代原本散落於 8 個腳本、逐字相同的 `readEnvValue` / `getDbUrl` 複製。
// 新增腳本請改用本模組，勿再複製貼上。
//
// 用法（**必須**在 import 任何應用模組之前呼叫）：
//   process.env.DATABASE_URL = getDbUrl();
//   const { db } = await import('@/shared/db/db');
//
// 註：`scripts/` 不在 `tsconfig.json` 的 include 內，故以相對路徑 import。
// ============================================

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** 從 `KEY=value` / `KEY: value` 形式的檔案讀取單一值（找不到或讀檔失敗回 null）。 */
export function readEnvValue(path: string, key: string): string | null {
  try {
    const content = readFileSync(path, 'utf8').replace(/^\uFEFF/, '');
    const match = content.match(new RegExp(`^${key}\\s*[:=]\\s*"?([^"\\r\\n]+?)"?\\s*$`, 'm'));
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/** 環境變數優先，否則依序讀 `.env.local` / `.env` / `cloud-run-env.yaml`。 */
export function getDbUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  for (const path of ['.env.local', '.env', 'cloud-run-env.yaml']) {
    const url = readEnvValue(resolve(process.cwd(), path), 'DATABASE_URL');
    if (url) return url;
  }
  throw new Error('找不到 DATABASE_URL（請設定環境變數，或確認 .env.local 存在）');
}

/** 讀取 `--flag=value` 形式的 CLI 參數。 */
export function argValue(flag: string): string | undefined {
  const hit = process.argv.find(a => a.startsWith(`${flag}=`));
  return hit ? hit.slice(flag.length + 1) : undefined;
}
