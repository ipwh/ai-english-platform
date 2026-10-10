// Sprint 99: Deployment Validator — checks deployment readiness against policies
import type { DeploymentValidationResult, DeploymentCheck, DeploymentPolicy } from './release-types';
import { getRuntimeMetrics } from '@/modules/ai/services/runtime-metrics';
import { evaluateAll } from '@/modules/platform/sre/slo-manager';
import { computeReliabilityScore } from '@/modules/platform/sre/reliability-score';
import { detectSaturation } from '@/modules/ai/runtime/saturation-detector';
import { getCapacityPlan } from '@/modules/ai/runtime/capacity-planner';

export function validateDeployment(policy: DeploymentPolicy, architectureTestCount: number, unitTestCount: number): DeploymentValidationResult {
  const checks: DeploymentCheck[] = [];
  const m = getRuntimeMetrics();
  const saturation = detectSaturation();
  const capacity = getCapacityPlan();
  const reliability = computeReliabilityScore();
  const sloReport = evaluateAll();

  // Success rate
  const successRate = m.totalCalls > 0 ? 1 - (m.validationFailures || 0) / m.totalCalls : 1;
  checks.push({ name: 'AI Success Rate', passed: successRate >= policy.minimumSuccessRate, current: Math.round(successRate * 100), threshold: Math.round(policy.minimumSuccessRate * 100), message: `Success rate: ${Math.round(successRate * 100)}% (need ${Math.round(policy.minimumSuccessRate * 100)}%)` });

  // Latency
  checks.push({ name: 'Avg Latency', passed: m.avgLatencyMs <= policy.maximumLatencyMs, current: m.avgLatencyMs, threshold: policy.maximumLatencyMs, message: `Latency: ${m.avgLatencyMs}ms (max ${policy.maximumLatencyMs}ms)` });

  // Retry rate
  const retryRate = m.totalCalls > 0 ? (m.totalRetries || 0) / m.totalCalls : 0;
  checks.push({ name: 'Retry Rate', passed: retryRate <= policy.maximumRetryRate, current: Math.round(retryRate * 100), threshold: Math.round(policy.maximumRetryRate * 100), message: `Retry rate: ${Math.round(retryRate * 100)}% (max ${Math.round(policy.maximumRetryRate * 100)}%)` });

  // Fallback rate
  const fallbackRate = capacity.fallbackAmplification;
  checks.push({ name: 'Fallback Rate', passed: fallbackRate <= policy.maximumFallbackRate, current: Math.round(fallbackRate * 100), threshold: Math.round(policy.maximumFallbackRate * 100), message: `Fallback rate: ${Math.round(fallbackRate * 100)}% (max ${Math.round(policy.maximumFallbackRate * 100)}%)` });

  // Reliability score
  checks.push({ name: 'Reliability Score', passed: reliability.score >= policy.minimumReliabilityScore, current: reliability.score, threshold: policy.minimumReliabilityScore, message: `Reliability: ${reliability.grade} (${reliability.score}/100, need ${policy.minimumReliabilityScore})` });

  // SLO compliance
  const sloPassing = sloReport.evaluations.filter(e => policy.requiredSLOs.includes(e.sloId) && e.status !== 'breached').length;
  checks.push({ name: 'SLO Compliance', passed: sloPassing === policy.requiredSLOs.length, current: sloPassing, threshold: policy.requiredSLOs.length, message: `SLOs: ${sloPassing}/${policy.requiredSLOs.length} passing` });

  // Architecture tests
  checks.push({ name: 'Architecture Tests', passed: architectureTestCount >= policy.requiredArchitectureTests, current: architectureTestCount, threshold: policy.requiredArchitectureTests, message: `Arch tests: ${architectureTestCount}/${policy.requiredArchitectureTests}` });

  // Unit tests
  checks.push({ name: 'Unit Tests', passed: unitTestCount >= policy.requiredUnitTests, current: unitTestCount, threshold: policy.requiredUnitTests, message: `Unit tests: ${unitTestCount}/${policy.requiredUnitTests}` });

  // Saturation
  const satCheck = saturation.overall === 'healthy';
  checks.push({ name: 'Saturation', passed: satCheck, current: saturation.overall === 'healthy' ? 0 : 1, threshold: 0, message: `Saturation: ${saturation.overall}` });

  const warnings = checks.filter(c => !c.passed && c.current >= c.threshold * 0.8).map(c => c.message);
  const blocking = checks.filter(c => !c.passed && c.current < c.threshold * 0.8).map(c => c.message);
  const allPassed = checks.every(c => c.passed);
  const score = Math.round(checks.filter(c => c.passed).length / checks.length * 100);

  return {
    passed: allPassed,
    score,
    warnings: warnings.length > 0 ? warnings : [],
    blockingIssues: blocking.length > 0 ? blocking : [],
    summary: allPassed ? `✅ All ${checks.length} deployment checks passed (${score}/100)` : `❌ ${blocking.length} blocking, ${warnings.length} warnings (${score}/100)`,
    checkedAt: new Date().toISOString(),
    checks,
  };
}
