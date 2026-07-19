/**
 * N+1 Query Detection Script
 * 
 * 搜尋 Prisma 查詢中可能造成 N+1 問題的模式
 * 在 CI 中執行：node scripts/check-n-plus-one.js
 * 
 * N+1 模式：
 * 1. for/forEach/map 迴圈中的 findUnique/findFirst/findMany
 * 2. 沒有使用 include/select 的關聯存取
 * 3. 在迴圈中查詢同一 model 多次
 */

const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, '..', 'src');
const EXCLUDE_DIRS = ['node_modules', '.next', '__tests__', '__stories__'];

let issues = [];
let filesChecked = 0;

function shouldExclude(dir) {
  return EXCLUDE_DIRS.some(ex => dir.includes(ex));
}

// ============================================
// False Positive Allowlist
// Known-safe patterns that should not be flagged
// ============================================

/** Known false-positive patterns — lines matching these are suppressed */
const FALSE_POSITIVE_PATTERNS = [
  // Cache cleanup operations (Map/Set in-memory, not DB)
  /\b(inMemoryStore|store|cache|topicBlacklist)\.(delete|clear)/,
  /\b(pruned)/,
  // Rate limiter cleanup
  /\b(rateLimitMap|store)\.delete/,
  // Recommendation cache ops
  /this\.cache\.delete/,
  // Already-batched operations (in $transaction)
  /\$transaction/,
];

/** Check if a line matches any known false-positive pattern */
function isFalsePositive(line, lineNumber, lines) {
  // Check for // nplus1-ignore comment on the same line or the line before
  if (line.includes('// nplus1-ignore')) return true;
  if (lineNumber > 0 && lines[lineNumber - 1].includes('// nplus1-ignore')) return true;

  // Check against known false-positive patterns
  for (const fp of FALSE_POSITIVE_PATTERNS) {
    if (fp.test(line)) return true;
  }
  return false;
}

function findNPlusOnePatterns(filePath, content) {
  const lines = content.split('\n');
  const fileIssues = [];

  // Pattern 1: 在迴圈中使用 findUnique 或 findFirst
  const loopPattern = /for\s*\(|\.forEach\s*\(|\.map\s*\(/;
  // Only flag actual DB queries, not Map/Set/cache operations
  const dbQueryPattern = /(prisma|db)\.\w+\.(findUnique|findFirst|findMany|update|delete|create)\s*\(/;
  const inMemoryPattern = /\.(delete|clear|set)\s*\(/;

  let inLoop = false;
  let loopStartLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip false positives early
    if (isFalsePositive(line, i, lines)) continue;

    // 檢測迴圈開始
    if (loopPattern.test(line) && !line.includes('//') && !line.includes('*')) {
      inLoop = true;
      loopStartLine = i + 1;
    }

    // 檢測迴圈中的 Prisma 查詢（僅限 DB queries）
    if (inLoop && dbQueryPattern.test(line) && !line.includes('//') && !line.includes('*')) {
      // 檢查是否使用了 batch/transaction
      const nextLines = lines.slice(i, Math.min(i + 5, lines.length)).join('\n');
      if (!nextLines.includes('$transaction') && !nextLines.includes('findMany') && !nextLines.includes('createMany') && !nextLines.includes('updateMany')) {
        fileIssues.push({
          line: i + 1,
          code: line.trim(),
          severity: 'WARNING',
          message: 'Potential N+1 query inside loop',
        });
      }
    }

    // 檢測迴圈結束
    if (inLoop && (line.includes('}') || line.includes(');'))) {
      inLoop = false;
    }
  }

  // Pattern 2: 沒有使用 include 的關聯存取
  const relationAccessPattern = /\.(class|teacher|student|mistakes|assignments)\s*[.(]/;
  let prevLine = '';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (relationAccessPattern.test(line) && !line.includes('include') && !line.includes('select')) {
      // 檢查前一行是否為 findUnique/findFirst 但沒有 include
      if (prevLine.match(/\.(findUnique|findFirst|findMany)\s*\(/) && !prevLine.includes('include')) {
        fileIssues.push({
          line: i + 1,
          code: line.trim(),
          severity: 'INFO',
          message: 'Relation access without include — potential lazy loading',
        });
      }
    }
    prevLine = line;
  }

  return fileIssues;
}

function walkDir(dir) {
  if (shouldExclude(dir)) return;

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walkDir(fullPath);
      } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') && !entry.name.endsWith('.spec.ts')) {
        filesChecked++;
        const content = fs.readFileSync(fullPath, 'utf-8');
        const fileIssues = findNPlusOnePatterns(fullPath, content);
        if (fileIssues.length > 0) {
          issues.push({
            file: path.relative(SRC_DIR, fullPath),
            issues: fileIssues,
          });
        }
      }
    }
  } catch (err) {
    console.error(`Error reading ${dir}: ${err.message}`);
  }
}

console.log('🔍 Checking for potential N+1 query patterns...\n');

walkDir(SRC_DIR);

let totalWarnings = 0;
let totalInfo = 0;

if (issues.length === 0) {
  console.log('✅ No potential N+1 patterns found!');
} else {
  for (const { file, issues: fileIssues } of issues) {
    console.log(`\n📁 ${file}:`);
    for (const issue of fileIssues) {
      const icon = issue.severity === 'WARNING' ? '⚠️' : 'ℹ️';
      console.log(`  ${icon} [${issue.severity}] Line ${issue.line}: ${issue.message}`);
      console.log(`     Code: ${issue.code}`);
      if (issue.severity === 'WARNING') totalWarnings++;
      else totalInfo++;
    }
  }

  console.log('\n--- Summary ---');
  console.log(`📊 Files checked: ${filesChecked}`);
  if (totalWarnings > 0) console.log(`⚠️  Warnings: ${totalWarnings}`);
  if (totalInfo > 0) console.log(`ℹ️  Info: ${totalInfo}`);

  if (totalWarnings > 0) {
    console.log('\n❌ Found potential N+1 issues that should be reviewed.');
    process.exit(1);
  }
}

console.log(`\n📊 Total files checked: ${filesChecked}`);
console.log('✅ N+1 check complete.');
