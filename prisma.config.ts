// ============================================
// Prisma 7.x 配置
// 使用 DATABASE_URL 環境變數（生產: Neon PostgreSQL）
// 本地開發如無 DATABASE_URL 則使用 SQLite file: URL
// ============================================

import { defineConfig } from 'prisma/config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Prisma CLI evaluates config before its built-in dotenv loads.
// Manually parse env files to ensure DATABASE_URL is available.
//
// 2026-09-14: 改為與 repo 其他腳本一致的載入順序（.env.local → .env）。
// 背景：本機 `.env` 內的 DATABASE_URL 密碼已失效（P1000 auth failed），
// 可用的憑證只更新在 `.env.local`；`scripts/set-academic-year.ts` 等腳本
// 一律以 `.env.local` 為優先（README 亦有記載）。此前 Prisma CLI 只讀 `.env`，
// 令 `prisma migrate deploy` / `db execute` 在本機無法連線。
// 真實環境變數永遠優先（`process.env` 已有的值不會被覆寫），
// 故 Vercel / Cloud Run 等無 .env 檔的部署不受影響。
const ENV_FILES = ['.env.local', '.env'];

function loadEnv() {
  for (const file of ENV_FILES) {
    try {
      const content = readFileSync(resolve(process.cwd(), file), 'utf-8').replace(/^\uFEFF/, '');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIndex = trimmed.indexOf('=');
        if (eqIndex === -1) continue;
        const key = trimmed.slice(0, eqIndex).trim();
        let value = trimmed.slice(eqIndex + 1).trim();
        // Strip surrounding quotes
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    } catch {
      // env files are optional
    }
  }
}

loadEnv();

const isProduction = process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';

// 生產環境必須設定 DATABASE_URL（透過 Vercel Environment Variables）
// 開發環境若無 DATABASE_URL 則 fallback 到本地 SQLite
let dbUrl: string;
if (process.env.DATABASE_URL) {
  dbUrl = process.env.DATABASE_URL;
} else if (!isProduction) {
  dbUrl = `file:${process.cwd()}/prisma/dev.db`;
  console.warn('[prisma.config] DATABASE_URL not set — using local SQLite (dev only)');
} else {
  throw new Error(
    '[prisma.config] 生產環境必須設定 DATABASE_URL 環境變數。\n' +
    '請在 Vercel Dashboard → Settings → Environment Variables 中設定。\n' +
    '格式: postgresql://user:password@host:5432/database'
  );
}

export default defineConfig({
  datasource: {
    url: dbUrl,
  },
});
