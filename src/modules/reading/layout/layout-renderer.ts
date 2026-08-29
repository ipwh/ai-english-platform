// ============================================
// Sprint 116 / Phase 1A: Layout Renderer (v5)
// Grid-based per-line layout — guarantees gutter alignment.
// Each line is a grid row: gutter number (left) + text (right).
// Paragraph labels rendered above text as separate element.
// ============================================

import type { LayoutParagraph } from './reading-layout-types';

/** Render layout paragraphs to DSE-authentic gutter HTML */
export function renderLayoutToHtml(paragraphs: LayoutParagraph[]): string {
  return paragraphs
    .map(
      (paragraph) => {
        // Paragraph label above the lines
        const firstLine = paragraph.lines[0];
        const label = firstLine?.isParagraphStart && firstLine.paragraphLabel
          ? `<div class="dse-paragraph-label">[${escapeHtml(firstLine.paragraphLabel.replace(/Paragraph\s*/i, ''))}]</div>`
          : '';
        return `<div class="dse-paragraph" data-paragraph="${paragraph.paragraphIndex}" data-paragraph-label="${escapeAttr(paragraph.label)}">` +
          label +
          paragraph.lines
            .map(
              (line, i) => {
                const isLast = i === paragraph.lines.length - 1;
                return `<div class="dse-line${isLast ? ' dse-line-last' : ''}">` +
                `<div class="dse-line-gutter">${line.lineNumber !== undefined ? line.lineNumber : ''}</div>` +
                `<div class="dse-line-text"><span>${escapeHtml(line.text)}</span></div>` +
                `</div>`;
              }
            )
            .join('') +
          `</div>`;
      }
    )
    .join('');
}

/** Escape HTML special characters */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Escape for HTML attribute values */
function escapeAttr(text: string): string {
  return text.replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/** Render to plain text with line markers (backward compat) */
export function renderToPlainText(
  allLines: { lineNumber?: number; text: string }[],
  _interval?: number,
): string {
  return allLines
    .filter(l => l.text.trim().length > 0)
    .map(l => {
      const marker = l.lineNumber !== undefined ? `[${l.lineNumber}] ` : '';
      return `${marker}${l.text}`;
    })
    .join('\n');
}
