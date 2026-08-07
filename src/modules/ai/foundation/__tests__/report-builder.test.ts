// ============================================
// ReportBuilder Contract Tests
// ============================================

import { describe, it, expect } from 'vitest';
import {
  ReportBuilder, MarkdownRenderer, JSONRenderer, ConsoleRenderer,
} from '../report/report-builder';
import type { ReportFormat } from '../types';

interface TestReportData {
  title: string;
  score: number;
  items: string[];
}

describe('ReportBuilder', () => {
  function createBuilder() {
    return new ReportBuilder<TestReportData>()
      .register(new MarkdownRenderer((data) => [
        `## ${data.title}`,
        `Score: ${data.score}`,
        ...data.items.map(i => `- ${i}`),
      ]))
      .register(new JSONRenderer())
      .register(new ConsoleRenderer((data) => [
        `=== ${data.title} ===`,
        `Score: ${data.score}`,
        data.items.join(', '),
      ]));
  }

  const sampleData: TestReportData = {
    title: 'Test Report',
    score: 95,
    items: ['Item A', 'Item B'],
  };

  // ── Build ──

  it('should build a markdown report', () => {
    const builder = createBuilder();
    const report = builder.build('markdown', sampleData);
    expect(report.format).toBe('markdown');
    expect(report.mimeType).toBe('text/markdown');
    expect(report.content).toContain('## Test Report');
    expect(report.content).toContain('Score: 95');
  });

  it('should build a JSON report', () => {
    const builder = createBuilder();
    const report = builder.build('json', sampleData, { pretty: true });
    expect(report.format).toBe('json');
    expect(report.mimeType).toBe('application/json');
    const parsed = JSON.parse(report.content);
    expect(parsed.data.title).toBe('Test Report');
  });

  it('should build a console report', () => {
    const builder = createBuilder();
    const report = builder.build('console', sampleData);
    expect(report.format).toBe('console');
    expect(report.content).toContain('=== Test Report ===');
  });

  // ── Render ──

  it('should render to string', () => {
    const builder = createBuilder();
    const content = builder.render('markdown', sampleData);
    expect(typeof content).toBe('string');
    expect(content).toContain('Test Report');
  });

  // ── Export ──

  it('should export (alias for render)', () => {
    const builder = createBuilder();
    const content = builder.export('json', sampleData);
    expect(() => JSON.parse(content)).not.toThrow();
  });

  // ── Build All ──

  it('should build all formats', () => {
    const builder = createBuilder();
    const all = builder.buildAll(sampleData);
    expect(all.size).toBe(3);
    expect(all.has('markdown')).toBe(true);
    expect(all.has('json')).toBe(true);
    expect(all.has('console')).toBe(true);
  });

  // ── Title and Timestamp ──

  it('should include title when provided', () => {
    const builder = createBuilder();
    const report = builder.build('markdown', sampleData, { title: 'Override Title' });
    expect(report.content).toContain('# Override Title');
  });

  it('should include timestamp when requested', () => {
    const builder = createBuilder();
    const report = builder.build('markdown', sampleData, {
      title: 'Titled',
      includeTimestamp: true,
    });
    expect(report.content).toContain('Generated');
  });

  // ── Error Handling ──

  it('should throw for unregistered format', () => {
    const builder = new ReportBuilder<TestReportData>();
    expect(() => builder.build('html' as ReportFormat, sampleData))
      .toThrow(/No renderer registered/);
  });

  // ── Supports ──

  it('should check if format is supported', () => {
    const builder = createBuilder();
    expect(builder.supports('markdown')).toBe(true);
    expect(builder.supports('html')).toBe(false);
  });

  // ── List Formats ──

  it('should list registered formats', () => {
    const builder = createBuilder();
    const formats = builder.listFormats();
    expect(formats).toContain('markdown');
    expect(formats).toContain('json');
    expect(formats).toContain('console');
  });

  // ── JSON Pretty Print ──

  it('should pretty-print JSON by default', () => {
    const builder = createBuilder();
    const content = builder.render('json', sampleData);
    // Should have newlines and indentation
    expect(content).toContain('\n');
    expect(content).toContain('  ');
  });

  it('should support compact JSON', () => {
    const builder = createBuilder();
    const content = builder.render('json', sampleData, { pretty: false });
    // Should be single-line
    expect(content).not.toContain('\n');
  });

  // ── Report Metadata ──

  it('should create metadata', () => {
    const meta = ReportBuilder.metadata('My Report', 'markdown', { version: '1.0' });
    expect(meta.title).toBe('My Report');
    expect(meta.format).toBe('markdown');
    expect(meta.generatedAt).toBeTruthy();
    expect(meta.extra!.version).toBe('1.0');
  });
});
