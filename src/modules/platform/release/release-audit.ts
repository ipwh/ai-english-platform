// Sprint 99: Release Audit — tracks who did what and when
import type { AuditEntry, ReleaseAuditReport } from './release-types';

const auditLog: AuditEntry[] = [];
let counter = 0;

function log(action: string, target: string, actor: string, details: Record<string, unknown>, result: 'success' | 'failure'): AuditEntry {
  const entry: AuditEntry = { id: `AUD-${++counter}-${Date.now()}`, timestamp: new Date().toISOString(), actor, action, target, details, result };
  auditLog.push(entry);
  if (auditLog.length > 1000) auditLog.splice(0, 100); // keep last 1000 entries
  return entry;
}

export function auditFlagChange(flagId: string, field: string, oldValue: unknown, newValue: unknown, actor: string): AuditEntry {
  return log('flag-change', flagId, actor, { field, oldValue, newValue }, 'success');
}

export function auditRelease(version: string, actor: string, result: 'success' | 'failure'): AuditEntry {
  return log('release', version, actor, {}, result);
}

export function auditRollback(version: string, actor: string): AuditEntry {
  return log('rollback', version, actor, {}, 'success');
}

export function auditDeployment(version: string, actor: string, result: 'success' | 'failure'): AuditEntry {
  return log('deployment', version, actor, {}, result);
}

export function generateAuditReport(): ReleaseAuditReport {
  const byAction: Record<string, number> = {};
  let failures = 0;
  for (const e of auditLog) {
    byAction[e.action] = (byAction[e.action] || 0) + 1;
    if (e.result === 'failure') failures++;
  }
  return {
    generatedAt: new Date().toISOString(),
    entries: [...auditLog].reverse().slice(0, 50),
    summary: { totalActions: auditLog.length, failures, byAction },
  };
}

export function exportJSON(): string {
  return JSON.stringify(generateAuditReport(), null, 2);
}

export function exportMarkdown(): string {
  const report = generateAuditReport();
  const lines = ['# Release Audit Report', '', `Generated: ${report.generatedAt}`, '', `Total: ${report.summary.totalActions} | Failures: ${report.summary.failures}`, '', '## Recent Entries', '', '| Time | Actor | Action | Target | Result |', '|------|-------|--------|--------|--------|'];
  for (const e of report.entries.slice(0, 20)) {
    lines.push(`| ${e.timestamp.slice(0, 19)} | ${e.actor} | ${e.action} | ${e.target} | ${e.result} |`);
  }
  return lines.join('\n');
}
