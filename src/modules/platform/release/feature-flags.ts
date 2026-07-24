// Sprint 99: Feature Flag System — deterministic feature toggles with environment/percentage/user-hash support
import type { FeatureFlag, Environment } from './release-types';
import { logger } from '@/shared/logger/logger';

const flags: Map<string, FeatureFlag> = new Map();

function hashUserId(userId: string): number {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash) + userId.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % 100;
}

export function registerFlag(flag: FeatureFlag): void {
  flags.set(flag.id, flag);
  logger.info({ module: 'feature-flags', flagId: flag.id, enabled: flag.enabled }, 'Feature flag registered');
}

export function getFlag(id: string): FeatureFlag | undefined {
  return flags.get(id);
}

export function setFlag(id: string, updates: Partial<Pick<FeatureFlag, 'enabled' | 'rolloutPercentage' | 'environment'>>): void {
  const flag = flags.get(id);
  if (!flag) throw new Error(`Feature flag not found: ${id}`);
  Object.assign(flag, updates, { updatedAt: new Date().toISOString() });
  logger.info({ module: 'feature-flags', flagId: id, updates }, 'Feature flag updated');
}

export function enableFlag(id: string): void { setFlag(id, { enabled: true }); }
export function disableFlag(id: string): void { setFlag(id, { enabled: false }); }

export function evaluateFlag(id: string, currentEnv: Environment, userId?: string): boolean {
  const flag = flags.get(id);
  if (!flag) return false;

  // Environment override: if flag is scoped to a specific env, check match
  if (flag.environment !== currentEnv && flag.environment !== 'development') return false;
  if (!flag.enabled) return false;

  // Percentage rollout: deterministic based on user hash
  if (flag.rolloutPercentage < 100) {
    if (!userId) return false;
    const bucket = hashUserId(userId);
    if (bucket >= flag.rolloutPercentage) return false;
  }

  return true;
}

export function listFlags(): FeatureFlag[] {
  return Array.from(flags.values());
}

// Register default flags
registerFlag({ id: 'ai-benchmark', name: 'AI Benchmark', description: 'Enable AI benchmark framework', enabled: true, defaultValue: true, environment: 'development', rolloutPercentage: 100, owner: 'platform', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
registerFlag({ id: 'ai-load-test', name: 'AI Load Test', description: 'Enable AI load testing', enabled: true, defaultValue: true, environment: 'development', rolloutPercentage: 100, owner: 'platform', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
registerFlag({ id: 'sre-dashboard', name: 'SRE Dashboard', description: 'Enable SRE reliability dashboard', enabled: true, defaultValue: true, environment: 'production', rolloutPercentage: 100, owner: 'platform', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
