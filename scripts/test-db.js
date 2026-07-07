// Quick test: PrismaClient + libsql adapter
const { PrismaClient } = require('@prisma/client');
const { PrismaLibSql } = require('@prisma/adapter-libsql');

async function main() {
  const dbUrl = 'file:C:/Users/TC-37/AppData/Local/Temp/english-platform-dev.db';
  console.log('URL:', dbUrl);
  
  // Try passing URL directly to adapter constructor
  const adapter = new PrismaLibSql({ url: dbUrl });
  console.log('adapter created');
  
  const prisma = new PrismaClient({ adapter });
  console.log('PrismaClient created');
  
  try {
    await prisma.$connect();
    console.log('Connected!');
    const count = await prisma.user.count();
    console.log('User count:', count);
    await prisma.$disconnect();
  } catch (e) {
    console.error('Error:', e.message);
  }
}

main();
