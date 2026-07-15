const path = require('path');
const fs = require('fs');
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const m = line.trim().match(/^([^=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

(async () => {
  const db = require('../src/lib/db').default;
  const rags = require('../src/lib/rag-service');

  // Find first material with content
  const m = await db.material.findFirst({
    where: { content: { not: null } },
    select: { id: true, title: true },
  });

  console.log('Indexing:', m.title, '(', m.id, ')');

  try {
    const chunks = await rags.processMaterialForRAG(m.id);
    console.log('✅ Success:', chunks, 'chunks');
  } catch (e) {
    console.error('❌ Failed:', e.message);
    console.error(e.stack?.slice(0, 800));
  }

  await db.$disconnect();
})();
