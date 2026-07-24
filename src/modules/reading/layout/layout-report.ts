// ============================================
// Sprint 116: Layout Report
// ============================================

import type { LayoutResult } from './reading-layout-types';
import { getLayoutMetrics } from './layout-metrics';

export interface LayoutReport {
  metrics: ReturnType<typeof getLayoutMetrics>;
  generatedAt: string;
}

export function generateLayoutReport(lastResult?: LayoutResult): LayoutReport & { lastResult?: LayoutResult } {
  return { metrics: getLayoutMetrics(), lastResult, generatedAt: new Date().toISOString() };
}

export function formatLayoutReport(report?: LayoutReport & { lastResult?: LayoutResult }): string {
  const r = report || generateLayoutReport();
  const lines: string[] = [];
  lines.push('# 📐 Reading Layout Report');
  lines.push(`> Generated: ${r.generatedAt}`);
  lines.push('');
  lines.push('## Metrics');
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Total Layouts | ${r.metrics.totalLayouts} |`);
  lines.push(`| Avg Lines | ${r.metrics.avgLines} |`);
  lines.push(`| Avg Paragraphs | ${r.metrics.avgParagraphs} |`);
  lines.push(`| Avg Layout Time | ${r.metrics.avgLayoutDurationMs}ms |`);
  lines.push(`| Avg Render Time | ${r.metrics.avgRenderDurationMs}ms |`);
  lines.push(`| Avg Markers | ${r.metrics.avgMarkerCount} |`);
  lines.push('');

  if (r.lastResult) {
    lines.push('## Last Layout');
    lines.push(`- Total Lines: ${r.lastResult.totalLines}`);
    lines.push(`- Substantive Lines: ${r.lastResult.substantiveLines}`);
    lines.push(`- Paragraphs: ${r.lastResult.paragraphs.length}`);
    lines.push(`- Markers: ${r.lastResult.markers.length} (interval: ${r.lastResult.options.markerInterval})`);
    lines.push(`- Chars/Line: ${r.lastResult.options.charsPerLine}`);
  }

  return lines.join('\n');
}

export function formatLayoutReportJson(report?: LayoutReport): string {
  return JSON.stringify(report || generateLayoutReport(), null, 2);
}
