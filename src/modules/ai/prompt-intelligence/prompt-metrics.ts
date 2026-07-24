// ============================================
// Sprint 109: Prompt Metrics & History
// ============================================

interface PromptMetrics {
  totalPrompts: number;
  totalOptimizations: number;
  totalReflections: number;
  totalLength: number;
  totalConstraintCount: number;
  totalComplexity: number;
  reflectionScores: number[];
  topMissingInstructions: Record<string, number>;
}

const m: PromptMetrics = {
  totalPrompts: 0, totalOptimizations: 0, totalReflections: 0,
  totalLength: 0, totalConstraintCount: 0, totalComplexity: 0,
  reflectionScores: [], topMissingInstructions: {},
};

interface PromptHistoryEntry {
  timestamp: string;
  action: 'built' | 'optimized' | 'validated' | 'reflected';
  metadata: Record<string, unknown>;
}

const history: PromptHistoryEntry[] = [];
const MAX_HISTORY = 500;

export function recordPromptBuilt(length: number, constraintCount: number, complexity: number): void {
  m.totalPrompts++; m.totalLength += length; m.totalConstraintCount += constraintCount; m.totalComplexity += complexity;
  history.push({ timestamp: new Date().toISOString(), action: 'built', metadata: { length, constraintCount, complexity } });
  if (history.length > MAX_HISTORY) history.shift();
}

export function recordPromptOptimized(constraintsAdded: string[]): void {
  m.totalOptimizations++;
  history.push({ timestamp: new Date().toISOString(), action: 'optimized', metadata: { constraintsAdded } });
  if (history.length > MAX_HISTORY) history.shift();
}

export function recordReflection(score: number, missingInstructions: string[]): void {
  m.totalReflections++; m.reflectionScores.push(score);
  for (const inst of missingInstructions) m.topMissingInstructions[inst] = (m.topMissingInstructions[inst] || 0) + 1;
  history.push({ timestamp: new Date().toISOString(), action: 'reflected', metadata: { score, missingInstructions } });
  if (history.length > MAX_HISTORY) history.shift();
}

export function getPromptMetrics() {
  const t = m.totalPrompts || 1;
  const r = m.totalReflections || 1;
  return {
    totalPrompts: m.totalPrompts, totalOptimizations: m.totalOptimizations, totalReflections: m.totalReflections,
    avgLength: Math.round(m.totalLength / t),
    avgConstraintCount: Math.round(m.totalConstraintCount / t),
    avgComplexity: Math.round(m.totalComplexity / t),
    avgReflectionScore: Math.round(m.reflectionScores.reduce((a, b) => a + b, 0) / r),
    reflectionFailures: m.reflectionScores.filter(s => s < 80).length,
    topMissingInstructions: Object.entries(m.topMissingInstructions).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => ({ instruction: k, count: v })),
  };
}

export function getPromptHistory(limit = 20): PromptHistoryEntry[] {
  return history.slice(-limit).reverse();
}

export function resetPromptMetrics(): void {
  m.totalPrompts = 0; m.totalOptimizations = 0; m.totalReflections = 0;
  m.totalLength = 0; m.totalConstraintCount = 0; m.totalComplexity = 0;
  m.reflectionScores = []; m.topMissingInstructions = {};
  history.length = 0;
}
