// ============================================
// Prisma 資料庫服務 — Prisma 7.x
// 支援 SQLite (libsql) 和 PostgreSQL (pg)
// 透過 DB_PROVIDER 或 DATABASE_URL 自動偵測
// ============================================

import { PrismaClient } from '@prisma/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function getDbUrl(): string {
  const url = process.env.DATABASE_URL;
  if (url) return url;

  // 生產環境必須設定 DATABASE_URL
  if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
    throw new Error(
      '[db] 生產環境必須設定 DATABASE_URL 環境變數。\n' +
      '請在 Vercel Dashboard → Settings → Environment Variables 中設定。\n' +
      '範例: postgresql://user:pass@host:5432/dbname'
    );
  }

  // 開發環境預設 SQLite
  return 'file:C:/Users/TC-37/AppData/Local/Temp/english-platform-dev.db';
}

function createPrismaClient(): PrismaClient {
  const dbUrl = getDbUrl();
  const isPostgres = dbUrl.startsWith('postgresql://') || dbUrl.startsWith('postgres://');

  if (isPostgres) {
    // PostgreSQL: 使用動態 import 避免 SQLite 專案需安裝 pg
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { PrismaPg } = require('@prisma/adapter-pg') as typeof import('@prisma/adapter-pg');
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { Pool } = require('pg') as typeof import('pg');
      const pool = new Pool({ connectionString: dbUrl, max: 5 });
      const adapter = new PrismaPg(pool);
      return new PrismaClient({
        adapter,
        log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
      });
    } catch (e) {
      console.error('[db] PostgreSQL adapter not available. Install: npm install @prisma/adapter-pg pg');
      throw e;
    }
  }

  // SQLite (預設)
  const adapter = new PrismaLibSql({ url: dbUrl });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
}

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db;
}

export default db;
