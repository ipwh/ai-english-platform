// ============================================
// EventBus — Lightweight synchronous event bus
// with typed events, priorities, and once()
// support.
//
// All PromptOps modules use this bus for
// decoupled communication: prompt releases,
// experiment completions, evaluation results,
// alerts, and provider changes.
// ============================================

import { EventPriority } from '../types';
import type { BaseEvent } from '../types';
import type { PromptOpsEventMap, PromptOpsEventType, PromptOpsEvent } from './event-types';

// ── Types ──

/**
 * A subscriber callback for a typed event.
 */
export type EventSubscriber<E extends BaseEvent = BaseEvent> = (event: E) => void;

/**
 * Internal subscription record.
 */
interface Subscription {
  /** Unique subscriber ID */
  id: string;
  /**
   * The callback. Typed with `never` so that every narrower per-event subscriber the
   * public API accepts can be stored here (function parameters are contravariant);
   * `publish()` casts back to the concrete event before invoking it.
   */
  callback: EventSubscriber<never>;
  /** Priority (higher = earlier execution) */
  priority: EventPriority;
  /** If true, auto-unsubscribe after first invocation */
  once: boolean;
}

/**
 * Options for subscribing to events.
 */
export interface SubscribeOptions {
  /** Priority (higher runs first). Default: Normal */
  priority?: EventPriority;
  /** Auto-unsubscribe after first invocation. Default: false */
  once?: boolean;
}

// ── Event Bus ──

/**
 * A lightweight, synchronous, typed event bus.
 *
 * Features:
 * - Typed events via {@link PromptOpsEventMap}
 * - Priority-based subscriber ordering
 * - `once()` for single-invocation subscriptions
 * - Wildcard subscriptions (`*`)
 * - Unsubscribe via returned function
 * - Error isolation: one subscriber failing doesn't affect others
 *
 * @example
 * ```ts
 * const bus = new EventBus();
 *
 * // Subscribe to a specific event
 * const unsub = bus.on('experiment:completed', (event) => {
 *   console.log(`Experiment ${event.experimentName} completed`);
 * });
 *
 * // Subscribe once
 * bus.once('prompt:released', (event) => {
 *   deployPrompt(event.version);
 * });
 *
 * // Publish an event
 * bus.emit({
 *   type: 'experiment:completed',
 *   timestamp: new Date().toISOString(),
 *   experimentId: 'exp-1',
 *   experimentName: 'Reading V12 A/B',
 *   hasWinner: true,
 *   winnerVariantId: 'B',
 *   confidenceScore: 95,
 *   durationMs: 12000,
 * });
 * ```
 */
export class EventBus {
  /** Subscribers per event type */
  private subscribers = new Map<string, Subscription[]>();

  /** Counter for generating subscriber IDs */
  private idCounter = 0;

  // ── Subscribe ──

  /**
   * Subscribe to a typed event.
   *
   * @param eventType — The event type string (e.g., 'experiment:completed')
   * @param callback — The subscriber callback
   * @param options — Subscription options
   * @returns A function to unsubscribe
   */
  on<K extends PromptOpsEventType>(
    eventType: K,
    callback: EventSubscriber<PromptOpsEventMap[K]>,
    options?: SubscribeOptions,
  ): () => void {
    return this.subscribeInternal(eventType, callback, options ?? {});
  }

  /**
   * Subscribe to ALL events (wildcard).
   *
   * @param callback — Called for every event
   * @param options — Subscription options
   * @returns Unsubscribe function
   */
  onAny(
    callback: EventSubscriber<PromptOpsEvent>,
    options?: SubscribeOptions,
  ): () => void {
    return this.subscribeInternal('*', callback, options ?? {});
  }

  /**
   * Subscribe to an event once (auto-unsubscribe after first invocation).
   *
   * @param eventType — The event type string
   * @param callback — The subscriber callback
   * @param priority — Optional priority
   * @returns Unsubscribe function (for early cancellation)
   */
  once<K extends PromptOpsEventType>(
    eventType: K,
    callback: EventSubscriber<PromptOpsEventMap[K]>,
    priority?: EventPriority,
  ): () => void {
    return this.subscribeInternal(eventType, callback, { once: true, priority });
  }

  // ── Unsubscribe ──

  /**
   * Unsubscribe a specific callback from an event type.
   *
   * @param eventType — The event type
   * @param callback — The callback to remove
   */
  unsubscribe<K extends PromptOpsEventType>(
    eventType: K,
    callback: EventSubscriber<PromptOpsEventMap[K]>,
  ): void {
    const subs = this.subscribers.get(eventType);
    if (!subs) return;

    const idx = subs.findIndex(s => s.callback === callback);
    if (idx !== -1) {
      subs.splice(idx, 1);
    }

    if (subs.length === 0) {
      this.subscribers.delete(eventType);
    }
  }

  /**
   * Unsubscribe by the returned unsubscribe function ID.
   */
  unsubscribeById(subscriberId: string): void {
    for (const [type, subs] of this.subscribers) {
      const idx = subs.findIndex(s => s.id === subscriberId);
      if (idx !== -1) {
        subs.splice(idx, 1);
        if (subs.length === 0) {
          this.subscribers.delete(type);
        }
        return;
      }
    }
  }

  // ── Publish ──

  /**
   * Publish (emit) an event to all subscribers.
   *
   * Subscribers are called in priority order (highest first).
   * Errors in individual subscribers are caught and logged
   * but do not prevent other subscribers from running.
   *
   * @param event — The event to publish
   */
  emit<K extends PromptOpsEventType>(event: PromptOpsEventMap[K]): void {
    // Ensure timestamp
    if (!event.timestamp) {
      (event as BaseEvent).timestamp = new Date().toISOString();
    }

    // Notify specific subscribers
    this.notifySubscribers(event.type, event);

    // Notify wildcard subscribers
    this.notifySubscribers('*', event);
  }

  /**
   * Publish multiple events atomically.
   *
   * @param events — Array of events to publish
   */
  emitAll(events: PromptOpsEvent[]): void {
    for (const event of events) {
      this.emit(event as PromptOpsEventMap[PromptOpsEventType]);
    }
  }

  // ── Query ──

  /**
   * Get the number of subscribers for a specific event type.
   */
  subscriberCount(eventType?: string): number {
    if (eventType) {
      return this.subscribers.get(eventType)?.length ?? 0;
    }

    let count = 0;
    for (const subs of this.subscribers.values()) {
      count += subs.length;
    }
    return count;
  }

  /**
   * List all event types that have subscribers.
   */
  activeEventTypes(): string[] {
    return Array.from(this.subscribers.keys());
  }

  /**
   * Remove all subscribers.
   */
  clear(): void {
    this.subscribers.clear();
    this.idCounter = 0;
  }

  // ── Internal ──

  /**
   * Internal subscribe implementation.
   */
  private subscribeInternal(
    eventType: string,
    // `EventSubscriber<BaseEvent>` cannot accept the narrower per-event subscribers the
    // public API passes (function parameters are contravariant); `never` accepts all of
    // them, and the invocation site below casts back to the concrete event type.
    callback: EventSubscriber<never>,
    options: SubscribeOptions,
  ): () => void {
    const id = `sub-${++this.idCounter}`;

    const subscription: Subscription = {
      id,
      callback,
      priority: options.priority ?? EventPriority.Normal,
      once: options.once ?? false,
    };

    const subs = this.subscribers.get(eventType) ?? [];
    subs.push(subscription);

    // Sort by priority descending
    subs.sort((a, b) => b.priority - a.priority);
    this.subscribers.set(eventType, subs);

    // Return unsubscribe function
    return () => this.unsubscribeById(id);
  }

  /**
   * Notify all subscribers for an event type.
   */
  private notifySubscribers(eventType: string, event: BaseEvent): void {
    const subs = this.subscribers.get(eventType);
    if (!subs || subs.length === 0) return;

    // Copy array to avoid mutation during iteration
    const toNotify = [...subs];

    for (const sub of toNotify) {
      try {
        // The stored callback is `EventSubscriber<never>` (see `Subscription`); at
        // invocation time the concrete event is known, so cast it back.
        (sub.callback as EventSubscriber<BaseEvent>)(event);
      } catch (err) {
        // Isolate subscriber errors — don't crash the bus
        console.error(
          `[EventBus] Error in subscriber ${sub.id} for "${eventType}":`,
          err instanceof Error ? err.message : err,
        );
      }
    }

    // Remove once-only subscribers
    const remaining = subs.filter(s => !s.once || !toNotify.includes(s));
    if (remaining.length === 0) {
      this.subscribers.delete(eventType);
    } else {
      this.subscribers.set(eventType, remaining);
    }
  }
}
