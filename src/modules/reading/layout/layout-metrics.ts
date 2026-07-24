// ============================================
// Sprint 116: Layout Metrics
// ============================================

import type { LayoutMetrics } from './reading-layout-types';

const metrics: LayoutMetrics = {
  totalLayouts: 0, totalLines: 0, totalParagraphs: 0,
  totalDurationMs: 0, totalRenderDurationMs: 0, markerCounts: [],
};

export function recordLayout(lines: number, paragraphs: number, durationMs: number): void {
  metrics.totalLayouts++;
  metrics.totalLines += lines;
  metrics.totalParagraphs += paragraphs;
  metrics.totalDurationMs += durationMs;
}

export function recordRender(durationMs: number, markerCount: number): void {
  metrics.totalRenderDurationMs += durationMs;
  metrics.markerCounts.push(markerCount);
  if (metrics.markerCounts.length > 500) metrics.markerCounts.shift();
}

export function getLayoutMetrics() {
  const t = metrics.totalLayouts || 1;
  const avgMarkers = metrics.markerCounts.length > 0
    ? Math.round(metrics.markerCounts.reduce((a, b) => a + b, 0) / metrics.markerCounts.length)
    : 0;

  return {
    totalLayouts: metrics.totalLayouts,
    avgLines: Math.round(metrics.totalLines / t),
    avgParagraphs: Math.round(metrics.totalParagraphs / t),
    avgLayoutDurationMs: Math.round(metrics.totalDurationMs / t),
    avgRenderDurationMs: Math.round(metrics.totalRenderDurationMs / t),
    avgMarkerCount: avgMarkers,
    totalLines: metrics.totalLines,
    totalParagraphs: metrics.totalParagraphs,
  };
}

export function resetLayoutMetrics(): void {
  metrics.totalLayouts = 0; metrics.totalLines = 0; metrics.totalParagraphs = 0;
  metrics.totalDurationMs = 0; metrics.totalRenderDurationMs = 0; metrics.markerCounts = [];
}
