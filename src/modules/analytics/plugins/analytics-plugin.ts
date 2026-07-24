// Sprint 86: Analytics Plugin — interface for pluggable analytics modules
// Analytics plugins subscribe to platform events and produce metrics.

import type { PlatformPlugin } from '@/modules/platform/plugins/plugin';

export interface AnalyticsEvent {
  eventType: string;
  timestamp: string;
  payload: Record<string, unknown>;
}

export interface AnalyticsResult {
  pluginId: string;
  metric: string;
  value: number;
  labels: Record<string, string>;
  timestamp: string;
}

export interface AnalyticsPlugin extends PlatformPlugin {
  /** Analytics category (e.g., "student", "ai", "teacher") */
  category: string;
  /** Consume a platform event and produce analytics */
  consume(event: AnalyticsEvent): AnalyticsResult | AnalyticsResult[] | null;
  /** Get aggregated metrics for this plugin */
  getMetrics(): Record<string, number>;
}
