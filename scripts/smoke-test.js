// ============================================
// Smoke Test — Pre-deployment verification
// Runs without DB: validates code integrity, imports, and build artifacts
// Usage: node scripts/smoke-test.js
// ============================================

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let failures = 0;
let checks = 0;

function check(name, fn) {
  checks++;
  try {
    fn();
    console.log(`  ✅ ${name}`);
  } catch (err) {
    failures++;
    console.log(`  ❌ ${name}: ${err.message}`);
  }
}

console.log('🔍 AI English Platform — Smoke Test');
console.log('===================================\n');

// 1. Critical files exist
console.log('📁 Critical files:');
const REQUIRED_FILES = [
  'package.json', 'tsconfig.json', 'next.config.ts', 'vercel.json',
  'middleware.ts', 'prisma/schema.prisma', 'src/app/layout.tsx',
  'src/shared/config/config.ts', 'src/shared/auth/api-auth.ts',
  'src/shared/utils/rate-limiter.ts', 'src/modules/ai/providers/provider-registry.ts',
  'src/modules/ai/services/ai-service.ts', 'src/modules/production/services/production-ready.ts',
  'src/components/shared/GlobalErrorBoundary.tsx',
  'src/components/shared/ErrorBoundary.tsx',
  'public/manifest.json',
];
for (const file of REQUIRED_FILES) {
  check(file, () => {
    if (!fs.existsSync(path.join(ROOT, file))) throw new Error('File missing');
  });
}

// 2. No @/lib/ legacy imports
console.log('\n📦 Legacy import check (@/lib/):');
function scanDir(dir, ext) {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
      results.push(...scanDir(full, ext));
    } else if (entry.isFile() && ext.some(e => entry.name.endsWith(e))) {
      results.push(full);
    }
  }
  return results;
}

const srcFiles = scanDir(path.join(ROOT, 'src'), ['.ts', '.tsx']);
let legacyImportCount = 0;
for (const file of srcFiles) {
  const content = fs.readFileSync(file, 'utf8');
  const matches = content.match(/from\s+['"]@\/lib\//g);
  if (matches) legacyImportCount += matches.length;
}
check('0 @/lib/ imports', () => {
  if (legacyImportCount > 0) throw new Error(`Found ${legacyImportCount} legacy @/lib/ imports`);
});

// 3. No hardcoded API keys
console.log('\n🔑 Hardcoded key check:');
const API_KEY_PATTERNS = [
  /sk-[a-zA-Z0-9]{20,}/,
  /AIzaSy[a-zA-Z0-9_-]{20,}/,
  /AQ[a-zA-Z0-9_-]{30,}/,
];
let hardcodedKeyCount = 0;
for (const file of srcFiles) {
  const content = fs.readFileSync(file, 'utf8');
  for (const pattern of API_KEY_PATTERNS) {
    const matches = content.match(new RegExp(pattern.source, 'g'));
    if (matches) {
      // Allow sentinel placeholders
      const real = matches.filter(m => !m.includes('sk-your-') && !m.includes('AIzaSy-your-'));
      if (real.length > 0) {
        hardcodedKeyCount += real.length;
        console.log(`  ⚠️  ${file}: found potential API key`);
      }
    }
  }
}
check('No hardcoded API keys', () => {
  if (hardcodedKeyCount > 0) throw new Error(`Found ${hardcodedKeyCount} potential hardcoded keys`);
});

// 4. Prisma schema integrity
console.log('\n🗄️  Prisma schema:');
const schema = fs.readFileSync(path.join(ROOT, 'prisma/schema.prisma'), 'utf8');
check('Has datasource db', () => { if (!schema.includes('datasource db')) throw new Error('Missing datasource'); });
check('Has generator client', () => { if (!schema.includes('generator client')) throw new Error('Missing generator'); });
check('Has User model', () => { if (!schema.includes('model User')) throw new Error('Missing User model'); });
check('Has Feedback model', () => { if (!schema.includes('model Feedback')) throw new Error('Missing Feedback model'); });
check('Has Notification model', () => { if (!schema.includes('model Notification')) throw new Error('Missing Notification model'); });

// 5. AI provider chain
console.log('\n🤖 AI Provider chain:');
const registry = fs.readFileSync(path.join(ROOT, 'src/modules/ai/providers/provider-registry.ts'), 'utf8');
check('DeepSeek registered', () => { if (!registry.includes('deepseekProvider')) throw new Error('Missing'); });
check('Gemini Flash registered', () => { if (!registry.includes('geminiProvider')) throw new Error('Missing'); });
check('Gemini Flash-Lite registered', () => { if (!registry.includes('geminiFlashLiteProvider')) throw new Error('Missing'); });
check('Grok registered', () => { if (!registry.includes('grokProvider')) throw new Error('Missing'); });
check('Claude placeholder registered', () => { if (!registry.includes('claudeProvider')) throw new Error('Missing'); });
check('OpenAI placeholder registered', () => { if (!registry.includes('openaiProvider')) throw new Error('Missing'); });
check('Cache integration', () => { if (!registry.includes('aiCache')) throw new Error('Missing'); });
check('Fallback loop', () => { if (!registry.includes('getAvailableProviders')) throw new Error('Missing'); });

// 6. Production readiness
console.log('\n🛡️  Production readiness:');
const prod = fs.readFileSync(path.join(ROOT, 'src/modules/production/services/production-ready.ts'), 'utf8');
check('CircuitBreaker', () => { if (!prod.includes('class CircuitBreaker')) throw new Error('Missing'); });
check('withRetry', () => { if (!prod.includes('export async function withRetry')) throw new Error('Missing'); });
check('AIRequestQueue', () => { if (!prod.includes('class AIRequestQueue')) throw new Error('Missing'); });

// 7. Auth system
console.log('\n🔐 Auth system:');
const apiAuth = fs.readFileSync(path.join(ROOT, 'src/shared/auth/api-auth.ts'), 'utf8');
check('verifyApiAuth exists', () => { if (!apiAuth.includes('export async function verifyApiAuth')) throw new Error('Missing'); });
check('JWT + NextAuth dual', () => { if (!apiAuth.includes('verifySessionToken') || !apiAuth.includes("auth()")) throw new Error('Missing dual auth'); });
check('Role check', () => { if (!apiAuth.includes('allowedRoles')) throw new Error('Missing role check'); });

// 8. i18n completeness (aggregate all i18n-*.ts module files)
console.log('\n🌐 i18n:');
const i18nDir = path.join(ROOT, 'src/shared/utils');
const i18nFiles = fs.readdirSync(i18nDir).filter(f => f.startsWith('i18n') && f.endsWith('.ts'));
let zhEntries = 0;
let enEntries = 0;
for (const f of i18nFiles) {
  const content = fs.readFileSync(path.join(i18nDir, f), 'utf8');
  zhEntries += (content.match(/zh:\s*'/g) || []).length;
  enEntries += (content.match(/en:\s*'/g) || []).length;
}
check(`zh entries (${zhEntries})`, () => { if (zhEntries < 100) throw new Error(`Only ${zhEntries} entries`); });
check(`en entries (${enEntries})`, () => { if (enEntries < 100) throw new Error(`Only ${enEntries} entries`); });
check(`zh/en parity`, () => { if (zhEntries !== enEntries) throw new Error(`Mismatch: ${zhEntries} zh vs ${enEntries} en`); });
check('zh/en parity', () => { if (Math.abs(zhEntries - enEntries) > 5) throw new Error(`Mismatch: zh=${zhEntries} en=${enEntries}`); });

// 9. CSS globals
console.log('\n🎨 Styling:');
check('globals.css exists', () => {
  if (!fs.existsSync(path.join(ROOT, 'src/app/globals.css'))) throw new Error('Missing globals.css');
});

// 10. PWA
console.log('\n📱 PWA:');
check('manifest.json exists', () => {
  if (!fs.existsSync(path.join(ROOT, 'public/manifest.json'))) throw new Error('Missing manifest.json');
});
check('manifest has icons', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/manifest.json'), 'utf8'));
  if (!manifest.icons || manifest.icons.length < 2) throw new Error('Missing icons in manifest');
});

// 11. Vercel config
console.log('\n🚀 Vercel config:');
check('vercel.json exists', () => {
  if (!fs.existsSync(path.join(ROOT, 'vercel.json'))) throw new Error('Missing vercel.json');
});
const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
check('CORS headers configured', () => {
  if (!vercel.headers || !vercel.headers[0].headers) throw new Error('Missing CORS headers');
});
check('AI functions have extended duration', () => {
  if (!vercel.functions || !vercel.functions['src/app/api/ai/**/*.ts']) throw new Error('Missing AI function config');
});

// Summary
console.log('\n===================================');
console.log(`📊 Results: ${checks - failures}/${checks} passed`);
if (failures === 0) {
  console.log('✅ All smoke tests passed — ready for deployment!');
} else {
  console.log(`❌ ${failures} test(s) failed — fix before deploying.`);
  process.exit(1);
}
