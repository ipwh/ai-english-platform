// Sprint 85: In-Memory Event Bus — canonical platform event bus
// Single source of truth for event publishing and subscription.
// No external dependencies. Synchronous dispatch by default.

import type { DomainEvent } from './domain-event';
import { logger } from '@/shared/logger/logger';

type EventHandler = (event: DomainEvent) => void | Promise<void>;

interface Subscription {
  eventType: string;
  handler: EventHandler;
  id: string;
}

class PlatformEventBus {
  private subscriptions: Subscription[] = [];
  private publishedCount = 0;
  private handlerLatencies: Map<string, number[]> = new Map();

  /** Subscribe to an event type */
  subscribe(eventType: string, handler: EventHandler): () => void {
    const id = `sub_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    this.subscriptions.push({ eventType, handler, id });
    return () => this.unsubscribe(id);
  }

  /** Unsubscribe by subscription ID */
  unsubscribe(id: string): void {
    this.subscriptions = this.subscriptions.filter(s => s.id !== id);
  }

  /** Publish an event to all matching subscribers */
  async publish(event: DomainEvent): Promise<void> {
    this.publishedCount++;
    const matches = this.subscriptions.filter(s => s.eventType === event.eventType || s.eventType === '*');

    for (const sub of matches) {
      const start = Date.now();
      try {
        await Promise.resolve(sub.handler(event));
      } catch (err) {
        logger.error({ module: 'event-bus', eventType: event.eventType, error: String(err) }, 'Event handler failed');
      } finally {
        const latency = Date.now() - start;
        if (!this.handlerLatencies.has(event.eventType)) {
          this.handlerLatencies.set(event.eventType, []);
        }
        this.handlerLatencies.get(event.eventType)!.push(latency);
      }
    }
  }

  /** Get event bus statistics */
  getStats() {
    const subscribers = this.subscriptions.length;
    const byType: Record<string, number> = {};
    for (const sub of this.subscriptions) {
      byType[sub.eventType] = (byType[sub.eventType] || 0) + 1;
    }
    const handlerLatency: Record<string, number> = {};
    for (const [type, latencies] of this.handlerLatencies) {
      handlerLatency[type] = latencies.length > 0
        ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
        : 0;
    }
    return {
      publishedCount: this.publishedCount,
      subscriberCount: subscribers,
      subscriptionsByType: byType,
      avgHandlerLatencyMs: handlerLatency,
    };
  }

  /** Reset all subscriptions and stats */
  reset(): void {
    this.subscriptions = [];
    this.publishedCount = 0;
    this.handlerLatencies.clear();
  }
}

/** Singleton platform event bus */
export const platformEventBus = new PlatformEventBus();
