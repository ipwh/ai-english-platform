// ============================================
// EventBus Contract Tests
// ============================================

import { describe, it, expect, vi } from 'vitest';
import { EventBus } from '../events/event-bus';
import { EventPriority } from '../types';
import type {
  ExperimentCompletedEvent,
  AlertRaisedEvent,
  ProviderChangedEvent,
} from '../events/event-types';

function makeExperimentEvent(overrides: Partial<ExperimentCompletedEvent> = {}): ExperimentCompletedEvent {
  return {
    type: 'experiment:completed',
    timestamp: new Date().toISOString(),
    experimentId: 'exp-1',
    experimentName: 'Test Experiment',
    hasWinner: true,
    winnerVariantId: 'B',
    confidenceScore: 95,
    durationMs: 1000,
    ...overrides,
  };
}

function makeAlertEvent(overrides: Partial<AlertRaisedEvent> = {}): AlertRaisedEvent {
  return {
    type: 'alert:raised',
    timestamp: new Date().toISOString(),
    alertId: 'alert-1',
    severity: 'warning',
    category: 'overall_drop',
    promptName: 'reading',
    title: 'Score dropped',
    description: 'Overall score dropped by 5%',
    ...overrides,
  };
}

describe('EventBus', () => {
  // ── Subscribe and Publish ──

  it('should deliver events to subscribers', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on('experiment:completed', handler);
    const event = makeExperimentEvent();
    bus.emit(event);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(event);
  });

  it('should not deliver to unsubscribed listeners', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    const unsub = bus.on('experiment:completed', handler);
    unsub();
    bus.emit(makeExperimentEvent());
    expect(handler).not.toHaveBeenCalled();
  });

  it('should not deliver to other event types', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on('experiment:completed', handler);
    bus.emit(makeAlertEvent());
    expect(handler).not.toHaveBeenCalled();
  });

  // ── Once ──

  it('should deliver once() exactly once', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.once('experiment:completed', handler);
    bus.emit(makeExperimentEvent());
    bus.emit(makeExperimentEvent({ experimentId: 'exp-2' }));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('should allow early unsubscription of once()', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    const unsub = bus.once('experiment:completed', handler);
    unsub();
    bus.emit(makeExperimentEvent());
    expect(handler).not.toHaveBeenCalled();
  });

  // ── Wildcard ──

  it('should deliver all events to wildcard subscribers', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.onAny(handler);
    bus.emit(makeExperimentEvent());
    bus.emit(makeAlertEvent());
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('should not deliver wildcard once() more than once', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.onAny(handler, { once: true });
    bus.emit(makeExperimentEvent());
    bus.emit(makeAlertEvent());
    expect(handler).toHaveBeenCalledTimes(1);
  });

  // ── Priority ──

  it('should deliver events in priority order', () => {
    const bus = new EventBus();
    const order: number[] = [];

    bus.on('experiment:completed', () => order.push(1), { priority: EventPriority.Low });
    bus.on('experiment:completed', () => order.push(2), { priority: EventPriority.High });
    bus.on('experiment:completed', () => order.push(3), { priority: EventPriority.Normal });

    bus.emit(makeExperimentEvent());

    // High (2) first, then Normal (1), then Low (0)
    expect(order).toEqual([2, 3, 1]);
  });

  // ── Error Isolation ──

  it('should isolate subscriber errors', () => {
    const bus = new EventBus();
    const goodHandler = vi.fn();
    const badHandler = vi.fn(() => { throw new Error('Subscriber error'); });

    bus.on('experiment:completed', badHandler);
    bus.on('experiment:completed', goodHandler);

    // Should not throw
    expect(() => bus.emit(makeExperimentEvent())).not.toThrow();
    // Good handler should still run
    expect(goodHandler).toHaveBeenCalled();
  });

  // ── Multiple Subscribers ──

  it('should deliver to multiple subscribers for the same event', () => {
    const bus = new EventBus();
    const h1 = vi.fn();
    const h2 = vi.fn();

    bus.on('experiment:completed', h1);
    bus.on('experiment:completed', h2);

    bus.emit(makeExperimentEvent());

    expect(h1).toHaveBeenCalledTimes(1);
    expect(h2).toHaveBeenCalledTimes(1);
  });

  // ── Emit All ──

  it('should emit multiple events', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on('experiment:completed', handler);

    bus.emitAll([
      makeExperimentEvent({ experimentId: 'e1' }),
      makeExperimentEvent({ experimentId: 'e2' }),
    ]);

    expect(handler).toHaveBeenCalledTimes(2);
  });

  // ── Subscriber Count ──

  it('should report subscriber count', () => {
    const bus = new EventBus();
    expect(bus.subscriberCount()).toBe(0);

    bus.on('experiment:completed', vi.fn());
    expect(bus.subscriberCount('experiment:completed')).toBe(1);

    bus.on('alert:raised', vi.fn());
    expect(bus.subscriberCount()).toBe(2);
  });

  // ── Active Event Types ──

  it('should list active event types', () => {
    const bus = new EventBus();
    bus.on('experiment:completed', vi.fn());
    bus.on('alert:raised', vi.fn());

    const types = bus.activeEventTypes();
    expect(types).toContain('experiment:completed');
    expect(types).toContain('alert:raised');
  });

  // ── Clear ──

  it('should clear all subscribers', () => {
    const bus = new EventBus();
    bus.on('experiment:completed', vi.fn());
    bus.clear();
    expect(bus.subscriberCount()).toBe(0);
  });

  // ── Timestamp Auto-fill ──

  it('should auto-fill timestamp if missing', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on('experiment:completed', handler);

    const event = makeExperimentEvent();
    // Remove timestamp to test auto-fill
    const eventWithoutTs = { ...event } as Record<string, unknown>;
    delete eventWithoutTs.timestamp;

    bus.emit(eventWithoutTs as unknown as typeof event);
    expect(handler).toHaveBeenCalled();
    expect(handler.mock.calls[0][0].timestamp).toBeTruthy();
  });

  // ── Typed Events ──

  it('should deliver typed alert events', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on('alert:raised', handler);

    const event = makeAlertEvent();
    bus.emit(event);
    expect(handler).toHaveBeenCalledWith(event);
  });

  it('should deliver typed provider events', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on('provider:changed', handler);

    const event: ProviderChangedEvent = {
      type: 'provider:changed',
      timestamp: new Date().toISOString(),
      newProvider: 'gemini',
      previousProvider: 'deepseek',
      reason: 'fallback',
    };
    bus.emit(event);
    expect(handler).toHaveBeenCalledWith(event);
  });
});
