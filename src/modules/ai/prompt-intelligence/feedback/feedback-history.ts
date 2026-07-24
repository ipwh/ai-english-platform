// ============================================
// Sprint 110: Feedback History
// Immutable audit trail of all feedback events.
// ============================================

import type { FeedbackEvent, FeedbackSource, FeedbackCategory, FeedbackSeverity } from './feedback-types';

const events: FeedbackEvent[] = [];
const MAX_EVENTS = 5000;

let idCounter = 0;

/** Generate a unique event ID */
function nextId(): string {
  return `fb-${Date.now()}-${++idCounter}`;
}

/** Record a feedback event */
export function recordFeedbackEvent(event: Omit<FeedbackEvent, 'id' | 'timestamp'>): FeedbackEvent {
  const record: FeedbackEvent = {
    ...event,
    id: nextId(),
    timestamp: new Date().toISOString(),
  };
  events.push(record);
  if (events.length > MAX_EVENTS) {
    events.splice(0, events.length - MAX_EVENTS);
  }
  return record;
}

/** Record multiple feedback events at once */
export function recordFeedbackEvents(inputs: Omit<FeedbackEvent, 'id' | 'timestamp'>[]): FeedbackEvent[] {
  return inputs.map(e => recordFeedbackEvent(e));
}

/** Get all feedback events (most recent first) */
export function getFeedbackHistory(limit?: number): FeedbackEvent[] {
  const result = [...events].reverse();
  return limit ? result.slice(0, limit) : result;
}

/** Get events by source layer */
export function getEventsBySource(source: FeedbackSource): FeedbackEvent[] {
  return events.filter(e => e.source === source);
}

/** Get events by rule ID */
export function getEventsByRule(rule: string): FeedbackEvent[] {
  return events.filter(e => e.rule === rule);
}

/** Get events by category */
export function getEventsByCategory(category: FeedbackCategory): FeedbackEvent[] {
  return events.filter(e => e.category === category);
}

/** Get failure events only (severity >= warning) */
export function getFailureEvents(): FeedbackEvent[] {
  return events.filter(e => e.severity !== 'info');
}

/** Get recent events within a window */
export function getRecentEvents(windowSize: number): FeedbackEvent[] {
  return events.slice(-windowSize);
}

/** Get events since a timestamp */
export function getEventsSince(since: string): FeedbackEvent[] {
  return events.filter(e => e.timestamp >= since);
}

/** Count events by a grouping function */
export function countEventsBy<K extends string>(groupFn: (e: FeedbackEvent) => K): Record<K, number> {
  const counts = {} as Record<K, number>;
  for (const e of events) {
    const key = groupFn(e);
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

/** Clear all feedback history */
export function clearFeedbackHistory(): void {
  events.length = 0;
  idCounter = 0;
}

/** Get total event count */
export function getFeedbackEventCount(): number {
  return events.length;
}
