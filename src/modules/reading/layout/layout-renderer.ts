// ============================================
// Sprint 116 / Phase 1A: Layout Renderer (v3)
// Renders paragraphs to inline-based HTML for text-align:justify support.
// Line numbers are inline-block gutters alongside flowing text.
// ============================================

import type { LayoutParagraph } from './reading-layout-types';

/** Render layout paragraphs to DSE-authentic gutter HTML */
export function renderLayoutToHtml(paragraphs: LayoutParagraph[]): string {
  return paragraphs
    .map(
      (paragraph) => {
        // Paragraph label above the text
        const firstLine = paragraph.lines[0];
        const label = firstLine?.isParagraphStart && firstLine.paragraphLabel
          ? `<div class="dse-paragraph-label">[${escapeHtml(firstLine.paragraphLabel.replace(/Paragraph\s*/i, ''))}]</div>`
          : '';
        // Lines as inline spans inside a justify container
        const linesHtml = paragraph.lines
          .map(
            (line) =>
              `<span class="dse-line-gutter">${line.lineNumber !== undefined ? `<span class="dse-line-number">${line.lineNumber}</span>` : ''}</span>` +
              `<span class="dse-line-text">${escapeHtml(line.text)}</span>`
          )
          .join('');
        return `<div class="dse-paragraph" data-paragraph="${paragraph.paragraphIndex}" data-paragraph-label="${escapeAttr(paragraph.label)}">` +
          label +
          `<div class="dse-lines">${linesHtml}</div>` +
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

// ── Backward-compat: old renderToHtml renamed ──
/** @deprecated Use renderLayoutToHtml instead */
export function renderToHtml(
  _allLines: unknown[],
  _options: unknown,
): { html: string; plainText: string; markers: number[] } {
  // This function is no longer used internally but kept for backward compat.
  // Callers should migrate to renderLayoutToHtml + using LayoutResult directly.
  throw new Error(
    'renderToHtml is deprecated. Use layoutReadingText() which returns LayoutResult.html directly.',
  );
}
