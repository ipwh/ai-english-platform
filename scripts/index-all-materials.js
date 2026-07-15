// ============================================
// RAG 批量索引腳本 — 將所有未索引的教材建立語義索引
// 用法: npx tsx scripts/index-all-materials.js
// ============================================

const path = require('path');
const fs = require('fs');

// Load .env.local
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

async function main() {
  // Get material IDs that need indexing
  const dbModule = require('../src/lib/db');
  const db = dbModule.default || dbModule.db;

  const materials = await db.material.findMany({
    where: { content: { not: null }, ragStatus: { not: 'done' } },
    select: { id: true, title: true, type: true, content: true, ragStatus: true },
    orderBy: { createdAt: 'asc' },
  });

  if (materials.length === 0) {
    console.log('✅ All materials already indexed.');
    await db.$disconnect();
    return;
  }

  console.log(`🔧 Indexing ${materials.length} materials...\n`);

  let success = 0;
  let failed = 0;

  for (let i = 0; i < materials.length; i++) {
    const m = materials[i];
    const label = `[${i + 1}/${materials.length}] ${m.title?.slice(0, 50) || m.id}`;

    try {
      // Use the internal rag-service to index directly (avoids HTTP overhead)
      const { processMaterialForRAG } = require('../src/lib/rag-service');
      const totalChunks = await processMaterialForRAG(m.id);

      // Update ragStatus in DB
      await db.material.update({
        where: { id: m.id },
        data: { ragStatus: 'done' },
      });

      console.log(`  ✅ ${label} → ${totalChunks} chunks`);
      success++;
    } catch (e) {
      console.error(`  ❌ ${label} → ${e.message}`);
      // Mark as failed so it can be retried
      try {
        await db.material.update({ where: { id: m.id }, data: { ragStatus: 'failed' } });
      } catch { /* ignore */ }
      failed++;
    }
  }

  console.log(`\n📊 Done: ${success} indexed, ${failed} failed`);
  if (failed > 0) {
    console.log('   Re-run this script to retry failed materials.');
  }

  await db.$disconnect();
}

main().catch(e => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
