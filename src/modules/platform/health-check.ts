// Sprint 79/83: Platform Health Check Service — extended with AI runtime metrics

import { db } from '@/shared/db/db';
import { config } from '@/shared/config/config';
import { providerRegistry } from '@/modules/ai/providers';
import { cacheService } from '@/modules/cache/cache-service';
import { memoryDbRepo } from '@/modules/learning/memory/repositories/memory-db-repository';
import { getRuntimeMetrics } from '@/modules/ai/services/runtime-metrics';
import { getObservabilityReport } from '@/modules/ai/services/ai-observability';
import { getProviderPolicy } from '@/modules/ai/runtime/provider-policy';
import { getBudgetStatus } from '@/modules/ai/runtime/budget-policy';
import { getAllCircuitBreakers } from '@/modules/ai/runtime/circuit-breaker';

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  latencyMs: number;
  error?: string;
}

interface HealthReport {
  timestamp: string;
  overall: 'healthy' | 'degraded' | 'unhealthy';
  checks: Record<string, HealthStatus>;
  runtime?: Record<string, unknown>;
}

async function checkDb(): Promise<HealthStatus> {
  const start = Date.now();
  try {
    await db.$queryRaw`SELECT 1`;
    return { status: 'healthy', latencyMs: Date.now() - start };
  } catch (err) {
    return { status: 'unhealthy', latencyMs: Date.now() - start, error: String(err) };
  }
}

async function checkCache(): Promise<HealthStatus> {
  const start = Date.now();
  try {
    // Probe the cache (the result is unused, but the call must still surface a throwing
    // stats implementation as `degraded`).
    cacheService.getStats();
    return { status: 'healthy', latencyMs: Date.now() - start };
  } catch (err) {
    return { status: 'degraded', latencyMs: Date.now() - start, error: String(err) };
  }
}

async function checkProviders(): Promise<HealthStatus> {
  const start = Date.now();
  try {
    const available = providerRegistry.getAvailableProviders();
      const total = available.length;
    if (total === 0) return { status: 'unhealthy', latencyMs: Date.now() - start, error: 'No AI providers available' };
    return { status: 'healthy', latencyMs: Date.now() - start };
  } catch (err) {
    return { status: 'unhealthy', latencyMs: Date.now() - start, error: String(err) };
  }
}

async function checkMemoryRepo(): Promise<HealthStatus> {
  const start = Date.now();
  try {
    await memoryDbRepo.count();
    return { status: 'healthy', latencyMs: Date.now() - start };
  } catch (err) {
    return { status: 'degraded', latencyMs: Date.now() - start, error: String(err) };
  }
}

function checkConfig(): HealthStatus {
  const start = Date.now();
  const missing: string[] = [];
  if (!config.deepseek?.apiKey) missing.push('DEEPSEEK_API_KEY');
  if (!config.gemini?.apiKey && !config.vertex?.projectId) missing.push('GEMINI_API_KEY or VERTEX_PROJECT_ID');
  if (missing.length > 0) {
    return { status: 'degraded', latencyMs: Date.now() - start, error: `Missing: ${missing.join(', ')}` };
  }
  return { status: 'healthy', latencyMs: Date.now() - start };
}

export async function runHealthCheck(): Promise<HealthReport> {
  const [dbHealth, cacheHealth, providerHealth, memoryHealth, budgets] = await Promise.all([
    checkDb(), checkCache(), checkProviders(), checkMemoryRepo(), getBudgetStatus(),
  ]);
  const configHealth = checkConfig();

  const checks: Record<string, HealthStatus> = {
    database: dbHealth,
    cache: cacheHealth,
    providers: providerHealth,
    memoryRepository: memoryHealth,
    configuration: configHealth,
  };

  const statuses = Object.values(checks).map(c => c.status);
  const overall = statuses.includes('unhealthy') ? 'unhealthy'
    : statuses.includes('degraded') ? 'degraded' : 'healthy';

  return {
    timestamp: new Date().toISOString(),
    overall,
    checks,
    runtime: {
      ai: getRuntimeMetrics(),
      observability: getObservabilityReport(),
      cache: cacheService.getStats(),
      policy: getProviderPolicy(),
      budgets,
      circuitBreakers: getAllCircuitBreakers(),
    },
  };
}
