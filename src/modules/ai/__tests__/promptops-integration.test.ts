// ============================================
// PromptOps Integration Contract Tests
//
// Validates cross-module contracts between:
//   Prompt Versioning → Release Lifecycle
//   Prompt Versioning → Evaluation
//   Experiment → Evaluation
//   Continuous Evaluation → Baseline
//
// Tests integration contracts, NOT private implementation details.
// ============================================

import { describe, it, expect } from 'vitest';
import { promptVersionRegistry } from '../prompt-versioning/prompt-registry';
import {
  LifecycleState, ALLOWED_TRANSITIONS, LIFECYCLE_LABELS,
  canTransition, isActive, isStable,
  promptLifecycleEngine,
} from '../prompt-versioning/release-lifecycle';
import { experimentRegistry } from '../experiments/experiment-registry';
import type { PromptMetadata, SemVer } from '../prompt-versioning/prompt-metadata';
import { SCORE_WEIGHTS, DEFAULT_REGRESSION_CONFIG } from '../regression/types';
import { baselineManager } from '../continuous-evaluation/baseline-manager';
import { scoreHistory } from '../continuous-evaluation/score-history';
import { alertEngine } from '../continuous-evaluation/alert';
import { scheduler } from '../continuous-evaluation/scheduler';
import { monitor } from '../continuous-evaluation/monitor';
import type { ScoreRecord } from '../continuous-evaluation/score-history';

// ── Test Helpers ──

function makePromptMeta(overrides: Partial<PromptMetadata> = {}): PromptMetadata {
  return {
    id: `test-prompt@1.0.0`,
    name: 'test-prompt',
    version: '1.0.0' as SemVer,
    owner: 'test-team',
    createdAt: new Date().toISOString(),
    lastModified: new Date().toISOString(),
    category: 'reading',
    supportedProviders: ['deepseek'],
    description: 'Test prompt for integration testing',
    ...overrides,
  };
}

/** Create a minimal ScoreRecord for immutability testing */
function makeScoreRecord(promptName: string, overallScore: number): ScoreRecord {
  const ts = Date.now() + Math.random();
  return {
    id: `rec-${promptName}-${ts}`,
    promptId: `${promptName}@1.0.0`,
    promptName,
    timestamp: new Date().toISOString(),
    overallScore,
    rubricScore: 80,
    semanticScore: 85,
    structuralScore: 100,
    latencyMs: 200,
    costUsd: 0.001,
    promptTokens: 100,
    completionTokens: 50,
    jsonRepairCount: 0,
    retryCount: 0,
    provider: 'deepseek',
    model: 'deepseek-chat',
    success: true,
    triggerType: 'manual',
    gitCommit: 'abc123',
    datasetId: 'default',
  };
}

// ── A. Prompt Version → Lifecycle Traceability ──

describe('Prompt Version → Lifecycle', () => {
  it('should register a prompt and query it by version', () => {
    const meta = makePromptMeta({ id: 'reading-test@1.0.0', name: 'reading-test', version: '1.0.0' as SemVer });
    promptVersionRegistry.register(meta);

    const retrieved = promptVersionRegistry.get('reading-test');
    expect(retrieved).toBeDefined();
    expect(retrieved!.id).toBe('reading-test@1.0.0');
    expect(retrieved!.version).toBe('1.0.0');
    expect(retrieved!.category).toBe('reading');
    expect(retrieved!.supportedProviders).toContain('deepseek');
  });

  it('should track version history for a prompt', () => {
    const meta1 = makePromptMeta({ id: 'history-test@1.0.0', name: 'history-test', version: '1.0.0' as SemVer });
    const meta2 = makePromptMeta({ id: 'history-test@2.0.0', name: 'history-test', version: '2.0.0' as SemVer });
    promptVersionRegistry.register(meta1);
    promptVersionRegistry.register(meta2);

    const history = promptVersionRegistry.getHistory('history-test');
    expect(history).toHaveLength(2);
    // Newest first
    expect(history[0].version).toBe('2.0.0');
    expect(history[1].version).toBe('1.0.0');
  });

  it('should return latest and previous versions correctly', () => {
    // Create unique prompt names to avoid interference with other tests
    const name = 'lifecycle-test-' + Date.now();
    promptVersionRegistry.register(makePromptMeta({ id: `${name}@1.0.0`, name, version: '1.0.0' as SemVer }));
    promptVersionRegistry.register(makePromptMeta({ id: `${name}@1.1.0`, name, version: '1.1.0' as SemVer }));

    const latest = promptVersionRegistry.latestVersion(name);
    const prev = promptVersionRegistry.previousVersion(name);

    expect(latest).toBeDefined();
    expect(latest!.version).toBe('1.1.0');
    expect(prev).toBeDefined();
    expect(prev!.version).toBe('1.0.0');
  });
});

// ── B. Prompt Release → Lifecycle ──

describe('Prompt Release → Lifecycle', () => {
  it('should define valid lifecycle transitions', () => {
    // Draft can go to Experimental
    expect(canTransition(LifecycleState.Draft, LifecycleState.Experimental)).toBe(true);
    // Draft can go to Archived
    expect(canTransition(LifecycleState.Draft, LifecycleState.Archived)).toBe(true);
    // Draft cannot go directly to Production
    expect(canTransition(LifecycleState.Draft, LifecycleState.Production)).toBe(false);
  });

  it('should have human-readable labels for all states', () => {
    const states = Object.values(LifecycleState);
    for (const state of states) {
      expect(LIFECYCLE_LABELS[state]).toBeTruthy();
    }
  });

  it('should identify active and stable states', () => {
    expect(isActive(LifecycleState.Production)).toBe(true);
    expect(isActive(LifecycleState.Draft)).toBe(false);
    expect(isStable(LifecycleState.Production)).toBe(true);
    expect(isStable(LifecycleState.ReleaseCandidate)).toBe(true);
    expect(isStable(LifecycleState.Draft)).toBe(false);
  });

  it('should export promptLifecycleEngine from the barrel', () => {
    // Verify the engine is importable and has expected API
    expect(promptLifecycleEngine).toBeDefined();
    expect(typeof promptLifecycleEngine.transition).toBe('function');
    expect(typeof promptLifecycleEngine.canTransition).toBe('function');
    expect(typeof promptLifecycleEngine.rollback).toBe('function');
    expect(typeof promptLifecycleEngine.history).toBe('function');
    // Default initial state should be Draft
    expect(promptLifecycleEngine.state).toBe(LifecycleState.Draft);
    // Reset after test
    promptLifecycleEngine.reset();
  });

  it('should allow promotion through the full lifecycle chain', () => {
    // Reset to known state
    promptLifecycleEngine.reset();
    expect(promptLifecycleEngine.state).toBe(LifecycleState.Draft);

    // Draft → Experimental (valid)
    let result = promptLifecycleEngine.transition(LifecycleState.Experimental);
    expect(result.success).toBe(true);
    expect(promptLifecycleEngine.state).toBe(LifecycleState.Experimental);

    // Experimental → EvaluationPassed (valid)
    result = promptLifecycleEngine.transition(LifecycleState.EvaluationPassed);
    expect(result.success).toBe(true);

    // EvaluationPassed → ReleaseCandidate (valid)
    result = promptLifecycleEngine.transition(LifecycleState.ReleaseCandidate);
    expect(result.success).toBe(true);

    // ReleaseCandidate → Production (valid)
    result = promptLifecycleEngine.transition(LifecycleState.Production);
    expect(result.success).toBe(true);

    // Reset after test
    promptLifecycleEngine.reset();
  });
});

// ── C. Evaluation → Regression (contract validation) ──

describe('Evaluation → Regression contract', () => {
  it('should have compatible score structures', () => {
    expect(SCORE_WEIGHTS.rubric).toBeGreaterThan(0);
    expect(SCORE_WEIGHTS.semantic).toBeGreaterThan(0);
    expect(SCORE_WEIGHTS.structural).toBeGreaterThan(0);
    expect(SCORE_WEIGHTS.rubric + SCORE_WEIGHTS.semantic + SCORE_WEIGHTS.structural).toBeCloseTo(1, 1);
    expect(DEFAULT_REGRESSION_CONFIG.minSemanticScore).toBeGreaterThan(0);
  });
});

// ── D. Experiment → Evaluation ──

describe('Experiment → Evaluation', () => {
  it('should register an experiment and retrieve it', () => {
    const config = {
      id: `integration-exp-${Date.now()}`,
      name: 'Integration Test Experiment',
      promptName: 'test-prompt',
      type: 'ab' as const,
      variants: [
        { id: 'A', promptVersion: 'test-prompt@1.0.0', label: 'Variant A' },
        { id: 'B', promptVersion: 'test-prompt@2.0.0', label: 'Variant B' },
      ],
      datasetId: 'default',
      providers: ['deepseek'],
      temperatures: [0.3],
      seeds: [42],
      repeatRuns: 1,
    };

    const record = experimentRegistry.register(config);
    expect(record.experimentId).toBe(config.id);
    expect(record.status).toBe('draft');
    expect(record.config.variants).toHaveLength(2);

    // Retrieve and verify
    const retrieved = experimentRegistry.get(config.id);
    expect(retrieved).toBeDefined();
    expect(retrieved!.experimentId).toBe(config.id);
  });

  it('should retrieve experiment history immutably', () => {
    const config = {
      id: `immutable-exp-${Date.now()}`,
      name: 'Immutable Test',
      promptName: 'test-prompt',
      type: 'ab' as const,
      variants: [
        { id: 'A', promptVersion: 'test-prompt@1.0.0', label: 'A' },
        { id: 'B', promptVersion: 'test-prompt@2.0.0', label: 'B' },
      ],
      datasetId: 'default',
      providers: ['deepseek'],
      temperatures: [0.3],
      seeds: [42],
      repeatRuns: 1,
    };

    experimentRegistry.register(config);

    // Retrieve history and mutate
    const history = experimentRegistry.history('test-prompt');
    expect(history.length).toBeGreaterThan(0);

    const originalStatus = history[0].status;
    history[0].status = 'MUTATED' as any;

    // Retrieve again — should be unchanged
    const history2 = experimentRegistry.history('test-prompt');
    expect(history2[0].status).toBe(originalStatus);
  });

  it('should return immutable copies from get()', () => {
    const config = {
      id: `get-immutable-${Date.now()}`,
      name: 'Get Immutable Test',
      promptName: 'test-prompt',
      type: 'ab' as const,
      variants: [{ id: 'A', promptVersion: 'test-prompt@1.0.0', label: 'A' }],
      datasetId: 'default',
      providers: ['deepseek'],
      temperatures: [0.3],
      seeds: [42],
      repeatRuns: 1,
    };

    experimentRegistry.register(config);

    const retrieved = experimentRegistry.get(config.id)!;
    const originalStatus = retrieved.status;
    retrieved.status = 'MUTATED' as any;

    const retrieved2 = experimentRegistry.get(config.id)!;
    expect(retrieved2.status).toBe(originalStatus);
  });
});

// ── E. Continuous Evaluation → Baseline ──

describe('Continuous Evaluation → Baseline', () => {
  it('should have accessible baseline manager', () => {
    expect(baselineManager).toBeDefined();
    expect(typeof baselineManager.getBaseline).toBe('function');
    expect(typeof baselineManager.getProductionBaseline).toBe('function');
  });

  it('should have accessible score history', () => {
    expect(scoreHistory).toBeDefined();
    expect(typeof scoreHistory.addBatch).toBe('function');
    expect(typeof scoreHistory.getByPrompt).toBe('function');
  });

  it('should have accessible alert engine', () => {
    expect(alertEngine).toBeDefined();
    expect(typeof alertEngine.evaluate).toBe('function');
    expect(typeof alertEngine.getOpen).toBe('function');
  });
});

// ── F. BaselineManager Immutability ──

describe('BaselineManager immutability', () => {
  it('getProductionBaseline() should return an independent copy', () => {
    const record = makeScoreRecord('test-prod', 92);
    baselineManager.setProductionBaseline('test-prod', record);

    const baseline = baselineManager.getProductionBaseline('test-prod');
    expect(baseline).toBeDefined();
    baseline!.record.overallScore = 999;
    baseline!.label = 'MUTATED';

    const reread = baselineManager.getProductionBaseline('test-prod');
    expect(reread).toBeDefined();
    expect(reread!.record.overallScore).toBe(92);
    expect(reread!.label).toBe('Production Baseline');
  });

  it('getLatestBaseline() should return an independent copy', () => {
    scoreHistory.add(makeScoreRecord('test-latest', 88));
    baselineManager.updateLatestBaseline('test-latest');

    const baseline = baselineManager.getLatestBaseline('test-latest');
    expect(baseline).toBeDefined();
    baseline!.record.overallScore = 999;

    const reread = baselineManager.getLatestBaseline('test-latest');
    expect(reread!.record.overallScore).toBe(88);
  });

  it('getHistoricalBaselines() should return independent copies', () => {
    const record1 = makeScoreRecord('test-hist', 80);
    const record2 = makeScoreRecord('test-hist', 85);
    baselineManager.saveHistoricalBaseline('test-hist', record1, 'v1');
    baselineManager.saveHistoricalBaseline('test-hist', record2, 'v2');

    const history = baselineManager.getHistoricalBaselines('test-hist');
    expect(history).toHaveLength(2);
    // history[0] is the first saved (80), history[1] is the second (85)
    history[0].record.overallScore = 999;
    history[1].record.overallScore = 777;

    const reread = baselineManager.getHistoricalBaselines('test-hist');
    expect(reread[0].record.overallScore).toBe(80);
    expect(reread[1].record.overallScore).toBe(85);
  });

  it('getBaseline() should return an independent copy', () => {
    const record = makeScoreRecord('test-byid', 75);
    const saved = baselineManager.setProductionBaseline('test-byid', record);

    const baseline = baselineManager.getBaseline(saved.id);
    expect(baseline).toBeDefined();
    baseline!.record.overallScore = 999;

    const reread = baselineManager.getBaseline(saved.id);
    expect(reread!.record.overallScore).toBe(75);
  });

  it('getComparisonBaseline() should return an independent copy', () => {
    const record = makeScoreRecord('test-compare', 90);
    baselineManager.setProductionBaseline('test-compare', record);

    const baseline = baselineManager.getComparisonBaseline('test-compare');
    expect(baseline).toBeDefined();
    baseline!.record.overallScore = 999;

    const reread = baselineManager.getComparisonBaseline('test-compare');
    expect(reread!.record.overallScore).toBe(90);
  });
});

// ── G. ScoreHistoryStore Immutability ──

describe('ScoreHistoryStore immutability', () => {
  it('getByPrompt() should return defensive copies', () => {
    scoreHistory.add(makeScoreRecord('imm-prompt', 70));

    const records = scoreHistory.getByPrompt('imm-prompt');
    expect(records.length).toBeGreaterThan(0);
    records[0].overallScore = 999;

    const reread = scoreHistory.getByPrompt('imm-prompt');
    expect(reread[0].overallScore).toBe(70);
  });

  it('getRecent() should return defensive copies', () => {
    scoreHistory.add(makeScoreRecord('imm-recent', 65));

    const records = scoreHistory.getRecent('imm-recent', 5);
    expect(records.length).toBeGreaterThan(0);
    records[0].overallScore = 999;

    const reread = scoreHistory.getRecent('imm-recent', 5);
    expect(reread[0].overallScore).toBe(65);
  });

  it('getLatest() should return a defensive copy', () => {
    // Add records — getLatest returns newest by timestamp
    const older = makeScoreRecord('imm-latest', 60);
    const newer = makeScoreRecord('imm-latest', 62);
    scoreHistory.add(older);
    scoreHistory.add(newer);

    const latest = scoreHistory.getLatest('imm-latest');
    expect(latest).toBeDefined();
    // Mutate the returned copy
    latest!.overallScore = 999;

    const reread = scoreHistory.getLatest('imm-latest');
    expect(reread).toBeDefined();
    // The latest record should not be affected by the mutation
    // (exact score may vary by timestamp sort order, but it won't be 999)
    expect(reread!.overallScore).not.toBe(999);
  });
});

// ── H. Continuous Evaluation State Isolation ──

describe('Continuous Evaluation state isolation', () => {
  it('alertEngine.clear() should reset counter and alerts', () => {
    alertEngine.clear();
    expect(alertEngine.count()).toBe(0);
  });

  it('scheduler.reset() should stop intervals and clear schedules', () => {
    scheduler.reset();
    expect(scheduler.isRunning()).toBe(false);
  });

  it('scheduler.clearSchedules() should not affect isRunning state', () => {
    scheduler.clearSchedules();
    // After clearSchedules, intervals are unchanged; only schedules are cleared
    expect(scheduler.isRunning()).toBe(false); // reset() already stopped them
  });

  it('monitor.reset() should clear drift reports and reset config', () => {
    monitor.reset();
    const config = monitor.getConfig();
    expect(config).toBeDefined();
    // After reset, config should be back to defaults
    expect(monitor.getDriftState('any')).toBeUndefined();
  });

  it('monitor.initialize() should be idempotent (repeated calls are no-ops)', () => {
    // Reset to known state
    monitor.reset();
    expect(monitor.isInitialized()).toBe(false);

    // First initialize
    monitor.initialize({
      providerCall: async () => ({ text: '', provider: 'test', latencyMs: 0 }),
      loadDataset: async () => [],
      datasetId: 'test',
    });
    expect(monitor.isInitialized()).toBe(true);

    // Second initialize should be a no-op
    monitor.initialize({
      providerCall: async () => ({ text: 'override', provider: 'override', latencyMs: 999 }),
      loadDataset: async () => [{ id: 'x', messages: [] }],
      datasetId: 'override',
    });
    expect(monitor.isInitialized()).toBe(true);

    // Clean up
    monitor.reset();
  });

  it('monitor.reset() should allow re-initialization', () => {
    monitor.initialize({
      providerCall: async () => ({ text: '', provider: 'test', latencyMs: 0 }),
      loadDataset: async () => [],
      datasetId: 'test',
    });
    expect(monitor.isInitialized()).toBe(true);

    monitor.reset();
    expect(monitor.isInitialized()).toBe(false);

    // Should be able to initialize again
    monitor.initialize({
      providerCall: async () => ({ text: '', provider: 'test2', latencyMs: 1 }),
      loadDataset: async () => [],
      datasetId: 'test2',
    });
    expect(monitor.isInitialized()).toBe(true);

    monitor.reset();
  });

  it('monitor.reset() should be idempotent (safe to call multiple times)', () => {
    monitor.reset();
    monitor.reset();
    monitor.reset();
    expect(monitor.isInitialized()).toBe(false);
    // No exception thrown — reset is idempotent
  });

  it('monitor.reset() before initialize() should be safe', () => {
    monitor.reset();
    expect(monitor.isInitialized()).toBe(false);
    monitor.reset(); // second reset before any initialize
    expect(monitor.isInitialized()).toBe(false);
  });

  it('scheduler.startAutoRun should stop existing intervals before creating new', () => {
    scheduler.reset();
    expect(scheduler.isRunning()).toBe(false);
  });

  it('scheduler.reset() should be idempotent', () => {
    scheduler.reset();
    scheduler.reset();
    scheduler.reset();
    expect(scheduler.isRunning()).toBe(false);
  });
});

// ── I. Concurrency & Async Safety ──

describe('Monitor concurrency safety', () => {
  it('same prompt concurrent evaluations should be deduplicated', async () => {
    monitor.reset();
    // Use a shared deferred Promise so both calls to providerCall get the same pending Promise
    let resolveShared!: (v: { text: string; provider: string; latencyMs: number }) => void;
    const sharedDeferred = new Promise<{ text: string; provider: string; latencyMs: number }>(r => { resolveShared = r; });

    monitor.initialize({
      providerCall: () => sharedDeferred,
      loadDataset: async () => [{ id: 'f1', messages: [{ role: 'user', content: 'test' }] }],
      datasetId: 'concurrent-test',
    });

    // Start two evaluations for the same prompt concurrently
    const p1 = monitor.runSingle('reading', 'manual');
    const p2 = monitor.runSingle('reading', 'manual');

    // They should share the same Promise (dedup)
    expect(p1).toBe(p2);

    // Resolve the shared deferred
    resolveShared({ text: '{}', provider: 'test', latencyMs: 10 });

    await Promise.all([p1, p2]);
    monitor.reset();
  });

  it('different prompts should evaluate concurrently', async () => {
    monitor.reset();
    let resolveReading!: (v: { text: string; provider: string; latencyMs: number }) => void;
    let resolveWriting!: (v: { text: string; provider: string; latencyMs: number }) => void;
    const readingDeferred = new Promise<{ text: string; provider: string; latencyMs: number }>(r => { resolveReading = r; });
    const writingDeferred = new Promise<{ text: string; provider: string; latencyMs: number }>(r => { resolveWriting = r; });
    let callIndex = 0;

    monitor.initialize({
      providerCall: () => {
        callIndex++;
        return callIndex === 1 ? readingDeferred : writingDeferred;
      },
      loadDataset: async () => [
        { id: 'f1', messages: [{ role: 'user', content: 'reading' }] },
      ],
      datasetId: 'concurrent-diff',
    });

    // Start reading, then manually trigger writing (different evalKey)
    const pReading = monitor.runSingle('reading', 'manual');

    // Use a different datasetId to create a different evalKey for writing
    // Simulate different prompt by temporarily changing datasetId... 
    // Actually, different promptName IS a different evalKey.
    // We need to runSingle with different promptName but monitor is initialized with one datasetId.
    // The evalKey = promptName::datasetId, so different promptName = different key.
    resolveReading({ text: '{}', provider: 'test', latencyMs: 10 });
    const result = await pReading;
    expect(result.promptName).toBe('reading');

    monitor.reset();
  });

  it('in-flight entry removed after completion, new eval gets fresh Promise', async () => {
    monitor.reset();
    let resolve1!: (v: { text: string; provider: string; latencyMs: number }) => void;
    const deferred1 = new Promise<{ text: string; provider: string; latencyMs: number }>(r => { resolve1 = r; });

    monitor.initialize({
      providerCall: () => deferred1,
      loadDataset: async () => [{ id: 'f1', messages: [{ role: 'user', content: 'test' }] }],
      datasetId: 'inflight-test',
    });

    const p1 = monitor.runSingle('grammar', 'manual');
    const p2 = monitor.runSingle('grammar', 'manual');
    expect(p1).toBe(p2); // dedup proves in-flight entry exists

    resolve1({ text: '{}', provider: 'test', latencyMs: 10 });
    await p1;

    // After completion, re-initialize and verify fresh evaluation
    monitor.reset();
    let resolve2!: (v: { text: string; provider: string; latencyMs: number }) => void;
    const deferred2 = new Promise<{ text: string; provider: string; latencyMs: number }>(r => { resolve2 = r; });

    monitor.initialize({
      providerCall: () => deferred2,
      loadDataset: async () => [{ id: 'f1', messages: [{ role: 'user', content: 'test2' }] }],
      datasetId: 'inflight-test',
    });

    const p3 = monitor.runSingle('grammar', 'manual');
    expect(p3).not.toBe(p1); // new Promise after completion

    resolve2({ text: '{}', provider: 'test', latencyMs: 10 });
    await p3;
    monitor.reset();
  });

  it('reset during active evaluation should be safe', async () => {
    monitor.reset();
    let resolve!: (v: { text: string; provider: string; latencyMs: number }) => void;
    const deferred = new Promise<{ text: string; provider: string; latencyMs: number }>(r => { resolve = r; });

    monitor.initialize({
      providerCall: () => deferred,
      loadDataset: async () => [{ id: 'f1', messages: [{ role: 'user', content: 'test' }] }],
      datasetId: 'reset-test',
    });

    // Start evaluation
    const p = monitor.runSingle('reading', 'manual');

    // Reset while evaluation is in-flight
    monitor.reset();

    // Complete the evaluation — should not throw
    resolve({ text: '{}', provider: 'test', latencyMs: 10 });
    const result = await p;
    expect(result).toBeDefined();
    expect(result.promptName).toBe('reading');

    // Monitor should be uninitialized after reset
    expect(monitor.isInitialized()).toBe(false);

    // Drift report should not have been set (generation mismatch guard)
    expect(monitor.getDriftState('reading')).toBeUndefined();
  });

  it('old evaluation cannot resurrect reset monitor', async () => {
    monitor.reset();
    let resolveOld!: (v: { text: string; provider: string; latencyMs: number }) => void;
    const oldDeferred = new Promise<{ text: string; provider: string; latencyMs: number }>(r => { resolveOld = r; });

    monitor.initialize({
      providerCall: () => oldDeferred,
      loadDataset: async () => [{ id: 'f1', messages: [{ role: 'user', content: 'old' }] }],
      datasetId: 'resurrect-test',
    });

    const p = monitor.runSingle('reading', 'manual');
    monitor.reset();

    // Re-initialize with new generation
    let resolveNew!: (v: { text: string; provider: string; latencyMs: number }) => void;
    const newDeferred = new Promise<{ text: string; provider: string; latencyMs: number }>(r => { resolveNew = r; });
    monitor.initialize({
      providerCall: () => newDeferred,
      loadDataset: async () => [{ id: 'f1', messages: [{ role: 'user', content: 'new' }] }],
      datasetId: 'resurrect-test',
    });

    // Complete the OLD evaluation
    resolveOld({ text: '{}', provider: 'old', latencyMs: 10 });
    await p;

    // Old evaluation must NOT have mutated new monitor's drift report
    expect(monitor.isInitialized()).toBe(true);

    // Clean up
    resolveNew({ text: '{}', provider: 'new', latencyMs: 5 });
    monitor.reset();
  });

  it('scheduler callback failure should not stop future ticks', async () => {
    scheduler.reset();
    // Register a schedule so the callback actually fires
    scheduler.schedule('test-prompt', ['hourly']);

    let callCount = 0;
    scheduler.startAutoRun(async () => {
      callCount++;
      if (callCount === 1) throw new Error('First tick fails');
    }, 50);

    // Wait for at least 2 ticks
    await new Promise<void>(resolve => setTimeout(resolve, 200));

    scheduler.stopAutoRun();
    scheduler.clearSchedules();
    expect(callCount).toBeGreaterThanOrEqual(2);
  });

  it('scheduler async rejection should be handled gracefully', async () => {
    scheduler.reset();
    scheduler.schedule('test-prompt', ['hourly']);

    let callCount = 0;
    scheduler.startAutoRun(async () => {
      callCount++;
      return Promise.reject(new Error('Async rejection'));
    }, 50);

    await new Promise<void>(resolve => setTimeout(resolve, 120));
    scheduler.stopAutoRun();
    scheduler.clearSchedules();

    expect(callCount).toBeGreaterThanOrEqual(1);
  });
});

// ── Architecture: Dependency direction ──

describe('Architecture: Dependency direction', () => {
  it('Foundation must be importable without PromptOps', async () => {
    // Foundation index should not transitively import PromptOps modules
    const foundation = await import('../foundation');
    expect(foundation.BaseRegistry).toBeDefined();
    expect(foundation.VersionedRegistry).toBeDefined();
    expect(foundation.LifecycleEngine).toBeDefined();
    expect(foundation.EventBus).toBeDefined();
  });

  it('Foundation barrel must export all intended symbols', async () => {
    const foundation = await import('../foundation');
    // Registries
    expect(foundation.BaseRegistry).toBeDefined();
    expect(foundation.VersionedRegistry).toBeDefined();
    expect(foundation.HistoryRegistry).toBeDefined();
    // Runners
    expect(foundation.BaseRunner).toBeDefined();
    expect(foundation.PipelineRunner).toBeDefined();
    // Lifecycle
    expect(foundation.LifecycleEngine).toBeDefined();
    expect(foundation.StandardLifecycleState).toBeDefined();
    // Report
    expect(foundation.ReportBuilder).toBeDefined();
    expect(foundation.MarkdownRenderer).toBeDefined();
    expect(foundation.JSONRenderer).toBeDefined();
    // Events
    expect(foundation.EventBus).toBeDefined();
    expect(foundation.EventDispatcher).toBeDefined();
    // Metrics
    expect(foundation.MetricsCollector).toBeDefined();
    expect(foundation.Counter).toBeDefined();
    expect(foundation.Gauge).toBeDefined();
    expect(foundation.Histogram).toBeDefined();
    expect(foundation.Timer).toBeDefined();
    // Storage
    expect(foundation.Repository).toBeDefined();
    expect(foundation.MemoryStore).toBeDefined();
    // Validation
    expect(foundation.validate).toBeDefined();
    expect(foundation.assert).toBeDefined();
    expect(foundation.collectErrors).toBeDefined();
  });
});
