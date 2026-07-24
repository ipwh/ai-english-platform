// Sprint 99: Release Governance — barrel exports
export type { FeatureFlag, RolloutPolicy, RolloutPolicyType, DeploymentPolicy, DeploymentValidationResult, DeploymentCheck, Release, ReleaseComparison, AuditEntry, ReleaseAuditReport, DeploymentDashboard, Environment } from './release-types';
export { registerFlag, getFlag, setFlag, enableFlag, disableFlag, evaluateFlag, listFlags } from './feature-flags';
export { evaluateRollout, getEligibleUsers, isFeatureEnabled, registerPolicy, getPolicy, listPolicies, ROLLOUT_POLICIES } from './rollout-policy';
export { STRICT_DEPLOYMENT_POLICY, STANDARD_DEPLOYMENT_POLICY, getDeploymentPolicy } from './deployment-policy';
export { validateDeployment } from './deployment-validator';
export { registerRelease, getRelease, latestRelease, listReleases, compareReleases } from './release-registry';
export { auditFlagChange, auditRelease, auditRollback, auditDeployment, generateAuditReport, exportJSON as exportAuditJSON, exportMarkdown as exportAuditMarkdown } from './release-audit';
export { getDeploymentDashboard } from './deployment-dashboard';
