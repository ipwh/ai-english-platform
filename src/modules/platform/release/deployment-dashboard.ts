// Sprint 99: Deployment Dashboard — aggregates release governance data
import type { DeploymentDashboard } from './release-types';
import { validateDeployment } from './deployment-validator';
import { getDeploymentPolicy } from './deployment-policy';
import { listFlags } from './feature-flags';
import { listPolicies } from './rollout-policy';
import { latestRelease, listReleases } from './release-registry';
import { generateAuditReport } from './release-audit';

export function getDeploymentDashboard(archTestCount = 106, unitTestCount = 1040): DeploymentDashboard {
  const policy = getDeploymentPolicy('standard');
  const validation = validateDeployment(policy, archTestCount, unitTestCount);
  const audit = generateAuditReport();

  return {
    timestamp: new Date().toISOString(),
    validation,
    flags: listFlags(),
    activeRollouts: listPolicies(),
    latestRelease: latestRelease() || null,
    recentReleases: listReleases(10),
    auditSummary: { totalEntries: audit.summary.totalActions, recentFailures: audit.summary.failures },
  };
}
