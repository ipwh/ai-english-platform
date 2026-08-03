// ============================================
// Sprint 116 / Phase 1A: Layout Renderer (v2)
// Renders paragraphs to gutter-based HTML.
// Line numbers are in a separate gutter column — NEVER inline in text.
// ============================================

import type { LayoutParagraph } from './reading-layout-types';

/** Render layout paragraphs to DSE-authentic gutter HTML */
export function renderLayoutToHtml(paragraphs: LayoutParagraph[]): string {
  return paragraphs
    .map(
      (paragraph) => `
        <div class="dse-paragraph" data-paragraph="${paragraph.paragraphIndex}" data-paragraph-label="${escapeAttr(paragraph.label)}">
          ${paragraph.lines
            .map(
              (line) => `
                <div class="dse-line">
                  <div class="dse-line-gutter">
                    ${line.lineNumber !== undefined ? `<span class="dse-line-number">${line.lineNumber}</span>` : ''}
                  </div>
                  <div class="dse-line-text">
                    ${
                      line.isParagraphStart && line.paragraphLabel
                        ? `<span class="dse-paragraph-label">[${escapeHtml(line.paragraphLabel.replace(/Paragraph\s*/i, ''))}]</span>`
                        : ''
                    }
                    <span>${escapeHtml(line.text)}</span>
                  </div>
                </div>
              `
            )
            .join('')}
        </div>
      `
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
