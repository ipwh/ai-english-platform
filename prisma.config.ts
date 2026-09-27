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
// 故 Cloud Run 等無 .env 檔的部署不受影響。
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

const isProduction = process.env.NODE_ENV === 'production';

// 生產環境必須設定 DATABASE_URL（Cloud Run 環境變數 / Secret Manager）
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
    '請在 Cloud Run 服務的環境變數（建議用 Secret Manager）中設定。\n' +
    '格式: postgresql://user:password@host:5432/database'
  );
}

// 2026-09-27：CLI（prisma migrate deploy / db push / studio）優先走**直連**。
// 背景：Neon 的 `-pooler` 主機是 PgBouncer（transaction mode）——Prisma schema
// engine 的遷移流程使用 advisory lock 與長時間工作階段，官方建議經 directUrl
// 執行；交易模式的 pooler 可能令遷移卡住或失敗。
// 命名：正典為 `DIRECT_DATABASE_URL`（同 Neon 直連主機、無 `-pooler`）；兼容
// 舊文件曾出現的 `DIRECT_URL`；兩者皆無則沿用 dbUrl（維持既有行為）。
// 執行期（app）不經此檔——`src/shared/db/db.ts` 以 @prisma/adapter-pg + pg Pool
// 連接 DATABASE_URL（pooler）。
const directUrl = process.env.DIRECT_DATABASE_URL || process.env.DIRECT_URL || null;
if (!directUrl && /-pooler\./.test(dbUrl)) {
  console.warn('[prisma.config] DIRECT_DATABASE_URL 未設定——遷移將經由 pooler 主機執行（Neon 建議直連；見 AGENTS.md）');
}

export default defineConfig({
  datasource: {
    url: directUrl ?? dbUrl,
  },
});
