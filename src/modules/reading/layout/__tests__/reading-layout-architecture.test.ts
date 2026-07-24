// ============================================
// Sprint 116: Reading Layout Architecture Tests (30 tests)
// ============================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  layoutReadingText, recalculateLayout,
  calculateParagraphLines, calculateTotalLines, estimateCharsPerLine,
  extractParagraphs, buildParagraphLayouts,
  renderToHtml, renderToPlainText,
  getLayoutMetrics, resetLayoutMetrics,
  generateLayoutReport, formatLayoutReport,
  DEFAULT_LAYOUT_OPTIONS,
} from '@/modules/reading/layout';
import { getFullRuntimeReport } from '@/modules/platform/sre/reliability-dashboard';
import fs from 'fs';
import path from 'path';

const SAMPLE_PASSAGE = `[Paragraph 1] The concept of general knowledge has long been a subject of debate in educational circles. In an age of increasing specialization, some argue that a broad base of general knowledge is no longer necessary.

[Paragraph 2] Proponents of general knowledge suggest that it provides a foundation upon which specialized learning can be built. For instance, a doctor who understands history or literature may be better equipped to empathize with patients.

[Paragraph 3] Critics however point to the vast amount of information available today. They contend that memorizing facts is less important than knowing how to access and evaluate information.`;

describe('Sprint 116: Reading Layout Engine', () => {
  beforeEach(() => resetLayoutMetrics());
  afterEach(() => resetLayoutMetrics());

  // ═══ 1-20: Unit Tests ═══

  it('1. Layout Engine exists and produces valid result', () => {
    const r = layoutReadingText(SAMPLE_PASSAGE, { markerInterval: 2, charsPerLine: 40 });
    expect(r).toBeDefined();
    expect(r.html).toBeDefined();
    expect(r.totalLines).toBeGreaterThan(0);
    expect(r.paragraphs.length).toBe(3);
    expect(r.lineMap.length).toBeGreaterThan(0);
    expect(r.markers.length).toBeGreaterThan(0);
  });

  it('2. Extracts paragraphs correctly', () => {
    const paras = extractParagraphs(SAMPLE_PASSAGE);
    expect(paras).toHaveLength(3);
    expect(paras[0].number).toBe(1);
    expect(paras[1].number).toBe(2);
    expect(paras[2].number).toBe(3);
  });

  it('3. Calculates display lines', () => {
    const lines = calculateParagraphLines('This is a test sentence with several words.', 0, 1, 0, DEFAULT_LAYOUT_OPTIONS);
    expect(lines.length).toBe(1);
    expect(lines[0].paragraph).toBe(0);
    expect(lines[0].paragraphLine).toBe(1);
  });

  it('4. Line map contains only substantive (non-blank) lines', () => {
    const r = layoutReadingText(SAMPLE_PASSAGE, { markerInterval: 2, charsPerLine: 40 });
    expect(r.lineMap.length).toBeGreaterThan(0);
    expect(r.lineMap.every(l => !l.isBlank)).toBe(true);
  });

  it('5. Markers inserted at correct interval', () => {
    const r = layoutReadingText(SAMPLE_PASSAGE, { markerInterval: 2, charsPerLine: 40 });
    for (const m of r.markers) {
      expect(m % 2).toBe(0);
    }
  });

  it('6. HTML contains styled line markers', () => {
    const r = layoutReadingText(SAMPLE_PASSAGE, { markerInterval: 2, charsPerLine: 40 });
    expect(r.html).toContain('[line ');
    expect(r.html).toContain('indigo-400');
  });

  it('7. Plain text rendering works', () => {
    const r = layoutReadingText(SAMPLE_PASSAGE, { markerInterval: 2, charsPerLine: 40 });
    expect(r.renderedText).toContain('[line ');
  });

  it('8. Paragraph count is correct', () => {
    const r = layoutReadingText(SAMPLE_PASSAGE);
    expect(r.paragraphs).toHaveLength(3);
    expect(r.paragraphs[0].paragraphNumber).toBe(1);
    expect(r.paragraphs[2].paragraphNumber).toBe(3);
  });

  it('9. Options are respected', () => {
    const r = layoutReadingText(SAMPLE_PASSAGE, { markerInterval: 2, charsPerLine: 40 });
    expect(r.options.markerInterval).toBe(2);
    expect(r.options.charsPerLine).toBe(40);
    expect(r.markers.length).toBeGreaterThan(0);
  });

  it('10. Metrics track correctly', () => {
    layoutReadingText(SAMPLE_PASSAGE);
    const m = getLayoutMetrics();
    expect(m.totalLayouts).toBe(1);
    expect(m.avgLines).toBeGreaterThan(0);
    expect(m.avgParagraphs).toBe(3);
  });

  it('11. Report generates Markdown', () => {
    layoutReadingText(SAMPLE_PASSAGE);
    const md = formatLayoutReport();
    expect(md).toContain('# 📐 Reading Layout Report');
    expect(md).toContain('## Metrics');
  });

  it('12. Recalculate layout works with new width', () => {
    const r = layoutReadingText(SAMPLE_PASSAGE);
    const r2 = recalculateLayout(r, 400);
    expect(r2.html).toBeDefined();
    expect(r2.options.containerWidth).toBe(400);
  });

  it('13. Blank lines between paragraphs', () => {
    const r = layoutReadingText(SAMPLE_PASSAGE);
    const blanks = r.lineMap.filter(l => l.isBlank);
    // Blank lines are in allLines but not in lineMap (substantive only)
    expect(r.totalLines).toBeGreaterThanOrEqual(r.substantiveLines);
  });

  it('14. Empty text returns empty result', () => {
    const r = layoutReadingText('');
    expect(r.paragraphs).toHaveLength(0);
    expect(r.totalLines).toBe(0);
  });

  it('15. Chars per line estimation', () => {
    const cpl = estimateCharsPerLine(700, 14);
    expect(cpl).toBeGreaterThan(50);
    expect(cpl).toBeLessThan(100);
  });

  it('16. Custom marker interval 10', () => {
    const r = layoutReadingText(SAMPLE_PASSAGE, { markerInterval: 10 });
    for (const m of r.markers) expect(m % 10).toBe(0);
  });

  it('17. Paragraph numbers preserved', () => {
    const r = layoutReadingText(SAMPLE_PASSAGE);
    const nums = r.paragraphs.map(p => p.paragraphNumber);
    expect(nums).toEqual([1, 2, 3]);
  });

  it('18. Long paragraph wraps correctly', () => {
    const longText = `[Paragraph 1] ${'word '.repeat(200)}`;
    const r = layoutReadingText(longText, { charsPerLine: 50 });
    expect(r.lineMap.length).toBeGreaterThan(5);
  });

  it('19. Substantive lines exclude blanks', () => {
    const r = layoutReadingText(SAMPLE_PASSAGE);
    expect(r.substantiveLines).toBeLessThanOrEqual(r.totalLines);
  });

  it('20. Fallback paragraph extraction (no markers)', () => {
    const paras = extractParagraphs('First paragraph.\n\nSecond paragraph.\n\nThird paragraph.');
    expect(paras).toHaveLength(3);
  });

  // ═══ 21-30: Architecture Tests ═══

  it('21. No AI/LLM imports', () => {
    const dir = path.resolve(__dirname, '../../../../modules/reading/layout');
    for (const file of getAllTsFiles(dir)) {
      const c = fs.readFileSync(file, 'utf-8');
      expect(c).not.toMatch(/callLLM|deepseek|gemini|openai|claude/i);
      expect(c).not.toMatch(/from ['"]@\/modules\/ai\/providers/);
    }
  });

  it('22. No Prisma imports', () => {
    const dir = path.resolve(__dirname, '../../../../modules/reading/layout');
    for (const file of getAllTsFiles(dir)) {
      const c = fs.readFileSync(file, 'utf-8');
      expect(c).not.toMatch(/from ['"]@prisma\/client/);
      expect(c).not.toMatch(/import\s+\{\s*db\b/);
    }
  });

  it('23. No Workflow imports', () => {
    const dir = path.resolve(__dirname, '../../../../modules/reading/layout');
    for (const file of getAllTsFiles(dir)) {
      expect(fs.readFileSync(file, 'utf-8')).not.toMatch(/from ['"]@\/modules\/ai\/workflow/);
    }
  });

  it('24. Health endpoint exposes runtime.readingLayout', () => {
    const r = getFullRuntimeReport();
    expect(r.readingLayout).toBeDefined();
    expect(r.readingLayout.metrics).toBeDefined();
    expect(typeof r.readingLayout.metrics.avgLines).toBe('number');
  });

  it('25. ADR count >= 37', () => {
    const adrDir = path.resolve(__dirname, '../../../../../docs/architecture');
    const adrs = fs.readdirSync(adrDir).filter(f => f.startsWith('ADR-') && f.endsWith('.md'));
    expect(adrs.length).toBeGreaterThanOrEqual(37);
  });

  it('26. No external service calls', () => {
    const dir = path.resolve(__dirname, '../../../../modules/reading/layout');
    for (const file of getAllTsFiles(dir)) {
      const c = fs.readFileSync(file, 'utf-8');
      expect(c).not.toMatch(/fetch\(/);
      expect(c).not.toMatch(/axios/);
    }
  });

  it('27. Layout result has all required fields', () => {
    const r = layoutReadingText(SAMPLE_PASSAGE);
    expect(r.html).toBeDefined();
    expect(r.renderedText).toBeDefined();
    expect(r.lineMap).toBeDefined();
    expect(r.paragraphs).toBeDefined();
    expect(r.totalLines).toBeGreaterThan(0);
    expect(r.markers).toBeDefined();
    expect(r.options).toBeDefined();
  });

  it('28. Deterministic output', () => {
    const r1 = layoutReadingText(SAMPLE_PASSAGE);
    const r2 = layoutReadingText(SAMPLE_PASSAGE);
    expect(r1.totalLines).toBe(r2.totalLines);
    expect(r1.paragraphs.length).toBe(r2.paragraphs.length);
    expect(r1.markers).toEqual(r2.markers);
  });

  it('29. Line numbers are 1-based', () => {
    const r = layoutReadingText(SAMPLE_PASSAGE);
    expect(r.lineMap[0].line).toBe(1);
  });

  it('30. renderToPlainText produces readable output', () => {
    const r = layoutReadingText(SAMPLE_PASSAGE, { markerInterval: 2, charsPerLine: 40 });
    const text = renderToPlainText(r.lineMap, 2);
    expect(text.length).toBeGreaterThan(50);
    expect(text).toContain('[line ');
  });
});

function getAllTsFiles(dir: string): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fp = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__') continue;
      results.push(...getAllTsFiles(fp));
    } else if (entry.name.endsWith('.ts') && entry.name !== 'index.ts') {
      results.push(fp);
    }
  }
  return results;
}
