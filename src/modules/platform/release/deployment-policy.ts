// Sprint 99: Deployment Policy — defines deployment safety thresholds
import type { DeploymentPolicy } from './release-types';

export const STRICT_DEPLOYMENT_POLICY: DeploymentPolicy = {
  name: 'strict',
  minimumSuccessRate: 0.99,
  maximumLatencyMs: 3000,
  maximumRetryRate: 0.05,
  maximumFallbackRate: 0.03,
  minimumReliabilityScore: 90,
  requiredSLOs: ['ai-availability', 'ai-success-rate', 'ai-latency'],
  requiredArchitectureTests: 110,
  requiredUnitTests: 1000,
};

export const STANDARD_DEPLOYMENT_POLICY: DeploymentPolicy = {
  name: 'standard',
  minimumSuccessRate: 0.95,
  maximumLatencyMs: 5000,
  maximumRetryRate: 0.10,
  maximumFallbackRate: 0.08,
  minimumReliabilityScore: 70,
  requiredSLOs: ['ai-availability', 'ai-success-rate'],
  requiredArchitectureTests: 100,
  requiredUnitTests: 900,
};

export function getDeploymentPolicy(name: 'strict' | 'standard'): DeploymentPolicy {
  return name === 'strict' ? STRICT_DEPLOYMENT_POLICY : STANDARD_DEPLOYMENT_POLICY;
}
