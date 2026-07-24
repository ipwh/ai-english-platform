// ============================================
// DevOps 環境檢查腳本 — 一鍵檢查所有環境變數與 RAG 狀態
// 用法: node scripts/devops-check.js
// ============================================

const path = require('path');
const fs = require('fs');

// ── ANSI colors ──
const R = '\x1b[31m'; const G = '\x1b[32m'; const Y = '\x1b[33m';
const B = '\x1b[34m'; const C = '\x1b[36m'; const W = '\x1b[0m';
const DIM = '\x1b[2m';

function ok(s) { return `${G}✅ ${s}${W}`; }
function warn(s) { return `${Y}⚠️  ${s}${W}`; }
function err(s) { return `${R}❌ ${s}${W}`; }
function info(s) { return `${B}ℹ️  ${s}${W}`; }
function hdr(s) { return `\n${C}━━━ ${s} ━━━${W}`; }
function sub(s) { return `   ${DIM}${s}${W}`; }

// ── Load .env.local ──
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
    if (!process.env[key]) process.env[key] = value;
  }
}

// ── Env var definitions with categories ──
const ENV_VARS = {
  critical: [
    { key: 'DATABASE_URL', desc: 'PostgreSQL 連線字串' },
    { key: 'DEEPSEEK_API_KEY', desc: 'DeepSeek AI API key' },
    { key: 'AUTH_SECRET', desc: 'NextAuth JWT secret' },
    { key: 'AUTH_GOOGLE_ID', desc: 'Google OAuth Client ID' },
    { key: 'AUTH_GOOGLE_SECRET', desc: 'Google OAuth Client Secret' },
    { key: 'JWT_SECRET', desc: 'JWT signing secret' },
  ],
  dse_rag: [
    { key: 'DSE_RAG_ENABLED', desc: '啟用 DSE 歷屆試題 RAG', expected: 'true' },
  ],
  ai_fallback: [
    { key: 'GEMINI_API_KEY', desc: 'Gemini API key（AI fallback）' },
    { key: 'GCP_PROJECT_ID', desc: 'Google Cloud Project ID（Vertex AI）' },
    { key: 'VERTEX_AI_LOCATION', desc: 'Vertex AI region' },
    { key: 'GCP_SERVICE_ACCOUNT_JSON', desc: 'GCP Service Account JSON（Base64）', mask: true },
  ],
  tts_stt: [
    { key: 'GCP_PROJECT_ID', desc: 'Google Cloud TTS/STT（共用 Vertex project）' },
    { key: 'GOOGLE_APPLICATION_CREDENTIALS', desc: 'GCP ADC 憑證路徑（TTS/STT 共用）' },
  ],
  optional: [
    { key: 'DEEPSEEK_BASE_URL', desc: 'DeepSeek API base URL' },
    { key: 'DEEPSEEK_MODEL', desc: 'DeepSeek model name' },
    { key: 'GEMINI_BASE_URL', desc: 'Gemini API base URL' },
    { key: 'GEMINI_MODEL', desc: 'Gemini model name' },
    { key: 'NEXT_PUBLIC_APP_URL', desc: '公開 App URL' },
    { key: 'AUTH_URL', desc: 'NextAuth URL' },
    { key: 'AI_TIMEOUT_MS', desc: 'AI API timeout (ms)', fallback: '30000 (dev) / 8000 (prod)' },
    { key: 'AI_CACHE_ENABLED', desc: '啟用 AI 回應快取', fallback: 'true' },
    { key: 'CRON_SECRET', desc: 'Cron Job 驗證密鑰', fallback: 'dev-cron-secret-change-me (dev only)' },
    { key: 'GOOGLE_SHEETS_CLASS_ROSTER_ID', desc: 'Google Sheets 班級名單 ID（選用）' },
    { key: 'GOOGLE_DRIVE_FOLDER_ID', desc: 'Google Drive folder ID（選用）' },
  ],
};

// ── Service account file check ──
function checkServiceAccount() {
  const sources = [];
  if (process.env.GCP_SERVICE_ACCOUNT_JSON) sources.push('GCP_SERVICE_ACCOUNT_JSON env');
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS.replace(/^["']|["']$/g, '');
    if (fs.existsSync(credPath)) sources.push(`ADC file: ${credPath}`);
    else sources.push(`⚠️ ADC path set but file not found: ${credPath}`);
  }
  const localPath = path.join(__dirname, '..', 'materials', 'gcp-service-account.json');
  if (fs.existsSync(localPath)) sources.push(`Local file: ${localPath}`);
  return sources;
}

// ── Main ──
async function main() {
  console.log(`${C}╔══════════════════════════════════════════╗${W}`);
  console.log(`${C}║   AI English Platform — DevOps Check     ║${W}`);
  console.log(`${C}║   ${new Date().toISOString().slice(0, 19).replace('T', ' ')}                    ║${W}`);
  console.log(`${C}╚══════════════════════════════════════════╝${W}`);

  let criticalMissing = 0;
  let warnings = 0;
  const report = [];

  // ── 1. ENVIRONMENT VARIABLES ──
  console.log(hdr('1. ENVIRONMENT VARIABLES'));

  for (const [category, vars] of Object.entries(ENV_VARS)) {
    const catLabel = {
      critical: '🔴 CRITICAL',
      dse_rag: '🔍 DSE RAG',
      ai_fallback: '🟡 AI Fallback',
      tts_stt: '🎧 TTS / STT',
      optional: '⚪ Optional',
    }[category] || category;

    console.log(`\n  ${catLabel}:`);

    for (const v of vars) {
      const val = process.env[v.key];
      const isSet = val && val.length > 0 && (v.expected ? val === v.expected : true);

      let status;
      if (isSet) {
        status = ok(v.key);
        if (v.mask) sub(`(value hidden, length=${val.length})`);
      } else if (category === 'critical') {
        status = err(`${v.key} — MISSING`);
        criticalMissing++;
      } else if (category === 'dse_rag') {
        status = warn(`${v.key}=${val || '(not set)'} (expected: ${v.expected})`);
        warnings++;
      } else if (v.fallback) {
        // Has a fallback default — show as info, not warning
        status = info(`${v.key} — using default: ${v.fallback}`);
      } else {
        status = warn(`${v.key} — not set (${v.desc})`);
        if (category !== 'optional') warnings++;
      }
      console.log(`    ${status}`);
    }
  }

  // ── 1b. Service Account ──
  console.log(`\n  🔑 Service Account:`);
  const saSources = checkServiceAccount();
  if (saSources.length > 0) {
    for (const src of saSources) {
      console.log(`    ${src.startsWith('⚠️') ? warn(src.slice(2)) : ok(src)}`);
    }
  } else {
    console.log(`    ${warn('No GCP service account found (TTS/STT/Vertex unavailable)')}`);
    warnings++;
  }

  // ── 2. DATABASE & RAG ──
  console.log(hdr('2. DATABASE & RAG INDEX'));

  let dbOk = false;
  try {
    const dbModule = require('../src/shared/db/db');
    const db = dbModule.default || dbModule.db;

    await db.$queryRawUnsafe('SELECT 1');
    console.log(`  ${ok('Database connected')}`);

    const materialCount = await db.material.count();
    const chunkCount = await db.materialChunk.count();
    const materialsWithContent = await db.material.count({ where: { content: { not: null } } });
    const ragDone = await db.material.count({ where: { ragStatus: 'done' } });
    const ragNone = await db.material.count({ where: { ragStatus: 'none' } });
    const ragFailed = await db.material.count({ where: { ragStatus: 'failed' } });

    console.log(`  📄 Materials total:        ${materialCount}`);
    console.log(`  📝 With extracted content: ${materialsWithContent}`);
    console.log(`  🧩 RAG chunks indexed:     ${chunkCount}`);

    if (ragDone > 0) console.log(`    ${ok(`RAG done: ${ragDone}`)}`);
    if (ragNone > 0) console.log(`    ${warn(`RAG pending: ${ragNone} — run: node scripts/index-all-materials.js`)}`);
    if (ragFailed > 0) console.log(`    ${err(`RAG failed: ${ragFailed} — run: node scripts/reset-rag.js then retry`)}`);

    // RAG health
    const dseRagEnabled = process.env.DSE_RAG_ENABLED === 'true';
    if (dseRagEnabled && chunkCount === 0) {
      console.log(`  ${err('DSE_RAG_ENABLED=true but ZERO chunks indexed!')}`);
      console.log(`    ${info('Fix: npx tsx scripts/index-all-materials.js')}`);
      criticalMissing++;
    } else if (dseRagEnabled && chunkCount > 0) {
      console.log(`  ${ok(`DSE RAG active (${chunkCount} chunks)`)}`);
    }

    await db.$disconnect();
    dbOk = true;
  } catch (e) {
    console.log(`  ${err('Database: FAILED — ' + e.message)}`);
    criticalMissing++;
  }

  // ── 3. AI PROVIDERS ──
  console.log(hdr('3. AI PROVIDERS'));

  const deepseekKey = process.env.DEEPSEEK_API_KEY;
  if (deepseekKey && deepseekKey !== 'sk-your-deepseek-api-key-here') {
    console.log(`  ${ok('DeepSeek — configured')}`);
    if (process.env.DEEPSEEK_MODEL) sub(`model: ${process.env.DEEPSEEK_MODEL}`);
  } else {
    console.log(`  ${err('DeepSeek — NOT CONFIGURED')}`);
    criticalMissing++;
  }

  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    console.log(`  ${ok('Gemini API — configured (fallback)')}`);
  } else {
    console.log(`  ${warn('Gemini API — not set (no AI fallback)')}`);
    warnings++;
  }

  const vertexProject = process.env.GCP_PROJECT_ID;
  if (vertexProject && saSources.length > 0) {
    console.log(`  ${ok(`Vertex AI — configured (project: ${vertexProject})`)}`);
  } else if (vertexProject) {
    console.log(`  ${warn('Vertex AI — project set but NO service account')}`);
  } else {
    console.log(`  ${warn('Vertex AI — not configured')}`);
  }

  // ── 4. TTS / STT ──
  console.log(hdr('4. TTS / STT (Google Cloud)'));

  const ttsEnabled = !!(saSources.length > 0 && process.env.GCP_PROJECT_ID);
  if (ttsEnabled) {
    console.log(`  ${ok('TTS available (Google Cloud Text-to-Speech)')}`);
  } else {
    console.log(`  ${warn('Cloud TTS unavailable — will fallback to browser Web Speech API')}`);
    console.log(`    ${info('Fix: set GCP_SERVICE_ACCOUNT_JSON + GCP_PROJECT_ID in env vars')}`);
    warnings++;
  }

  // Local service account file
  const localSA = path.join(__dirname, '..', 'materials', 'gcp-service-account.json');
  if (fs.existsSync(localSA)) {
    console.log(`  ${ok('Local SA file: materials/gcp-service-account.json')}`);
  } else {
    console.log(`  ${warn('No local SA file at materials/gcp-service-account.json')}`);
  }

  // ── 5. SUMMARY ──
  console.log(hdr('5. SUMMARY'));

  if (criticalMissing === 0 && warnings === 0) {
    console.log(`\n  ${ok('ALL CHECKS PASSED — environment is production-ready.')}`);
  } else {
    console.log(`\n  ${err(`CRITICAL: ${criticalMissing}`)}  ${warn(`WARNINGS: ${warnings}`)}`);

    if (criticalMissing > 0) {
      console.log(`\n  ${R}🚨 FIX REQUIRED BEFORE DEPLOY:${W}`);
      console.log(`  ─────────────────────────────`);
      if (!deepseekKey || deepseekKey === 'sk-your-deepseek-api-key-here') {
        console.log(`  1. Set DEEPSEEK_API_KEY in Vercel Dashboard → Environment Variables`);
        console.log(`     Get key: https://platform.deepseek.com → API Keys`);
      }
      if (!process.env.AUTH_SECRET) {
        console.log(`  2. Set AUTH_SECRET (run: openssl rand -base64 32)`);
      }
      if (!process.env.JWT_SECRET) {
        console.log(`  3. Set JWT_SECRET (run: openssl rand -base64 32)`);
      }
      if (!process.env.DATABASE_URL) {
        console.log(`  4. Set DATABASE_URL (PostgreSQL connection string from Neon/Supabase)`);
      }
      if (process.env.DSE_RAG_ENABLED === 'true' && dbOk) {
        console.log(`  5. Run RAG indexing: npx tsx scripts/index-all-materials.js`);
      }
    }

    if (warnings > 0) {
      console.log(`\n  ${Y}💡 RECOMMENDED:${W}`);
      console.log(`  ─────────────`);
      if (!geminiKey) console.log(`  • Set GEMINI_API_KEY for AI fallback redundancy`);
      if (!process.env.GCP_PROJECT_ID) console.log(`  • Set GCP_PROJECT_ID for Vertex AI + TTS/STT`);
      if (!process.env.GCP_SERVICE_ACCOUNT_JSON) console.log(`  • Set GCP_SERVICE_ACCOUNT_JSON for Cloud TTS (higher quality audio)`);
    }
  }

  console.log(`\n${C}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${W}\n`);
}

main().catch(e => { console.error(err('Fatal: ' + e.message)); process.exit(1); });
