// Prisma 7.x config
export default {
  datasource: {
    db: {
      url: process.env.DATABASE_URL || 'file:C:/Users/steve/AppData/Local/english-platform/dev.db',
    },
  },
};
