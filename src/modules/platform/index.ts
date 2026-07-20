// v4.1: PlatformFacade — Unified entry point for ALL platform/infrastructure logic
// Cross-cutting concerns: cache, reliability, experiments, notifications

// ============================================
// Cache (S12) — TTL in-memory cache
// ============================================
export { cacheService } from '@/modules/cache/services/cache-service';

// ============================================
// Production (S29) — circuit breaker, retry, health checks, feature flags
// ============================================
export {
  CircuitBreaker,
  withRetry,
  aiQueue,
  isFeatureEnabled,
  setFeatureFlag,
  getAllFeatureFlags,
  healthCheck,
  readinessCheck,
  onShutdown,
  gracefulShutdown,
} from '@/modules/production/services/production-ready';

// ============================================
// Experiment (S42) — A/B testing
// ============================================
export { experimentService } from '@/modules/experiment/services/experiment-engine';

// ============================================
// Notification — notification repository
// ============================================
export { createNotification, listNotifications, markNotificationRead } from '@/modules/notification/repositories/notification-repo';

// ============================================
// Unified Facade Object
// ============================================

/**
 * PlatformFacade — v4.1
 *
 * ALL platform/infrastructure logic must be accessed through this facade.
 *
 * Sub-domains:
 *   Cache        — TTL in-memory cache
 *   Reliability  — circuit breaker, retry strategy, graceful shutdown
 *   FeatureFlags — runtime feature toggles
 *   Health       — health checks, readiness probes
 *   Experiment   — A/B testing for prompts and models
 *   Notification — push notification delivery
 *
 * @example
 * import { PlatformFacade } from '@/modules/platform';
 * if (PlatformFacade.features.isEnabled('DSE_RAG_ENABLED')) { ... }
 */
export const PlatformFacade = {
  cache: {
    service: cacheService,
  },

  reliability: {
    circuitBreaker: CircuitBreaker,
    retry: withRetry,
    queue: aiQueue,
    shutdown: gracefulShutdown,
    onShutdown,
  },

  features: {
    isEnabled: isFeatureEnabled,
    set: setFeatureFlag,
    all: getAllFeatureFlags,
  },

  health: {
    check: healthCheck,
    readiness: readinessCheck,
  },

  experiment: {
    service: experimentService,
  },

  notification: {
    create: createNotification,
    list: listNotifications,
    markRead: markNotificationRead,
  },
} as const;
