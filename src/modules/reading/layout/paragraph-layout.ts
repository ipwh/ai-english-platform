// ============================================
// Sprint 116 / Phase 1A: Paragraph Layout (v2)
// Handles paragraph extraction, labeling, and layout building.
// ============================================

import type { LayoutParagraph, DisplayLine } from './reading-layout-types';

/** Extract paragraphs from raw passage text with [N] or [Paragraph N] markers */
export function extractParagraphs(rawText: string): { text: string; number: number; label: string }[] {
  // Strip AI-generated line markers — both [line N] and bare [N] formats
  const cleaned = rawText.replace(/\[(?:line\s+)?\d+\]\s*/gi, '');
  
  // Split on [Paragraph N] or [N] markers
  const paragraphs: { text: string; number: number; label: string }[] = [];
  const regex = /\[Paragraph\s+(\d+)\]\s*/gi;
  const parts = cleaned.split(regex);

  // parts will be: ['', '2', ' text...', '3', ' text...', ...]
  for (let i = 1; i < parts.length; i += 2) {
    const num = parseInt(parts[i], 10);
    const text = (parts[i + 1] || '').trim();
    if (text) {
      paragraphs.push({ text, number: num, label: `Paragraph ${num}` });
    }
  }

  // Fallback: if no [Paragraph N] markers, split on double newlines
  if (paragraphs.length === 0) {
    const chunks = rawText.split(/\n\n+/).filter(c => c.trim());
    chunks.forEach((chunk, i) => {
      const clean = chunk.replace(/^\s*\[\d+\]\s*/, '').trim();
      if (clean) paragraphs.push({ text: clean, number: i + 1, label: `Paragraph ${i + 1}` });
    });
  }

  return paragraphs;
}

/** Build LayoutParagraph objects from display lines */
export function buildParagraphLayouts(
  allLines: DisplayLine[],
  paragraphs: { text: string; number: number; label: string }[],
): LayoutParagraph[] {
  const layouts: LayoutParagraph[] = [];

  for (const para of paragraphs) {
    const paraLines = allLines.filter(
      l => l.paragraphIndex === para.number - 1 && l.text.trim().length > 0,
    );
    if (paraLines.length === 0) continue;

    const firstLine = paraLines[0];
    const lastLine = paraLines[paraLines.length - 1];

    layouts.push({
      paragraphIndex: para.number - 1,
      index: para.number - 1,
      label: para.label,
      paragraphNumber: para.number,
      sourceText: para.text,
      lines: paraLines,
      startLine: firstLine.lineNumber ?? firstLine.lineIndex + 1,
      endLine: lastLine.lineNumber ?? lastLine.lineIndex + 1,
    });
  }

  return layouts;
}
