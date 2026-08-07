// ============================================
// BaseRegistry Contract Tests
// ============================================

import { describe, it, expect } from 'vitest';
import { BaseRegistry } from '../registry/base-registry';

interface TestItem {
  id: string;
  name: string;
  value: number;
  tags?: string[];
}

function makeItem(id: string, name: string, value: number, tags?: string[]): TestItem {
  return { id, name, value, tags };
}

describe('BaseRegistry', () => {
  // ── Registration ──

  it('should register an item', () => {
    const registry = new BaseRegistry<TestItem>();
    const entry = registry.register(makeItem('a', 'Alpha', 1));
    expect(entry.item.id).toBe('a');
    expect(entry.item.name).toBe('Alpha');
    expect(entry.registeredAt).toBeTruthy();
    expect(entry.version).toBeGreaterThan(0);
  });

  it('should throw on duplicate registration', () => {
    const registry = new BaseRegistry<TestItem>();
    registry.register(makeItem('a', 'Alpha', 1));
    expect(() => registry.register(makeItem('a', 'Alpha', 2)))
      .toThrow(/already registered/);
  });

  it('should increment version on each registration', () => {
    const registry = new BaseRegistry<TestItem>();
    const e1 = registry.register(makeItem('a', 'A', 1));
    const e2 = registry.register(makeItem('b', 'B', 2));
    expect(e2.version).toBeGreaterThan(e1.version);
  });

  // ── Retrieval ──

  it('should get an item by id', () => {
    const registry = new BaseRegistry<TestItem>();
    registry.register(makeItem('a', 'Alpha', 10));
    const item = registry.get('a');
    expect(item).toBeDefined();
    expect(item!.name).toBe('Alpha');
    expect(item!.value).toBe(10);
  });

  it('should return undefined for missing item', () => {
    const registry = new BaseRegistry<TestItem>();
    expect(registry.get('nonexistent')).toBeUndefined();
  });

  it('should check existence', () => {
    const registry = new BaseRegistry<TestItem>();
    registry.register(makeItem('a', 'A', 1));
    expect(registry.exists('a')).toBe(true);
    expect(registry.exists('b')).toBe(false);
  });

  // ── Update ──

  it('should update an existing item', () => {
    const registry = new BaseRegistry<TestItem>();
    registry.register(makeItem('a', 'Alpha', 1));
    registry.update('a', { value: 99 });
    expect(registry.get('a')!.value).toBe(99);
    expect(registry.get('a')!.name).toBe('Alpha'); // unchanged
  });

  it('should throw on update of missing item', () => {
    const registry = new BaseRegistry<TestItem>();
    expect(() => registry.update('nonexistent', { value: 1 }))
      .toThrow(/not found/);
  });

  // ── Remove ──

  it('should remove an item', () => {
    const registry = new BaseRegistry<TestItem>();
    registry.register(makeItem('a', 'A', 1));
    expect(registry.remove('a')).toBe(true);
    expect(registry.exists('a')).toBe(false);
  });

  it('should return false when removing nonexistent item', () => {
    const registry = new BaseRegistry<TestItem>();
    expect(registry.remove('nonexistent')).toBe(false);
  });

  // ── List ──

  it('should list all items', () => {
    const registry = new BaseRegistry<TestItem>();
    registry.register(makeItem('a', 'A', 1));
    registry.register(makeItem('b', 'B', 2));
    const items = registry.list();
    expect(items).toHaveLength(2);
  });

  it('should return items in insertion order', () => {
    const registry = new BaseRegistry<TestItem>();
    registry.register(makeItem('c', 'C', 3));
    registry.register(makeItem('a', 'A', 1));
    registry.register(makeItem('b', 'B', 2));
    const items = registry.list();
    expect(items.map(i => i.id)).toEqual(['c', 'a', 'b']);
  });

  // ── Find ──

  it('should find items by predicate', () => {
    const registry = new BaseRegistry<TestItem>();
    registry.register(makeItem('a', 'Alpha', 10));
    registry.register(makeItem('b', 'Beta', 20));
    registry.register(makeItem('c', 'Alpha2', 30));
    const found = registry.find(item => item.name.startsWith('Alpha'));
    expect(found).toHaveLength(2);
    expect(found.map(i => i.id)).toEqual(['a', 'c']);
  });

  it('should find one item', () => {
    const registry = new BaseRegistry<TestItem>();
    registry.register(makeItem('a', 'Alpha', 1));
    registry.register(makeItem('b', 'Beta', 2));
    const item = registry.findOne(item => item.value > 1);
    expect(item).toBeDefined();
    expect(item!.id).toBe('b');
  });

  it('should return undefined when findOne matches nothing', () => {
    const registry = new BaseRegistry<TestItem>();
    expect(registry.findOne(() => false)).toBeUndefined();
  });

  // ── Clear ──

  it('should clear all items', () => {
    const registry = new BaseRegistry<TestItem>();
    registry.register(makeItem('a', 'A', 1));
    registry.register(makeItem('b', 'B', 2));
    registry.clear();
    expect(registry.size()).toBe(0);
    expect(registry.list()).toHaveLength(0);
  });

  // ── Size ──

  it('should return correct size', () => {
    const registry = new BaseRegistry<TestItem>();
    expect(registry.size()).toBe(0);
    registry.register(makeItem('a', 'A', 1));
    expect(registry.size()).toBe(1);
    registry.register(makeItem('b', 'B', 2));
    expect(registry.size()).toBe(2);
    registry.remove('a');
    expect(registry.size()).toBe(1);
  });

  // ── Immutability ──

  it('list() should return copies — top-level mutation does not affect store', () => {
    const registry = new BaseRegistry<TestItem>();
    registry.register(makeItem('a', 'Original', 42));
    const items = registry.list();
    items[0].name = 'MUTATED';
    expect(registry.get('a')!.name).toBe('Original');
  });

  it('get() should return a copy — mutation does not affect store', () => {
    const registry = new BaseRegistry<TestItem>();
    registry.register(makeItem('a', 'Original', 42));
    const item = registry.get('a')!;
    item.value = 999;
    expect(registry.get('a')!.value).toBe(42);
  });

  it('list() should return copies — nested mutation does not affect store', () => {
    const registry = new BaseRegistry<TestItem>();
    registry.register(makeItem('a', 'Original', 42, ['tag1']));
    const items = registry.list();
    items[0].tags!.push('MUTATED_TAG');
    expect(registry.get('a')!.tags).toEqual(['tag1']);
  });

  // ── History ──

  it('should return entry metadata via getEntry', () => {
    const registry = new BaseRegistry<TestItem>();
    registry.register(makeItem('a', 'A', 1));
    const entry = registry.getEntry('a');
    expect(entry).toBeDefined();
    expect(entry!.item.id).toBe('a');
    expect(entry!.version).toBeGreaterThan(0);
  });
});
