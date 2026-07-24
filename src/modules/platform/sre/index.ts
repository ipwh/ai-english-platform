// Sprint 98: SRE Module — barrel exports
export type { SLODefinition, SLOEvaluation, SLOReport, SLOMetrics, SLOStatus, SLOCompliance, ErrorBudget, BudgetWindow, ReliabilityScore, ReliabilityComponent, ReliabilityGrade, Incident, IncidentReport, IncidentCategory, IncidentSeverity, Runbook, PlatformReliabilityDashboard } from './slo-types';
export { registerSLO, getSLO, evaluate, evaluateAll, getStatus, exportSnapshot } from './slo-manager';
export { consume, remaining, reset, percentage, isExceeded, getAllBudgets } from './error-budget';
export { computeReliabilityScore } from './reliability-score';
export { classifyIncidents } from './incident-classifier';
export { RUNBOOKS, getRunbook } from './runbook';
export { getReliabilityDashboard, getFullRuntimeReport } from './reliability-dashboard';
