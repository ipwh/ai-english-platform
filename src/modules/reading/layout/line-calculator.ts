// ============================================
// Sprint 116: Line Calculator
// Splits text into display lines based on chars-per-line.
// ============================================

import type { DisplayLine, LayoutOptions } from './reading-layout-types';
import { DEFAULT_LAYOUT_OPTIONS } from './reading-layout-types';

/** Calculate display lines for a single paragraph of text */
export function calculateParagraphLines(
  text: string,
  paragraphIndex: number,
  paragraphNumber: number,
  startGlobalLine: number,
  options: Required<LayoutOptions>,
): DisplayLine[] {
  const lines: DisplayLine[] = [];
  const words = text.trim().split(/\s+/);
  if (words.length === 0 || (words.length === 1 && words[0] === '')) return lines;

  let currentLine = '';
  let paraLine = 1;

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const testLine = currentLine ? `${currentLine} ${word}` : word;

    if (testLine.length <= options.charsPerLine) {
      currentLine = testLine;
    } else {
      // Flush current line
      if (currentLine) {
        const globalLine = startGlobalLine + lines.length;
        lines.push({
          line: globalLine + 1,
          paragraph: paragraphIndex,
          paragraphLine: paraLine++,
          text: currentLine,
          hasMarker: false,
          isBlank: false,
        });
      }
      currentLine = word;
    }
  }

  // Flush last line
  if (currentLine) {
    const globalLine = startGlobalLine + lines.length;
    lines.push({
      line: globalLine + 1,
      paragraph: paragraphIndex,
      paragraphLine: paraLine,
      text: currentLine,
      hasMarker: false,
      isBlank: false,
    });
  }

  return lines;
}

/** Calculate total visual lines for a passage */
export function calculateTotalLines(
  paragraphs: { text: string; number: number }[],
  options: Required<LayoutOptions>,
): DisplayLine[] {
  const allLines: DisplayLine[] = [];
  let globalLine = 0;

  for (let pi = 0; pi < paragraphs.length; pi++) {
    const para = paragraphs[pi];

    // Add paragraph break marker (visual only — does NOT affect line numbering)
    if (options.includeParagraphSpacing && pi > 0 && allLines.length > 0) {
      allLines.push({
        line: -1, // negative = visual spacer, not a text line
        paragraph: pi - 1,
        paragraphLine: 0,
        text: '',
        hasMarker: false,
        isBlank: true,
      });
      // Do NOT increment globalLine — spacers don't count toward line numbers
    }

    const paraLines = calculateParagraphLines(
      para.text, pi, para.number, globalLine, options,
    );
    allLines.push(...paraLines);
    globalLine += paraLines.length;
  }

  return allLines;
}

/** Estimate chars per line from container width and font size */
export function estimateCharsPerLine(containerWidth: number, fontSize: number): number {
  // Average character width is ~0.55 * fontSize for proportional fonts
  const avgCharWidth = fontSize * 0.55;
  return Math.floor(containerWidth / avgCharWidth) - 2; // -2 for padding
}

/** Recalculate layout for new container dimensions */
export function recalculateCharsPerLine(
  options: Required<LayoutOptions>,
  newWidth?: number,
  newFontSize?: number,
): Required<LayoutOptions> {
  const width = newWidth ?? options.containerWidth;
  const fontSize = newFontSize ?? options.fontSize;
  return {
    ...options,
    containerWidth: width,
    fontSize,
    charsPerLine: estimateCharsPerLine(width, fontSize),
  };
}
