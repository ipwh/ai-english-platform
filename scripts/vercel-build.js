// ============================================
// Vercel Build Script
// 取代 "prisma generate && prisma migrate deploy && next build"
// 使用 migrate deploy 而非 db push，確保生產環境 schema 變更可審計且不會遺失資料
// 本地開發仍可使用 prisma db push 快速迭代
// ============================================

const { execSync } = require('node:child_process');

function run(cmd, label) {
  console.log(`\n🔧 ${label}...`);
  try {
    execSync(cmd, { stdio: 'inherit', cwd: process.cwd() });
    console.log(`✅ ${label} done`);
    return true;
  } catch (err) {
    console.error(`❌ ${label} failed:`, err.message?.slice(0, 200));
    return false;
  }
}

// Step 1: Generate Prisma Client (必須成功)
if (!run('npx prisma generate', 'prisma generate')) {
  process.exit(1);
}

// Step 2: Deploy migrations to DB
// 使用 migrate deploy（而非 db push）以確保生產環境 schema 變更可追蹤
// 若 DB 無法連線（如本地開發），不中斷 build
const isProd = process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';
const migrateOk = run('npx prisma migrate deploy', 'prisma migrate deploy');
if (!migrateOk) {
  if (isProd) {
    console.error('❌  Production requires successful prisma migrate deploy. Aborting build.');
    process.exit(1);
  }
  console.warn('⚠️  prisma migrate deploy failed — DB may be unreachable locally.');
  console.warn('   This is OK for local testing.');
}

// Step 3: Build Next.js (必須成功)
if (!run('npx next build', 'next build')) {
  process.exit(1);
}

console.log('\n🎉 vercel-build completed successfully');
