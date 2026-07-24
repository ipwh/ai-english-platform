# ADR-008: Platform Event Bus

**Date**: 2026-07-23  
**Status**: Accepted  
**Sprint**: 85

## Context

After Sprint 84, the platform had strong runtime governance but secondary behaviors (metrics, logging, analytics) were triggered directly from business code via imperative calls. This created tight coupling between primary business logic and cross-cutting concerns.

## Decision

Introduce a canonical Platform Event Bus at `platform/events/`:

```
Business Logic → publish(Event) → PlatformEventBus → Subscribers
                                                  ├── MetricsSubscriber
                                                  ├── LoggingSubscriber
                                                  └── AnalyticsSubscriber
```

**Rules**:
1. Only `platform/events/` implements `publish()` / `subscribe()`
2. No service imports subscriber implementations
3. Events are synchronous by default (fire-and-forget handlers)
4. Event handlers must not throw — errors are caught and logged
5. All events inherit from `DomainEvent` (eventId, eventType, timestamp, source, payload)

## Alternatives Considered

- **External message queue (Redis/Kafka)**: Deferred — over-engineering for current scale. In-memory bus is sufficient.
- **No event bus (direct calls)**: Rejected — creates tight coupling between services.

## Consequences

- 23 canonical event types defined
- Built-in subscribers: metrics, circuit breaker, logging
- Event bus statistics exposed via health endpoint
- Zero breaking changes to public APIs

## Ownership

`platform/events/in-memory-event-bus.ts` — canonical event bus  
`platform/events/event-types.ts` — canonical event type registry  
`platform/events/event-publisher.ts` — convenience publishers  
`platform/events/event-subscriber.ts` — built-in subscribers
