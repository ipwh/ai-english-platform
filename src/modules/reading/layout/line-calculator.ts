// ============================================
// Sprint 116 / Phase 1A: Line Calculator (v2)
// Splits text into display lines based on max-chars-per-line.
// Never injects line markers into text — that's the renderer's job.
// ============================================

import type { DisplayLine, ResolvedLayoutOptions } from './reading-layout-types';

/** Calculate display lines for a single paragraph of text */
export function calculateParagraphLines(
  text: string,
  paragraphIndex: number,
  paragraphNumber: number,
  startLineIndex: number,
  options: ResolvedLayoutOptions,
  label: string,
): DisplayLine[] {
  const lines: DisplayLine[] = [];
  const words = text.trim().split(/\s+/);
  if (words.length === 0 || (words.length === 1 && words[0] === '')) return lines;

  let currentLine = '';
  let localLineIndex = 0;

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;

    if (testLine.length <= options.maxCharsPerLine) {
      currentLine = testLine;
    } else {
      // Flush current line
      if (currentLine) {
        const globalIndex = startLineIndex + localLineIndex;
        const lineNumber = shouldShowLineNumber(globalIndex + 1, options.lineNumberInterval);
        lines.push({
          lineIndex: globalIndex,
          lineNumber: lineNumber ? globalIndex + 1 : undefined,
          paragraphIndex,
          text: currentLine,
          isParagraphStart: localLineIndex === 0,
          paragraphLabel: localLineIndex === 0 ? label : undefined,
        });
        localLineIndex++;
      }
      currentLine = word;
    }
  }

  // Flush last line
  if (currentLine) {
    const globalIndex = startLineIndex + localLineIndex;
    const lineNumber = shouldShowLineNumber(globalIndex + 1, options.lineNumberInterval);
    lines.push({
      lineIndex: globalIndex,
      lineNumber: lineNumber ? globalIndex + 1 : undefined,
      paragraphIndex,
      text: currentLine,
      isParagraphStart: localLineIndex === 0,
      paragraphLabel: localLineIndex === 0 ? label : undefined,
    });
    localLineIndex++;
  }

  return lines;
}

/** Calculate total visual lines for a passage */
export function calculateTotalLines(
  paragraphs: { text: string; number: number; label: string }[],
  options: ResolvedLayoutOptions,
): DisplayLine[] {
  const allLines: DisplayLine[] = [];
  let globalIndex = 0;

  for (const para of paragraphs) {
    const paraLines = calculateParagraphLines(
      para.text, para.number - 1, para.number, globalIndex, options, para.label,
    );
    allLines.push(...paraLines);
    globalIndex += paraLines.length;
  }

  return allLines;
}

/** Whether a 1-based line number should show a gutter number */
function shouldShowLineNumber(lineNum: number, interval: number): boolean {
  if (interval <= 0) return false;
  return lineNum % interval === 0;
}

/** Estimate chars per line from container width and font size (backward compat) */
export function estimateCharsPerLine(containerWidth: number, fontSize: number): number {
  const avgCharWidth = fontSize * 0.55;
  return Math.floor(containerWidth / avgCharWidth) - 2;
}

/** Recalculate layout for new container dimensions (backward compat) */
export function recalculateCharsPerLine(
  options: ResolvedLayoutOptions,
  newWidth?: number,
  newFontSize?: number,
): ResolvedLayoutOptions {
  const width = newWidth ?? 700;
  const fontSize = newFontSize ?? 14;
  return {
    ...options,
    maxCharsPerLine: estimateCharsPerLine(width, fontSize),
  };
}
