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

// Skip these patterns (test files, server-side routes, etc.)
const SKIP_PATTERNS = [
  /[\\/]__tests__[\\/]/,
  /[\\/]__stories__[\\/]/, // Storybook fixtures are not user-facing pages
  /[\\/]types[\\/]/,
  /\.test\.tsx?$/,
  /\.spec\.tsx?$/,
  /[\\/]api[\\/]/,  // API routes are server-side
];

// Chinese character pattern (CJK Unified Ideographs)
const CHINESE_PATTERN = /[\u4e00-\u9fff\u3400-\u4dbf]/;

// Pattern to detect Chinese strings that are NOT inside t() calls
// This is a simplified heuristic - we look for Chinese in JSX text content,
// string literals, and attributes that should be translated
const HARDCODED_ZH_IN_JSX = /(?:>|}\s*)([^<{]*[\u4e00-\u9fff][^<{]*?)(?:<|{)/g;
const HARDCODED_ZH_IN_STRING = /["'`]([^"'`]*[\u4e00-\u9fff][^"'`]*?)["'`]/g;

// Files known to contain intentional Chinese (prompts, configs, seed data, style guide)
const ALLOWED_CHINESE_FILES = [
  'prompts',
  'seed.ts',
  'ai-service.ts',       // AI prompts contain Chinese intentionally
  'rag-service.ts',       // RAG prompts
  'i18n.ts',              // The translation file itself
  'chinglish-rules.json', // Rule config
  'check-i18n.js',        // This script itself
  'style-guide',          // Design system demo page — intentional bilingual content
  'dse-topics.ts',        // DSE topic taxonomy with bilingual labels
  'dse-writing-data.ts',  // Writing data with bilingual examples
  'writing-generation.ts', // Writing generation prompts
  'OnboardingGuard.tsx',  // First-run onboarding has intentional step-by-step Chinese
  '/usecases/',           // Sprint 102: AI usecases contain intentional Chinese prompts for LLM
  '\\usecases\\',          // Windows path variant
  'question-normalizer.ts', // Question validation messages
  'question-validator.ts',  // Question validation messages
  'listening-normalizer.ts', // Listening content normalization
  'reflection-generator.ts', // AI-generated reflection prompts
  'ai-evaluator.ts',      // LLM evaluation prompt instructions (bilingual output by design)
];

/** @typedef {{ file: string; line: number; text: string; type: 'jsx-text' | 'string-literal' | 'comment' | 'attribute' }} Finding */

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

  // Track whether we are inside a backtick template literal (prompt text).
  let inTemplateLiteral = false;
  // Track multi-line bilingual ternaries:
  //   {language === 'en' ? ( ...en... ) : ( ...zh... )}
  // The zh branch is already translated — skip it.
  let ternaryBranch = null; // null | 'en' | 'zh'

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Skip comments
    const trimmedLine = line.trim();
    if (trimmedLine.startsWith('//') || trimmedLine.startsWith('*') || trimmedLine.startsWith('/*')) continue;
    if (trimmedLine.startsWith('import ') || trimmedLine.startsWith('export ')) continue;

    // Multi-line bilingual ternary state machine
    if (ternaryBranch !== null) {
      if (line.includes(')}')) { ternaryBranch = null; continue; }
      if (line.includes(') : (')) { ternaryBranch = 'zh'; continue; }
      // Single-line zh branch (`: <span>...</span>}`) or multi-line zh branch
      // content — already translated inline, nothing to flag.
      if (ternaryBranch === 'en' && line.trim().startsWith(': ')) ternaryBranch = 'zh';
      if (ternaryBranch === 'zh') {
        if (line.includes('}')) ternaryBranch = null;
        continue;
      }
      continue;
    }

    // Skip lines that are part of a bilingual ternary — the Chinese text
    // already has an English counterpart (inline or multi-line).
    if (line.includes("=== 'en'") || line.includes('=== "en"') || line.includes("== 'en'") || line.includes('== "en"')) {
      const t = line.trim();
      if (t.endsWith('(') || t.endsWith("=== 'en'") || t.endsWith('=== "en"') || t.endsWith("== 'en'")) ternaryBranch = 'en';
      continue;
    }

    // Check for Chinese characters
    if (!CHINESE_PATTERN.test(line)) continue;

    const lineInsideTemplate = inTemplateLiteral;
    // Toggle template-literal state based on unescaped backticks on this line.
    const backtickCount = (line.match(/[^\\]`|^`/g) || []).length;
    if (backtickCount % 2 === 1) inTemplateLiteral = !inTemplateLiteral;

    // Extract Chinese-containing strings
    const stringMatches = line.matchAll(/"([^"]*[\u4e00-\u9fff][^"]*)"/g);
    for (const match of stringMatches) {
      const text = match[1];
      // Skip console.log, comments, t() calls, translation objects, and
      // prompt text inside backtick template literals.
      if (line.includes('console.') || line.includes('t(') || line.includes('zh:')) continue;
      if (text.includes('{') || text.includes('/*') || text.includes('*/')) continue;
      if (lineInsideTemplate || line.includes('`')) continue;
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

  const COMPONENTS_DIR = path.join(SRC_DIR, 'components');
  const APP_DIR = path.join(SRC_DIR, 'app');
  const MODULES_DIR = path.join(SRC_DIR, 'modules');
  const SHARED_DIR = path.join(SRC_DIR, 'shared');

  const allFiles = [
    ...findAllFiles(COMPONENTS_DIR),
    ...findAllFiles(APP_DIR),
    ...findAllFiles(MODULES_DIR),
    ...findAllFiles(SHARED_DIR),
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
    console.log('   Add translations to src/shared/utils/i18n.ts translations object.\n');
    process.exitCode = 1;
  }
}

main();
