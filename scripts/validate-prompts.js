#!/usr/bin/env node
// ============================================
// Prompt Version Validator — 驗證所有 prompt 檔案版本一致性
// 用法：node scripts/validate-prompts.ts
// ============================================

const fs = require('fs');
const path = require('path');

const PROMPTS_DIR = path.join(__dirname, '..', 'src', 'modules', 'ai', 'prompts');
const DOMAINS = ['grammar', 'reading', 'speaking', 'writing'];

const errors = [];
const warnings = [];

/**
 * Dynamically import a .ts file and extract version metadata.
 * Falls back to regex extraction since we can't easily import TS at runtime.
 */
function extractVersionInfo(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');

  const versionMatch = content.match(/export\s+const\s+version\s*=\s*['"]([^'"]+)['"]/);
  const descMatch = content.match(/export\s+const\s+description\s*=\s*['"]([^'"]+)['"]/);
  const dateMatch = content.match(/export\s+const\s+updatedAt\s*=\s*['"]([^'"]+)['"]/);
  const authorMatch = content.match(/export\s+const\s+author\s*=\s*['"]([^'"]+)['"]/);

  return {
    version: versionMatch ? versionMatch[1] : null,
    description: descMatch ? descMatch[1] : null,
    updatedAt: dateMatch ? dateMatch[1] : null,
    author: authorMatch ? authorMatch[1] : null,
  };
}

function parseSemver(version) {
  const parts = version.split('.').map(Number);
  return { major: parts[0] || 0, minor: parts[1] || 0, patch: parts[2] || 0 };
}

function main() {
  console.log('🔍 Prompt Version Validator\n');

  const versions = {};

  for (const domain of DOMAINS) {
    const v1Path = path.join(PROMPTS_DIR, domain, 'v1.ts');
    const answerAnalysisPath = path.join(PROMPTS_DIR, domain, 'answer-analysis.ts');

    if (!fs.existsSync(v1Path)) {
      errors.push(`Missing prompt file: ${domain}/v1.ts`);
      continue;
    }

    const info = extractVersionInfo(v1Path);

    if (!info.version) {
      errors.push(`${domain}/v1.ts: missing 'version' export`);
    } else {
      versions[domain] = info.version;
    }

    if (!info.description) {
      warnings.push(`${domain}/v1.ts: missing 'description' export`);
    }
    if (!info.updatedAt) {
      warnings.push(`${domain}/v1.ts: missing 'updatedAt' export`);
    }
    if (!info.author) {
      warnings.push(`${domain}/v1.ts: missing 'author' export`);
    }

    // Check answer-analysis.ts if it exists
    if (fs.existsSync(answerAnalysisPath)) {
      const aaInfo = extractVersionInfo(answerAnalysisPath);
      if (aaInfo.version && aaInfo.version !== info.version) {
        warnings.push(`${domain}/answer-analysis.ts version (${aaInfo.version}) differs from v1.ts (${info.version})`);
      }
    }
  }

  // Report versions
  console.log('📋 Current prompt versions:\n');
  for (const [domain, ver] of Object.entries(versions)) {
    console.log(`  ${domain.padEnd(12)} v${ver}`);
  }
  console.log('');

  // Check version consistency across domains
  const uniqueVersions = new Set(Object.values(versions));
  if (uniqueVersions.size > 1) {
    warnings.push(`Version mismatch across domains: ${[...uniqueVersions].join(', ')}`);
  }

  // Check semver validity
  for (const [domain, ver] of Object.entries(versions)) {
    if (!/^\d+\.\d+\.\d+$/.test(ver)) {
      errors.push(`${domain}: invalid semver format "${ver}"`);
    }
  }

  // Report
  if (errors.length > 0) {
    console.log(`❌ ${errors.length} error(s):`);
    for (const e of errors) console.log(`   - ${e}`);
    console.log('');
  }

  if (warnings.length > 0) {
    console.log(`⚠️  ${warnings.length} warning(s):`);
    for (const w of warnings) console.log(`   - ${w}`);
    console.log('');
  }

  if (errors.length === 0 && warnings.length === 0) {
    console.log('✅ All prompt files have valid version metadata!\n');
    process.exit(0);
  }

  process.exit(errors.length > 0 ? 1 : 0);
}

main();
