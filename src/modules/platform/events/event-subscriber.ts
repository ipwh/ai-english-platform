// Sprint 85: Event Subscribers — built-in subscribers for platform events
// Each subscriber owns one concern. Register during app initialization.

import { platformEventBus } from './in-memory-event-bus';
import { EventTypes } from './event-types';
import { recordProviderCall, recordRetry } from '@/modules/ai/services/runtime-metrics';
import { recordStage } from '@/modules/ai/services/ai-observability';
import { recordTokenUsage } from '@/modules/ai/runtime/budget-policy';
import { recordSuccess, recordFailure } from '@/modules/ai/runtime/circuit-breaker';
import { logger } from '@/shared/logger/logger';

/** Initialize all built-in platform subscribers */
export function initPlatformSubscribers(): void {
  // AI Request Succeeded → update metrics + circuit breaker
  platformEventBus.subscribe(EventTypes.AI_REQUEST_SUCCEEDED, async (event) => {
    const { provider, latencyMs, tokenCount } = event.payload;
    recordProviderCall(String(provider), true, Number(latencyMs));
    recordSuccess(String(provider));
    recordStage('provider', Number(latencyMs), true);
    // NOTE: token accounting is owned by `provider-registry.call()`, which is the
    // only place that knows the real prompt/response sizes. If this event path is
    // ever wired up, do NOT keep both — the ledger would double-count and the
    // daily budget would trip at half the configured limit.
    if (tokenCount) await recordTokenUsage(Number(tokenCount));
  });

  // AI Request Failed → update metrics + circuit breaker
  platformEventBus.subscribe(EventTypes.AI_REQUEST_FAILED, (event) => {
    const { provider } = event.payload;
    recordProviderCall(String(provider), false, 0);
    recordFailure(String(provider));
    recordStage('provider', 0, false);
  });

  // Provider Fallback → record retry
  platformEventBus.subscribe(EventTypes.AI_PROVIDER_FALLBACK, () => {
    recordRetry();
  });

  // Practice Completed → log
  platformEventBus.subscribe(EventTypes.PRACTICE_COMPLETED, (event) => {
    const { studentId, questionsAnswered, correctCount } = event.payload;
    logger.info({ module: 'events', studentId, questionsAnswered, correctCount }, 'Practice completed');
  });

  // Student XP Awarded → log
  platformEventBus.subscribe(EventTypes.STUDENT_XP_AWARDED, (event) => {
    const { studentId, xpGained, newLevel } = event.payload;
    logger.info({ module: 'events', studentId, xpGained, newLevel }, 'XP awarded');
  });
}
