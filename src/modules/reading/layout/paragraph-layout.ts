// ============================================
// Sprint 116: Paragraph Layout
// Handles paragraph spacing, indentation, boundaries.
// ============================================

import type { LayoutParagraph, DisplayLine } from './reading-layout-types';

/** Extract paragraphs from raw passage text with [N] markers */
export function extractParagraphs(rawText: string): { text: string; number: number }[] {
  // Split on [Paragraph N] or [N] markers
  const paragraphs: { text: string; number: number }[] = [];
  const regex = /\[Paragraph\s+(\d+)\]\s*/gi;
  const parts = rawText.split(regex);

  // parts will be: ['', '2', ' text...', '3', ' text...', ...]
  for (let i = 1; i < parts.length; i += 2) {
    const num = parseInt(parts[i], 10);
    const text = (parts[i + 1] || '').trim();
    if (text) {
      paragraphs.push({ text, number: num });
    }
  }

  // Fallback: if no [Paragraph N] markers, split on double newlines
  if (paragraphs.length === 0) {
    const chunks = rawText.split(/\n\n+/).filter(c => c.trim());
    chunks.forEach((chunk, i) => {
      // Remove any [N] markers from start
      const clean = chunk.replace(/^\s*\[\d+\]\s*/, '').trim();
      if (clean) paragraphs.push({ text: clean, number: i + 1 });
    });
  }

  return paragraphs;
}

/** Build LayoutParagraph objects from display lines */
export function buildParagraphLayouts(
  allLines: DisplayLine[],
  paragraphs: { text: string; number: number }[],
): LayoutParagraph[] {
  const layouts: LayoutParagraph[] = [];

  for (let pi = 0; pi < paragraphs.length; pi++) {
    const paraLines = allLines.filter(l => l.paragraph === pi && !l.isBlank);
    if (paraLines.length === 0) continue;

    layouts.push({
      index: pi,
      paragraphNumber: paragraphs[pi].number,
      lines: paraLines,
      startLine: paraLines[0].line,
      endLine: paraLines[paraLines.length - 1].line,
    });
  }

  return layouts;
}
