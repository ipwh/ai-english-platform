// Sprint 98: SRE Types — shared types for SLO, error budget, incidents, runbooks

export type SLOStatus = 'compliant' | 'at-risk' | 'breached';

export interface SLODefinition {
  id: string;
  name: string;
  description: string;
  /** Target as fraction (e.g. 0.995 = 99.5%) */
  target: number;
  /** Measurement window in hours */
  windowHours: number;
  metrics: SLOMetrics;
}

export interface SLOMetrics {
  availability: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  errorRate: number;
  successRate: number;
  retryRate: number;
  fallbackRate: number;
}

export interface SLOEvaluation {
  sloId: string;
  name: string;
  status: SLOStatus;
  target: number;
  current: SLOMetrics;
  compliance: SLOCompliance;
  evaluatedAt: string;
}

export interface SLOCompliance {
  availability: { met: boolean; actual: number; target: number };
  latency: { met: boolean; actual: number; target: number };
  errorRate: { met: boolean; actual: number; target: number };
  successRate: { met: boolean; actual: number; target: number };
}

export interface SLOReport {
  timestamp: string;
  evaluations: SLOEvaluation[];
  overallStatus: SLOStatus;
  breachedCount: number;
  atRiskCount: number;
}

// ═══ Error Budget ═══

export interface ErrorBudget {
  sloId: string;
  daily: BudgetWindow;
  weekly: BudgetWindow;
  monthly: BudgetWindow;
}

export interface BudgetWindow {
  total: number;
  consumed: number;
  remaining: number;
  percentage: number;
  isExceeded: boolean;
  resetAt: string;
}

// ═══ Reliability Score ═══

export type ReliabilityGrade = 'A+' | 'A' | 'B' | 'C' | 'D';

export interface ReliabilityScore {
  score: number;
  grade: ReliabilityGrade;
  components: ReliabilityComponent[];
  timestamp: string;
}

export interface ReliabilityComponent {
  name: string;
  score: number;
  weight: number;
  status: 'healthy' | 'degraded' | 'unhealthy';
  details: string;
}

// ═══ Incident Classification ═══

export type IncidentCategory =
  | 'ProviderFailure' | 'HighLatency' | 'RetryStorm' | 'FallbackCascade'
  | 'CircuitBreakerOpen' | 'ValidationFailure' | 'MemoryPressure' | 'Unknown';

export type IncidentSeverity = 'Critical' | 'High' | 'Medium' | 'Low';

export interface Incident {
  id: string;
  category: IncidentCategory;
  severity: IncidentSeverity;
  detectedAt: string;
  source: string;
  summary: string;
  metrics: Record<string, number>;
  runbookRef: string;
}

export interface IncidentReport {
  timestamp: string;
  active: Incident[];
  recentCount: number;
  byCategory: Record<IncidentCategory, number>;
  bySeverity: Record<IncidentSeverity, number>;
}

// ═══ Runbook ═══

export interface Runbook {
  incidentType: IncidentCategory;
  diagnosis: string[];
  immediateActions: string[];
  escalation: string;
  recoverySteps: string[];
  verification: string[];
  prevention: string[];
}

// ═══ Dashboard ═══

export interface PlatformReliabilityDashboard {
  timestamp: string;
  reliability: ReliabilityScore;
  slo: SLOReport;
  errorBudget: ErrorBudget[];
  incidents: IncidentReport;
  summary: string;
}
