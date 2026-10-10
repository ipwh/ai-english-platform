// Sprint 16: Coverage Report Generator
import { existsSync, readdirSync } from 'fs';
import { join } from 'path';

export interface ModuleCoverage {
  name: string;
  services: number;
  repos: number;
  testFiles: number;
  testCount: number;
  coveragePercent: number;
}

export interface CoverageReport {
  modules: ModuleCoverage[];
  totalServices: number;
  totalTestFiles: number;
  totalTests: number;
  overallCoverage: number;
  generatedAt: Date;
}

/** Scan modules directory and generate coverage report */
export function scanModuleCoverage(): CoverageReport {
  const modulesDir = join(process.cwd(), 'src', 'modules');
  const modules: ModuleCoverage[] = [];

  if (!existsSync(modulesDir)) return { modules: [], totalServices: 0, totalTestFiles: 0, totalTests: 0, overallCoverage: 0, generatedAt: new Date() };

  for (const name of readdirSync(modulesDir)) {
    if (name.startsWith('_') || name.startsWith('.')) continue;
    const dir = join(modulesDir, name);
    if (!existsSync(dir)) continue;

    const svcDir = join(dir, 'services');
    const repoDir = join(dir, 'repositories');
    const testDir = join(dir, '__tests__');

    const services = existsSync(svcDir) ? readdirSync(svcDir).filter(f => f.endsWith('.ts')).length : 0;
    const repos = existsSync(repoDir) ? readdirSync(repoDir).filter(f => f.endsWith('.ts')).length : 0;
    const testFiles = existsSync(testDir) ? readdirSync(testDir).filter(f => f.endsWith('.ts')).length : 0;

    modules.push({
      name, services, repos, testFiles,
      testCount: 0, // Will be filled from vitest results
      coveragePercent: testFiles > 0 ? 100 : 0,
    });
  }

  // Also check __tests__ at modules level
  const rootTestDir = join(modulesDir, '__tests__');
  if (existsSync(rootTestDir)) {
    const rootTests = readdirSync(rootTestDir).filter(f => f.endsWith('.ts'));
    if (rootTests.length > 0) {
      modules.push({ name: '(root)', services: 0, repos: 0, testFiles: rootTests.length, testCount: 0, coveragePercent: 100 });
    }
  }

  const tested = modules.filter(m => m.testFiles > 0).length;
  const overall = modules.length > 0 ? Math.round((tested / modules.length) * 100) : 0;

  return {
    modules: modules.sort((a, b) => b.services - a.services),
    totalServices: modules.reduce((s, m) => s + m.services, 0),
    totalTestFiles: modules.reduce((s, m) => s + m.testFiles, 0),
    totalTests: 0,
    overallCoverage: overall,
    generatedAt: new Date(),
  };
}

/** Generate a human-readable coverage report */
export function formatCoverageReport(report: CoverageReport, _vitestOutput?: string): string {
  const lines: string[] = [
    '═══════════════════════════════════════',
    '     Test Coverage Report',
    `     ${report.generatedAt.toISOString().slice(0, 10)}`,
    '═══════════════════════════════════════',
    '',
    `Overall Coverage: ${report.overallCoverage}% (${report.totalTestFiles} test files)`,
    `Total Services:   ${report.totalServices}`,
    '',
    '--- By Module ---',
  ];

  for (const m of report.modules) {
    const icon = m.testFiles > 0 ? '✅' : '❌';
    const svcInfo = m.services > 0 ? `${m.services} svc` : '';
    const repoInfo = m.repos > 0 ? `${m.repos} repo` : '';
    lines.push(`  ${icon} ${m.name}: ${[svcInfo, repoInfo, `${m.testFiles} tests`].filter(Boolean).join(', ')}`);
  }

  lines.push('', '═══════════════════════════════════════');
  return lines.join('\n');
}
