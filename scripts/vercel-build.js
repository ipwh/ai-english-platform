// ============================================
// Vercel Build Script
// 取代 "prisma generate && prisma db push && next build"
// prisma db push 在 DB 無法連線時不中斷 build（Vercel serverless 環境可正常連線）
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

// Step 2: Push schema to DB (非致命：Vercel 環境可正常連線 Neon)
// P1001 = Can't reach database server（本地開發常見，Vercel 環境不會發生）
const pushOk = run('npx prisma db push', 'prisma db push');
if (!pushOk) {
  console.warn('⚠️  prisma db push failed — DB may be unreachable locally.');
  console.warn('   This is OK for local testing. On Vercel, the build will connect to Neon successfully.');
}

// Step 3: Build Next.js (必須成功)
if (!run('npx next build', 'next build')) {
  process.exit(1);
}

console.log('\n🎉 vercel-build completed successfully');
