// ============================================
// Sprint 116: Reading Layout — Barrel Export
// ============================================

export type {
  LayoutOptions, DisplayLine, LayoutParagraph, LayoutResult, LayoutMetrics,
} from './reading-layout-types';
export { DEFAULT_LAYOUT_OPTIONS } from './reading-layout-types';

export { layoutReadingText, recalculateLayout } from './layout-engine';
export { calculateParagraphLines, calculateTotalLines, estimateCharsPerLine, recalculateCharsPerLine } from './line-calculator';
export { extractParagraphs, buildParagraphLayouts } from './paragraph-layout';
export { renderToHtml, renderToPlainText } from './layout-renderer';
export { recordLayout, recordRender, getLayoutMetrics, resetLayoutMetrics } from './layout-metrics';
export { generateLayoutReport, formatLayoutReport, formatLayoutReportJson, type LayoutReport } from './layout-report';
