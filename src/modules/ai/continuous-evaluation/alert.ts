// ============================================
// Alert Engine — generates, deduplicates, and
// manages alerts for continuous evaluation.
//
// Alert triggers:
//   - Overall score drop > 3%
//   - Semantic score drop > 3%
//   - Structural failure
//   - Latency increase > 20%
//   - Cost increase > 20%
//   - Provider change (unexpected)
//   - Repeated JSON repair
//   - Repeated retries
//
// Severities: info, warning, high, critical
// ============================================

import type { AlertSeverity, AlertThresholds } from './config';
import { ALERT_ICONS, ALERT_LABELS } from './config';
import type { ScoreRecord } from './score-history';

// ── Types ──

/** An individual alert */
export interface Alert {
  /** Unique alert ID */
  id: string;
  /** Alert severity */
  severity: AlertSeverity;
  /** Alert category */
  category: AlertCategory;
  /** Prompt affected */
  promptName: string;
  /** Human-readable title */
  title: string;
  /** Detailed description */
  description: string;
  /** Current metric value */
  currentValue: number;
  /** Threshold that was breached */
  threshold: number;
  /** When the alert was created */
  createdAt: string;
  /** Whether the alert has been acknowledged */
  acknowledged: boolean;
  /** When acknowledged (if applicable) */
  acknowledgedAt?: string;
  /** Whether the alert has been resolved */
  resolved: boolean;
  /** When resolved (if applicable) */
  resolvedAt?: string;
  /** Related score record */
  recordId?: string;
}

/** Alert categories */
export type AlertCategory =
  | 'overall_drop'
  | 'semantic_drop'
  | 'rubric_drop'
  | 'structural_failure'
  | 'latency_spike'
  | 'cost_spike'
  | 'provider_change'
  | 'json_repair'
  | 'retry_spike'
  | 'failure_spike';

export const ALERT_CATEGORY_LABELS: Record<AlertCategory, string> = {
  overall_drop: 'Overall Score Drop',
  semantic_drop: 'Semantic Score Drop',
  rubric_drop: 'Rubric Score Drop',
  structural_failure: 'Structural Failure',
  latency_spike: 'Latency Spike',
  cost_spike: 'Cost Spike',
  provider_change: 'Provider Change',
  json_repair: 'JSON Repair Spike',
  retry_spike: 'Retry Spike',
  failure_spike: 'Failure Spike',
};

/** Summary of all open alerts */
export interface AlertSummary {
  total: number;
  bySeverity: Record<AlertSeverity, number>;
  byCategory: Partial<Record<AlertCategory, number>>;
  criticalCount: number;
  openCount: number;
  acknowledgedCount: number;
}

// ── Alert Engine ──

class AlertEngine {
  /** All alerts, indexed by ID */
  private alerts = new Map<string, Alert>();

  /** Deduplication cache: category+prompt → last alert */
  private dedupCache = new Map<string, { alertId: string; timestamp: string }>();

  /** Dedup window in minutes (don't repeat same alert within this window) */
  private dedupWindowMinutes = 60;

  /** Alert ID counter */
  private counter = 0;

  // ── Generate Alerts ──

  /**
   * Evaluate a score record and generate alerts for threshold breaches.
   */
  evaluate(
    record: ScoreRecord,
    thresholds: AlertThresholds,
    baseline?: ScoreRecord,
  ): Alert[] {
    const alerts: Alert[] = [];

    // 1. Overall score drop
    if (baseline) {
      const overallDrop = baseline.overallScore - record.overallScore;
      const overallDropPct = baseline.overallScore !== 0
        ? (overallDrop / baseline.overallScore) * 100
        : 0;

      if (overallDropPct >= thresholds.overallDropPct) {
        alerts.push(this.createAlert(
          overallDropPct >= thresholds.overallDropPct * 2 ? 'critical' : 'high',
          'overall_drop',
          record.promptName,
          `Overall score dropped ${overallDropPct.toFixed(1)}%`,
          `Overall score fell from ${baseline.overallScore.toFixed(1)} to ${record.overallScore.toFixed(1)} (Δ=${overallDrop.toFixed(1)})`,
          record.overallScore,
          baseline.overallScore,
          record.id,
        ));
      }

      // 2. Semantic score drop
      const semanticDrop = baseline.semanticScore - record.semanticScore;
      const semanticDropPct = baseline.semanticScore !== 0
        ? (semanticDrop / baseline.semanticScore) * 100
        : 0;

      if (semanticDropPct >= thresholds.semanticDropPct) {
        alerts.push(this.createAlert(
          semanticDropPct >= thresholds.semanticDropPct * 2 ? 'critical' : 'high',
          'semantic_drop',
          record.promptName,
          `Semantic score dropped ${semanticDropPct.toFixed(1)}%`,
          `Semantic: ${baseline.semanticScore.toFixed(1)} → ${record.semanticScore.toFixed(1)}`,
          record.semanticScore,
          baseline.semanticScore,
          record.id,
        ));
      }

      // 3. Latency spike
      if (baseline.latencyMs > 0) {
        const latencyIncrease = ((record.latencyMs - baseline.latencyMs) / baseline.latencyMs) * 100;
        if (latencyIncrease >= thresholds.latencyIncreasePct) {
          alerts.push(this.createAlert(
            latencyIncrease >= thresholds.latencyIncreasePct * 2 ? 'high' : 'warning',
            'latency_spike',
            record.promptName,
            `Latency increased ${latencyIncrease.toFixed(0)}%`,
            `Latency: ${baseline.latencyMs}ms → ${record.latencyMs}ms (+${latencyIncrease.toFixed(0)}%)`,
            record.latencyMs,
            baseline.latencyMs,
            record.id,
          ));
        }
      }

      // 4. Cost spike
      if (baseline.costUsd > 0) {
        const costIncrease = ((record.costUsd - baseline.costUsd) / baseline.costUsd) * 100;
        if (costIncrease >= thresholds.costIncreasePct) {
          alerts.push(this.createAlert(
            costIncrease >= thresholds.costIncreasePct * 2 ? 'high' : 'warning',
            'cost_spike',
            record.promptName,
            `Cost increased ${costIncrease.toFixed(0)}%`,
            `Cost: $${baseline.costUsd.toFixed(5)} → $${record.costUsd.toFixed(5)} (+${costIncrease.toFixed(0)}%)`,
            record.costUsd,
            baseline.costUsd,
            record.id,
          ));
        }
      }
    }

    // 5. Structural failure
    if (thresholds.structuralFail && record.structuralScore < 80) {
      alerts.push(this.createAlert(
        'critical',
        'structural_failure',
        record.promptName,
        `Structural score critically low: ${record.structuralScore.toFixed(1)}`,
        `Structural integrity check failed. Score: ${record.structuralScore.toFixed(1)} (threshold: 80). Check JSON schema, question counts, paragraph references.`,
        record.structuralScore,
        80,
        record.id,
      ));
    }

    // 6. JSON repair spike
    if (record.jsonRepairCount >= thresholds.jsonRepairCount) {
      alerts.push(this.createAlert(
        'warning',
        'json_repair',
        record.promptName,
        `${record.jsonRepairCount} JSON repairs needed`,
        `Response required ${record.jsonRepairCount} JSON repair attempts. May indicate prompt output quality degradation.`,
        record.jsonRepairCount,
        thresholds.jsonRepairCount,
        record.id,
      ));
    }

    // 7. Retry spike
    if (record.retryCount >= thresholds.retryCount) {
      alerts.push(this.createAlert(
        record.retryCount >= thresholds.retryCount * 2 ? 'high' : 'warning',
        'retry_spike',
        record.promptName,
        `${record.retryCount} provider retries`,
        `Request required ${record.retryCount} retries before succeeding. Check provider health.`,
        record.retryCount,
        thresholds.retryCount,
        record.id,
      ));
    }

    // 8. Failure alert
    if (!record.success) {
      alerts.push(this.createAlert(
        'critical',
        'failure_spike',
        record.promptName,
        `Evaluation failed: ${record.errorMessage ?? 'Unknown error'}`,
        `Evaluation for "${record.promptName}" failed. Error: ${record.errorMessage ?? 'No error message'}`,
        0,
        100,
        record.id,
      ));
    }

    // 9. Provider change
    if (baseline && thresholds.providerFallback && record.provider !== baseline.provider) {
      alerts.push(this.createAlert(
        'info',
        'provider_change',
        record.promptName,
        `Provider changed: ${baseline.provider} → ${record.provider}`,
        `The primary provider changed from ${baseline.provider} to ${record.provider}. Verify this was intentional.`,
        0,
        0,
        record.id,
      ));
    }

    return alerts;
  }

  // ── Alert Management ──

  /** Acknowledge an alert */
  acknowledge(alertId: string): boolean {
    const alert = this.alerts.get(alertId);
    if (!alert || alert.acknowledged) return false;
    alert.acknowledged = true;
    alert.acknowledgedAt = new Date().toISOString();
    return true;
  }

  /** Resolve an alert */
  resolve(alertId: string): boolean {
    const alert = this.alerts.get(alertId);
    if (!alert || alert.resolved) return false;
    alert.resolved = true;
    alert.resolvedAt = new Date().toISOString();
    return true;
  }

  /** Get an alert by ID */
  get(alertId: string): Alert | undefined {
    return this.alerts.get(alertId);
  }

  /** Get all open (unresolved) alerts */
  getOpen(): Alert[] {
    return [...this.alerts.values()]
      .filter(a => !a.resolved)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /** Get open alerts for a specific prompt */
  getOpenForPrompt(promptName: string): Alert[] {
    return this.getOpen().filter(a => a.promptName === promptName);
  }

  /** Get alerts by severity */
  getBySeverity(severity: AlertSeverity): Alert[] {
    return [...this.alerts.values()]
      .filter(a => a.severity === severity)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /** Get critical alerts */
  getCritical(): Alert[] {
    return this.getBySeverity('critical').filter(a => !a.resolved);
  }

  /** Get alert summary */
  getSummary(): AlertSummary {
    const all = [...this.alerts.values()];
    const open = all.filter(a => !a.resolved);

    const bySeverity: Record<AlertSeverity, number> = {
      info: 0, warning: 0, high: 0, critical: 0,
    };
    const byCategory: Partial<Record<AlertCategory, number>> = {};

    for (const alert of open) {
      bySeverity[alert.severity]++;
      byCategory[alert.category] = (byCategory[alert.category] ?? 0) + 1;
    }

    return {
      total: all.length,
      bySeverity,
      byCategory,
      criticalCount: bySeverity.critical,
      openCount: open.length,
      acknowledgedCount: open.filter(a => a.acknowledged).length,
    };
  }

  /** Count alerts */
  count(): number {
    return this.alerts.size;
  }

  // ── Dedup Config ──

  setDedupWindow(minutes: number): void {
    this.dedupWindowMinutes = minutes;
  }

  // ── Private ──

  private createAlert(
    severity: AlertSeverity,
    category: AlertCategory,
    promptName: string,
    title: string,
    description: string,
    currentValue: number,
    threshold: number,
    recordId?: string,
  ): Alert {
    // Dedup check
    const dedupKey = `${category}:${promptName}`;
    const last = this.dedupCache.get(dedupKey);
    if (last) {
      const lastTime = new Date(last.timestamp).getTime();
      const now = Date.now();
      if (now - lastTime < this.dedupWindowMinutes * 60 * 1000) {
        // Return existing alert (don't create duplicate)
        const existing = this.alerts.get(last.alertId);
        if (existing && !existing.resolved) return existing;
      }
    }

    const id = `alert-${++this.counter}-${category}`;
    const alert: Alert = {
      id,
      severity,
      category,
      promptName,
      title: `${ALERT_ICONS[severity]} ${ALERT_LABELS[severity]}: ${title}`,
      description,
      currentValue,
      threshold,
      createdAt: new Date().toISOString(),
      acknowledged: false,
      resolved: false,
      recordId,
    };

    this.alerts.set(id, alert);
    this.dedupCache.set(dedupKey, { alertId: id, timestamp: alert.createdAt });

    return alert;
  }

  /** Clear all alerts and reset internal state */
  clear(): void {
    this.alerts.clear();
    this.dedupCache.clear();
    this.counter = 0;
  }
}

/** Singleton alert engine */
export const alertEngine = new AlertEngine();
