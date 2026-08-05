// ============================================
// Sprint 116 / Phase 1A: Layout Renderer (v4)
// Two-column layout: gutter numbers (left) + continuous justified text (right).
// Text is a single block per paragraph so text-align:justify works properly.
// Line numbers align via matching line-height.
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

        // Gutter column: empty — populated client-side by JS sync
        const gutters = '';

        // Text column: single continuous block for justify to work
        const text = paragraph.lines
          .map((line) => line.text)
          .join(' ');

        return `<div class="dse-paragraph" data-paragraph="${paragraph.paragraphIndex}" data-paragraph-label="${escapeAttr(paragraph.label)}">` +
          label +
          `<div class="dse-para-body">` +
          `<div class="dse-line-gutters">${gutters}</div>` +
          `<div class="dse-para-text">${escapeHtml(text)}</div>` +
          `</div>` +
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
