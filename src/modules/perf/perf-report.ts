// Sprint 14: Performance Report Generator
import { analyzeBundle, shouldLazyLoad } from './bundle-optimizer';
import { detectNPlusOne } from './query-optimizer';

/** Generate a comprehensive performance optimization report */
export function generatePerfReport(params: {
  imports: Array<{ file: string; modulePath: string }>;
  queryLogs: Array<{ model: string; operation: string; timestamp: number }>;
}): string {
  const bundle = analyzeBundle(params.imports);
  const nPlusOne = detectNPlusOne(params.queryLogs);

  const lines: string[] = [
    '═══════════════════════════════════════',
    '     Performance Optimization Report',
    '═══════════════════════════════════════',
    '',
    '--- Bundle Analysis ---',
    `Total imports:        ${bundle.totalImports}`,
    `Heavy modules (>50KB): ${bundle.heavyModules.length}`,
    `Duplicated imports:   ${bundle.duplicates.length}`,
    `Tree-shaking score:   ${bundle.treeShakingScore}/100`,
    '',
  ];

  if (bundle.heavyModules.length > 0) {
    lines.push('Heavy modules:');
    for (const m of bundle.heavyModules.slice(0, 10)) {
      const lazy = shouldLazyLoad(m.path, m.estimatedSizeKB) ? ' ⚡ LAZY' : '';
      lines.push(`  ${m.path} (${m.estimatedSizeKB}KB, ${m.importCount} imports)${lazy}`);
    }
    lines.push('');
  }

  if (bundle.duplicates.length > 0) {
    lines.push('Top duplicated imports:');
    for (const d of bundle.duplicates.slice(0, 5)) {
      lines.push(`  ${d.module} — ${d.count}x across ${d.files.length} files`);
    }
    lines.push('');
  }

  lines.push(
    '--- Query Analysis ---',
    `Total queries:    ${nPlusOne.totalQueries}`,
    `Unique models:    ${nPlusOne.uniqueModels}`,
    `N+1 issues:       ${nPlusOne.issues.filter(i => i.isNPlusOne).length}`,
    `Est. savings:     ${nPlusOne.estimatedSavings}`,
    '',
  );

  if (nPlusOne.issues.length > 0) {
    lines.push('Query issues:');
    for (const issue of nPlusOne.issues) {
      const flag = issue.isNPlusOne ? '🔴 N+1' : '🟡 Batch';
      lines.push(`  ${flag} ${issue.model}.${issue.operation} (${issue.count}x) — ${issue.suggestion}`);
    }
    lines.push('');
  }

  lines.push(
    '--- Recommendations ---',
  );

  for (const rec of bundle.recommendations) {
    lines.push(`  • ${rec}`);
  }
  if (nPlusOne.hasIssues) lines.push(`  • Fix ${nPlusOne.issues.filter(i => i.isNPlusOne).length} N+1 query patterns`);
  if (bundle.treeShakingScore < 70) lines.push('  • Tree-shaking score below 70 — audit heavy dependencies');

  lines.push('', '═══════════════════════════════════════');
  return lines.join('\n');
}
