// ============================================
// HistoryRegistry Contract Tests
// ============================================

import { describe, it, expect } from 'vitest';
import { HistoryRegistry } from '../registry/history-registry';

interface TestItem {
  id: string;
  value: number;
  label: string;
}

describe('HistoryRegistry', () => {
  // ── Registration ──

  it('should register an item with a snapshot', () => {
    const registry = new HistoryRegistry<TestItem>();
    const snap = registry.register({ id: 'a', value: 0, label: 'start' });
    expect(snap.action).toBe('register');
    expect(snap.item.value).toBe(0);
    expect(snap.version).toBeGreaterThan(0);
    expect(snap.timestamp).toBeTruthy();
  });

  it('should throw on duplicate registration', () => {
    const registry = new HistoryRegistry<TestItem>();
    registry.register({ id: 'a', value: 0, label: 'start' });
    expect(() => registry.register({ id: 'a', value: 1, label: 'duplicate' }))
      .toThrow(/already registered/);
  });

  // ── History is append-only ──

  it('should record history on updates', () => {
    const registry = new HistoryRegistry<TestItem>();
    registry.register({ id: 'a', value: 0, label: 'start' });
    registry.update('a', { value: 1 });
    registry.update('a', { value: 2 });

    const history = registry.history('a');
    expect(history).toHaveLength(3);
    expect(history[0].action).toBe('register');
    expect(history[1].action).toBe('update');
    expect(history[2].action).toBe('update');
    expect(history[0].item.value).toBe(0);
    expect(history[1].item.value).toBe(1);
    expect(history[2].item.value).toBe(2);
  });

  it('should record removal as a snapshot', () => {
    const registry = new HistoryRegistry<TestItem>();
    registry.register({ id: 'a', value: 0, label: 'start' });
    registry.remove('a');

    const history = registry.history('a');
    expect(history).toHaveLength(2);
    expect(history[1].action).toBe('remove');
    expect(registry.exists('a')).toBe(false);
  });

  it('should have monotonically increasing versions', () => {
    const registry = new HistoryRegistry<TestItem>();
    const s1 = registry.register({ id: 'a', value: 0, label: 'start' });
    const s2 = registry.update('a', { value: 1 });
    const s3 = registry.register({ id: 'b', value: 0, label: 'b' });
    expect(s2.version).toBeGreaterThan(s1.version);
    expect(s3.version).toBeGreaterThan(s2.version);
  });

  // ── Time-travel queries ──

  it('should retrieve state at a specific version', () => {
    const registry = new HistoryRegistry<TestItem>();
    const s1 = registry.register({ id: 'a', value: 0, label: 'start' });
    registry.update('a', { value: 1 });
    registry.update('a', { value: 2 });

    const atV1 = registry.atVersion('a', s1.version);
    expect(atV1).toBeDefined();
    expect(atV1!.value).toBe(0);
  });

  it('should retrieve state at a specific time', () => {
    const registry = new HistoryRegistry<TestItem>();
    const beforeAll = new Date().toISOString();
    registry.register({ id: 'a', value: 0, label: 'start' });

    // Should retrieve the item using the timestamp before registration
    const afterReg = new Date().toISOString();
    const item = registry.atTime('a', afterReg);
    expect(item).toBeDefined();
    expect(item!.value).toBe(0);
  });

  it('should return undefined for atVersion before registration', () => {
    const registry = new HistoryRegistry<TestItem>();
    const s1 = registry.register({ id: 'a', value: 0, label: 'start' });
    expect(registry.atVersion('a', s1.version - 1)).toBeUndefined();
  });

  it('should return undefined after removal', () => {
    const registry = new HistoryRegistry<TestItem>();
    registry.register({ id: 'a', value: 0, label: 'start' });
    registry.remove('a');

    // After removal, current state is gone
    expect(registry.get('a')).toBeUndefined();
  });

  // ── Diff ──

  it('should compute diff between two versions', () => {
    const registry = new HistoryRegistry<TestItem>();
    const s1 = registry.register({ id: 'a', value: 0, label: 'start' });
    registry.update('a', { value: 99 });

    const diff = registry.diff('a', s1.version);
    expect(diff).toBeDefined();
    expect(diff!.changed).toContain('value');
  });

  // ── Immutability ──

  it('history() should return copies — mutation does not affect store', () => {
    const registry = new HistoryRegistry<TestItem>();
    registry.register({ id: 'a', value: 0, label: 'start' });
    const history = registry.history('a');
    history[0].item.value = 999;
    expect(registry.get('a')!.value).toBe(0);
  });

  it('get() should return a copy', () => {
    const registry = new HistoryRegistry<TestItem>();
    registry.register({ id: 'a', value: 0, label: 'start' });
    const item = registry.get('a')!;
    item.value = 999;
    expect(registry.get('a')!.value).toBe(0);
  });

  it('list() should return copies', () => {
    const registry = new HistoryRegistry<TestItem>();
    registry.register({ id: 'a', value: 0, label: 'start' });
    const items = registry.list();
    items[0].value = 999;
    expect(registry.get('a')!.value).toBe(0);
  });

  // ── Chronological ordering ──

  it('should maintain chronological order in history', () => {
    const registry = new HistoryRegistry<TestItem>();
    registry.register({ id: 'a', value: 0, label: 'start' });
    registry.update('a', { value: 1 });
    registry.update('a', { value: 2 });

    const history = registry.history('a');
    for (let i = 1; i < history.length; i++) {
      expect(new Date(history[i].timestamp).getTime())
        .toBeGreaterThanOrEqual(new Date(history[i - 1].timestamp).getTime());
    }
  });

  // ── Size and snapshots ──

  it('should track size correctly', () => {
    const registry = new HistoryRegistry<TestItem>();
    expect(registry.size()).toBe(0);
    registry.register({ id: 'a', value: 0, label: 'start' });
    expect(registry.size()).toBe(1);
  });

  it('should track total snapshots', () => {
    const registry = new HistoryRegistry<TestItem>();
    registry.register({ id: 'a', value: 0, label: 'start' });
    registry.update('a', { value: 1 });
    registry.register({ id: 'b', value: 0, label: 'b' });
    expect(registry.totalSnapshots()).toBe(3);
  });

  it('should clear all state and history', () => {
    const registry = new HistoryRegistry<TestItem>();
    registry.register({ id: 'a', value: 0, label: 'start' });
    registry.update('a', { value: 1 });
    registry.clear();
    expect(registry.size()).toBe(0);
    expect(registry.totalSnapshots()).toBe(0);
    expect(registry.history('a')).toHaveLength(0);
  });
});
