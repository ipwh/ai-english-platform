// ============================================
// Vercel Build Script
// 取代 "prisma generate && prisma db push && next build"
//
// Migration 策略：
//   1. 優先使用 prisma migrate deploy（可審計、不遺失資料）
//   2. 若 DB 已有 schema 但無 migration 歷史（P3005），fallback 到 prisma db push
//   3. 本地開發 fallback 到 prisma db push
//
// 遷移路徑：設定好 baseline migration 後（見 prisma/migrations/），
//   migrate deploy 將成為主要路徑，不再需要 db push fallback。
// ============================================

const { execSync } = require('node:child_process');

function run(cmd, label) {
  console.log(`\n🔧 ${label}...`);
  try {
    execSync(cmd, { stdio: 'inherit', cwd: process.cwd() });
    console.log(`✅ ${label} done`);
    return { ok: true, output: '' };
  } catch (err) {
    // execSync throws on non-zero exit — the actual error text is in stderr/stdout
    const stderr = err.stderr?.toString() || '';
    const stdout = err.stdout?.toString() || '';
    const combined = stderr + stdout + (err.message || '');
    console.error(`❌ ${label} failed`);
    return { ok: false, output: combined };
  }
}

// Step 1: Generate Prisma Client (必須成功)
if (!run('npx prisma generate', 'prisma generate').ok) {
  process.exit(1);
}

// Step 2: Deploy schema to DB
const isProd = process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';

// Try migrate deploy first (preferred for production)
const migrateResult = run('npx prisma migrate deploy', 'prisma migrate deploy');

if (migrateResult.ok) {
  console.log('✅  Schema deployed via prisma migrate deploy');
} else {
  const output = migrateResult.output;
  const isMissingMigration =
    output.includes('P3005') ||
    output.includes('No migration found') ||
    output.includes('not empty');

  if (isMissingMigration) {
    // DB already has schema but no migration history yet (project was using db push).
    // Fallback to db push until baseline migration is created.
    console.warn('⚠️  No migration history found — project was previously using prisma db push.');
    console.warn('   Falling back to prisma db push for this deployment.');
    console.warn('   To migrate: run `npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/0_init/migration.sql`');
    const pushResult = run('npx prisma db push', 'prisma db push (fallback)');
    if (!pushResult.ok && isProd) {
      console.error('❌  Production requires a working DB connection. Aborting build.');
      process.exit(1);
    }
  } else if (isProd) {
    // Real error in production (not a missing-migration issue) — abort
    console.error('❌  prisma migrate deploy failed in production. Aborting build.');
    console.error('   Error:', output.slice(0, 500));
    process.exit(1);
  } else {
    // Dev: just warn and try db push
    console.warn('⚠️  prisma migrate deploy failed — falling back to prisma db push for local dev.');
    run('npx prisma db push', 'prisma db push (dev fallback)');
  }
}

// Step 3: Build Next.js (必須成功)
if (!run('npx next build', 'next build').ok) {
  process.exit(1);
}

console.log('\n🎉 vercel-build completed successfully');
