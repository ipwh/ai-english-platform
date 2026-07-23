// v5: PlatformFacade — Unified entry point for cross-cutting platform concerns
export { cacheService } from '@/modules/cache/cache-service';
export { healthCheck, isFeatureEnabled, setFeatureFlag } from '@/modules/production/services/production-ready';
export { CircuitBreaker } from '@/modules/production/services/production-ready';
export { createNotification, createBulkNotifications, listNotifications, countUnreadNotifications } from '@/modules/notification/repositories/notification-repo';
