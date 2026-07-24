// ============================================
// Sprint 110: Feedback Registry
// Open/Closed Principle: new layers auto-register.
// ============================================

import type { FeedbackEvent, FeedbackSource } from './feedback-types';

/** A feedback collector that normalizes layer-specific results into FeedbackEvents */
export interface FeedbackCollector {
  /** Source layer identifier */
  readonly source: FeedbackSource;
  /** Collect feedback events from a layer result (without id/timestamp — engine adds those) */
  collect(result: unknown): Omit<FeedbackEvent, 'id' | 'timestamp'>[];
}

const collectors = new Map<FeedbackSource, FeedbackCollector>();

/** Register a feedback collector */
export function registerFeedbackCollector(collector: FeedbackCollector): void {
  collectors.set(collector.source, collector);
}

/** Get a registered collector */
export function getFeedbackCollector(source: FeedbackSource): FeedbackCollector | undefined {
  return collectors.get(source);
}

/** Get all registered collectors */
export function getAllCollectors(): FeedbackCollector[] {
  return Array.from(collectors.values());
}

/** Check if a source has a registered collector */
export function hasCollector(source: FeedbackSource): boolean {
  return collectors.has(source);
}

/** Unregister a collector */
export function unregisterCollector(source: FeedbackSource): boolean {
  return collectors.delete(source);
}

/** Get registered sources */
export function getRegisteredSources(): FeedbackSource[] {
  return Array.from(collectors.keys());
}

/** Clear all registrations */
export function clearCollectorRegistry(): void {
  collectors.clear();
}
