// Load .env.local
const path = require('path');
const fs = require('fs');
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

  console.log('=== Materials Content Audit ===\n');
  const materials = await db.material.findMany({
    select: { id: true, title: true, type: true, fileSize: true, content: true, ragStatus: true },
    orderBy: { createdAt: 'desc' },
  });

  let withContent = 0;
  let noContent = 0;
  for (const m of materials) {
    const has = !!m.content && m.content.length > 0;
    if (has) withContent++; else noContent++;
    console.log(
      `  ${has?'✅':'❌'} ${(m.type||'?').padEnd(6)} ${m.ragStatus.padEnd(6)} ${(m.title||'(no title)').slice(0,60)}`,
      has ? `(${m.content.length} chars)` : ''
    );
  }

  console.log(`\n📊 With content: ${withContent} | No content: ${noContent}`);
  if (withContent > 0 && noContent === 0) {
    console.log('✅ All materials have content — ready for RAG indexing.');
    console.log('   Run: npx tsx scripts/check-rag.js (from project root)');
  } else if (noContent > 0) {
    console.log(`⚠️ ${noContent} materials have no content. Only text-extracted PDFs/TXTs can be indexed.`);
  }

  await db.$disconnect();
}

main().catch(e => { console.error(e.message); process.exit(1); });
