// Sprint 14: Performance Tests
import { describe, it, expect, beforeEach } from 'vitest';
import {
  logQuery, detectNPlusOne, batchQueries, createIdBatcher,
  estimateQueryDepth, startQueryLogging, stopQueryLogging,
} from '../query-optimizer';
import { analyzeBundle, shouldLazyLoad, generateLazyImport } from '../bundle-optimizer';
import { generatePerfReport } from '../perf-report';

beforeEach(() => { startQueryLogging(); });

// ============================================
// Query Optimizer Tests
// ============================================

describe('QueryOptimizer', () => {
  it('should detect N+1 patterns', () => {
    const now = Date.now();
    // Simulate: for each student, query their class (N+1)
    for (let i = 0; i < 5; i++) {
      logQuery('Class', 'findUnique');
    }
    const logs = stopQueryLogging();
    const report = detectNPlusOne(logs);
    expect(report.hasIssues).toBe(true);
    expect(report.issues[0].isNPlusOne).toBe(true);
    expect(report.issues[0].model).toBe('Class');
  });

  it('should not flag single queries as N+1', () => {
    logQuery('User', 'findUnique');
    const logs = stopQueryLogging();
    const report = detectNPlusOne(logs);
    expect(report.hasIssues).toBe(false);
  });

  it('should batch queries', async () => {
    const result = await batchQueries({
      a: Promise.resolve(1),
      b: Promise.resolve('hello'),
      c: Promise.resolve(true),
    });
    expect(result).toEqual({ a: 1, b: 'hello', c: true });
  });

  it('should create id batcher', async () => {
    const fetched: string[][] = [];
    const batcher = createIdBatcher(async (ids) => {
      fetched.push(ids);
      return new Map(ids.map(id => [id, `result-${id}`]));
    }, 10);

    const p1 = batcher.queue('id1');
    const p2 = batcher.queue('id2');
    batcher.flush();

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toBe('result-id1');
    expect(r2).toBe('result-id2');
    expect(fetched[0]).toEqual(['id1', 'id2']);
  });

  it('should estimate query depth', () => {
    const depth = estimateQueryDepth({
      class: true,
      submissions: { include: { student: true } },
    });
    expect(depth).toBeGreaterThanOrEqual(3);
  });
});

// ============================================
// Bundle Optimizer Tests
// ============================================

describe('BundleOptimizer', () => {
  it('should analyze imports', () => {
    const imports = [
      { file: 'page1.ts', modulePath: '@prisma/client' },
      { file: 'page2.ts', modulePath: '@prisma/client' },
      { file: 'page3.ts', modulePath: '@prisma/client' },
      { file: 'page4.ts', modulePath: '@prisma/client' },
      { file: 'page5.ts', modulePath: '@prisma/client' },
      { file: 'page6.ts', modulePath: '@prisma/client' },
      { file: 'page1.ts', modulePath: 'pdfkit' },
      { file: 'page2.ts', modulePath: 'react' },
    ];
    const analysis = analyzeBundle(imports);
    expect(analysis.totalImports).toBe(8);
    expect(analysis.heavyModules.length).toBeGreaterThan(0);
    expect(analysis.duplicates.length).toBeGreaterThan(0);
  });

  it('should recommend lazy loading for heavy non-core modules', () => {
    expect(shouldLazyLoad('pdfkit', 400)).toBe(true);
    expect(shouldLazyLoad('react', 120)).toBe(false); // core
    expect(shouldLazyLoad('small-module', 10)).toBe(false); // small
  });

  it('should generate lazy import code', () => {
    const code = generateLazyImport('@/heavy/module', 'doStuff');
    expect(code).toContain('import(');
    expect(code).toContain('doStuff');
  });
});

// ============================================
// Perf Report Tests
// ============================================

describe('PerfReport', () => {
  it('should generate a full report', () => {
    const report = generatePerfReport({
      imports: [
        { file: 'a.ts', modulePath: '@prisma/client' },
        { file: 'b.ts', modulePath: 'pdfkit' },
      ],
      queryLogs: [{
        model: 'User', operation: 'findUnique', timestamp: Date.now(),
      }],
    });
    expect(report).toContain('Performance Optimization Report');
    expect(report).toContain('Bundle Analysis');
    expect(report).toContain('Query Analysis');
    expect(report).toContain('Recommendations');
  });
});
