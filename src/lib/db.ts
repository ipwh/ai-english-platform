// ============================================
// Prisma 資料庫服務 — Prisma 7.x
// 支援 SQLite (libsql) 和 PostgreSQL (pg)
// 透過 DB_PROVIDER 或 DATABASE_URL 自動偵測
// ============================================

import { PrismaClient } from '@prisma/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';
import { config } from '@/lib/config';
import { logger } from '@/lib/logger';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function getDbUrl(): string {
  const url = process.env.DATABASE_URL;
  if (url) return url;

  // 生產環境必須設定 DATABASE_URL
  if (config.isProduction) {
    throw new Error(
      '[db] 生產環境必須設定 DATABASE_URL 環境變數。\n' +
      '請在 Vercel Dashboard → Settings → Environment Variables 中設定。\n' +
      '範例: postgresql://user:pass@host:5432/dbname'
    );
  }

  // 開發環境預設 SQLite
  return `file:${process.cwd()}/prisma/dev.db`;
}

function createPrismaClient(): PrismaClient {
  const dbUrl = getDbUrl();
  const isPostgres = dbUrl.startsWith('postgresql://') || dbUrl.startsWith('postgres://');

  if (isPostgres) {
    // PostgreSQL: 使用 require() 避免 SQLite 專案需安裝 pg（無法用動態 import，此處須同步初始化）
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { PrismaPg } = require('@prisma/adapter-pg') as typeof import('@prisma/adapter-pg');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Pool } = require('pg') as typeof import('pg');
      const pool = new Pool({
        connectionString: dbUrl,
        max: config.db.pool.max,
        connectionTimeoutMillis: config.db.pool.connectionTimeoutMillis,
        idleTimeoutMillis: config.db.pool.idleTimeoutMillis,
      });
      const adapter = new PrismaPg(pool);
      return new PrismaClient({
        adapter,
        log: config.isDevelopment ? ['warn', 'error'] : ['error'],
      });
    } catch (e) {
      logger.error({ module: 'db', error: 'PostgreSQL adapter not available' }, 'Install: npm install @prisma/adapter-pg pg');
      throw e;
    }
  }

  // SQLite (預設)
  const adapter = new PrismaLibSql({ url: dbUrl });
  return new PrismaClient({
    adapter,
    log: config.isDevelopment ? ['warn', 'error'] : ['error'],
  });
}

export const db = globalForPrisma.prisma ?? createPrismaClient();

// 所有環境都 cache，避免 serverless 每次調用重建 Pool
globalForPrisma.prisma = db;

// ---- 大量匯入專用 DB 客戶端（較大連線池，避免逾時）----
let bulkDbCache: PrismaClient | null = null;

export function getBulkDb(): PrismaClient {
  if (bulkDbCache) return bulkDbCache;

  const dbUrl = getDbUrl();
  const isPostgres = dbUrl.startsWith('postgresql://') || dbUrl.startsWith('postgres://');

  if (isPostgres) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PrismaPg } = require('@prisma/adapter-pg') as typeof import('@prisma/adapter-pg');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Pool } = require('pg') as typeof import('pg');
    const pool = new Pool({
      connectionString: dbUrl,
      max: 8, // 大量寫入需要較大連線池
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 60000,
    });
    bulkDbCache = new PrismaClient({
      adapter: new PrismaPg(pool),
      log: ['error'],
    });
  } else {
    // SQLite：使用同一個客戶端
    bulkDbCache = db;
  }

  return bulkDbCache;
}

// 啟動時探測 DB 連線（僅記錄，不中斷啟動）
if (typeof window === 'undefined') {
  db.$connect()
    .then(() => {
      logger.info({ module: 'db' }, 'connected successfully');
    })
    .catch((err: unknown) => {
      logger.error({ module: 'db', error: String(err) }, 'connection test failed');
    });
}

export default db;
