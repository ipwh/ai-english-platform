// Sprint 85: Platform Events — barrel exports

export type { DomainEvent } from './domain-event';
export { createDomainEvent, createEventId } from './domain-event';
export { EventTypes } from './event-types';
export type { EventType } from './event-types';
export { platformEventBus } from './in-memory-event-bus';
export { publishEvent, publishStudentXpAwarded, publishPracticeCompleted, publishAIRequestSucceeded, publishAIRequestFailed } from './event-publisher';
export { initPlatformSubscribers } from './event-subscriber';
