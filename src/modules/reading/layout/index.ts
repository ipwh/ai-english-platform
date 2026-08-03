// ============================================
// Sprint 116 / Phase 1C: Reading Layout — Barrel Export (v3)
// ============================================

export type {
  LayoutOptions, ResolvedLayoutOptions, DisplayLine, LayoutParagraph, LayoutResult, LayoutMetrics, LayoutWarnings,
} from './reading-layout-types';
export { DEFAULT_LAYOUT_OPTIONS, resolveLayoutOptions, resolveCharsPerLine } from './reading-layout-types';

export { layoutReadingText, recalculateLayout } from './layout-engine';
export { calculateParagraphLines, calculateTotalLines, estimateCharsPerLine, recalculateCharsPerLine } from './line-calculator';
export { extractParagraphs, buildParagraphLayouts } from './paragraph-layout';
export { renderLayoutToHtml, renderToPlainText, escapeHtml, renderToHtml } from './layout-renderer';
export { recordLayout, recordRender, getLayoutMetrics, resetLayoutMetrics } from './layout-metrics';
export { generateLayoutReport, formatLayoutReport, formatLayoutReportJson, type LayoutReport } from './layout-report';
