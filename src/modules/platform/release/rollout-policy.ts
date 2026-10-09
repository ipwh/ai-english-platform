// Sprint 99: Rollout Policy — controls how features are rolled out to users
import type { RolloutPolicy } from './release-types';

const activePolicies: Map<string, RolloutPolicy> = new Map();

export function evaluateRollout(policy: RolloutPolicy, userId?: string, region?: string): boolean {
  switch (policy.type) {
    case 'Immediate': return true;
    case 'Disabled': return false;
    case 'Percentage':
      if (!userId || !policy.percentage) return false;
      return (hashUserId(userId) % 100) < policy.percentage;
    case 'Canary':
      if (!userId || !policy.allowedUserIds) return false;
      return policy.allowedUserIds.includes(userId);
    case 'Regional':
      if (!region || !policy.allowedRegions) return false;
      return policy.allowedRegions.includes(region);
    case 'InternalOnly':
      return userId ? userId.endsWith('@internal') || userId.startsWith('admin-') : false;
    default: return false;
  }
}

function hashUserId(userId: string): number {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) { hash = ((hash << 5) - hash) + userId.charCodeAt(i); hash |= 0; }
  return Math.abs(hash);
}

export function getEligibleUsers(policy: RolloutPolicy, allUsers: string[]): string[] {
  return allUsers.filter(u => evaluateRollout(policy, u));
}

export function isFeatureEnabled(policyId: string, userId?: string, region?: string): boolean {
  const policy = activePolicies.get(policyId);
  if (!policy) return true; // no policy = enabled by default
  return evaluateRollout(policy, userId, region);
}

export function registerPolicy(id: string, policy: RolloutPolicy): void { activePolicies.set(id, policy); }
export function getPolicy(id: string): RolloutPolicy | undefined { return activePolicies.get(id); }
export function listPolicies(): RolloutPolicy[] { return Array.from(activePolicies.values()); }

export const ROLLOUT_POLICIES: Record<string, RolloutPolicy> = {
  Immediate: { type: 'Immediate', description: 'Immediately available to all users' },
  Percentage10: { type: 'Percentage', percentage: 10, description: '10% of users' },
  Percentage50: { type: 'Percentage', percentage: 50, description: '50% of users' },
  Canary: { type: 'Canary', allowedUserIds: [], description: 'Canary: specific users only' },
  InternalOnly: { type: 'InternalOnly', description: 'Internal/Admin users only' },
  Disabled: { type: 'Disabled', description: 'Feature disabled for all users' },
};
