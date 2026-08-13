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

function run(cmd, label, { captureOutput = false } = {}) {
  console.log(`\n🔧 ${label}...`);
  const opts = {
    cwd: process.cwd(),
    stdio: captureOutput ? 'pipe' : 'inherit',
    encoding: 'utf-8',
  };
  try {
    const result = execSync(cmd, opts);
    console.log(`✅ ${label} done`);
    return { ok: true, output: captureOutput ? (result?.toString() || '') : '' };
  } catch (err) {
    const stderr = captureOutput ? (err.stderr?.toString() || '') : '';
    const stdout = captureOutput ? (err.stdout?.toString() || '') : '';
    const combined = stderr + stdout + (err.message || '');
    if (!captureOutput) {
      console.error(`❌ ${label} failed`);
    }
    return { ok: false, output: combined };
  }
}

// Step 1: Generate Prisma Client (必須成功)
if (!run('npx --yes prisma generate', 'prisma generate').ok) {
  process.exit(1);
}

// Step 2: Deploy schema to DB
const isProd = process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';

// Step 2a: Ensure pgvector extension is available (required for vector(1536) column)
// Non-fatal: if pgvector is not available, the column will be skipped
// and the app falls back to in-memory cosine similarity in rag-service.ts
console.log('\n🔧 Ensuring pgvector extension...');
try {
  execSync('npx --yes prisma db execute --stdin', {
    input: 'CREATE EXTENSION IF NOT EXISTS vector;',
    cwd: process.cwd(),
    stdio: 'pipe',
    encoding: 'utf-8',
  });
  console.log('✅ pgvector extension ready');
} catch (err) {
  const msg = (err.stderr?.toString() || '') + (err.message || '');
  if (msg.includes('vector') || msg.includes('extension')) {
    console.warn('⚠️  pgvector extension not available on this database.');
    console.warn('   The vector(1536) column for embeddings will be skipped.');
    console.warn('   RAG will use in-memory cosine similarity as fallback.');
    console.warn('   To enable pgvector: Neon Dashboard → Extensions → enable "vector".');
  } else {
    console.warn('⚠️  Could not verify pgvector extension:', msg.slice(0, 200));
  }
}

// Try migrate deploy first (preferred for production)
// Use captureOutput to inspect the actual Prisma error (P3005 detection)
const { decideMigrationOutcome } = require('./migration-gate.cjs');

const migrateResult = run('npx --yes prisma migrate deploy', 'prisma migrate deploy', { captureOutput: true });

// R3.10-E.2 P0-1: `prisma migrate status` is an EXPLICIT deployment gate.
// It must succeed in production or the build fails closed.
let migrateStatusResult = { ok: true, output: '' };
if (migrateResult.ok) {
  migrateStatusResult = run('npx --yes prisma migrate status', 'prisma migrate status', { captureOutput: true });
}

const decision = decideMigrationOutcome({ isProd, migrateDeploy: migrateResult, migrateStatus: migrateStatusResult });

if (decision.action === 'abort') {
  console.error(`❌  ${decision.reason}`);
  console.error('   Fix: ensure DATABASE_URL is reachable and `npx prisma migrate deploy` succeeds, then rebuild.');
  process.exit(1);
}

if (decision.action === 'continue') {
  console.log('✅  Schema deployed and migration status verified');
} else {
  // decision.action === 'dev-fallback'
  const output = migrateResult.output;
  const isMissingMigration =
    output.includes('P3005') ||
    output.includes('No migration found') ||
    output.includes('not empty');

  if (isMissingMigration) {
    console.warn('⚠️  No migration history found — project was previously using prisma db push.');
    console.warn('   DEV ONLY: falling back to prisma db push (NEVER in production).');
    console.warn('   To migrate: run `npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/0_init/migration.sql`');
    const pushResult = run('npx --yes prisma db push', 'prisma db push (dev fallback)', { captureOutput: true });
    if (!pushResult.ok) {
      const pushOutput = pushResult.output;
      if (pushOutput.includes('vector') && pushOutput.includes('does not exist')) {
        console.warn('⚠️  prisma db push skipped vector column (pgvector not enabled).');
        console.warn('   This is OK — RAG will use in-memory fallback.');
      } else {
        console.warn('⚠️  prisma db push failed in dev:', pushOutput.slice(0, 300));
        console.warn('   Continuing build anyway (dev mode)...');
      }
    }
  } else {
    // Dev: warn and try db push
    console.warn('⚠️  prisma migrate deploy/status not verified in dev — falling back to prisma db push for local dev.');
    const devPushResult = run('npx --yes prisma db push', 'prisma db push (dev fallback)', { captureOutput: true });
    if (!devPushResult.ok) {
      const devPushOutput = devPushResult.output;
      const isConnectionError = devPushOutput.includes('P1001') || devPushOutput.includes('P1002') || devPushOutput.includes('Timed out') || devPushOutput.includes('advisory lock');
      if (isConnectionError) {
        console.warn('⚠️  Database unreachable in dev — skipping db push. Build will succeed if schema is already deployed.');
      } else {
        console.warn('⚠️  prisma db push failed:', devPushOutput.slice(0, 300));
        console.warn('   Continuing build anyway (dev mode)...');
      }
    }
  }
}

// Step 3: Build Next.js (必須成功)
if (!run('npx --yes next build', 'next build').ok) {
  process.exit(1);
}

console.log('\n🎉 vercel-build completed successfully');
