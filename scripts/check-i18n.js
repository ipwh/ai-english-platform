#!/usr/bin/env node
// ============================================
// i18n Coverage Check — 檢查專案中是否有硬編碼中文
// 掃描所有 .tsx/.ts 檔案，回報未使用 t() 的中文字串
//
// 使用方式：
//   node scripts/check-i18n.js
//   node scripts/check-i18n.js --fix    (產出報告，不自動修復)
// ============================================

const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, '..', 'src');
const COMPONENTS_DIR = path.join(SRC_DIR, 'components');
const APP_DIR = path.join(SRC_DIR, 'app');
const LIB_DIR = path.join(SRC_DIR, 'lib');

// Skip these patterns (lib files, test files, etc.)
const SKIP_PATTERNS = [
  /\\__tests__\\/,
  /\\lib\\/,
  /\\types\\/,
  /\.test\.tsx?$/,
  /\.spec\.tsx?$/,
  /\\api\\//,  // API routes are server-side
];

// Chinese character pattern (CJK Unified Ideographs)
const CHINESE_PATTERN = /[\u4e00-\u9fff\u3400-\u4dbf]/;

// Pattern to detect Chinese strings that are NOT inside t() calls
// This is a simplified heuristic - we look for Chinese in JSX text content,
// string literals, and attributes that should be translated
const HARDCODED_ZH_IN_JSX = /(?:>|}\s*)([^<{]*[\u4e00-\u9fff][^<{]*?)(?:<|{)/g;
const HARDCODED_ZH_IN_STRING = /["'`]([^"'`]*[\u4e00-\u9fff][^"'`]*?)["'`]/g;

// Files known to contain intentional Chinese (prompts, configs, seed data)
const ALLOWED_CHINESE_FILES = [
  'prompts',
  'seed.ts',
  'ai-service.ts', // AI prompts contain Chinese intentionally
  'rag-service.ts', // RAG prompts
  'i18n.ts', // The translation file itself
  'chinglish-rules.json', // Rule config
];

interface Finding {
  file: string;
  line: number;
  text: string;
  type: 'jsx-text' | 'string-literal' | 'comment' | 'attribute';
}

function shouldSkip(filePath) {
  return SKIP_PATTERNS.some(p => p.test(filePath));
}

function isAllowedChineseFile(filePath) {
  return ALLOWED_CHINESE_FILES.some(f => filePath.includes(f));
}

function findAllFiles(dir, extensions = ['.tsx', '.ts', '.jsx', '.js']) {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
        results.push(...findAllFiles(fullPath, extensions));
      }
    } else if (extensions.some(ext => entry.name.endsWith(ext))) {
      results.push(fullPath);
    }
  }
  return results;
}

function scanFile(filePath) {
  const findings = [];
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Skip comments
    const trimmedLine = line.trim();
    if (trimmedLine.startsWith('//') || trimmedLine.startsWith('*') || trimmedLine.startsWith('/*')) continue;
    if (trimmedLine.startsWith('import ') || trimmedLine.startsWith('export ')) continue;

    // Check for Chinese characters
    if (!CHINESE_PATTERN.test(line)) continue;

    // Extract Chinese-containing strings
    const stringMatches = line.matchAll(/"([^"]*[\u4e00-\u9fff][^"]*)"/g);
    for (const match of stringMatches) {
      const text = match[1];
      // Skip console.log, comments, t() calls, translation objects
      if (line.includes('console.') || line.includes('t(') || line.includes('zh:')) continue;
      if (text.includes('{') || text.includes('/*') || text.includes('*/')) continue;
      findings.push({ file: path.relative(SRC_DIR, filePath), line: lineNum, text, type: 'string-literal' });
    }

    // Check for JSX text content (between > and <)
    const jsxMatches = line.matchAll(/>([^<{]*[\u4e00-\u9fff][^<{]*)</g);
    for (const match of jsxMatches) {
      const text = match[1].trim();
      if (!text) continue;
      if (text.includes('t(')) continue;
      findings.push({ file: path.relative(SRC_DIR, filePath), line: lineNum, text: text.slice(0, 80), type: 'jsx-text' });
    }
  }

  return findings;
}

function main() {
  console.log('🔍 i18n Coverage Check — Scanning for hardcoded Chinese text...\n');

  const allFiles = [
    ...findAllFiles(COMPONENTS_DIR),
    ...findAllFiles(APP_DIR),
  ].filter(f => !shouldSkip(f) && !isAllowedChineseFile(f));

  console.log(`📁 Scanning ${allFiles.length} files...\n`);

  const allFindings = [];
  for (const file of allFiles) {
    const findings = scanFile(file);
    allFindings.push(...findings);
  }

  // Group by file
  const byFile = {};
  for (const f of allFindings) {
    if (!byFile[f.file]) byFile[f.file] = [];
    byFile[f.file].push(f);
  }

  // Report
  const fileCount = Object.keys(byFile).length;
  if (fileCount === 0) {
    console.log('✅ No hardcoded Chinese text found! All text uses i18n.');
  } else {
    console.log(`⚠️  Found ${allFindings.length} potential hardcoded Chinese strings in ${fileCount} files:\n`);
    for (const [file, findings] of Object.entries(byFile)) {
      console.log(`  📄 ${file} (${findings.length} issues)`);
      for (const f of findings.slice(0, 3)) {
        console.log(`     L${f.line} [${f.type}]: "${f.text}"`);
      }
      if (findings.length > 3) {
        console.log(`     ... and ${findings.length - 3} more`);
      }
      console.log('');
    }

    console.log('💡 To fix: Replace hardcoded Chinese with t("key") calls.');
    console.log('   Add translations to src/lib/i18n.ts translations object.\n');
    process.exitCode = 1;
  }
}

main();
