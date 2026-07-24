// ============================================
// Sprint 116: Layout Engine
// Main public API: layoutReadingText()
// ============================================

import type { LayoutResult, LayoutOptions } from './reading-layout-types';
import { DEFAULT_LAYOUT_OPTIONS } from './reading-layout-types';
import { calculateTotalLines, recalculateCharsPerLine } from './line-calculator';
import { extractParagraphs, buildParagraphLayouts } from './paragraph-layout';
import { renderToHtml } from './layout-renderer';
import { recordLayout, recordRender } from './layout-metrics';

/** Layout a reading passage and return fully structured result with HTML */
export function layoutReadingText(
  rawText: string,
  options?: LayoutOptions,
): LayoutResult {
  const startTime = Date.now();
  const opts: Required<LayoutOptions> = { ...DEFAULT_LAYOUT_OPTIONS, ...options };

  // 1. Extract paragraphs
  const paragraphs = extractParagraphs(rawText);

  // 2. Calculate display lines
  const allLines = calculateTotalLines(paragraphs, opts);

  // 3. Build paragraph layouts
  const paragraphLayouts = buildParagraphLayouts(allLines, paragraphs);

  // 4. Render to HTML
  const renderStart = Date.now();
  const { html, plainText, markers } = renderToHtml(allLines, opts);
  const renderDuration = Date.now() - renderStart;

  const substantiveLines = allLines.filter(l => !l.isBlank);

  const result: LayoutResult = {
    html,
    renderedText: plainText,
    lineMap: substantiveLines,
    paragraphs: paragraphLayouts,
    totalLines: allLines.length,
    substantiveLines: substantiveLines.length,
    markers,
    options: opts,
  };

  const duration = Date.now() - startTime;
  recordLayout(allLines.length, paragraphs.length, duration);
  recordRender(renderDuration, markers.length);

  return result;
}

/** Recalculate layout for responsive changes without regenerating passage */
export function recalculateLayout(
  result: LayoutResult,
  newWidth?: number,
  newFontSize?: number,
  newInterval?: number,
): LayoutResult {
  const newOpts = recalculateCharsPerLine(result.options, newWidth, newFontSize);
  if (newInterval !== undefined) newOpts.markerInterval = newInterval;

  const paragraphs = result.paragraphs.map(p => {
    const orig = result.paragraphs.find(pp => pp.index === p.index);
    return { text: p.lines.map(l => l.text).join(' '), number: p.paragraphNumber };
  });

  const allLines = calculateTotalLines(paragraphs, newOpts);
  const paragraphLayouts = buildParagraphLayouts(allLines, paragraphs);
  const { html, plainText, markers } = renderToHtml(allLines, newOpts);
  const substantiveLines = allLines.filter(l => !l.isBlank);

  return {
    html, renderedText: plainText, lineMap: substantiveLines,
    paragraphs: paragraphLayouts, totalLines: allLines.length,
    substantiveLines: substantiveLines.length, markers, options: newOpts,
  };
}
