// ============================================
// Sprint 116 / Phase 1C: Layout Engine (v3)
// Main public API: layoutReadingText()
// v3: Stable reading measure, fixed chars-per-line per viewport, alignment warnings
// ============================================

import type { LayoutResult, LayoutOptions, ResolvedLayoutOptions, LayoutWarnings } from './reading-layout-types';
import { resolveLayoutOptions, resolveCharsPerLine } from './reading-layout-types';
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

  // Phase 1C: Use stable chars-per-line based on viewport mode
  const effectiveCharsPerLine = resolveCharsPerLine(opts);
  const layoutOpts: ResolvedLayoutOptions = { ...opts, maxCharsPerLine: effectiveCharsPerLine };

  // 1. Extract paragraphs
  const rawParagraphs = extractParagraphs(rawText);

  // 2. Calculate display lines with gutter metadata
  const allLines = calculateTotalLines(rawParagraphs, layoutOpts);

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

  // Phase 1C: Generate layout warnings
  const warnings = computeLayoutWarnings(allLines, paragraphs, effectiveCharsPerLine, opts.viewportMode);

  const result: LayoutResult = {
    paragraphs,
    html,
    totalLines: allLines.length,
    warnings,
    // Backward compat
    renderedText: substantiveLines
      .map(l => (l.lineNumber !== undefined ? `[${l.lineNumber}] ` : '') + (l.paragraphLabel ? l.paragraphLabel + ' ' : '') + l.text)
      .join('\n'),
    lineMap: substantiveLines,
    markers,
    options: { ...layoutOpts, effectiveCharsPerLine } as unknown as Record<string, unknown>,
    substantiveLines: substantiveLines.length,
  };

  const duration = Date.now() - startTime;
  recordLayout(allLines.length, paragraphs.length, duration);
  recordRender(renderDuration, markers.length);

  return result;
}

/** Compute layout quality warnings */
function computeLayoutWarnings(
  allLines: { text: string; lineNumber?: number; paragraphLabel?: string }[],
  paragraphs: { lines: { text: string }[]; label: string }[],
  charsPerLine: number,
  viewportMode: string,
): LayoutWarnings {
  const details: string[] = [];
  let overWideLines = false;
  let gutterAlignmentRisk = false;

  // Check for over-wide lines
  for (const line of allLines) {
    if (line.text.length > charsPerLine * 1.15) {
      overWideLines = true;
      details.push(`Line exceeds target width: ${line.text.length} > ${Math.round(charsPerLine * 1.15)} chars`);
      break;
    }
  }

  // Check for gutter alignment risk: any line with a label but no number?
  for (const para of paragraphs) {
    if (para.lines.length === 0) continue;
    const firstLine = para.lines[0];
    if (!firstLine) continue;
    if (!firstLine.lineNumber && firstLine.paragraphLabel) {
      gutterAlignmentRisk = true;
      details.push(`Paragraph "${para.label}" first line has label but no line number — gutter may appear empty`);
      break;
    }
  }

  // Check for standalone blank-line artifacts (lines with label but empty text)
  for (const line of allLines) {
    if (line.text.trim().length === 0 && line.paragraphLabel) {
      details.push('Blank line has a paragraph label — visual artifact risk');
      break;
    }
  }

  const splitViewEligible = viewportMode === 'desktop' || viewportMode === 'tablet';

  return {
    overWideLines,
    unstableLineCount: false,
    gutterAlignmentRisk,
    splitViewEligible,
    details,
  };
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
  const warnings = computeLayoutWarnings(
    allLines, paragraphs, resolveCharsPerLine(newOpts), newOpts.viewportMode,
  );

  return {
    paragraphs,
    html,
    totalLines: allLines.length,
    warnings,
    renderedText: substantiveLines
      .map(l => (l.lineNumber !== undefined ? `[${l.lineNumber}] ` : '') + l.text)
      .join('\n'),
    lineMap: substantiveLines,
    markers: allLines.filter(l => l.lineNumber !== undefined).map(l => l.lineNumber as number),
    options: { ...newOpts } as unknown as Record<string, unknown>,
    substantiveLines: substantiveLines.length,
  };
}
