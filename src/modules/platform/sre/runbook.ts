// Sprint 98: Operational Runbooks — diagnosis/escalation/recovery per incident type
import type { Runbook, IncidentCategory } from './slo-types';

export const RUNBOOKS: Record<IncidentCategory, Runbook> = {
  ProviderFailure: {
    incidentType: 'ProviderFailure',
    diagnosis: ['Check provider health dashboard', 'Verify API key validity', 'Check rate limits', 'Review provider status page'],
    immediateActions: ['Switch to fallback provider', 'Enable circuit breaker if not already active', 'Notify team via #alerts channel'],
    escalation: 'If >2 providers fail simultaneously, escalate to on-call SRE within 5 minutes.',
    recoverySteps: ['Restore primary provider once confirmed healthy', 'Gradually ramp traffic back (10% → 50% → 100%)', 'Monitor for 15 minutes at each step'],
    verification: ['All providers return 200 OK', 'Latency within baseline (<2x normal)', 'No new fallback events for 10 minutes'],
    prevention: ['Add provider health check to CI/CD pipeline', 'Set up automated provider rotation every 30 days', 'Maintain minimum 3 active providers'],
  },
  HighLatency: {
    incidentType: 'HighLatency',
    diagnosis: ['Check provider latency dashboard', 'Review recent deployment changes', 'Check database query performance', 'Inspect network connectivity'],
    immediateActions: ['Increase timeout thresholds temporarily', 'Enable request coalescing if available', 'Scale down non-critical background jobs'],
    escalation: 'If P95 > 5 seconds for >5 minutes, escalate to on-call engineer.',
    recoverySteps: ['Identify bottleneck (DB/network/provider)', 'Apply targeted fix or rollback recent change', 'Clear any accumulated queues'],
    verification: ['P95 latency back within baseline', 'No timeout errors for 5 minutes', 'Throughput returned to normal'],
    prevention: ['Add latency regression tests to CI', 'Set up P95 latency alert at 2x baseline', 'Profile critical paths monthly'],
  },
  RetryStorm: {
    incidentType: 'RetryStorm',
    diagnosis: ['Check retry rate in runtime metrics', 'Identify which provider is failing', 'Check for cascading timeout patterns'],
    immediateActions: ['Temporarily disable retries on failing provider', 'Increase retry backoff (exponential)', 'Redirect traffic to healthy providers'],
    escalation: 'If retry rate >20% for >3 minutes, escalate to on-call SRE.',
    recoverySteps: ['Fix root cause of failures', 'Reset retry counters', 'Gradually re-enable retries with conservative backoff'],
    verification: ['Retry rate <5%', 'No cascading failures', 'All providers responding'],
    prevention: ['Implement jitter in retry timing', 'Set max retry budget per time window', 'Add circuit breaker integration'],
  },
  FallbackCascade: {
    incidentType: 'FallbackCascade',
    diagnosis: ['Check fallback chain order', 'Verify all providers are configured', 'Check provider priority list'],
    immediateActions: ['Freeze fallback chain at current provider', 'Attempt to restore primary provider', 'Alert team of degraded service'],
    escalation: 'If all providers exhausted, escalate to engineering lead immediately.',
    recoverySteps: ['Restore providers in priority order', 'Test each provider before adding to chain', 'Monitor fallback rate after each restoration'],
    verification: ['Primary provider handling >80% of traffic', 'Fallback rate <5%', 'All providers in chain healthy'],
    prevention: ['Test failover monthly', 'Maintain N+2 provider redundancy', 'Set up automated failover testing'],
  },
  CircuitBreakerOpen: {
    incidentType: 'CircuitBreakerOpen',
    diagnosis: ['Check which circuit breaker opened', 'Review failure count and threshold', 'Check if provider is actually down'],
    immediateActions: ['Verify provider health independently', 'Manually reset breaker if false positive', 'Redirect traffic to alternative path'],
    escalation: 'If circuit breaker stays open >10 minutes, escalate to on-call SRE.',
    recoverySteps: ['Fix underlying provider issue', 'Reset circuit breaker', 'Allow half-open state testing before full restore'],
    verification: ['Circuit breaker closed', 'Half-open tests passing', 'Provider responding normally'],
    prevention: ['Tune breaker thresholds based on traffic patterns', 'Add automated half-open testing', 'Monitor breaker state in dashboard'],
  },
  ValidationFailure: {
    incidentType: 'ValidationFailure',
    diagnosis: ['Check AI response format', 'Review recent prompt changes', 'Check schema compatibility'],
    immediateActions: ['Enable JSON repair mode if not active', 'Switch to more reliable model if available', 'Log failing inputs for analysis'],
    escalation: 'If validation failure rate >10%, escalate to AI team lead.',
    recoverySteps: ['Fix prompt or schema issue', 'Clear corrupted cache entries', 'Re-validate recent outputs'],
    verification: ['Validation rate <2%', 'No schema mismatch errors', 'All response types validating'],
    prevention: ['Add pre-flight validation to CI', 'Version all schemas', 'Set up automated prompt regression tests'],
  },
  MemoryPressure: {
    incidentType: 'MemoryPressure',
    diagnosis: ['Check heap usage trend', 'Review recent deployments', 'Check for memory leak patterns', 'Inspect cache sizes'],
    immediateActions: ['Clear non-essential caches', 'Trigger garbage collection if available', 'Reduce concurrent request limit'],
    escalation: 'If heap >80% of max for >5 minutes, escalate to platform team.',
    recoverySteps: ['Identify memory leak source', 'Apply fix or rollback', 'Restart service if necessary during low-traffic window'],
    verification: ['Heap usage stable and <70%', 'No OutOfMemory errors', 'Cache sizes within limits'],
    prevention: ['Add memory profiling to CI', 'Set heap alerts at 70% and 85%', 'Run weekly memory leak tests'],
  },
  Unknown: {
    incidentType: 'Unknown',
    diagnosis: ['Check all dashboards', 'Review recent changes', 'Inspect error logs', 'Run health check suite'],
    immediateActions: ['Take snapshot of current state', 'Notify on-call engineer', 'Begin systematic diagnosis'],
    escalation: 'If unresolved after 15 minutes, escalate to engineering lead.',
    recoverySteps: ['Identify root cause through diagnosis', 'Apply targeted fix', 'Document incident for post-mortem'],
    verification: ['All health checks passing', 'System returned to baseline', 'No recurrence for 1 hour'],
    prevention: ['Add monitoring for this incident type', 'Update runbooks with findings', 'Schedule post-mortem within 48 hours'],
  },
};

export function getRunbook(category: IncidentCategory): Runbook {
  return RUNBOOKS[category] || RUNBOOKS.Unknown;
}
