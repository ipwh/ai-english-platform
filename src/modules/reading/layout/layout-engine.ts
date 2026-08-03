// ============================================
// Sprint 116 / Phase 1A: Layout Engine (v2)
// Main public API: layoutReadingText()
// v2: Gutter-based line numbers, paragraph labels, clean text/metadata separation
// ============================================

import type { LayoutResult, LayoutOptions, ResolvedLayoutOptions } from './reading-layout-types';
import { resolveLayoutOptions } from './reading-layout-types';
import { calculateTotalLines, recalculateCharsPerLine } from './line-calculator';
import { extractParagraphs, buildParagraphLayouts } from './paragraph-layout';
import { renderLayoutToHtml } from './layout-renderer';
import { recordLayout, recordRender } from './layout-metrics';

/** Layout a reading passage and return fully structured result with gutter HTML */
export function layoutReadingText(
  rawText: string,
  options?: Partial<LayoutOptions>,
): LayoutResult {
  const startTime = Date.now();
  const opts: ResolvedLayoutOptions = resolveLayoutOptions(options);

  // 1. Extract paragraphs
  const rawParagraphs = extractParagraphs(rawText);

  // 2. Calculate display lines with gutter metadata
  const allLines = calculateTotalLines(rawParagraphs, opts);

  // 3. Build paragraph layouts
  const paragraphs = buildParagraphLayouts(allLines, rawParagraphs);

  // 4. Render to gutter-based HTML
  const renderStart = Date.now();
  const html = renderLayoutToHtml(paragraphs);
  const renderDuration = Date.now() - renderStart;

  const substantiveLines = allLines.filter(l => l.text.trim().length > 0);
  const markers = allLines
    .filter(l => l.lineNumber !== undefined)
    .map(l => l.lineNumber as number);

  const result: LayoutResult = {
    paragraphs,
    html,
    totalLines: allLines.length,
    // Backward compat
    renderedText: substantiveLines
      .map(l => (l.lineNumber !== undefined ? `[${l.lineNumber}] ` : '') + (l.paragraphLabel ? l.paragraphLabel + ' ' : '') + l.text)
      .join('\n'),
    lineMap: substantiveLines,
    markers,
    options: { ...opts } as unknown as Record<string, unknown>,
    substantiveLines: substantiveLines.length,
  };

  const duration = Date.now() - startTime;
  recordLayout(allLines.length, paragraphs.length, duration);
  recordRender(renderDuration, markers.length);

  return result;
}

/** Recalculate layout for responsive changes (backward compat) */
export function recalculateLayout(
  result: LayoutResult,
  newWidth?: number,
  newFontSize?: number,
  newInterval?: number,
): LayoutResult {
  const oldOpts = result.options as unknown as ResolvedLayoutOptions | undefined;
  const newOpts = recalculateCharsPerLine(
    oldOpts ?? resolveLayoutOptions(),
    newWidth,
    newFontSize,
  );
  if (newInterval !== undefined) newOpts.lineNumberInterval = newInterval;

  const rawParagraphs = result.paragraphs.map(p => ({
    text: p.sourceText || p.lines.map(l => l.text).join(' '),
    number: p.paragraphNumber,
    label: p.label,
  }));

  const allLines = calculateTotalLines(rawParagraphs, newOpts);
  const paragraphs = buildParagraphLayouts(allLines, rawParagraphs);
  const html = renderLayoutToHtml(paragraphs);
  const substantiveLines = allLines.filter(l => l.text.trim().length > 0);

  return {
    paragraphs,
    html,
    totalLines: allLines.length,
    renderedText: substantiveLines
      .map(l => (l.lineNumber !== undefined ? `[${l.lineNumber}] ` : '') + l.text)
      .join('\n'),
    lineMap: substantiveLines,
    markers: allLines.filter(l => l.lineNumber !== undefined).map(l => l.lineNumber as number),
    options: { ...newOpts } as unknown as Record<string, unknown>,
    substantiveLines: substantiveLines.length,
  };
}
