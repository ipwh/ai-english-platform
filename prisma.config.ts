// ============================================
// Prisma 7.x 配置
// 使用 DATABASE_URL 環境變數（生產: Neon PostgreSQL）
// 本地開發如無 DATABASE_URL 則使用 SQLite file: URL
// ============================================

import { defineConfig } from 'prisma/config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Prisma CLI evaluates config before its built-in dotenv loads.
// Manually parse .env to ensure DATABASE_URL is available.
function loadEnv() {
  try {
    const envPath = resolve(process.cwd(), '.env');
    const content = readFileSync(envPath, 'utf-8');
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
    // .env file is optional
  }
}

loadEnv();

const dbUrl = process.env.DATABASE_URL || `file:${process.cwd()}/prisma/dev.db`;

export default defineConfig({
  datasource: {
    url: dbUrl,
  },
});
