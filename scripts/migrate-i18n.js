// ============================================
// migrate-i18n.js — Auto-migrate inline i18n keys to domain files
// Run: node scripts/migrate-i18n.js
// ============================================

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const I18N_FILE = path.join(ROOT, 'src', 'shared', 'utils', 'i18n.ts');
const I18N_DIR = path.dirname(I18N_FILE);

// Read i18n.ts
const content = fs.readFileSync(I18N_FILE, 'utf-8');

// Extract inline translations (after the '尚未模組化' comment)
const inlineStart = content.indexOf("// 以下為尚未模組化的翻譯");
const inlineEnd = content.lastIndexOf('};');
const inlineSection = content.slice(inlineStart, inlineEnd);

// Parse all key-value pairs
const kvRegex = /'([^']+)'\s*:\s*\{\s*zh:\s*'([^']*)'\s*,\s*en:\s*'([^']*)'\s*\}/g;
const entries = [];
let match;
while ((match = kvRegex.exec(inlineSection)) !== null) {
  entries.push({ key: match[1], zh: match[2], en: match[3] });
}

console.log(`Found ${entries.length} inline translation entries`);

// Domain file mapping based on key prefix
const domainMap = {
  'teacher.': 'i18n-teacher.ts',
  'common.': 'i18n-common.ts',
  'student.': 'i18n-student.ts',
  'login.': 'i18n-login.ts',
  'role.': 'i18n-role.ts',
  'nav.': 'i18n-nav.ts',
  'navClass.': 'i18n-nav.ts',
  'writing.': 'i18n-writing.ts',
  'practice.': 'i18n-practice.ts',
  'vocabulary.': 'i18n-vocab.ts',
  'vocab.': 'i18n-vocab.ts',
  'progress.': 'i18n-progress.ts',
  'is.': 'i18n-is.ts',
  'groups.': 'i18n-groups.ts',
  'notif.': 'i18n-notifications.ts',
  'dashboard.': 'i18n-student.ts',
  'diagnostic.': 'i18n-student.ts',
  'admin.': 'i18n-admin.ts',
  'ai.': 'i18n-ai.ts',
  'gamification.': 'i18n-gamification.ts',
  'mistakes.': 'i18n-mistakes.ts',
  'speaking.': 'i18n-speaking.ts',
  'reading.': 'i18n-reading.ts',
  'listening.': 'i18n-listening.ts',
};

// Group entries by domain file
const groups = {};
for (const entry of entries) {
  let domain = null;
  for (const [prefix, file] of Object.entries(domainMap)) {
    if (entry.key.startsWith(prefix)) {
      domain = file;
      break;
    }
  }
  if (!domain) domain = 'i18n-common.ts'; // fallback
  if (!groups[domain]) groups[domain] = [];
  groups[domain].push(entry);
}

// For each domain file, read existing content, merge, write back
const domainExports = {};
for (const [domainFile, newEntries] of Object.entries(groups)) {
  const filePath = path.join(I18N_DIR, domainFile);
  const exportName = domainFile.replace('i18n-', '').replace('.ts', '') + 'Translations';
  
  let existingKeys = new Set();
  let fileHeader = '';
  
  if (fs.existsSync(filePath)) {
    const existing = fs.readFileSync(filePath, 'utf-8');
    // Extract existing keys
    const ekRegex = /'([^']+)'\s*:\s*\{/g;
    let em;
    while ((em = ekRegex.exec(existing)) !== null) {
      existingKeys.add(em[1]);
    }
    // Extract header (first comment block)
    const headerMatch = existing.match(/^(\/\/[^\n]*\n)+/);
    fileHeader = headerMatch ? headerMatch[0] : '';
    
    // Extract existing export name
    const enMatch = existing.match(/export const (\w+)/);
    if (enMatch) {
      // Use existing export name
      domainExports[domainFile] = enMatch[1];
    }
  } else {
    fileHeader = `// ${domainFile.replace('i18n-', '').replace('.ts', '')} translations\n`;
    domainExports[domainFile] = exportName;
  }
  
  const exportVarName = domainExports[domainFile] || exportName;
  
  // Generate new entries (only those not already in domain file)
  const newUniqueEntries = newEntries.filter(e => !existingKeys.has(e.key));
  const duplicateCount = newEntries.length - newUniqueEntries.length;
  
  if (newUniqueEntries.length === 0) {
    console.log(`  ${domainFile}: ${duplicateCount} duplicates, 0 new — SKIPPED`);
    continue;
  }
  
  // Append new entries to existing file
  let appendContent = '';
  if (fs.existsSync(filePath)) {
    // Remove the closing `};` and add new entries
    let existing = fs.readFileSync(filePath, 'utf-8');
    const lastBrace = existing.lastIndexOf('};');
    existing = existing.slice(0, lastBrace);
    
    appendContent = existing + '\n';
  } else {
    appendContent = fileHeader + `export const ${exportVarName}: Record<string, { zh: string; en: string }> = {\n`;
  }
  
  for (const entry of newUniqueEntries) {
    appendContent += `  '${entry.key}': { zh: '${entry.zh}', en: '${entry.en}' },\n`;
  }
  appendContent += '};\n';
  
  fs.writeFileSync(filePath, appendContent, 'utf-8');
  console.log(`  ${domainFile}: ${duplicateCount} duplicates (kept domain version), ${newUniqueEntries.length} new entries appended`);
  
  domainExports[domainFile] = exportVarName;
}

// Now rebuild i18n.ts: keep imports, remove inline section, add new imports
const importSectionEnd = content.indexOf("const translations: Record<string,");

// Build new import lines for any newly created domain files
const existingImports = new Set();
const importRegex = /import \{ (\w+) \} from '\.\/i18n-(\w+)'/g;
let im;
while ((im = importRegex.exec(content)) !== null) {
  existingImports.add(im[2]);
}

let newImportLines = '';
for (const domainFile of Object.keys(groups)) {
  const stem = domainFile.replace('i18n-', '').replace('.ts', '');
  if (!existingImports.has(stem)) {
    const exportVarName = domainExports[domainFile];
    newImportLines += `import { ${exportVarName} } from './${domainFile.replace('.ts', '')}';\n`;
  }
}

// Build new translations object
let newSpreadLines = '';
for (const [domainFile, entries] of Object.entries(groups)) {
  const stem = domainFile.replace('i18n-', '').replace('.ts', '');
  const exportVarName = domainExports[domainFile];
  newSpreadLines += `  ...${exportVarName},\n`;
}

// Rebuild the file
const newContent = content.slice(0, importSectionEnd) +
  (newImportLines ? '\n' + newImportLines : '') +
  `\nconst translations: Record<string, { zh: string; en: string }> = {\n` +
  `  // 模組化翻譯（來自 i18n-*.ts 拆分檔）\n` +
  newSpreadLines +
  `};\n\n` +
  content.slice(content.lastIndexOf('export function t('));

fs.writeFileSync(I18N_FILE, newContent, 'utf-8');
console.log(`\n✅ i18n.ts rebuilt: ${entries.length} inline entries migrated to domain files`);
console.log(`   New i18n.ts size: ~${newContent.split('\n').length} lines (was ${content.split('\n').length})`);
