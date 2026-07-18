// Sprint 11: Event Bus — in-process pub/sub with error isolation
import type { DomainEvent, DomainEventType, EventHandler, EventPayloadMap } from './types';
import { logger } from '@/shared/logger/logger';

type Subscription = {
  handler: EventHandler<any>;
  filter?: (event: DomainEvent<any>) => boolean;
};

const subscriptions = new Map<DomainEventType, Subscription[]>();

let eventCounter = 0;

/** Generate a unique event ID */
function generateEventId(): string {
  eventCounter++;
  return `evt_${Date.now()}_${eventCounter}`;
}

/**
 * Subscribe to a domain event type.
 * Returns an unsubscribe function.
 */
export function on<T extends DomainEventType>(
  eventType: T,
  handler: EventHandler<T>,
  filter?: (event: DomainEvent<EventPayloadMap[T]>) => boolean
): () => void {
  if (!subscriptions.has(eventType)) {
    subscriptions.set(eventType, []);
  }
  const sub: Subscription = { handler, filter };
  subscriptions.get(eventType)!.push(sub);

  return () => {
    const subs = subscriptions.get(eventType);
    if (subs) {
      const idx = subs.indexOf(sub);
      if (idx >= 0) subs.splice(idx, 1);
    }
  };
}

/**
 * Emit a domain event to all subscribers.
 * Handlers run synchronously but errors are isolated — one handler failure
 * does not prevent others from executing.
 */
export async function emit<T extends DomainEventType>(
  type: T,
  payload: EventPayloadMap[T]
): Promise<void> {
  const event: DomainEvent<EventPayloadMap[T]> = {
    type,
    payload,
    timestamp: new Date(),
    eventId: generateEventId(),
  };

  const subs = subscriptions.get(type);
  if (!subs || subs.length === 0) return;

  logger.debug({ module: 'event-bus', eventType: type, subscriberCount: subs.length, eventId: event.eventId }, 'Emitting event');

  for (const sub of subs) {
    if (sub.filter && !sub.filter(event)) continue;
    try {
      await sub.handler(event);
    } catch (err) {
      // Isolate handler errors — don't let one handler break others
      logger.error({ module: 'event-bus', eventType: type, error: (err as Error).message }, 'Event handler failed');
    }
  }
}

/** Get subscriber count for an event type (for testing) */
export function subscriberCount(type: DomainEventType): number {
  return subscriptions.get(type)?.length ?? 0;
}

/** Clear all subscriptions (for testing) */
export function clearAllSubscriptions(): void {
  subscriptions.clear();
}
