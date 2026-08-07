// ============================================
// EventDispatcher Contract Tests
// ============================================

import { describe, it, expect, vi } from 'vitest';
import { EventBus } from '../events/event-bus';
import { EventDispatcher } from '../events/event-dispatcher';

describe('EventDispatcher', () => {
  it('should dispatch prompt:released events', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on('prompt:released', handler);

    const dispatcher = new EventDispatcher(bus);
    dispatcher.promptReleased({
      promptName: 'reading',
      version: '2.0.0',
      previousVersion: '1.0.0',
      releasedBy: 'admin',
    });

    expect(handler).toHaveBeenCalledTimes(1);
    const event = handler.mock.calls[0][0];
    expect(event.type).toBe('prompt:released');
    expect(event.promptName).toBe('reading');
    expect(event.version).toBe('2.0.0');
  });

  it('should dispatch experiment:started events', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on('experiment:started', handler);

    const dispatcher = new EventDispatcher(bus);
    dispatcher.experimentStarted({
      experimentId: 'exp-1',
      experimentName: 'Test',
      variantCount: 3,
      estimatedRuns: 100,
    });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].experimentId).toBe('exp-1');
  });

  it('should dispatch experiment:completed events', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on('experiment:completed', handler);

    const dispatcher = new EventDispatcher(bus);
    dispatcher.experimentCompleted({
      experimentId: 'exp-1',
      experimentName: 'Test',
      hasWinner: true,
      winnerVariantId: 'B',
      confidenceScore: 95,
      durationMs: 1000,
    });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('should dispatch experiment:failed events', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on('experiment:failed', handler);

    const dispatcher = new EventDispatcher(bus);
    dispatcher.experimentFailed({
      experimentId: 'exp-1',
      experimentName: 'Test',
      error: 'Something went wrong',
    });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].error).toBe('Something went wrong');
  });

  it('should dispatch evaluation:finished events', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on('evaluation:finished', handler);

    const dispatcher = new EventDispatcher(bus);
    dispatcher.evaluationFinished({
      promptName: 'reading',
      overallScore: 92,
      allPassed: true,
      fixtureCount: 50,
      scoreDelta: 2,
    });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('should dispatch evaluation:regressionDetected events', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on('evaluation:regressionDetected', handler);

    const dispatcher = new EventDispatcher(bus);
    dispatcher.regressionDetected({
      promptName: 'reading',
      currentScore: 85,
      previousScore: 95,
      drop: 10,
      severity: 'major',
    });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('should dispatch alert:raised events', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on('alert:raised', handler);

    const dispatcher = new EventDispatcher(bus);
    dispatcher.alertRaised({
      alertId: 'a1',
      severity: 'critical',
      category: 'overall_drop',
      promptName: 'reading',
      title: 'Critical drop',
      description: 'Score dropped 15%',
    });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('should dispatch alert:resolved events', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on('alert:resolved', handler);

    const dispatcher = new EventDispatcher(bus);
    dispatcher.alertResolved({
      alertId: 'a1',
      resolvedBy: 'admin',
    });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('should dispatch provider:changed events', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on('provider:changed', handler);

    const dispatcher = new EventDispatcher(bus);
    dispatcher.providerChanged({
      newProvider: 'gemini',
      previousProvider: 'deepseek',
      reason: 'fallback',
    });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('should dispatch provider:healthChanged events', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on('provider:healthChanged', handler);

    const dispatcher = new EventDispatcher(bus);
    dispatcher.providerHealthChanged({
      provider: 'deepseek',
      previousStatus: 'healthy',
      newStatus: 'degraded',
      errorRate: 0.05,
    });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('should auto-fill timestamp on all events', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on('experiment:completed', handler);

    const dispatcher = new EventDispatcher(bus);
    dispatcher.experimentCompleted({
      experimentId: 'exp-1',
      experimentName: 'Test',
      hasWinner: false,
      durationMs: 500,
    });

    expect(handler.mock.calls[0][0].timestamp).toBeTruthy();
  });
});
