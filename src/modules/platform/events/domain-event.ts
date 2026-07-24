// Sprint 85: Domain Event — base type for all platform events

export interface DomainEvent {
  /** Unique event ID */
  eventId: string;
  /** Event type discriminator */
  eventType: string;
  /** When the event occurred */
  timestamp: string;
  /** Entity that triggered the event */
  source: string;
  /** Event payload (type-safe in derived events) */
  payload: Record<string, unknown>;
}

/** Generate a unique event ID */
export function createEventId(): string {
  return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/** Create a domain event */
export function createDomainEvent(
  eventType: string,
  source: string,
  payload: Record<string, unknown>,
): DomainEvent {
  return {
    eventId: createEventId(),
    eventType,
    timestamp: new Date().toISOString(),
    source,
    payload,
  };
}
