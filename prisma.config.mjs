// Prisma 7.x config — 支援 SQLite (開發) / PostgreSQL (生產)
export default {
  datasource: {
    db: {
      url: process.env.DATABASE_URL || 'file:C:/Users/TC-37/AppData/Local/Temp/english-platform-dev.db',
    },
  },
};
