// ============================================
// Prisma 7.x 配置
// 開發: SQLite（本地）
// 生產: PostgreSQL（透過 DATABASE_URL 環境變數）
// ============================================

import { defineConfig } from 'prisma/config';

const dbUrl = process.env.DATABASE_URL || 'file:C:/Users/TC-37/AppData/Local/Temp/english-platform-dev.db';

export default defineConfig({
  datasource: {
    url: dbUrl,
  },
});
