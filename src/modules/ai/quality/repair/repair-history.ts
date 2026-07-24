// ============================================
// Sprint 104: Repair History
// Immutable audit trail of all repair operations.
// ============================================

export interface RepairHistoryEntry {
  /** Which rule triggered the repair */
  ruleId: string;
  /** What action was taken */
  action: string;
  /** Which field was targeted */
  target: string;
  /** Original (faulty) value before repair */
  originalValue?: string;
  /** Duration of the repair step in ms */
  durationMs: number;
  /** Whether the repair succeeded */
  success: boolean;
  /** Error message if repair failed */
  error?: string;
  /** Timestamp of repair */
  timestamp: string;
}

const repairHistory: RepairHistoryEntry[] = [];
const MAX_HISTORY_SIZE = 1000;

/** Log a repair operation to history. */
export function logRepairHistory(entry: Omit<RepairHistoryEntry, 'timestamp'>): void {
  const record: RepairHistoryEntry = {
    ...entry,
    timestamp: new Date().toISOString(),
  };
  repairHistory.push(record);
  if (repairHistory.length > MAX_HISTORY_SIZE) {
    repairHistory.shift(); // keep only last 1000 entries
  }
}

/** Get all repair history entries (most recent first). */
export function getRepairHistory(limit?: number): RepairHistoryEntry[] {
  const entries = [...repairHistory].reverse();
  return limit ? entries.slice(0, limit) : entries;
}

/** Get repair history for a specific rule. */
export function getRepairHistoryForRule(ruleId: string): RepairHistoryEntry[] {
  return repairHistory.filter(e => e.ruleId === ruleId);
}

/** Get recent failures. */
export function getRecentFailures(limit = 10): RepairHistoryEntry[] {
  return repairHistory.filter(e => !e.success).slice(-limit).reverse();
}

/** Clear all repair history. */
export function clearRepairHistory(): void {
  repairHistory.length = 0;
}
