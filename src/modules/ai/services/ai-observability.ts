// Sprint 83: AI Observability — pipeline stage instrumentation

interface StageRecord {
  stage: string;
  count: number;
  totalDurationMs: number;
  failures: number;
}

const stageRecords: Map<string, StageRecord> = new Map();

function ensureStage(name: string): StageRecord {
  if (!stageRecords.has(name)) {
    stageRecords.set(name, { stage: name, count: 0, totalDurationMs: 0, failures: 0 });
  }
  return stageRecords.get(name)!;
}

/** Record a pipeline stage execution */
export function recordStage(stage: string, durationMs: number, success: boolean): void {
  const s = ensureStage(stage);
  s.count++;
  s.totalDurationMs += durationMs;
  if (!success) s.failures++;
}

/** Get observability report */
export function getObservabilityReport() {
  const stages = Array.from(stageRecords.values()).map(s => ({
    stage: s.stage,
    count: s.count,
    avgDurationMs: s.count > 0 ? Math.round(s.totalDurationMs / s.count) : 0,
    failureRate: s.count > 0 ? Math.round((s.failures / s.count) * 100) / 100 : 0,
  }));

  return { stages };
}

/** Reset all observability data */
export function resetObservability(): void {
  stageRecords.clear();
}
