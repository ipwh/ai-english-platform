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
  const r = await db.material.updateMany({
    where: { ragStatus: 'failed' },
    data: { ragStatus: 'none' },
  });
  console.log('Reset', r.count, 'materials from failed → none');
  await db.$disconnect();
})();
