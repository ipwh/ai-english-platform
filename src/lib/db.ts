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
      const pool = new Pool({
        connectionString: dbUrl,
        max: 5,
        connectionTimeoutMillis: 15000,
        idleTimeoutMillis: 60000,
        // Vercel serverless: 每個 function instance 約需 1-2 連線
        // max:5 允許 5 個並行請求而不排隊
        // 若使用 Cloud SQL 可調至 10-20
      });
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

// 所有環境都 cache，避免 serverless 每次調用重建 Pool
globalForPrisma.prisma = db;

// ---- 大量匯入專用 DB 客戶端（較大連線池，避免逾時）----
let bulkDbCache: PrismaClient | null = null;

export function getBulkDb(): PrismaClient {
  if (bulkDbCache) return bulkDbCache;

  const dbUrl = getDbUrl();
  const isPostgres = dbUrl.startsWith('postgresql://') || dbUrl.startsWith('postgres://');

  if (isPostgres) {
    const { PrismaPg } = require('@prisma/adapter-pg') as typeof import('@prisma/adapter-pg');
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
      console.log('[db] connected successfully');
    })
    .catch((err: unknown) => {
      console.error('[db] connection test failed', err);
    });
}

export default db;
