// ============================================
// Sprint 116 / Phase 1A: Reading Layout — Barrel Export (v2)
// ============================================

export type {
  LayoutOptions, ResolvedLayoutOptions, DisplayLine, LayoutParagraph, LayoutResult, LayoutMetrics,
} from './reading-layout-types';
export { DEFAULT_LAYOUT_OPTIONS, resolveLayoutOptions } from './reading-layout-types';

export { layoutReadingText, recalculateLayout } from './layout-engine';
export { calculateParagraphLines, calculateTotalLines, estimateCharsPerLine, recalculateCharsPerLine } from './line-calculator';
export { extractParagraphs, buildParagraphLayouts } from './paragraph-layout';
export { renderLayoutToHtml, renderToPlainText, escapeHtml, renderToHtml } from './layout-renderer';
export { recordLayout, recordRender, getLayoutMetrics, resetLayoutMetrics } from './layout-metrics';
export { generateLayoutReport, formatLayoutReport, formatLayoutReportJson, type LayoutReport } from './layout-report';
