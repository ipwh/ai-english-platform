// ============================================
// RAG & DB 狀態檢查腳本
// 用法: node scripts/check-rag.js
// ============================================

const path = require('path');
const fs = require('fs');

// Load .env.local manually (before importing db module)
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
  const dbModule = require('../src/lib/db');
  const db = dbModule.default || dbModule.db;

  console.log('=== RAG + DB STATUS ===\n');

  try {
    await db.$queryRawUnsafe('SELECT 1');
    console.log('✅ Database: connected');
  } catch (e) {
    console.log('❌ Database: FAILED —', e.message);
    return;
  }

  const materialCount = await db.material.count();
  console.log(`📄 Materials: ${materialCount}`);

  const chunkCount = await db.materialChunk.count();
  console.log(`🧩 RAG Chunks: ${chunkCount}`);

  const ragGroups = await db.material.groupBy({ by: ['ragStatus'], _count: true });
  console.log('📊 RAG Status:');
  for (const g of ragGroups) {
    const emoji = g.ragStatus === 'done' ? '✅' : g.ragStatus === 'none' ? '⚪' : '🔄';
    console.log(`   ${emoji} ${g.ragStatus}: ${g._count}`);
  }

  const dseRag = process.env.DSE_RAG_ENABLED;
  console.log(`\n🔧 DSE_RAG_ENABLED: ${dseRag === 'true' ? '✅ true' : dseRag ? `⚠️ "${dseRag}"` : '❌ not set'}`);

  const deepseek = process.env.DEEPSEEK_API_KEY;
  const gemini = process.env.GEMINI_API_KEY;
  const vertex = process.env.GCP_PROJECT_ID;
  console.log('🤖 AI Providers:');
  console.log(`   DeepSeek: ${deepseek ? '✅ configured' : '❌ MISSING'}`);
  console.log(`   Gemini API: ${gemini ? '✅ configured' : '⚪ optional'}`);
  console.log(`   Vertex AI: ${vertex ? '✅ configured' : '⚪ optional'}`);

  console.log('\n=== RECOMMENDATIONS ===');
  if (chunkCount === 0 && dseRag === 'true') {
    console.log('🔴 CRITICAL: DSE_RAG_ENABLED=true but no chunks indexed.');
    console.log('   → Visit /teacher/materials, expand each material, click "建立語義索引 (RAG)"');
  } else if (chunkCount > 0) {
    console.log('🟢 RAG index active with', chunkCount, 'chunks.');
  }
  if (!deepseek) console.log('🔴 CRITICAL: DEEPSEEK_API_KEY missing.');
  if (!gemini && !vertex) console.log('🟡 No fallback AI provider configured.');

  await db.$disconnect();
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });

