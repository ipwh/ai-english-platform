// Sprint 99: Release Types — shared types for feature flags, releases, deployments

export type Environment = 'development' | 'test' | 'staging' | 'production';

export interface FeatureFlag {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  defaultValue: boolean;
  environment: Environment;
  rolloutPercentage: number;
  owner: string;
  createdAt: string;
  updatedAt: string;
}

export type RolloutPolicyType = 'Immediate' | 'Percentage' | 'Canary' | 'Regional' | 'InternalOnly' | 'Disabled';

export interface RolloutPolicy {
  type: RolloutPolicyType;
  percentage?: number;
  allowedRegions?: string[];
  allowedUserIds?: string[];
  description: string;
}

export interface DeploymentPolicy {
  name: string;
  minimumSuccessRate: number;
  maximumLatencyMs: number;
  maximumRetryRate: number;
  maximumFallbackRate: number;
  minimumReliabilityScore: number;
  requiredSLOs: string[];
  requiredArchitectureTests: number;
  requiredUnitTests: number;
}

export interface DeploymentValidationResult {
  passed: boolean;
  score: number;
  warnings: string[];
  blockingIssues: string[];
  summary: string;
  checkedAt: string;
  checks: DeploymentCheck[];
}

export interface DeploymentCheck {
  name: string;
  passed: boolean;
  current: number;
  threshold: number;
  message: string;
}

export interface Release {
  id: string;
  version: string;
  gitSha: string;
  timestamp: string;
  author: string;
  featureFlags: string[];
  migrationVersion?: string;
  rollbackVersion?: string;
  deploymentResult?: 'success' | 'failure' | 'rolled-back' | 'pending';
  notes: string;
}

export interface ReleaseComparison {
  from: Release;
  to: Release;
  flagChanges: { flagId: string; from: boolean; to: boolean }[];
  diffSummary: string;
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  target: string;
  details: Record<string, unknown>;
  result: 'success' | 'failure';
}

export interface ReleaseAuditReport {
  generatedAt: string;
  entries: AuditEntry[];
  summary: { totalActions: number; failures: number; byAction: Record<string, number> };
}

export interface DeploymentDashboard {
  timestamp: string;
  validation: DeploymentValidationResult | null;
  flags: FeatureFlag[];
  activeRollouts: RolloutPolicy[];
  latestRelease: Release | null;
  recentReleases: Release[];
  auditSummary: { totalEntries: number; recentFailures: number };
}
