// ============================================
// Sprint 116: Layout Renderer
// Inserts [line N] markers into HTML at configurable intervals.
// ============================================

import type { DisplayLine, LayoutOptions } from './reading-layout-types';
import { DEFAULT_LAYOUT_OPTIONS } from './reading-layout-types';

/** Render display lines to HTML with line markers */
export function renderToHtml(
  allLines: DisplayLine[],
  options: Required<LayoutOptions>,
): { html: string; plainText: string; markers: number[] } {
  const markerLines = new Set<number>();
  const htmlParts: string[] = [];
  const textParts: string[] = [];

  let lastParagraph = -1;

  for (const line of allLines) {
    // Paragraph break
    if (line.paragraph !== lastParagraph && lastParagraph >= 0 && !line.isBlank) {
      htmlParts.push('<div class="h-3"></div>');
      textParts.push('');
    }
    lastParagraph = line.paragraph;

    // Blank spacer line — visual only, use CSS margin instead of content gap
    if (line.isBlank) {
      htmlParts.push('<div style="margin-bottom:0.25rem"></div>');
      textParts.push('');
      continue;
    }

    // Determine if this line needs a marker
    const needsMarker = shouldInsertMarker(line.line, options.markerInterval);
    if (needsMarker) markerLines.add(line.line);

    // Build line HTML
    let lineHtml = '<div class="flex gap-2 items-start">';

    // Line number column
    if (needsMarker) {
      lineHtml += `<span class="text-xs text-indigo-400 dark:text-indigo-500 font-mono w-12 shrink-0 text-right select-none">[line ${line.line}]</span>`;
    } else {
      lineHtml += '<span class="w-12 shrink-0"></span>';
    }

    // Text
    const escaped = escapeHtml(line.text);
    lineHtml += `<span class="flex-1">${escaped}</span>`;
    lineHtml += '</div>';

    htmlParts.push(lineHtml);
    textParts.push(needsMarker ? `[line ${line.line}] ${line.text}` : line.text);
  }

  return {
    html: htmlParts.join('\n'),
    plainText: textParts.join('\n'),
    markers: [...markerLines].sort((a, b) => a - b),
  };
}

/** Determine if a line number should have a marker */
function shouldInsertMarker(lineNum: number, interval: number): boolean {
  if (interval <= 0) return false;
  return lineNum % interval === 0;
}

/** Escape HTML special characters */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Render to plain text only (for line map export) */
export function renderToPlainText(
  allLines: DisplayLine[],
  markerInterval: number,
): string {
  return allLines
    .filter(l => !l.isBlank)
    .map(l => {
      const marker = l.line % markerInterval === 0 ? `[line ${l.line}] ` : '';
      return `${marker}${l.text}`;
    })
    .join('\n');
}
