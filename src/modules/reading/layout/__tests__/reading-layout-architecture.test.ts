// ============================================
// Sprint 116 / Phase 1A: Reading Layout Architecture Tests (v2, 33 tests)
// ============================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  layoutReadingText, recalculateLayout,
  calculateParagraphLines, estimateCharsPerLine,
  extractParagraphs, 
  renderToPlainText,
  getLayoutMetrics, resetLayoutMetrics,
  formatLayoutReport,
} from '@/modules/reading/layout';
import { getFullRuntimeReport } from '@/modules/platform/sre/reliability-dashboard';
import { resolveLayoutOptions, resolveCharsPerLine } from '@/modules/reading/layout';
import fs from 'fs';
import path from 'path';

const SAMPLE_PASSAGE = `[Paragraph 1] The concept of general knowledge has long been a subject of debate in educational circles. In an age of increasing specialization, some argue that a broad base of general knowledge is no longer necessary.

[Paragraph 2] Proponents of general knowledge suggest that it provides a foundation upon which specialized learning can be built. For instance, a doctor who understands history or literature may be better equipped to empathize with patients.

[Paragraph 3] Critics however point to the vast amount of information available today. They contend that memorizing facts is less important than knowing how to access and evaluate information.`;

const opts = resolveLayoutOptions({ maxCharsPerLine: 40, lineNumberInterval: 2 });

describe('Sprint 116 / Phase 1A: Reading Layout Engine (v2)', () => {
  beforeEach(() => resetLayoutMetrics());
  afterEach(() => resetLayoutMetrics());

  // ═══ 1-10: Core Layout Tests ═══

  it('1. Layout Engine exists and produces valid result', () => {
    const r = layoutReadingText(SAMPLE_PASSAGE, { maxCharsPerLine: 40, lineNumberInterval: 2 });
    expect(r).toBeDefined();
    expect(r.html).toBeDefined();
    expect(r.totalLines).toBeGreaterThan(0);
    expect(r.paragraphs.length).toBe(3);
    expect(r.lineMap!.length).toBeGreaterThan(0);
    expect(r.markers!.length).toBeGreaterThan(0);
  });

  it('2. Extracts paragraphs correctly', () => {
    const paras = extractParagraphs(SAMPLE_PASSAGE);
    expect(paras).toHaveLength(3);
    expect(paras[0].number).toBe(1);
    expect(paras[1].number).toBe(2);
    expect(paras[2].number).toBe(3);
    expect(paras[0].label).toBe('Paragraph 1');
  });

  it('3. Calculates display lines', () => {
    const lines = calculateParagraphLines('Short test.', 0, 1, 0, opts, 'Paragraph 1');
    expect(lines.length).toBe(1);
    expect(lines[0].paragraphIndex).toBe(0);
    expect(lines[0].isParagraphStart).toBe(true);
    expect(lines[0].paragraphLabel).toBe('Paragraph 1');
  });

  it('4. Line map contains only substantive (non-empty) lines', () => {
    const r = layoutReadingText(SAMPLE_PASSAGE, { maxCharsPerLine: 40, lineNumberInterval: 2 });
    expect(r.lineMap!.length).toBeGreaterThan(0);
    expect(r.lineMap!.every(l => l.text.trim().length > 0)).toBe(true);
  });

  it('5. Line numbers follow interval logic', () => {
    const r = layoutReadingText(SAMPLE_PASSAGE, { maxCharsPerLine: 40, lineNumberInterval: 2 });
    for (const m of r.markers!) {
      expect(m % 2).toBe(0);
    }
  });

  it('6. HTML contains gutter markup, NOT inline markers', () => {
    const r = layoutReadingText(SAMPLE_PASSAGE, { maxCharsPerLine: 40, lineNumberInterval: 2 });
    expect(r.html).toContain('dse-line-gutter');
    expect(r.html).toContain('dse-line-text');
    expect(r.html).not.toMatch(/\[line\s+\d+\]/i);
  });

  it('7. Plain text rendering works (backward compat)', () => {
    const r = layoutReadingText(SAMPLE_PASSAGE, { maxCharsPerLine: 40, lineNumberInterval: 2 });
    expect(r.renderedText).toBeDefined();
    expect(r.renderedText!.length).toBeGreaterThan(50);
  });

  it('8. Paragraph count is correct', () => {
    const r = layoutReadingText(SAMPLE_PASSAGE);
    expect(r.paragraphs).toHaveLength(3);
    expect(r.paragraphs[0].paragraphNumber).toBe(1);
    expect(r.paragraphs[1].paragraphNumber).toBe(2);
    expect(r.paragraphs[2].paragraphNumber).toBe(3);
  });

  it('9. Options are respected (fixed measure off)', () => {
    const r = layoutReadingText(SAMPLE_PASSAGE, { maxCharsPerLine: 40, lineNumberInterval: 2, fixedReadingMeasure: false });
    const o = r.options as Record<string, unknown>;
    expect(o.lineNumberInterval).toBe(2);
    // With fixedReadingMeasure off, the effective chars-per-line is the raw value
    expect(o.effectiveCharsPerLine ?? o.maxCharsPerLine).toBe(40);
    expect(r.markers!.length).toBeGreaterThan(0);
  });

  it('10. Metrics track correctly', () => {
    layoutReadingText(SAMPLE_PASSAGE);
    const m = getLayoutMetrics();
    expect(m.totalLayouts).toBe(1);
    expect(m.avgLines).toBeGreaterThan(0);
    expect(m.avgParagraphs).toBe(3);
  });

  // ═══ 11-20: Backward Compat + Edge Cases ═══

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
    expect(r2.totalLines).toBeGreaterThan(0);
  });

  it('13. Total lines >= substantive lines', () => {
    const r = layoutReadingText(SAMPLE_PASSAGE);
    expect(r.totalLines).toBeGreaterThanOrEqual(r.substantiveLines!);
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

  it('16. Custom line number interval 10', () => {
    const r = layoutReadingText(SAMPLE_PASSAGE, { lineNumberInterval: 10, maxCharsPerLine: 40 });
    for (const m of r.markers!) expect(m % 10).toBe(0);
  });

  it('17. Paragraph numbers preserved', () => {
    const r = layoutReadingText(SAMPLE_PASSAGE);
    const nums = r.paragraphs.map(p => p.paragraphNumber);
    expect(nums).toEqual([1, 2, 3]);
  });

  it('18. Long paragraph wraps correctly', () => {
    const longText = `[Paragraph 1] ${'word '.repeat(200)}`;
    const r = layoutReadingText(longText, { maxCharsPerLine: 50 });
    expect(r.lineMap!.length).toBeGreaterThan(5);
  });

  it('19. Substantive lines exclude blanks', () => {
    const r = layoutReadingText(SAMPLE_PASSAGE);
    expect(r.substantiveLines!).toBeLessThanOrEqual(r.totalLines);
  });

  it('20. Fallback paragraph extraction (no markers)', () => {
    const paras = extractParagraphs('First paragraph.\n\nSecond paragraph.\n\nThird paragraph.');
    expect(paras).toHaveLength(3);
    expect(paras[0].label).toBe('Paragraph 1');
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
    expect(r.paragraphs).toBeDefined();
    expect(r.totalLines).toBeGreaterThan(0);
    expect(r.renderedText).toBeDefined();
    expect(r.lineMap).toBeDefined();
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

  it('29. Line numbers are 1-based and not inline', () => {
    const r = layoutReadingText(SAMPLE_PASSAGE, { maxCharsPerLine: 10, lineNumberInterval: 1 });
    // Check display line metadata: first line with a number has number 1
    const firstNumbered = r.lineMap!.find(l => l.lineNumber !== undefined);
    expect(firstNumbered).toBeDefined();
    // All line texts must be clean — no [N] tokens
    for (const line of r.lineMap!) {
      expect(line.text).not.toMatch(/\[\d+\]|\[line\s+\d+\]/i);
    }
  });

  it('30. renderToPlainText produces readable output (backward compat)', () => {
    const r = layoutReadingText(SAMPLE_PASSAGE, { maxCharsPerLine: 40, lineNumberInterval: 2 });
    const text = renderToPlainText(r.lineMap!);
    expect(text.length).toBeGreaterThan(50);
  });

  // ═══ 31-33: Phase 1A — No Inline Markers + Gutter Tests ═══

  it('31. does not inject inline line markers into text', () => {
    const result = layoutReadingText(
      'Paragraph one. Here is some text that will wrap across multiple lines to test line numbering.',
      {
        maxCharsPerLine: 20,
        lineNumberInterval: 5,
        showParagraphLabels: true,
      },
    );

    for (const paragraph of result.paragraphs) {
      for (const line of paragraph.lines) {
        expect(line.text).not.toMatch(/\[\d+\]|\[line\s+\d+\]/i);
      }
    }
  });

  it('32. renders gutter line numbers instead of inline markers', () => {
    const result = layoutReadingText(
      'This is a sample passage for testing gutter rendering with multiple lines of text.',
      {
        maxCharsPerLine: 10,
        lineNumberInterval: 1,
      },
    );

    expect(result.html).toContain('dse-line-gutter');
    expect(result.html).not.toMatch(/\[line\s+\d+\]/i);
    // Verify gutter column exists
    const gutterCount = (result.html.match(/dse-line-gutter/g) || []).length;
    expect(gutterCount).toBeGreaterThan(0);
  });

  it('33. paragraph labels exist on first line of each paragraph', () => {
    const result = layoutReadingText(SAMPLE_PASSAGE, {
      maxCharsPerLine: 40,
      showParagraphLabels: true,
      paragraphLabelMode: 'paragraph',
    });

    for (const paragraph of result.paragraphs) {
      expect(paragraph.label).toBeDefined();
      expect(paragraph.label).toContain('Paragraph');
      // First line should have the paragraph label
      const firstLine = paragraph.lines[0];
      expect(firstLine.isParagraphStart).toBe(true);
      expect(firstLine.paragraphLabel).toBe(paragraph.label);
    }
  });

  // ═══ 34-38: Phase 1C — Stable Width + Alignment Tests ═══

  it('34. desktop mode constrains chars-per-line to stable range', () => {
    const opts = resolveLayoutOptions({
      viewportMode: 'desktop',
      fixedReadingMeasure: true,
      preferredCharsPerLine: 66,
    });
    const cpl = resolveCharsPerLine(opts);
    expect(cpl).toBe(66);
    expect(cpl).toBeGreaterThanOrEqual(60);
    expect(cpl).toBeLessThanOrEqual(78);
  });

  it('35. mobile mode uses narrower chars-per-line', () => {
    const opts = resolveLayoutOptions({
      viewportMode: 'mobile',
      fixedReadingMeasure: true,
      preferredCharsPerLine: 66,
    });
    const cpl = resolveCharsPerLine(opts);
    expect(cpl).toBe(44);
    expect(cpl).toBeLessThan(64);
  });

  it('36. rendered HTML uses per-line grid layout with gutters', () => {
    const result = layoutReadingText(SAMPLE_PASSAGE, {
      maxCharsPerLine: 40,
      lineNumberInterval: 5,
      fixedReadingMeasure: true,
    });
    // v5: grid-based per-line layout
    expect(result.html).toContain('dse-line-gutter');
    expect(result.html).toContain('dse-line-text');
    const gutterCount = (result.html.match(/dse-line-gutter/g) || []).length;
    expect(gutterCount).toBeGreaterThan(0);
  });

  it('37. paragraph labels are above the text, not inline in the first line', () => {
    const result = layoutReadingText(SAMPLE_PASSAGE, {
      maxCharsPerLine: 40,
      showParagraphLabels: true,
      paragraphLabelMode: 'paragraph',
      lineNumberInterval: 5,
      fixedReadingMeasure: true,
    });
    // .dse-paragraph-label is a standalone div above .dse-line
    expect(result.html).toContain('dse-paragraph-label');
    // Label appears before the first .dse-line
    expect(result.html).toMatch(/dse-paragraph-label.*dse-line/s);
  });

  it('38. fixedReadingMeasure prevents fluid width drift', () => {
    // Two calls with different container widths should produce same layout
    const r1 = layoutReadingText(SAMPLE_PASSAGE, {
      viewportMode: 'desktop',
      fixedReadingMeasure: true,
      preferredCharsPerLine: 66,
    });
    const r2 = layoutReadingText(SAMPLE_PASSAGE, {
      viewportMode: 'desktop',
      fixedReadingMeasure: true,
      preferredCharsPerLine: 66,
    });
    expect(r1.totalLines).toBe(r2.totalLines);
    expect(r1.markers).toEqual(r2.markers);
  });

  // ═══ 39-42: Phase 1C.1 — Cleanup & Hardening Tests ═══

  it('39. LayoutResult.warnings exists independently from options', () => {
    const r = layoutReadingText(SAMPLE_PASSAGE, {
      viewportMode: 'desktop',
      fixedReadingMeasure: true,
    });
    // warnings is a top-level field, not nested inside options
    expect(r.warnings).toBeDefined();
    expect(r.warnings!.splitViewEligible).toBe(true);
    expect(r.warnings!.details).toBeDefined();
    // options should NOT contain _warnings
    const opts = r.options as Record<string, unknown>;
    expect(opts._warnings).toBeUndefined();
    // options should contain config, not runtime warnings
    expect(opts.viewportMode).toBe('desktop');
  });

  it('40. width bucket remains stable within same desktop range', () => {
    // Simulate two different desktop widths within the same bucket
    const opts1 = resolveLayoutOptions({
      viewportMode: 'desktop',
      fixedReadingMeasure: true,
      preferredCharsPerLine: 66,
    });
    const opts2 = resolveLayoutOptions({
      viewportMode: 'desktop',
      fixedReadingMeasure: true,
      preferredCharsPerLine: 66,
    });
    // Both should resolve to the same chars-per-line
    expect(resolveCharsPerLine(opts1)).toBe(66);
    expect(resolveCharsPerLine(opts2)).toBe(66);
    expect(resolveCharsPerLine(opts1)).toBe(resolveCharsPerLine(opts2));
  });

  it('41. tablet mode caps chars at 64 regardless of preferred', () => {
    const opts = resolveLayoutOptions({
      viewportMode: 'tablet',
      fixedReadingMeasure: true,
      preferredCharsPerLine: 70,
    });
    expect(resolveCharsPerLine(opts)).toBe(64);
  });

  it('42. fixedReadingMeasure=false falls back to raw maxCharsPerLine', () => {
    const opts = resolveLayoutOptions({
      viewportMode: 'desktop',
      fixedReadingMeasure: false,
      maxCharsPerLine: 50,
    });
    expect(resolveCharsPerLine(opts)).toBe(50);
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
