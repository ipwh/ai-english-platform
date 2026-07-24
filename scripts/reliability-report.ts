// Sprint 98: Reliability Report CLI — npx tsx scripts/reliability-report.ts
import { getReliabilityDashboard, getFullRuntimeReport } from '../src/modules/platform/sre';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

async function main() {
  console.log('🛡️  Reliability Report — Sprint 98\n');

  const reportsDir = join(process.cwd(), 'reports');
  mkdirSync(reportsDir, { recursive: true });

  const dashboard = getReliabilityDashboard();
  writeFileSync(join(reportsDir, 'reliability-report.json'), JSON.stringify(dashboard, null, 2));

  const rt = getFullRuntimeReport();
  writeFileSync(join(reportsDir, 'full-runtime-report.json'), JSON.stringify(rt, null, 2));

  const md = `# Reliability Report

**Generated**: ${dashboard.timestamp}

## Overall
${dashboard.summary}

## SLO Status
| SLO | Status | Target | Actual Success | Actual Latency |
|-----|--------|--------|----------------|----------------|
${dashboard.slo.evaluations.map(e => `| ${e.name} | ${e.status} | ${(e.target * 100).toFixed(1)}% | ${(e.current.successRate * 100).toFixed(1)}% | ${e.current.avgLatencyMs}ms |`).join('\n')}

## Error Budget
| SLO | Monthly Remaining | Status |
|-----|-------------------|--------|
${dashboard.errorBudget.map(b => `| ${b.sloId} | ${b.monthly.percentage}% | ${b.monthly.isExceeded ? '⚠️ EXCEEDED' : '✅'} |`).join('\n')}

## Active Incidents
${dashboard.incidents.active.length === 0 ? 'No active incidents. ✅' : dashboard.incidents.active.map(i => `- **${i.severity}** [${i.category}] ${i.summary}`).join('\n')}

## Reliability Components
| Component | Score | Weight | Status |
|-----------|-------|--------|--------|
${dashboard.reliability.components.map(c => `| ${c.name} | ${c.score}/100 | ${c.weight}% | ${c.status} |`).join('\n')}
`;

  writeFileSync(join(reportsDir, 'reliability-report.md'), md);

  console.log('📊 reports/reliability-report.json');
  console.log('📝 reports/reliability-report.md');
  console.log('📊 reports/full-runtime-report.json');
  console.log(`\nReliability Score: ${dashboard.reliability.grade} (${dashboard.reliability.score}/100)`);
  console.log('✅ Reliability report complete.');
  process.exit(0);
}

main().catch(e => { console.error('Report failed:', e); process.exit(1); });
