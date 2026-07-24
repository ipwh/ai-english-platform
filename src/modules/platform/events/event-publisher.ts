// Sprint 85: Event Publisher — convenience functions for publishing domain events

import { platformEventBus } from './in-memory-event-bus';
import { createDomainEvent } from './domain-event';
import { EventTypes } from './event-types';
import type { EventType } from './event-types';

/** Publish a domain event with type safety */
export function publishEvent(
  eventType: EventType,
  source: string,
  payload: Record<string, unknown> = {},
): void {
  const event = createDomainEvent(eventType, source, payload);
  platformEventBus.publish(event);
}

/** Publish a student XP awarded event */
export function publishStudentXpAwarded(studentId: string, xpGained: number, newLevel: number): void {
  publishEvent(EventTypes.STUDENT_XP_AWARDED, 'StudentStateMutationService', {
    studentId, xpGained, newLevel,
  });
}

/** Publish a practice completed event */
export function publishPracticeCompleted(studentId: string, questionsAnswered: number, correctCount: number): void {
  publishEvent(EventTypes.PRACTICE_COMPLETED, 'ExerciseService', {
    studentId, questionsAnswered, correctCount,
  });
}

/** Publish an AI request completed event */
export function publishAIRequestSucceeded(provider: string, latencyMs: number, tokenCount: number): void {
  publishEvent(EventTypes.AI_REQUEST_SUCCEEDED, 'AI Pipeline', {
    provider, latencyMs, tokenCount,
  });
}

/** Publish an AI request failed event */
export function publishAIRequestFailed(provider: string, error: string): void {
  publishEvent(EventTypes.AI_REQUEST_FAILED, 'AI Pipeline', { provider, error });
}
