// ============================================
// Prisma 7.x 配置
// 開發: SQLite（本地）
// 生產: PostgreSQL（透過 DATABASE_URL 環境變數）
// ============================================

import { defineConfig } from 'prisma/config';

const dbUrl = process.env.DATABASE_URL || `file:${process.cwd()}/prisma/dev.db`;
const isPostgres = dbUrl.startsWith('postgresql://') || dbUrl.startsWith('postgres://');

export default defineConfig({
  datasource: {
    url: dbUrl,
    provider: isPostgres ? 'postgresql' : 'sqlite',
  },
});
