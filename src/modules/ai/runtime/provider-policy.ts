// Sprint 84: Provider Policy — provider selection and routing logic
// ProviderRegistry becomes execution-only; this owns routing decisions.

import { providerRegistry } from '@/modules/ai/providers';

export interface ProviderPolicy {
  /** Preferred provider name */
  preferred: string;
  /** Fallback chain enabled */
  fallbackEnabled: boolean;
  /** Blacklisted providers (temporarily unhealthy) */
  blacklist: string[];
}

const DEFAULT_PROVIDER_POLICY: ProviderPolicy = {
  preferred: '',
  fallbackEnabled: true,
  blacklist: [],
};

let currentPolicy: ProviderPolicy = { ...DEFAULT_PROVIDER_POLICY };

export function getProviderPolicy(): ProviderPolicy {
  return { ...currentPolicy };
}

export function setProviderPolicy(policy: Partial<ProviderPolicy>): void {
  currentPolicy = { ...currentPolicy, ...policy };
}

export function blacklistProvider(provider: string): void {
  if (!currentPolicy.blacklist.includes(provider)) {
    currentPolicy.blacklist.push(provider);
  }
}

export function unblacklistProvider(provider: string): void {
  currentPolicy.blacklist = currentPolicy.blacklist.filter(p => p !== provider);
}

export function getAvailableProviders(): string[] {
  const available = providerRegistry.getAvailableProviders();
  const names = available.map(p => p.name || 'unknown');
  return names.filter(n => !currentPolicy.blacklist.includes(n));
}

export function resetProviderPolicy(): void {
  currentPolicy = { ...DEFAULT_PROVIDER_POLICY };
}
